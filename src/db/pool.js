// src/db/pool.js
require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '-03:00', // Argentina
});

// Test de conexión al iniciar
pool.getConnection()
  .then(conn => { console.log('✅ MySQL conectado'); conn.release(); })
  .catch(err => { console.error('❌ MySQL error:', err.message); });

module.exports = pool;
