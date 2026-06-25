// backend/routes.js
const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { classifyEmail } = require('./classifier');
const { getPool, sql } = require('./db');

const router = express.Router();

// ── Auth simple (usuario hardcodeado para MVP académico) ──────────────────────
const USERS = [
  { id: 1, username: 'admin', password: 'admin123', role: 'admin', nombre: 'Administrador' },
  { id: 2, username: 'operador', password: 'op123', role: 'operador', nombre: 'Operador' },
];

// Middleware de sesión simple por token en memoria
const activeSessions = new Map();

function authMiddleware(req, res, next) {
  const token = req.headers['x-auth-token'];
  if (!token || !activeSessions.has(token)) {
    return res.status(401).json({ error: 'No autorizado. Iniciá sesión.' });
  }
  req.user = activeSessions.get(token);
  next();
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acceso solo para administradores.' });
  }
  next();
}

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/auth/login', [
  body('username').trim().notEmpty(),
  body('password').notEmpty(),
], (req, res) => {
  const { username, password } = req.body;
  const user = USERS.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });

  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  activeSessions.set(token, { id: user.id, username: user.username, role: user.role, nombre: user.nombre });

  return res.json({ token, user: { username: user.username, role: user.role, nombre: user.nombre } });
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
router.post('/auth/logout', (req, res) => {
  const token = req.headers['x-auth-token'];
  if (token) activeSessions.delete(token);
  return res.json({ ok: true });
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/auth/me', authMiddleware, (req, res) => {
  return res.json(req.user);
});

