// src/services/dynamics.js
require('dotenv').config();
const axios = require('axios');

let tokenCache = { token: null, expiresAt: 0 };

// ── AUTH ───────────────────────────────────────────────────
async function getToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60000) {
    return tokenCache.token;
  }
  const params = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     process.env.D365_CLIENT_ID,
    client_secret: process.env.D365_CLIENT_SECRET,
    scope:         `${process.env.D365_INSTANCE_URL}/.default`,
  });
  const res = await axios.post(
    `https://login.microsoftonline.com/${process.env.D365_TENANT_ID}/oauth2/v2.0/token`,
    params.toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  tokenCache.token = res.data.access_token;
  tokenCache.expiresAt = Date.now() + res.data.expires_in * 1000;
  return tokenCache.token;
}

async function d365Get(endpoint, params = {}) {
  const token = await getToken();
  const res = await axios.get(
    `${process.env.D365_INSTANCE_URL}/api/data/v9.2/${endpoint}`,
    {
      headers: {
        Authorization:      `Bearer ${token}`,
        'OData-MaxVersion': '4.0',
        'OData-Version':    '4.0',
        Accept:             'application/json',
      },
      params,
    }
  );

  console.log(res.data, "d365Get");
  return res.data;
}

// ══════════════════════════════════════════════════════════
//  MAPA DE ROLES — acc_rol en acc_colaboradors
//  805230000 = Agente  |  805230001 = Team Leader  (confirmar con THARSA)
// ══════════════════════════════════════════════════════════
const ROL_MAP = {
  805230000: 'Agente',
  805230001: 'Team Leader',
  805230002: 'Agente',       // ajustar si existe
};

function mapRolColaborador(accRol) {
  return ROL_MAP[accRol] || 'Agente';
}

// ══════════════════════════════════════════════════════════
//  MAPA DE ROLES — acc_rol en acc_usuariobackoffices
//  805230000 = Head Comercial  (confirmar con THARSA)
// ══════════════════════════════════════════════════════════
const ROL_BACKOFFICE_MAP = {
  805230000: 'Head Comercial',
  805230001: 'Gerente',
};

function mapRolBackoffice(accRol) {
  return ROL_BACKOFFICE_MAP[accRol] || 'Head Comercial';
}

// ══════════════════════════════════════════════════════════
//  COLABORADORES (Agentes / Team Leaders)
//  Entidad: acc_colaboradors
//  ID de login: acc_colaboradorid  (el que la agente ingresa en la app)
// ══════════════════════════════════════════════════════════

// Buscar un colaborador por su acc_colaboradorid (lo que tipea en login)
async function getColaboradorById(colaboradorId) {
  const data = await d365Get('acc_colaboradors', {
    $select: [
      'acc_colaboradorid',
      'acc_id',
      'acc_name',
      'acc_firstname',
      'acc_apellido',
      'acc_fullname',
      'acc_colaborador_email',
      'acc_rol',
      'acc_proceso',
      'statecode',
      'statuscode',
      '_acc_team_leader_value',
      '_acc_branchmanagerid_value',
      '_owningbusinessunit_value',
      'acc_es_primer_login',
    ].join(','),
    // acc_colaboradorid es el GUID que la agente usa como ID de login
    $filter: `acc_colaboradorid eq '${colaboradorId}'`,
    $top: 1,
  });

  //console.log(data, "que tiene data en getColaboradorById ");
  const col = (data.value || [])[0];
  if (!col) return null;

  console.log( "que tiene col:", col);
  return mapColaborador(col);
}

// Buscar colaborador por acc_id numérico (alternativa si lo usan)
async function getColaboradorByNumericId(accId) {
  const data = await d365Get('acc_colaboradors', {
    $select: [
      'acc_colaboradorid','acc_id','acc_name','acc_firstname',
      'acc_apellido','acc_fullname','acc_colaborador_email',
      'acc_rol','statecode','statuscode',
      '_acc_team_leader_value','_acc_branchmanagerid_value',
      '_owningbusinessunit_value','acc_es_primer_login',
    ].join(','),
    $filter: `acc_id eq ${accId}`,
    $top: 1,
  });
//console.log(data, "getColaboradorByNumericId");

  const col = (data.value || [])[0];
  if (!col) return null;

  console.log("Col:", col);
  return mapColaborador(col);
}

// Listar todos los colaboradores activos
async function getColaboradores() {
  const data = await d365Get('acc_colaboradors', {
    $select: [
      'acc_colaboradorid','acc_id','acc_name','acc_firstname',
      'acc_apellido','acc_fullname','acc_colaborador_email',
      'acc_rol','statecode',
      '_acc_team_leader_value','_acc_branchmanagerid_value',
      '_owningbusinessunit_value',
    ].join(','),
    $filter: 'statecode eq 0', // solo activos
    $orderby: 'acc_fullname asc',
  });
  return (data.value || []).map(mapColaborador);
}

function mapColaborador(col) {
  return {
    // ID que usa la agente para loguearse
    id:              col.acc_colaboradorid,
    // ID numérico interno (acc_id: 11798 en el ejemplo)
    idNumerico:      col.acc_id,
    nombre:          col.acc_fullname || `${col.acc_firstname} ${col.acc_apellido}`.trim(),
    firstName:       col.acc_firstname,
    apellido:        col.acc_apellido,
    email:           col.acc_colaborador_email,
    rol:             mapRolColaborador(col.acc_rol),
    activo:          col.statecode === 0,
    esPrimerLogin:   col.acc_es_primer_login,
    // Relaciones (IDs de D365 para navegar estructura)
    teamLeaderId:    col._acc_team_leader_value,
    branchManagerId: col._acc_branchmanagerid_value,
    businessUnitId:  col._owningbusinessunit_value,
  };
}

