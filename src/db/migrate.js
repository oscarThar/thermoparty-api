// src/db/migrate.js
// Ejecutar una vez: node src/db/migrate.js
require('dotenv').config();
const mysql = require('mysql2/promise');

async function migrate() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`USE \`${process.env.DB_NAME}\``);

  // ── COLABORADORES (Agentes / Team Leaders) ────────────────
  // Espejo local de acc_colaboradors de D365
  // Solo para usar como FK — la fuente de verdad es D365
  // NUNCA se guarda password aquí
  await conn.query(`
    CREATE TABLE IF NOT EXISTS colaboradores (
      d365_id VARCHAR(36) PRIMARY KEY COMMENT 'acc_colaboradorid de D365',
      id_numerico INT COMMENT 'acc_id numérico de D365',
      nombre VARCHAR(200) NOT NULL,
      email VARCHAR(200),
      rol ENUM('Agente','Team Leader') NOT NULL DEFAULT 'Agente',
      business_unit_id VARCHAR(36) COMMENT '_owningbusinessunit_value',
      team_leader_id VARCHAR(36) COMMENT '_acc_team_leader_value',
      branch_manager_id VARCHAR(36) COMMENT '_acc_branchmanagerid_value',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_id_numerico (id_numerico),
      INDEX idx_business_unit (business_unit_id),
      INDEX idx_team_leader (team_leader_id)
    )
  `);

  // ── USUARIOS BACKOFFICE (Gerentes / Head Comercial) ───────
  // Espejo local de acc_usuariobackoffices de D365
  // Solo ID, usuario y rol — la password SIEMPRE se valida en D365
  await conn.query(`
    CREATE TABLE IF NOT EXISTS usuarios_backoffice (
      d365_id VARCHAR(36) PRIMARY KEY COMMENT 'acc_usuariobackofficeid de D365',
      usuario VARCHAR(200) NOT NULL COMMENT 'acc_name (email)',
      rol ENUM('Gerente','Head Comercial') NOT NULL DEFAULT 'Head Comercial',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_usuario (usuario)
    )
  `);

  // ── PROSPECTOS ──
  await conn.query(`
    CREATE TABLE IF NOT EXISTS prospectos (
      id VARCHAR(36) PRIMARY KEY,
      agente_id VARCHAR(36) NOT NULL,
      agente_nombre VARCHAR(200),
      equipo_id VARCHAR(36),
      equipo_nombre VARCHAR(200),
      local_id VARCHAR(36),
      local_nombre VARCHAR(200),
      nombre VARCHAR(200) NOT NULL,
      telefono VARCHAR(50),
      zona VARCHAR(200),
      modelo_tm VARCHAR(10),
      estado ENUM('Por contactar','Contactado','No interesado','ThermoParty realizada') DEFAULT 'Por contactar',
      party_id VARCHAR(36),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_agente (agente_id),
      INDEX idx_local (local_id),
      INDEX idx_equipo (equipo_id)
    )
  `);

  // ── THERMOPARTIES ──
  await conn.query(`
    CREATE TABLE IF NOT EXISTS parties (
      id VARCHAR(36) PRIMARY KEY,
      agente_id VARCHAR(36) NOT NULL,
      agente_nombre VARCHAR(200),
      equipo_id VARCHAR(36),
      equipo_nombre VARCHAR(200),
      local_id VARCHAR(36),
      local_nombre VARCHAR(200),
      anfitrion_nombre VARCHAR(200) NOT NULL,
      telefono VARCHAR(50) NOT NULL,
      ov VARCHAR(100),
      modelo_tm VARCHAR(10),
      fecha DATE NOT NULL,
      calle VARCHAR(300),
      localidad VARCHAR(200),
      menu VARCHAR(200),
      regalo VARCHAR(200),
      estado ENUM('Agendada','Regalo entregado','Realizada y cerrada','Con ventas posteriores','No realizada') DEFAULT 'Agendada',
      foto MEDIUMTEXT,
      duracion INT,
      cree_ventas ENUM('Sí','Tal vez','No'),
      recluta_anfitrion TINYINT(1) DEFAULT 0,
      upgrade_anfitrion ENUM('Sí','No'),
      zona_target TINYINT(1) DEFAULT 0,
      motivo_cancelacion TEXT,
      fecha_entrega_regalo DATE,
      fecha_cierre DATE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_agente (agente_id),
      INDEX idx_local (local_id),
      INDEX idx_estado (estado),
      INDEX idx_fecha (fecha)
    )
  `);

  // ── INVITADOS ──
  await conn.query(`
    CREATE TABLE IF NOT EXISTS invitados (
      id VARCHAR(36) PRIMARY KEY,
      party_id VARCHAR(36) NOT NULL,
      nombre VARCHAR(200) NOT NULL,
      zona VARCHAR(200),
      tiene_tm ENUM('si','no') DEFAULT 'no',
      modelo_tm_invitado VARCHAR(10),
      familia VARCHAR(10),
      deseos JSON,
      completado TINYINT(1) DEFAULT 0,
      ahorro DECIMAL(12,2),
      quiere_comprar TINYINT(1),
      forma_pago ENUM('Contado','Cuotas','A definir'),
      quiere_ser_agente ENUM('Sí','No'),
      frena TEXT,
      objecion TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE,
      INDEX idx_party (party_id)
    )
  `);

  // ── VENTAS POSTERIORES ──
  await conn.query(`
    CREATE TABLE IF NOT EXISTS ventas (
      id VARCHAR(36) PRIMARY KEY,
      party_id VARCHAR(36) NOT NULL,
      agente_id VARCHAR(36) NOT NULL,
      local_id VARCHAR(36),
      comprador_id VARCHAR(100),
      comprador_nombre VARCHAR(200),
      anfitrion_nombre VARCHAR(200),
      ov VARCHAR(100) NOT NULL,
      fecha DATE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE,
      INDEX idx_party (party_id),
      INDEX idx_agente (agente_id)
    )
  `);

  // ── CUTTERS (upgrade TM7) ──
  await conn.query(`
    CREATE TABLE IF NOT EXISTS cutters (
      id VARCHAR(36) PRIMARY KEY,
      party_id VARCHAR(36) NOT NULL,
      agente_id VARCHAR(36) NOT NULL,
      local_id VARCHAR(36),
      anfitrion_nombre VARCHAR(200),
      telefono VARCHAR(50),
      ov VARCHAR(100),
      estado ENUM('Pendiente','Entregado a agente') DEFAULT 'Pendiente',
      tipo VARCHAR(50) DEFAULT 'cierre',
      fecha_venta DATE,
      fecha_entrega DATE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE,
      INDEX idx_local (local_id)
    )
  `);

  // ── CONFIG (menus y regalos) ──
  await conn.query(`
    CREATE TABLE IF NOT EXISTS config (
      clave VARCHAR(100) PRIMARY KEY,
      valor JSON NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  // Insertar config por defecto
  await conn.query(`
    INSERT IGNORE INTO config (clave, valor) VALUES
      ('menus', '["Peruano","Pizza","Brunch"]'),
      ('regalos', '["Bolso de transporte TM6","Caja de cubiertos"]')
  `);

  console.log('✅ Migración completada exitosamente');
  await conn.end();
}

migrate().catch(err => { console.error('❌ Error en migración:', err); process.exit(1); });
