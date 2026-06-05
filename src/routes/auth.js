// src/routes/auth.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const dynamics = require('../services/dynamics');

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });
}

// ── Upsert colaborador en MySQL (sin password) ────────────
// Guarda/actualiza el colaborador la primera vez que se loguea
// para poder usarlo como FK en parties, prospectos, etc.
async function upsertColaborador(col) {
  await pool.query(
    `INSERT INTO colaboradores
       (d365_id, id_numerico, nombre, email, rol, business_unit_id, team_leader_id, branch_manager_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       nombre = VALUES(nombre),
       email  = VALUES(email),
       rol    = VALUES(rol),
       business_unit_id  = VALUES(business_unit_id),
       team_leader_id    = VALUES(team_leader_id),
       branch_manager_id = VALUES(branch_manager_id),
       updated_at = NOW()`,
    [
      col.id,
      col.idNumerico || null,
      col.nombre,
      col.email || null,
      col.rol,
      col.businessUnitId || null,
      col.teamLeaderId || null,
      col.branchManagerId || null,
    ]
  );
}

// ── Upsert usuario backoffice en MySQL (sin password) ─────
async function upsertBackoffice(user) {
  await pool.query(
    `INSERT INTO usuarios_backoffice (d365_id, usuario, rol)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       usuario    = VALUES(usuario),
       rol        = VALUES(rol),
       updated_at = NOW()`,
    [user.id, user.usuario, user.rol]
  );
}

// ══════════════════════════════════════════════════════════
//  POST /api/auth/login-colaborador
//  Login de Agentes y Team Leaders
//  Body: { id: "696a441f-3c48-f011-877a-000d3a8855bc" }
//        (acc_colaboradorid de D365 — el GUID)
// ══════════════════════════════════════════════════════════
router.post('/login-colaborador', async (req, res) => {
  const { id } = req.body;
  if (!id?.trim()) return res.status(400).json({ error: 'ID requerido' });
  console.log(id, "id que ingresa al endpoint login-colaborador")
  try {
    const col = await dynamics.getColaboradorByNumericId(id.trim());
      console.log("COL EN AUTH.js", col)
    if (!col) {
      return res.status(401).json({ error: 'ID no encontrado en el sistema' });
    }
    if (!col.activo) {
      return res.status(401).json({ error: 'Usuario inactivo — contactá a tu gerente' });
    }
    if (col.rol !== 'Agente' && col.rol !== 'Team Leader') {
      return res.status(401).json({ error: 'Este acceso es solo para agentes y team leaders' });
    }

    // Guardar/actualizar en MySQL (sin password)
    await upsertColaborador(col);

    const payload = {
      id:              col.id,            // acc_colaboradorid (GUID)
      idNumerico:      col.idNumerico,    // acc_id numérico
      nombre:          col.nombre,
      email:           col.email,
      rol:             col.rol,           // 'Agente' | 'Team Leader'
      businessUnitId:  col.businessUnitId,
      teamLeaderId:    col.teamLeaderId,
      branchManagerId: col.branchManagerId,
      esPrimerLogin:   col.esPrimerLogin,
    };

    res.json({
      token: signToken(payload),
      user:  payload,
    });

  } catch (err) {
    console.error('[auth] login-colaborador:', err.message);
    res.status(500).json({ error: 'Error al conectar con D365' });
  }
});

// ══════════════════════════════════════════════════════════
//  POST /api/auth/login-backoffice
//  Login de Gerentes y Head Comercial
//  Body: { usuario: "carla.zarate@tharsa.com.ar", password: "Tharsa2025!*" }
//  Valida directo contra acc_usuariobackoffices en D365
//  NO guarda ni compara passwords en MySQL
// ══════════════════════════════════════════════════════════
router.post('/login-backoffice', async (req, res) => {
  const { usuario, password } = req.body;
  if (!usuario?.trim() || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  }
  console.log("USUARIO Y PASSWORD: ", usuario, password);

  try {
    const user = await dynamics.loginBackoffice(usuario.trim(), password);
    console.log(user, "que usuarios tengo")
    if (!user) {
      // Mismo mensaje para usuario no encontrado y password incorrecta
      // para no dar información de más
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }
    if (!user.activo) {
      return res.status(401).json({ error: 'Usuario inactivo' });
    }

    // Guardar/actualizar referencia en MySQL (solo ID, usuario, rol — sin password)
    await upsertBackoffice(user);

    const payload = {
      id:      user.id,       // acc_usuariobackofficeid
      usuario: user.usuario,  // acc_name (email)
      rol:     user.rol,      // 'Head Comercial' | 'Gerente'
      permisos: user.permisos,
    };

    res.json({
      token: signToken(payload),
      user:  payload,
    });

  } catch (err) {
    console.error('[auth] login-backoffice:', err.message);
    res.status(500).json({ error: 'Error al conectar con D365' });
  }
});

// ══════════════════════════════════════════════════════════
//  POST /api/auth/login  (endpoint unificado — detecta tipo)
//  El frontend puede mandar todo acá y el backend decide
//  Si viene solo { id } → colaborador
//  Si viene { usuario, password } → backoffice
// ══════════════════════════════════════════════════════════
router.post('/login', async (req, res, next) => {
  const { id, usuario, password } = req.body;

  if (id && !usuario) {
    req.body = { id };
    return router.handle({ ...req, url: '/login-colaborador', path: '/login-colaborador' }, res, next);
  }

  // Redirigir internamente
  if (id) {
    req.url = '/login-colaborador';
  } else {
    req.url = '/login-backoffice';
  }
  next('route');
});

module.exports = router;
