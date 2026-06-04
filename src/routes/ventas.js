// src/routes/ventas.js
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// POST /api/ventas
router.post('/', async (req, res) => {
  const u = req.user;
  const { party_id, comprador_id, comprador_nombre, anfitrion_nombre, ov } = req.body;
  if (!party_id || !ov) return res.status(400).json({ error: 'party_id y OV requeridos' });

  const [party] = await pool.query('SELECT * FROM parties WHERE id = ?', [party_id]);
  if (!party.length) return res.status(404).json({ error: 'Party no encontrada' });

  const id = uuidv4();
  await pool.query(
    'INSERT INTO ventas (id, party_id, agente_id, local_id, comprador_id, comprador_nombre, anfitrion_nombre, ov, fecha) VALUES (?,?,?,?,?,?,?,?,CURDATE())',
    [id, party_id, party[0].agente_id, party[0].local_id, comprador_id||null, comprador_nombre||null, anfitrion_nombre||null, ov]
  );

  // Cambiar estado de party a "Con ventas posteriores"
  await pool.query(
    "UPDATE parties SET estado = 'Con ventas posteriores' WHERE id = ? AND estado = 'Realizada y cerrada'",
    [party_id]
  );

  // Si el anfitrión compra → generar cutter
  if (comprador_id === 'anfitrion') {
    const [yaExiste] = await pool.query(
      "SELECT id FROM cutters WHERE party_id = ? AND tipo = 'venta'", [party_id]
    );
    if (!yaExiste.length) {
      await pool.query(
        "INSERT INTO cutters (id, party_id, agente_id, local_id, anfitrion_nombre, telefono, ov, estado, tipo, fecha_venta) VALUES (?,?,?,?,?,?,?,'Pendiente','venta',CURDATE())",
        [uuidv4(), party_id, party[0].agente_id, party[0].local_id,
         party[0].anfitrion_nombre, party[0].telefono, ov]
      );
    }
  }

  res.status(201).json({ id });
});

// GET /api/ventas?party_id=x
router.get('/', async (req, res) => {
  const { party_id } = req.query;
  let sql = 'SELECT * FROM ventas';
  const params = [];
  if (party_id) { sql += ' WHERE party_id = ?'; params.push(party_id); }
  const [rows] = await pool.query(sql + ' ORDER BY fecha DESC', params);
  res.json(rows);
});

module.exports = router;