// ══════════════════════════════════════════════════════════
//  USUARIOS BACKOFFICE (Gerentes / Head Comercial)
//  Entidad: acc_usuariobackoffices
//  Login: acc_name (email) + acc_contrasena
//  ⚠️  La password viene en texto plano desde D365 —
//      validamos directo, NO la guardamos en MySQL
// ══════════════════════════════════════════════════════════

async function loginBackoffice(usuario, password) {
  // Buscar por acc_name (que es el email/usuario)
  const data = await d365Get('acc_usuariobackoffices', {
    $select: [
      'acc_usuariobackofficeid',
      'acc_name',
      'acc_contrasena',
      'acc_rol',
      'statecode',
      'statuscode',
      'cr6f2_permisosedicionov',
    ].join(','),
    $filter: `acc_name eq '${usuario.trim()}' and statecode eq 0`,
    $top: 1,
  });

  console.log("DATA EN LOGIN BACKOOFICE", data.value);

  const user = (data.value || [])[0];
  if (!user) return null; // usuario no encontrado

  // Validar password directo contra D365
  // D365 guarda la contraseña en texto plano (así está en tu sistema)
  if (user.acc_contrasena !== password) return null;

  return {
    id:        user.acc_usuariobackofficeid,
    usuario:   user.acc_name,
    rol:       mapRolBackoffice(user.acc_rol),
    activo:    user.statecode === 0,
    permisos:  user.cr6f2_permisosedicionov || null,
    // NO incluimos acc_contrasena en el payload que sale de esta función
  };
}

// Buscar un backoffice por ID (para referencias)
async function getBackofficeById(id) {
  const data = await d365Get(`acc_usuariobackoffices(${id})`, {
    $select: 'acc_usuariobackofficeid,acc_name,acc_rol,statecode',
  });
  return {
    id:      data.acc_usuariobackofficeid,
    usuario: data.acc_name,
    rol:     mapRolBackoffice(data.acc_rol),
  };
}

// ══════════════════════════════════════════════════════════
//  ESTRUCTURA ORGANIZACIONAL
// ══════════════════════════════════════════════════════════

async function getEquipos() {
  const data = await d365Get('businessunits', {
    $select: 'businessunitid,name,parentbusinessunitid',
    $filter: 'isdisabled eq false',
  });
  return (data.value || []).map(bu => ({
    id:       bu.businessunitid,
    nombre:   bu.name,
    parentId: bu._parentbusinessunitid_value || null,
  }));
}

// ══════════════════════════════════════════════════════════
//  OVs
// ══════════════════════════════════════════════════════════

async function validarOV(numeroOV) {
  try {
    const data = await d365Get('acc_ordendeventas', {
      $select: [
        'acc_ordendeventaid',
        'acc_name',
        'acc_erpid',
        'acc_razon_social',
        'acc_cuit',
        'acc_pagado',
        'acc_monto_total',
        'acc_saldada',
        'acc_fecha_entrega',
        'acc_numerodeserie',
        'acc_estado_orden_de_venta',
        'statecode',
        '_acc_colaboradorid_value',
        '_acc_clienteid_value',
      ].join(','),
      $filter: `acc_name eq '${numeroOV}' or acc_erpid eq '${numeroOV}'`,
      $top: 1,
    });

    const ov = (data.value || [])[0];
    if (!ov) return { valida: false, mensaje: 'OV no encontrada' };

    if (ov.statecode !== 0) {
      return { valida: false, mensaje: `OV inactiva (statecode: ${ov.statecode})` };
    }

    return {
      valida:        true,
      id:            ov.acc_ordendeventaid,
      numero:        ov.acc_name,
      erpId:         ov.acc_erpid,
      razonSocial:   ov.acc_razon_social,
      cuit:          ov.acc_cuit,
      montoPagado:   ov.acc_pagado,
      montoTotal:    ov.acc_monto_total,
      saldada:       ov.acc_saldada,
      fechaEntrega:  ov.acc_fecha_entrega,
      numeroSerie:   ov.acc_numerodeserie,
      estadoOV:      ov.acc_estado_orden_de_venta,
      colaboradorId: ov._acc_colaboradorid_value,
      clienteId:     ov._acc_clienteid_value,
    };
  } catch (err) {
    console.error('[D365] validarOV:', err.message);
    return { valida: null, mensaje: 'No se pudo validar con D365', error: true };
  }
}

// ══════════════════════════════════════════════════════════
//  CLIENTES / CONTACTOS
// ══════════════════════════════════════════════════════════

async function buscarCliente(query) {
  const data = await d365Get('contacts', {
    $select: 'contactid,fullname,mobilephone,address1_city',
    $filter: `contains(fullname,'${query}') or mobilephone eq '${query}'`,
    $top: 10,
  });
  return (data.value || []).map(c => ({
    id:       c.contactid,
    nombre:   c.fullname,
    telefono: c.mobilephone,
    ciudad:   c.address1_city,
  }));
}

module.exports = {
  // Colaboradores
  getColaboradorById,
  getColaboradorByNumericId,
  getColaboradores,
  // Backoffice
  loginBackoffice,
  getBackofficeById,
  // Estructura
  getEquipos,
  // OVs
  validarOV,
  // Clientes
  buscarCliente,
};
