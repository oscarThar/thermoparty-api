// src/routes/cutters.js
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authMiddleware, requireRole } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', async (req, res) => {
  const u = req.user;
  let sql = 'SELECT * FROM cutters';
  const params = [];
  if (u.rol === 'Gerente') { sql += ' WHERE local_id = ?'; params.push(u.local_id); }
  else if (u.rol === 'Agente' || u.rol === 'Team Leader') { sql += ' WHERE agente_id = ?'; params.push(u.id); }
  const [rows] = await pool.query(sql + ' ORDER BY fecha_venta DESC', params);
  res.json(rows);
});

router.patch('/:id/entregar', requireRole('Gerente', 'Head Comercial'), async (req, res) => {
  await pool.query(
    "UPDATE cutters SET estado = 'Entregado a agente', fecha_entrega = CURDATE() WHERE id = ?",
    [req.params.id]
  );
  res.json({ ok: true });
});

module.exports = router;
