// test-d365.js
// Correr con: node test-d365.js
// Probá cada paso por separado con: node test-d365.js token | whoami | agentes | ov ORD-001
require('dotenv').config();
const axios = require('axios');

const {
  D365_TENANT_ID,
  D365_CLIENT_ID,
  D365_CLIENT_SECRET,
  D365_INSTANCE_URL,
} = process.env;

// ── Colores para la consola ───────────────────────────────
const ok  = msg => console.log(`\x1b[32m✅ ${msg}\x1b[0m`);
const err = msg => console.log(`\x1b[31m❌ ${msg}\x1b[0m`);
const inf = msg => console.log(`\x1b[36mℹ️  ${msg}\x1b[0m`);
const dim = msg => console.log(`\x1b[90m   ${msg}\x1b[0m`);

// ── 1. Validar que el .env tiene lo necesario ─────────────
function checkEnv() {
  console.log('\n── PASO 1: Variables de entorno ──────────────────────');
  const required = ['D365_TENANT_ID','D365_CLIENT_ID','D365_CLIENT_SECRET','D365_INSTANCE_URL'];
  let allOk = true;
  for (const key of required) {
    if (process.env[key]) {
      ok(`${key} = ${process.env[key].slice(0,8)}...`);
    } else {
      err(`${key} no está definido en .env`);
      allOk = false;
    }
  }
  return allOk;
}

// ── 2. Obtener token OAuth2 ───────────────────────────────
async function getToken() {
  console.log('\n── PASO 2: Obtener token de Azure AD ─────────────────');
  inf(`POST https://login.microsoftonline.com/${D365_TENANT_ID}/oauth2/v2.0/token`);

  const params = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     D365_CLIENT_ID,
    client_secret: D365_CLIENT_SECRET,
    scope:         `${D365_INSTANCE_URL}/.default`,
  });

  try {
    const res = await axios.post(
      `https://login.microsoftonline.com/${D365_TENANT_ID}/oauth2/v2.0/token`,
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const token = res.data.access_token;
    const expiresIn = res.data.expires_in;

    ok(`Token obtenido correctamente`);
    dim(`Tipo: ${res.data.token_type}`);
    dim(`Expira en: ${expiresIn}s (${Math.round(expiresIn/60)} minutos)`);
    dim(`Preview: ${token.slice(0,40)}...`);

    return token;
  } catch (e) {
    err(`Error obteniendo token`);
    if (e.response) {
      dim(`Status: ${e.response.status}`);
      dim(`Error: ${e.response.data?.error}`);
      dim(`Descripción: ${e.response.data?.error_description}`);
      console.log('\n  Causas comunes:');
      console.log('  - TENANT_ID incorrecto');
      console.log('  - CLIENT_ID incorrecto');
      console.log('  - CLIENT_SECRET vencido o incorrecto');
      console.log('  - La app no tiene permisos en el tenant\n');
    } else {
      dim(e.message);
    }
    return null;
  }
}

// ── 3. Llamada base a D365 ────────────────────────────────
async function d365Get(token, endpoint, params = {}) {
  const url = `${D365_INSTANCE_URL}/api/data/v9.2/${endpoint}`;
  return axios.get(url, {
    headers: {
      Authorization:    `Bearer ${token}`,
      'OData-MaxVersion': '4.0',
      'OData-Version':    '4.0',
      Accept:           'application/json',
    },
    params,
  });
}

// ── 4. Verificar que la instancia D365 responde ───────────
async function testWhoAmI(token) {
  console.log('\n── PASO 3: WhoAmI — verificar instancia D365 ─────────');
  inf(`GET ${D365_INSTANCE_URL}/api/data/v9.2/WhoAmI`);

  try {
    const res = await d365Get(token, 'WhoAmI');
    ok(`Instancia D365 responde correctamente`);
    dim(`UserId:           ${res.data.UserId}`);
    dim(`BusinessUnitId:   ${res.data.BusinessUnitId}`);
    dim(`OrganizationId:   ${res.data.OrganizationId}`);
    return res.data;
  } catch (e) {
    err(`No se pudo conectar con la instancia D365`);
    if (e.response) {
      dim(`Status: ${e.response.status}`);
      dim(`Body: ${JSON.stringify(e.response.data).slice(0,300)}`);
      if (e.response.status === 401) {
        console.log('\n  Causas comunes:');
        console.log('  - La app registration no tiene permisos en D365');
        console.log('  - Falta crear el Application User en D365');
        console.log('  - D365_INSTANCE_URL incorrecto (revisar región: .crm, .crm2, .crm4, etc.)');
      }
    } else {
      dim(e.message);
    }
    return null;
  }
}

// ── 5. Listar entidades disponibles (primeras 5) ──────────
async function testEntidades(token) {
  console.log('\n── PASO 4: Listar entidades disponibles ──────────────');
  try {
    const res = await d365Get(token, 'EntityDefinitions', {
      $select: 'LogicalName,DisplayName',
      $top: 5,
    });
    ok(`API OData accesible`);
    dim('Primeras entidades:');
    (res.data.value || []).forEach(e => {
      dim(`  - ${e.LogicalName} (${e.DisplayName?.UserLocalizedLabel?.Label || ''})`);
    });
  } catch (e) {
    err(`No se pudo listar entidades`);
    dim(e.response?.data?.error?.message || e.message);
  }
}

