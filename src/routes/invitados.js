// src/routes/invitados.js
const express = require('express');
const router = express.Router({ mergeParams: true }); // para acceder a :partyId
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/parties/:partyId/invitados
router.get('/', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM invitados WHERE party_id = ?', [req.params.partyId]);
  res.json(rows);
});

// POST /api/parties/:partyId/invitados — agregar invitado
router.post('/', async (req, res) => {
  const { nombre } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
  const id = uuidv4();
  await pool.query(
    'INSERT INTO invitados (id, party_id, nombre) VALUES (?,?,?)',
    [id, req.params.partyId, nombre]
  );
  res.status(201).json({ id, nombre, completado: false });
});

// PATCH /api/parties/:partyId/invitados/:id — actualizar datos del invitado
// Usado tanto desde la app de la agente como desde la vista del invitado (QR)
router.patch('/:id', async (req, res) => {
  const { nombre, zona, tiene_tm, modelo_tm_invitado, familia, deseos,
          completado, ahorro, quiere_comprar, forma_pago, quiere_ser_agente, frena, objecion } = req.body;

  // Verificar que la party no esté cerrada (el invitado no puede editar después del cierre)
  const [party] = await pool.query('SELECT estado FROM parties WHERE id = ?', [req.params.partyId]);
  if (party[0] && (party[0].estado === 'Realizada y cerrada' || party[0].estado === 'Con ventas posteriores')) {
    if (req.headers['x-invitado-view']) {
      return res.status(403).json({ error: 'El evento ya finalizó' });
    }
  }

  await pool.query(
    `UPDATE invitados SET
      nombre = COALESCE(?, nombre),
      zona = COALESCE(?, zona),
      tiene_tm = COALESCE(?, tiene_tm),
      modelo_tm_invitado = COALESCE(?, modelo_tm_invitado),
      familia = COALESCE(?, familia),
      deseos = COALESCE(?, deseos),
      completado = COALESCE(?, completado),
      ahorro = COALESCE(?, ahorro),
      quiere_comprar = COALESCE(?, quiere_comprar),
      forma_pago = COALESCE(?, forma_pago),
      quiere_ser_agente = COALESCE(?, quiere_ser_agente),
      frena = COALESCE(?, frena),
      objecion = COALESCE(?, objecion)
     WHERE id = ? AND party_id = ?`,
    [nombre||null, zona||null, tiene_tm||null, modelo_tm_invitado||null, familia||null,
     deseos ? JSON.stringify(deseos) : null,
     completado !== undefined ? (completado ? 1 : 0) : null,
     ahorro||null, quiere_comprar !== undefined ? (quiere_comprar ? 1 : 0) : null,
     forma_pago||null, quiere_ser_agente||null, frena||null, objecion||null,
     req.params.id, req.params.partyId]
  );
  res.json({ ok: true });
});

// GET público (sin auth) — para la vista del invitado desde QR
// GET /api/invitado/:partyId/:invId
router.get('/public/:invId', async (req, res) => {
  const [party] = await pool.query(
    'SELECT id, anfitrion_nombre, estado, agente_nombre FROM parties WHERE id = ?',
    [req.params.partyId]
  );
  if (!party.length) return res.status(404).json({ error: 'Evento no encontrado' });

  const [inv] = await pool.query(
    'SELECT * FROM invitados WHERE id = ? AND party_id = ?',
    [req.params.invId, req.params.partyId]
  );
  if (!inv.length) return res.status(404).json({ error: 'Invitado no encontrado' });

  res.json({ party: party[0], invitado: inv[0] });
});

module.exports = router;
