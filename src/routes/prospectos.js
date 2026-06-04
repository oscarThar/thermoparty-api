// src/routes/prospectos.js
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const { authMiddleware, canAccessProspecto } = require('../middleware/auth');

router.use(authMiddleware);

function buildWhere(user) {
  if (user.rol === 'Head Comercial') return { sql: '1=1', params: [] };
  if (user.rol === 'Gerente') return { sql: 'local_id = ?', params: [user.local_id] };
  if (user.rol === 'Team Leader') return { sql: '(equipo_id = ? OR agente_id = ?)', params: [user.equipo_id, user.id] };
  return { sql: 'agente_id = ?', params: [user.id] };
}

router.get('/', async (req, res) => {
  const { sql, params } = buildWhere(req.user);
  const { estado } = req.query;
  let where = sql;
  if (estado) { where += ' AND estado = ?'; params.push(estado); }
  const [rows] = await pool.query(`SELECT * FROM prospectos WHERE ${where} ORDER BY created_at DESC`, params);
  res.json(rows);
});

router.post('/', async (req, res) => {
  const u = req.user;
  const { nombre, telefono, zona, modelo_tm, estado } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
  const id = uuidv4();
  await pool.query(
    `INSERT INTO prospectos (id, agente_id, agente_nombre, equipo_id, equipo_nombre, local_id, local_nombre, nombre, telefono, zona, modelo_tm, estado)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, u.id, u.nombre, u.equipoId||null, u.equipoNombre||null, u.local_id||null, u.local_nombre||null,
     nombre, telefono||null, zona||null, modelo_tm||null, estado||'Por contactar']
  );
  res.status(201).json({ id });
});

router.patch('/:id', async (req, res) => {
  const { nombre, telefono, zona, modelo_tm, estado } = req.body;
  await pool.query(
    'UPDATE prospectos SET nombre=?, telefono=?, zona=?, modelo_tm=?, estado=? WHERE id=?',
    [nombre, telefono||null, zona||null, modelo_tm||null, estado, req.params.id]
  );
  res.json({ ok: true });
});

module.exports = router;