// ── 6. Buscar usuarios/agentes ────────────────────────────
async function testAgentes(token) {
  console.log('\n── PASO 5: Buscar usuarios del sistema ───────────────');
  inf('GET /api/data/v9.2/systemusers?$top=3');
  try {
    const res = await d365Get(token, 'systemusers', {
      $select: 'systemuserid,fullname,internalemailaddress,isdisabled',
      $filter: 'isdisabled eq false',
      $top: 3,
    });
    const users = res.data.value || [];
    ok(`${users.length} usuario(s) encontrado(s) (mostrando hasta 3)`);
    users.forEach(u => {
      dim(`  ID: ${u.systemuserid}`);
      dim(`  Nombre: ${u.fullname}`);
      dim(`  Email: ${u.internalemailaddress}`);
      dim('  ---');
    });

    if (!users.length) {
      inf('Sin usuarios — revisá si el Application User tiene permisos de lectura');
    }
  } catch (e) {
    err(`Error al buscar usuarios`);
    dim(e.response?.data?.error?.message || e.message);
    console.log('\n  → Puede que la entidad se llame distinto en tu instancia');
    console.log('  → O que la app no tenga permisos de lectura sobre systemusers\n');
  }
}

// ── 7. Validar una OV específica ──────────────────────────
async function testOV(token, numeroOV) {
  console.log(`\n── PASO 6: Buscar OV "${numeroOV}" ───────────────────`);
  inf(`GET /api/data/v9.2/salesorders?$filter=ordernumber eq '${numeroOV}'`);
  try {
    const res = await d365Get(token, 'salesorders', {
      $select: 'salesorderid,ordernumber,name,totalamount,statecode',
      $filter: `ordernumber eq '${numeroOV}'`,
      $top: 1,
    });
    const orders = res.data.value || [];
    if (orders.length) {
      ok(`OV encontrada`);
      dim(`  ID:     ${orders[0].salesorderid}`);
      dim(`  Número: ${orders[0].ordernumber}`);
      dim(`  Nombre: ${orders[0].name}`);
      dim(`  Total:  ${orders[0].totalamount}`);
      dim(`  Estado: ${orders[0].statecode}`);
    } else {
      inf(`OV "${numeroOV}" no encontrada — probá con otro número`);
    }
  } catch (e) {
    err(`Error al buscar OV`);
    const msg = e.response?.data?.error?.message || e.message;
    dim(msg);
    if (msg.includes('salesorder')) {
      console.log('\n  → La entidad "salesorders" puede tener otro nombre en tu instancia');
      console.log('  → Revisá con el comando: node test-d365.js entidades\n');
    }
  }
}

// ── 8. Listar business units (equipos/locales) ────────────
async function testEquipos(token) {
  console.log('\n── PASO 7: Business Units (equipos/locales) ──────────');
  try {
    const res = await d365Get(token, 'businessunits', {
      $select: 'businessunitid,name,isdisabled',
      $filter: 'isdisabled eq false',
      $top: 5,
    });
    const bUs = res.data.value || [];
    ok(`${bUs.length} business unit(s) encontrada(s)`);
    bUs.forEach(b => dim(`  ${b.businessunitid} — ${b.name}`));
  } catch (e) {
    err(`Error al obtener business units`);
    dim(e.response?.data?.error?.message || e.message);
  }
}

// ── MAIN ─────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] || 'all';

  console.log('╔═══════════════════════════════════════════╗');
  console.log('║      ThermoParty — Test D365 Connection   ║');
  console.log('╚═══════════════════════════════════════════╝');
  console.log(`Instancia: ${D365_INSTANCE_URL || '(no configurada)'}`);

  if (!checkEnv()) {
    console.log('\n⛔ Corregí el .env antes de continuar\n');
    process.exit(1);
  }

  const token = await getToken();
  if (!token) { console.log('\n⛔ Sin token, no se puede continuar\n'); process.exit(1); }

  switch(cmd) {
    case 'token':
      // Solo testea el token — ya lo hicimos arriba
      break;
    case 'whoami':
      await testWhoAmI(token);
      break;
    case 'agentes':
      await testWhoAmI(token);
      await testAgentes(token);
      break;
    case 'equipos':
      await testWhoAmI(token);
      await testEquipos(token);
      break;
    case 'entidades':
      await testWhoAmI(token);
      await testEntidades(token);
      break;
    case 'ov':
      await testWhoAmI(token);
      await testOV(token, args[1] || 'ORD-001');
      break;
    case 'all':
    default:
      await testWhoAmI(token);
      await testEntidades(token);
      await testAgentes(token);
      await testEquipos(token);
      break;
  }

  console.log('\n── Fin del test ──────────────────────────────────────\n');
}

main().catch(e => {
  console.error('\x1b[31m' + e.message + '\x1b[0m');
  process.exit(1);
});
