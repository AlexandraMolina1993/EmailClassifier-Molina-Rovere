// backend/db.js
const sql = require('mssql/msnodesqlv8');
require('dotenv').config();

const config = {
  server: 'ALEXANDRAMOLINA',
  database: 'EmailClassifier',
  options: {
    instanceName: 'SQLEXPRESS',
    trustedConnection: true,
    trustServerCertificate: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let pool = null;

async function getPool() {
  if (!pool) {
    try {
      pool = await sql.connect(config);
      console.log('✅ Conectado a SQL Server');
    } catch (err) {
      console.error('❌ ERROR COMPLETO AL CONECTAR:');
      console.error(err);
      throw err;
    }
  }

  return pool;
}

async function initDB() {
  const db = await getPool();

  await db.request().query(`
    IF NOT EXISTS (
      SELECT *
      FROM sys.objects
      WHERE object_id = OBJECT_ID(N'[dbo].[Correos]')
        AND type = 'U'
    )
    BEGIN
      CREATE TABLE Correos (
        id INT IDENTITY(1,1) PRIMARY KEY,
        asunto NVARCHAR(500) NOT NULL,
        contenido NVARCHAR(MAX) NOT NULL,
        categoria NVARCHAR(100) NOT NULL,
        area_responsable NVARCHAR(100) NOT NULL,
        prioridad NVARCHAR(10) NOT NULL
          CHECK (prioridad IN ('Baja','Media','Alta')),
        fecha_clasificacion DATETIME2 NOT NULL DEFAULT GETDATE()
      )
    END
  `);

  // Agregar columna usuario si ya existe la tabla sin ella
  await db.request().query(`
    IF NOT EXISTS (
      SELECT * FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME='Correos' AND COLUMN_NAME='usuario'
    )
    ALTER TABLE Correos ADD usuario NVARCHAR(100) NOT NULL DEFAULT 'sistema'
  `);

  console.log('✅ Tabla Correos lista');
}

module.exports = {
  getPool,
  initDB,
  sql
};