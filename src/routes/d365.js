// src/routes/d365.js
const express = require('express');
const router = express.Router();
const dynamics = require('../services/dynamics');
const { authMiddleware } = require('../middleware/auth');

// Todos los endpoints de D365 requieren auth
router.use(authMiddleware);

// GET /api/d365/agentes — lista completa (para gerentes/head)
router.get('/agentes', async (req, res) => {
  try {
    const agentes = await dynamics.getAgentes();
    res.json(agentes);
  } catch (err) {
    console.error('[d365] getAgentes:', err.message);
    res.status(500).json({ error: 'Error al consultar agentes en D365' });
  }
});

// GET /api/d365/agentes/:id — un agente específico
router.get('/agentes/:id', async (req, res) => {
  try {
    const agente = await dynamics.getAgenteById(req.params.id);
    res.json(agente);
  } catch (err) {
    res.status(404).json({ error: 'Agente no encontrado' });
  }
});

// GET /api/d365/equipos — business units / equipos
router.get('/equipos', async (req, res) => {
  try {
    const equipos = await dynamics.getEquipos();
    res.json(equipos);
  } catch (err) {
    res.status(500).json({ error: 'Error al consultar equipos en D365' });
  }
});

// GET /api/d365/validar-ov/:numero — valida una OV
router.get('/validar-ov/:numero', async (req, res) => {
  try {
    const resultado = await dynamics.validarOV(req.params.numero);
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ error: 'Error al validar OV' });
  }
});

// GET /api/d365/clientes?q=texto — buscar clientes/contactos
router.get('/clientes', async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.status(400).json({ error: 'Query mínimo 2 caracteres' });
  try {
    const clientes = await dynamics.buscarCliente(q);
    res.json(clientes);
  } catch (err) {
    res.status(500).json({ error: 'Error al buscar clientes' });
  }
});

// GET /api/d365/modelos-tm — modelos disponibles
router.get('/modelos-tm', async (req, res) => {
  try {
    const modelos = await dynamics.getModelosTM();
    res.json(modelos);
  } catch (err) {
    res.json([{ nombre: 'TM5' }, { nombre: 'TM6' }, { nombre: 'TM7' }]);
  }
});

module.exports = router;
