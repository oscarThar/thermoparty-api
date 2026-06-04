# ThermoParty API

Backend Node/Express + MySQL + Dynamics 365 para la app ThermoParty.

## Arquitectura

```
ThermoParty.html (frontend)
        ↕ fetch() → JWT en header
    Node/Express API  (este proyecto)
        ↕                    ↕
    MySQL              Dynamics 365
 (parties, prospectos,  (agentes, OVs,
  invitados, ventas)     clientes)
```

## Setup inicial

### 1. Instalar dependencias
```bash
npm install
```

### 2. Configurar variables de entorno
```bash
cp .env.example .env
# Editar .env con tus valores reales
```

Variables clave en `.env`:
| Variable | Descripción |
|---|---|
| `D365_TENANT_ID` | Tu Azure AD Tenant ID |
| `D365_CLIENT_ID` | App registration Client ID |
| `D365_CLIENT_SECRET` | Client Secret de la app en Azure |
| `D365_INSTANCE_URL` | URL de tu instancia D365 (ej: https://tharsa.crm2.dynamics.com) |
| `DB_*` | Credenciales MySQL |
| `JWT_SECRET` | String largo y random para firmar tokens |

### 3. Crear la base de datos
```bash
npm run migrate
```

### 4. Crear usuarios gerentes/head (solo en development)
```bash
# Ejemplo con curl:
curl -X POST http://localhost:3000/api/auth/setup \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Gerente Centro","usuario":"gerente.centro","password":"pass123","rol":"Gerente","local_id":"LOC1","local_nombre":"Local Centro"}'
```

### 5. Poner el HTML del frontend
```bash
mkdir public
# Copiar ThermoParty.html → public/index.html
# (ver sección "Migrar el frontend" abajo)
```

### 6. Correr el servidor
```bash
npm run dev   # desarrollo (con nodemon)
npm start     # producción
```

---

## Configurar Dynamics 365

### En Azure AD — registrar la aplicación:
1. Ir a **portal.azure.com** → Azure Active Directory → App registrations → New registration
2. Nombre: `ThermoParty API`
3. En **Certificates & secrets** → crear un Client Secret → copiarlo al `.env`
4. En **API permissions** → Add permission → Dynamics CRM → `user_impersonation`
5. **Grant admin consent**

### En Dynamics 365:
1. Settings → Security → Application Users → New
2. Asociar la app registration que creaste
3. Asignar rol: mínimo **System User** (o uno custom con permisos de lectura)

### Ajustar campos en `src/services/dynamics.js`:
Los nombres de entidades y campos varían según tu implementación de D365.
Revisar y ajustar:
- `systemusers` → puede ser `contacts` o una entidad custom si los agentes no son usuarios del sistema
- `salesorders` → ajustar si las OVs están en otra entidad
- Campos como `businessunitid` → mapear a tu estructura de locales/equipos

---

## Migrar el frontend (ThermoParty.html)

El HTML actual usa `localStorage`. Para conectarlo a la API hay que reemplazar
las funciones de datos por llamadas `fetch()`.

Patrón de migración:
```javascript
// ANTES (localStorage)
function getParties() { return LS.get('tp_parties', []); }

// DESPUÉS (API)
async function getParties() {
  const res = await apiFetch('/api/parties');
  return res.json();
}

// Helper para todas las llamadas
async function apiFetch(url, options = {}) {
  const token = sessionStorage.getItem('tp_token');
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}
```

---

## Endpoints de la API

### Auth
| Método | Endpoint | Descripción |
|---|---|---|
| POST | `/api/auth/login-agente` | Login con ID (valida en D365) |
| POST | `/api/auth/login` | Login gerente/head (MySQL) |

### D365 (consulta)
| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/api/d365/agentes` | Lista de agentes |
| GET | `/api/d365/agentes/:id` | Un agente |
| GET | `/api/d365/equipos` | Business units |
| GET | `/api/d365/validar-ov/:numero` | Validar OV |
| GET | `/api/d365/clientes?q=texto` | Buscar contactos |

### ThermoParties
| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/api/parties` | Listar (filtrado por rol) |
| POST | `/api/parties` | Crear |
| GET | `/api/parties/:id` | Detalle con invitados |
| PATCH | `/api/parties/:id/entregar-regalo` | Gerente entrega regalo |
| PATCH | `/api/parties/:id/realizar` | Cierre completo |
| PATCH | `/api/parties/:id/reagendar` | Cambiar fecha |
| PATCH | `/api/parties/:id/cancelar` | Cancelar |

### Invitados
| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/api/parties/:partyId/invitados` | Listar |
| POST | `/api/parties/:partyId/invitados` | Agregar |
| PATCH | `/api/parties/:partyId/invitados/:id` | Actualizar (incluye vista QR) |
| GET | `/api/invitado/:partyId/:invId` | Vista pública (sin auth, para QR) |

### Otros
| Método | Endpoint | Descripción |
|---|---|---|
| POST | `/api/ventas` | Registrar venta posterior |
| GET | `/api/ventas?party_id=x` | Listar ventas |
| GET | `/api/cutters` | Listar cutters |
| PATCH | `/api/cutters/:id/entregar` | Gerente entrega cutter |
| GET | `/api/config` | Leer menús y regalos |
| PUT | `/api/config/:clave` | Actualizar config (Head) |

---

## Deploy

### Opción más rápida: Railway
1. Crear cuenta en railway.app
2. New Project → Deploy from GitHub
3. Agregar variables de entorno en Railway
4. Agregar un MySQL service en el mismo proyecto
5. Deploy automático en cada push

### Azure (recomendado por D365)
- App Service (Node 18+) para la API
- Azure Database for MySQL para la DB
- Misma red virtual que D365 → latencia mínima en las llamadas

### VPS propio
```bash
# Con PM2
npm install -g pm2
pm2 start src/index.js --name thermoparty
pm2 save
pm2 startup
```
