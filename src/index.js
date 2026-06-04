// src/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ── SEGURIDAD ──────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false })); // CSP off para servir el HTML con CDNs
app.use(compression());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET','POST','PUT','PATCH','DELETE'],
  allowedHeaders: ['Content-Type','Authorization','x-invitado-view'],
}));

// Rate limiting — evitar abuso
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Demasiados intentos, esperá 15 minutos' } });

app.use(limiter);
app.use(express.json({ limit: '10mb' })); // 10mb para fotos en base64
app.use(express.urlencoded({ extended: true }));

// ── FRONTEND ESTÁTICO ──────────────────────────────────────
// Sirve el ThermoParty.html desde la carpeta /public
app.use(express.static(path.join(__dirname, '../public')));

// ── RUTAS API ──────────────────────────────────────────────
app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/d365', require('./routes/d365'));
app.use('/api/prospectos', require('./routes/prospectos'));
app.use('/api/parties', require('./routes/parties'));
app.use('/api/parties', require('./routes/parties')); // para nested routes de invitados
app.use('/api/ventas', require('./routes/ventas'));
app.use('/api/cutters', require('./routes/cutters'));
app.use('/api/config', require('./routes/config'));

// Nested: invitados dentro de parties
const invitadosRouter = require('./routes/invitados');
app.use('/api/parties/:partyId/invitados', invitadosRouter);

// Endpoint público para vista del invitado (QR) — sin auth
app.get('/api/invitado/:partyId/:invId', async (req, res) => {
  const pool = require('./db/pool');
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

// ── HEALTH CHECK ───────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── SPA FALLBACK ───────────────────────────────────────────
// Cualquier ruta no-API devuelve el index HTML
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ── ERRORES ────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`
  ✅ ThermoParty API corriendo en puerto ${PORT}
  🌐 Frontend: http://localhost:${PORT}
  🔌 D365: ${process.env.D365_INSTANCE_URL || 'NO CONFIGURADO'}
  🗄️  MySQL: ${process.env.DB_HOST}/${process.env.DB_NAME}
  `);
});
