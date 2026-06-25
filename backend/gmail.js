// backend/gmail.js
const { google } = require('googleapis');
const fs   = require('fs');
const path = require('path');
const http = require('http');
const url  = require('url');

const SCOPES     = ['https://www.googleapis.com/auth/gmail.modify'];
const TOKEN_PATH = path.join(__dirname, 'token.json');
const CREDS_PATH = path.join(__dirname, 'credentials.json');

function getOAuth2Client() {
  if (!fs.existsSync(CREDS_PATH)) {
    throw new Error('No se encontró credentials.json en backend/');
  }
  const creds = JSON.parse(fs.readFileSync(CREDS_PATH));
  const { client_secret, client_id, redirect_uris } =
    creds.installed || creds.web;
  return new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
}

async function getAuthenticatedClient() {
  const auth = getOAuth2Client();
  if (fs.existsSync(TOKEN_PATH)) {
    auth.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH)));
    return auth;
  }
  return await authorizeInBrowser(auth);
}

function authorizeInBrowser(auth) {
  return new Promise((resolve, reject) => {
    const authUrl = auth.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
    });
    console.log('\n🔐 Abrí este enlace para autorizar Gmail:\n');
    console.log(authUrl + '\n');

    const server = http.createServer(async (req, res) => {
      const qs   = new url.URL(req.url, 'http://localhost:3001').searchParams;
      const code = qs.get('code');
      if (!code) return;
      res.end('<h2 style="font-family:sans-serif">✅ Gmail autorizado. Podés cerrar esta pestaña.</h2>');
      server.close();
      try {
        const { tokens } = await auth.getToken(code);
        auth.setCredentials(tokens);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
        console.log('✅ Token de Gmail guardado');
        resolve(auth);
      } catch (err) { reject(err); }
    });

    server.listen(3001, () => {
      const { exec } = require('child_process');
      exec(`start "" "${authUrl}"`, () => {});
    });
  });
}

async function getUnreadEmails(maxResults = 20) {
  const auth  = await getAuthenticatedClient();
  const gmail = google.gmail({ version: 'v1', auth });

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: 'is:unread',
    maxResults,
  });

  const messages = listRes.data.messages || [];
  if (!messages.length) return [];

  const emails = await Promise.all(
    messages.map(async ({ id }) => {
      const msg     = await gmail.users.messages.get({
        userId: 'me', id, format: 'full',
      });
      const headers = msg.data.payload.headers;
      const asunto  = headers.find(h => h.name === 'Subject')?.value || '(Sin asunto)';
      const de      = headers.find(h => h.name === 'From')?.value    || '';
      const fecha   = headers.find(h => h.name === 'Date')?.value    || '';
      const contenido = extractBody(msg.data.payload);
      return { id, asunto, de, fecha, contenido };
    })
  );
  return emails;
}

async function markAsRead(messageId) {
  const auth  = await getAuthenticatedClient();
  const gmail = google.gmail({ version: 'v1', auth });
  await gmail.users.messages.modify({
    userId: 'me', id: messageId,
    requestBody: { removeLabelIds: ['UNREAD'] },
  });
}

function extractBody(payload) {
  if (!payload) return '';
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64')
      .toString('utf-8').replace(/<[^>]+>/g, ' ').trim();
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8').trim();
      }
    }
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64')
          .toString('utf-8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }
      if (part.parts) {
        const nested = extractBody(part);
        if (nested) return nested;
      }
    }
  }
  return '';
}

module.exports = { getUnreadEmails, markAsRead, getAuthenticatedClient };