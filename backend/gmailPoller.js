// backend/gmailPoller.js
// Lee Gmail automáticamente cada 5 minutos y clasifica los correos nuevos

const cron = require('node-cron');
const { getUnreadEmails, markAsRead } = require('./gmail');
const { classifyEmail } = require('./classifier');
const { getPool, sql }  = require('./db');

let pollerActivo = false;

async function procesarCorreosNuevos() {
  console.log('📬 Verificando correos nuevos en Gmail...');
  try {
    const emails = await getUnreadEmails(20);
    if (!emails.length) {
      console.log('📭 No hay correos nuevos.');
      return { clasificados: 0 };
    }

    console.log(`📨 ${emails.length} correo(s) nuevos encontrados.`);
    let clasificados = 0;

    for (const email of emails) {
      try {
        const contenido = email.contenido || email.asunto;
        const { categoria, area_responsable, prioridad } =
          classifyEmail(email.asunto, contenido);

        const pool = await getPool();
        await pool.request()
          .input('asunto',           sql.NVarChar(500),     email.asunto.substring(0, 500))
          .input('contenido',        sql.NVarChar(sql.MAX), contenido)
          .input('categoria',        sql.NVarChar(100),     categoria)
          .input('area_responsable', sql.NVarChar(100),     area_responsable)
          .input('prioridad',        sql.NVarChar(10),      prioridad)
          .input('usuario',          sql.NVarChar(100),     `gmail:${email.de.substring(0, 80)}`)
          .query(`
            INSERT INTO Correos
              (asunto, contenido, categoria, area_responsable, prioridad, usuario)
            VALUES
              (@asunto, @contenido, @categoria, @area_responsable, @prioridad, @usuario)
          `);

        await markAsRead(email.id);
        clasificados++;
        console.log(`  ✅ "${email.asunto.substring(0,50)}" → ${categoria} [${prioridad}]`);
      } catch (err) {
        console.error(`  ❌ Error con "${email.asunto}":`, err.message);
      }
    }

    console.log(`✅ ${clasificados} correo(s) clasificados automáticamente.`);
    return { clasificados };
  } catch (err) {
    console.error('❌ Error en poller Gmail:', err.message);
    return { clasificados: 0, error: err.message };
  }
}

function iniciarPoller(intervaloMinutos = 5) {
  if (pollerActivo) return;
  pollerActivo = true;

  // Ejecutar inmediatamente al arrancar
  procesarCorreosNuevos();

  // Luego cada X minutos
  cron.schedule(`*/${intervaloMinutos} * * * *`, () => {
    procesarCorreosNuevos();
  });

  console.log(`🔄 Poller de Gmail activo — revisando cada ${intervaloMinutos} minutos`);
}

module.exports = { iniciarPoller, procesarCorreosNuevos };