// ── POST /api/clasificar ──────────────────────────────────────────────────────
router.post('/clasificar', authMiddleware, [
  body('asunto').trim().notEmpty().withMessage('El asunto es requerido').isLength({ max: 500 }),
  body('contenido').trim().notEmpty().withMessage('El contenido es requerido'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const { asunto, contenido } = req.body;
  try {
    const { categoria, area_responsable, prioridad } = classifyEmail(asunto, contenido);
    const pool = await getPool();
    const result = await pool.request()
      .input('asunto',           sql.NVarChar(500),     asunto)
      .input('contenido',        sql.NVarChar(sql.MAX), contenido)
      .input('categoria',        sql.NVarChar(100),     categoria)
      .input('area_responsable', sql.NVarChar(100),     area_responsable)
      .input('prioridad',        sql.NVarChar(10),      prioridad)
      .input('usuario',          sql.NVarChar(100),     req.user.username)
      .query(`
        INSERT INTO Correos (asunto, contenido, categoria, area_responsable, prioridad, usuario)
        OUTPUT INSERTED.id, INSERTED.fecha_clasificacion
        VALUES (@asunto, @contenido, @categoria, @area_responsable, @prioridad, @usuario)
      `);

    const inserted = result.recordset[0];
    return res.status(201).json({ id: inserted.id, asunto, categoria, area_responsable, prioridad, fecha_clasificacion: inserted.fecha_clasificacion });
  } catch (err) {
    console.error('Error al clasificar:', err.message);
    return res.status(500).json({ error: 'Error al procesar el correo.' });
  }
});

// ── GET /api/historial ────────────────────────────────────────────────────────
router.get('/historial', authMiddleware, [
  query('categoria').optional().isString(),
  query('prioridad').optional().isIn(['Alta', 'Media', 'Baja']),
  query('busqueda').optional().isString(),
  query('pagina').optional().isInt({ min: 1 }),
], async (req, res) => {

  const pagina    = parseInt(req.query.pagina) || 1;
  const porPagina = 10;
  const offset    = (pagina - 1) * porPagina;

  let where = 'WHERE 1=1';
  const pool = await getPool();
  const request = pool.request();

  // Filtro categoría
  if (req.query.categoria && req.query.categoria.trim() !== '') {
    where += ' AND categoria = @categoria';
    request.input('categoria', sql.NVarChar(100), req.query.categoria);
  }

  // Filtro prioridad
  if (req.query.prioridad && req.query.prioridad.trim() !== '') {
    where += ' AND prioridad = @prioridad';
    request.input('prioridad', sql.NVarChar(10), req.query.prioridad);
  }

  // Filtro búsqueda
  if (req.query.busqueda && req.query.busqueda.trim() !== '') {
    where += ' AND (asunto LIKE @busqueda OR contenido LIKE @busqueda)';
    request.input('busqueda', sql.NVarChar(200), `%${req.query.busqueda}%`);
  }

  // ⭐ Filtro fecha DESDE
  if (req.query.desde && req.query.desde.trim() !== '') {
    where += ' AND fecha_clasificacion >= @desde';
    request.input('desde', sql.DateTime2, new Date(req.query.desde));
  }

  // ⭐ Filtro fecha HASTA
  if (req.query.hasta && req.query.hasta.trim() !== '') {
    where += ' AND fecha_clasificacion <= @hasta';
    request.input('hasta', sql.DateTime2, new Date(req.query.hasta));
  }

  try {
    // Total de registros
    const countResult = await request.query(`
      SELECT COUNT(*) AS total
      FROM Correos
      ${where}
    `);

    const total = countResult.recordset[0].total;

    // Segunda consulta con paginación
    const request2 = pool.request();

    if (req.query.categoria) request2.input('categoria', sql.NVarChar(100), req.query.categoria);
    if (req.query.prioridad) request2.input('prioridad', sql.NVarChar(10), req.query.prioridad);
    if (req.query.busqueda)  request2.input('busqueda',  sql.NVarChar(200), `%${req.query.busqueda}%`);
    if (req.query.desde)     request2.input('desde',     sql.DateTime2, new Date(req.query.desde));
    if (req.query.hasta)     request2.input('hasta',     sql.DateTime2, new Date(req.query.hasta));

    request2.input('offset',    sql.Int, offset);
    request2.input('porPagina', sql.Int, porPagina);

    const result = await request2.query(`
      SELECT id, asunto, categoria, area_responsable, prioridad, fecha_clasificacion, usuario
      FROM Correos
      ${where}
      ORDER BY fecha_clasificacion DESC
      OFFSET @offset ROWS FETCH NEXT @porPagina ROWS ONLY
    `);

    return res.json({
      datos: result.recordset,
      total,
      pagina,
      totalPaginas: Math.ceil(total / porPagina),
    });

  } catch (err) {
    console.error('Error historial:', err.message);
    return res.status(500).json({ error: 'Error al obtener el historial.' });
  }
});

// ── GET /api/estadisticas ─────────────────────────────────────────────────────
router.get('/estadisticas', authMiddleware, async (req, res) => {
  try {
    const pool = await getPool();

    const [porCategoria, porPrioridad, porDia, totales] = await Promise.all([
      pool.request().query(`
        SELECT categoria, COUNT(*) AS total
        FROM Correos GROUP BY categoria ORDER BY total DESC
      `),
      pool.request().query(`
        SELECT prioridad, COUNT(*) AS total
        FROM Correos GROUP BY prioridad
      `),
      pool.request().query(`
        SELECT CAST(fecha_clasificacion AS DATE) AS dia, COUNT(*) AS total
        FROM Correos
        WHERE fecha_clasificacion >= DATEADD(DAY, -7, GETDATE())
        GROUP BY CAST(fecha_clasificacion AS DATE)
        ORDER BY dia ASC
      `),
      pool.request().query(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN prioridad = 'Alta'  THEN 1 ELSE 0 END) AS alta,
          SUM(CASE WHEN prioridad = 'Media' THEN 1 ELSE 0 END) AS media,
          SUM(CASE WHEN prioridad = 'Baja'  THEN 1 ELSE 0 END) AS baja
        FROM Correos
      `),
    ]);

    return res.json({
      porCategoria: porCategoria.recordset,
      porPrioridad: porPrioridad.recordset,
      porDia:       porDia.recordset,
      totales:      totales.recordset[0],
    });
  } catch (err) {
    console.error('Error estadísticas:', err.message);
    return res.status(500).json({ error: 'Error al obtener estadísticas.' });
  }
});

// ── DELETE /api/correos/:id (solo admin) ──────────────────────────────────────
router.delete('/correos/:id', authMiddleware, adminOnly, async (req, res) => {
  const { id } = req.params;
  if (!Number.isInteger(Number(id))) return res.status(400).json({ error: 'ID inválido' });

  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, Number(id))
      .query('DELETE FROM Correos WHERE id = @id');
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Error al eliminar.' });
  }
});


// ── GET /api/gmail/estado ─────────────────────────────────────────────────────
router.get('/gmail/estado', authMiddleware, (req, res) => {
  const fs   = require('fs');
  const path = require('path');
  return res.json({
    credenciales: fs.existsSync(path.join(__dirname, 'credentials.json')),
    autorizado:   fs.existsSync(path.join(__dirname, 'token.json')),
  });
});

// ── POST /api/gmail/sincronizar ───────────────────────────────────────────────
// Fuerza una sincronización manual inmediata
router.post('/gmail/sincronizar', authMiddleware, async (req, res) => {
  const { procesarCorreosNuevos } = require('./gmailPoller');
  try {
    const resultado = await procesarCorreosNuevos();
    return res.json(resultado);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/exportar ─────────────────────────────────────────────────────────
// Exporta los datos de la tabla Correos a Excel
router.get('/exportar', async (req, res) => {
  const ExcelJS = require('exceljs');

  try {
    const pool = await getPool();

    // Filtros opcionales (solo si vienen con valor)
    let where = 'WHERE 1=1';
    const request = pool.request();

    if (req.query.categoria && req.query.categoria.trim() !== '') {
      where += ' AND categoria = @categoria';
      request.input('categoria', sql.NVarChar(100), req.query.categoria);
    }

    if (req.query.prioridad && req.query.prioridad.trim() !== '') {
      where += ' AND prioridad = @prioridad';
      request.input('prioridad', sql.NVarChar(10), req.query.prioridad);
    }

    if (req.query.desde && req.query.desde.trim() !== '') {
      where += ' AND fecha_clasificacion >= @desde';
      request.input('desde', sql.DateTime2, new Date(req.query.desde));
    }

    if (req.query.hasta && req.query.hasta.trim() !== '') {
      where += ' AND fecha_clasificacion <= @hasta';
      request.input('hasta', sql.DateTime2, new Date(req.query.hasta));
    }

    // 🔥 TABLA Y COLUMNAS REALES
    const query = `
      SELECT 
        id,
        asunto,
        contenido,
        categoria,
        area_responsable,
        prioridad,
        fecha_clasificacion,
        usuario
      FROM Correos
      ${where}
      ORDER BY fecha_clasificacion DESC
    `;

    const result = await request.query(query);

    // Crear Excel
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Correos');

    sheet.columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'Asunto', key: 'asunto', width: 40 },
      { header: 'Contenido', key: 'contenido', width: 60 },
      { header: 'Categoría', key: 'categoria', width: 20 },
      { header: 'Área Responsable', key: 'area_responsable', width: 25 },
      { header: 'Prioridad', key: 'prioridad', width: 15 },
      { header: 'Fecha Clasificación', key: 'fecha_clasificacion', width: 25 },
      { header: 'Usuario', key: 'usuario', width: 25 },
    ];

    sheet.addRows(result.recordset);

    // Enviar archivo
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=correos.xlsx'
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error('Error al exportar:', err);
    res.status(500).json({ error: 'Error al exportar a Excel' });
  }
});



module.exports = router;