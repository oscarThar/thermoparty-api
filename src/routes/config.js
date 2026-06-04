// src/routes/config.js
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authMiddleware, requireRole } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/config — cualquier usuario autenticado puede leer la config
router.get('/', async (req, res) => {
  const [rows] = await pool.query('SELECT clave, valor FROM config');
  const config = {};
  rows.forEach(r => { config[r.clave] = r.valor; });
  res.json(config);
});

// PUT /api/config/:clave — solo Head Comercial
router.put('/:clave', requireRole('Head Comercial'), async (req, res) => {
  const { valor } = req.body;
  await pool.query(
    'INSERT INTO config (clave, valor) VALUES (?,?) ON DUPLICATE KEY UPDATE valor = ?',
    [req.params.clave, JSON.stringify(valor), JSON.stringify(valor)]
  );
  res.json({ ok: true });
});

module.exports = router;
