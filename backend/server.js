// backend/server.js
// Punto de entrada del servidor Express

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDB } = require('./db');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Sirve el frontend desde la carpeta ../frontend
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api', routes);

// ── Fallback: devuelve index.html para cualquier ruta no-API ──────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// ── Arranque ──────────────────────────────────────────────────────────────────
async function start() {
  try {
    await initDB();
    // Iniciar poller de Gmail (si credentials.json existe)
const fs = require('fs');
const path = require('path');
if (fs.existsSync(path.join(__dirname, 'credentials.json'))) {
  const { iniciarPoller } = require('./gmailPoller');
  iniciarPoller(5); // cada 5 minutos
} else {
  console.log('ℹ️  Gmail no configurado (falta credentials.json)');
}
    app.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('❌ Error al iniciar el servidor:', err.message);
    process.exit(1);
  }
}

start();
