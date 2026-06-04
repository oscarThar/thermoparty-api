// src/middleware/auth.js
const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  const token = header.slice(7);
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

// Middleware para roles específicos
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.rol)) {
      return res.status(403).json({ error: 'Sin permisos para esta acción' });
    }
    next();
  };
}

// Filtro: un agente solo ve sus datos, TL ve su equipo, etc.
function canAccessParty(party, user) {
  if (user.rol === 'Head Comercial') return true;
  if (user.rol === 'Gerente') return party.local_id === user.local_id;
  if (user.rol === 'Team Leader') return party.equipo_id === user.equipo_id || party.agente_id === user.id;
  return party.agente_id === user.id;
}

function canAccessProspecto(p, user) {
  if (user.rol === 'Head Comercial') return true;
  if (user.rol === 'Gerente') return p.local_id === user.local_id;
  if (user.rol === 'Team Leader') return p.equipo_id === user.equipo_id || p.agente_id === user.id;
  return p.agente_id === user.id;
}

module.exports = { authMiddleware, requireRole, canAccessParty, canAccessProspecto };
