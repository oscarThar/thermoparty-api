// src/routes/parties.js
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const { authMiddleware, canAccessParty } = require('../middleware/auth');

router.use(authMiddleware);

// ── Helper: filtro SQL según rol ──────────────────────────
function buildWhereClause(user) {
  if (user.rol === 'Head Comercial') return { sql: '1=1', params: [] };
  if (user.rol === 'Gerente') return { sql: 'local_id = ?', params: [user.local_id] };
  if (user.rol === 'Team Leader') return { sql: '(equipo_id = ? OR agente_id = ?)', params: [user.equipo_id, user.id] };
  return { sql: 'agente_id = ?', params: [user.id] };
}

// GET /api/parties
router.get('/', async (req, res) => {
  const { sql, params } = buildWhereClause(req.user);
  const { estado, desde, hasta } = req.query;

  let where = sql;
  if (estado) { where += ' AND estado = ?'; params.push(estado); }
  if (desde)  { where += ' AND fecha >= ?'; params.push(desde); }
  if (hasta)  { where += ' AND fecha <= ?'; params.push(hasta); }

  try {
    const [parties] = await pool.query(
      `SELECT p.*, 
        (SELECT JSON_ARRAYAGG(JSON_OBJECT(
          'id', i.id, 'nombre', i.nombre, 'zona', i.zona,
          'tieneTM', i.tiene_tm, 'modeloTMInvitado', i.modelo_tm_invitado,
          'familia', i.familia, 'deseos', i.deseos, 'completado', i.completado,
          'quiereComprar', i.quiere_comprar, 'formaPago', i.forma_pago,
          'ahorro', i.ahorro, 'objecion', i.objecion
        )) FROM invitados i WHERE i.party_id = p.id) as invitados
       FROM parties p WHERE ${where} ORDER BY p.fecha DESC`,
      params
    );
    res.json(parties);
  } catch (err) {
    console.error('[parties] GET:', err.message);
    res.status(500).json({ error: 'Error al obtener ThermoParties' });
  }
});

// GET /api/parties/:id
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM parties WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'No encontrada' });
    if (!canAccessParty(rows[0], req.user)) return res.status(403).json({ error: 'Sin acceso' });

    const [invitados] = await pool.query('SELECT * FROM invitados WHERE party_id = ?', [req.params.id]);
    const [ventas] = await pool.query('SELECT * FROM ventas WHERE party_id = ?', [req.params.id]);

    res.json({ ...rows[0], invitados, ventas });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/parties
router.post('/', async (req, res) => {
  const u = req.user;
  if (u.rol !== 'Agente' && u.rol !== 'Team Leader') {
    return res.status(403).json({ error: 'Solo agentes pueden crear ThermoParties' });
  }

  const { anfitrion_nombre, telefono, ov, modelo_tm, fecha, calle, localidad, menu, regalo, prospecto_id } = req.body;
  if (!anfitrion_nombre || !telefono || !fecha) {
    return res.status(400).json({ error: 'Nombre, teléfono y fecha son obligatorios' });
  }

  const id = uuidv4();
  try {
    await pool.query(
      `INSERT INTO parties (id, agente_id, agente_nombre, equipo_id, equipo_nombre, local_id, local_nombre,
        anfitrion_nombre, telefono, ov, modelo_tm, fecha, calle, localidad, menu, regalo, estado)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'Agendada')`,
      [id, u.id, u.nombre, u.equipoId, u.equipoNombre, u.local_id, u.local_nombre,
       anfitrion_nombre, telefono, ov || null, modelo_tm || null, fecha, calle || null, localidad || null, menu || null, regalo || null]
    );

    // Vincular con prospecto si viene de uno
    if (prospecto_id) {
      await pool.query('UPDATE prospectos SET party_id = ? WHERE id = ?', [id, prospecto_id]);
    }

    res.status(201).json({ id, estado: 'Agendada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/parties/:id/entregar-regalo (Gerente/Head)
router.patch('/:id/entregar-regalo', async (req, res) => {
  if (req.user.rol !== 'Gerente' && req.user.rol !== 'Head Comercial') {
    return res.status(403).json({ error: 'Sin permisos' });
  }
  try {
    await pool.query(
      "UPDATE parties SET estado = 'Regalo entregado', fecha_entrega_regalo = CURDATE() WHERE id = ? AND estado = 'Agendada'",
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/parties/:id/realizar — Paso foto + invitados + cierre
router.patch('/:id/realizar', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM parties WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'No encontrada' });
  const party = rows[0];
  if (!canAccessParty(party, req.user)) return res.status(403).json({ error: 'Sin acceso' });

  const { foto, duracion, cree_ventas, recluta_anfitrion, upgrade_anfitrion, zona_target, invitados } = req.body;

  try {
    await pool.query(
      `UPDATE parties SET
        estado = 'Realizada y cerrada', foto = ?, duracion = ?, cree_ventas = ?,
        recluta_anfitrion = ?, upgrade_anfitrion = ?, zona_target = ?, fecha_cierre = CURDATE()
       WHERE id = ?`,
      [foto || null, duracion || null, cree_ventas || null,
       recluta_anfitrion ? 1 : 0, upgrade_anfitrion || null, zona_target ? 1 : 0, req.params.id]
    );

    // Actualizar invitados del cierre
    if (invitados && invitados.length) {
      for (const inv of invitados) {
        await pool.query(
          `UPDATE invitados SET quiere_comprar = ?, forma_pago = ?, objecion = ?
           WHERE id = ? AND party_id = ?`,
          [inv.quiere_comprar ?? null, inv.forma_pago || null, inv.objecion || null,
           inv.id, req.params.id]
        );
      }
    }

    // Actualizar prospecto asociado
    await pool.query(
      "UPDATE prospectos SET estado = 'ThermoParty realizada' WHERE party_id = ?",
      [req.params.id]
    );

    // Generar cutter si hay upgrade TM7
    if (recluta_anfitrion && upgrade_anfitrion === 'Sí') {
      await pool.query(
        `INSERT INTO cutters (id, party_id, agente_id, local_id, anfitrion_nombre, telefono, ov, estado, tipo, fecha_venta)
         VALUES (?,?,?,?,?,?,?,'Pendiente','cierre',CURDATE())`,
        [uuidv4(), req.params.id, party.agente_id, party.local_id,
         party.anfitrion_nombre, party.telefono, party.ov]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/parties/:id/reagendar
router.patch('/:id/reagendar', async (req, res) => {
  const { fecha } = req.body;
  if (!fecha) return res.status(400).json({ error: 'Fecha requerida' });
  await pool.query('UPDATE parties SET fecha = ? WHERE id = ?', [fecha, req.params.id]);
  res.json({ ok: true });
});

// PATCH /api/parties/:id/cancelar
router.patch('/:id/cancelar', async (req, res) => {
  const { motivo } = req.body;
  await pool.query(
    "UPDATE parties SET estado = 'No realizada', motivo_cancelacion = ? WHERE id = ?",
    [motivo || null, req.params.id]
  );
  res.json({ ok: true });
});

module.exports = router;
