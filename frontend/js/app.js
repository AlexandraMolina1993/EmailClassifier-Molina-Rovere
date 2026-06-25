// frontend/js/app.js
// DESPUÉS
const API = 'http://localhost:3000/api';
localStorage.removeItem('token');
localStorage.removeItem('user');
let TOKEN = null;
let USER  = null;
let historialPagina = 1;
let adminPagina = 1;

// ── Auth ──────────────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (TOKEN) headers['x-auth-token'] = TOKEN;
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  return res;
}

document.getElementById('btn-login').addEventListener('click', async () => {
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  const errEl    = document.getElementById('login-error');
  errEl.style.display = 'none';

  setLoadingBtn('btn-login', true);
  try {
    const res  = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    const data = await res.json();
    if (!res.ok) { errEl.querySelector('span').textContent = data.error; errEl.style.display = 'flex'; return; }

    TOKEN = data.token;
    USER  = data.user;
    localStorage.setItem('token', TOKEN);
    localStorage.setItem('user', JSON.stringify(USER));
    initApp();
  } catch {
    errEl.querySelector('span').textContent = 'No se pudo conectar con el servidor.';
    errEl.style.display = 'flex';
  } finally {
    setLoadingBtn('btn-login', false);
  }
});

document.getElementById('login-pass').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-login').click();
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  await apiFetch('/auth/logout', { method: 'POST' });
  TOKEN = null; USER = null;
  localStorage.removeItem('token'); localStorage.removeItem('user');
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
});

function initApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'grid';
  document.getElementById('user-badge').textContent = `${USER.nombre} (${USER.role})`;

  // Mostrar/ocultar tab admin
  const navAdmin = document.getElementById('nav-admin');
  if (USER.role !== 'admin') navAdmin.style.display = 'none';

  loadQuickStats();
  loadHistorial();
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    document.getElementById(`tab-${tab}`).style.display = 'block';

    if (tab === 'historial')    loadHistorial();
    if (tab === 'estadisticas') loadEstadisticas();
    if (tab === 'admin')        loadAdmin();
  });
});

// ── Clasificar ────────────────────────────────────────────────────────────────
document.getElementById('classify-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();
  setLoadingBtn('btn-classify', true);

  const asunto   = document.getElementById('asunto').value.trim();
  const contenido = document.getElementById('contenido').value.trim();

  try {
    const res  = await apiFetch('/clasificar', { method: 'POST', body: JSON.stringify({ asunto, contenido }) });
    const data = await res.json();
    if (!res.ok) { showError(data.error); return; }
    renderResult(data);
    loadQuickStats();
  } catch {
    showError('No se pudo conectar con el servidor.');
  } finally {
    setLoadingBtn('btn-classify', false);
  }
});

function renderResult(data) {
  document.getElementById('res-categoria').textContent = data.categoria;
  document.getElementById('res-area').textContent      = data.area_responsable;
  document.getElementById('res-fecha').textContent     = fmtDate(data.fecha_clasificacion);
  const el = document.getElementById('res-prioridad');
  el.innerHTML = `<span class="badge badge-${data.prioridad.toLowerCase()}">${data.prioridad}</span>`;
  document.getElementById('result-section').style.display = 'block';
}

// ── Quick Stats ───────────────────────────────────────────────────────────────
async function loadQuickStats() {
  try {
    const res  = await apiFetch('/estadisticas');
    const data = await res.json();
    document.getElementById('qs-total').textContent = data.totales.total;
    document.getElementById('qs-alta').textContent  = data.totales.alta;
    document.getElementById('qs-media').textContent = data.totales.media;
    document.getElementById('qs-baja').textContent  = data.totales.baja;

    const max = Math.max(...data.porCategoria.map(c => c.total), 1);
    document.getElementById('cat-bars').innerHTML = data.porCategoria.map(c => `
      <div class="cat-bar-row">
        <div class="cat-bar-label"><span>${c.categoria}</span><span>${c.total}</span></div>
        <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${(c.total/max*100).toFixed(1)}%"></div></div>
      </div>
    `).join('');
  } catch {}
}

// ── Historial ─────────────────────────────────────────────────────────────────
// ── Filtros de fecha ──────────────────────────────────────────────────────────
async function loadHistorial(pagina = 1) {
  historialPagina = pagina;
  const busqueda  = document.getElementById('filtro-busqueda').value.trim();
  const categoria = document.getElementById('filtro-categoria').value;
  const prioridad = document.getElementById('filtro-prioridad').value;
  const desde     = document.getElementById('filtro-desde')?.value || '';
  const hasta     = document.getElementById('filtro-hasta')?.value || '';

  const params = new URLSearchParams({ pagina });
  if (busqueda)  params.set('busqueda',  busqueda);
  if (categoria) params.set('categoria', categoria);
  if (prioridad) params.set('prioridad', prioridad);
  if (desde)     params.set('desde',     desde);
  if (hasta)     params.set('hasta',     hasta);

  try {
    const res  = await apiFetch(`/historial?${params}`);
    const data = await res.json();
    renderHistorial(data);
  } catch {
    document.getElementById('history-body').innerHTML =
      '<tr><td colspan="8"><div class="empty-state"><p>Error al cargar.</p></div></td></tr>';
  }
}

// Controladores de eventos para el filtrado del Historial
document.getElementById('btn-filtrar').addEventListener('click', () => loadHistorial(1));

document.getElementById('btn-limpiar').addEventListener('click', () => {
  document.getElementById('filtro-busqueda').value  = '';
  document.getElementById('filtro-categoria').value = '';
  document.getElementById('filtro-prioridad').value = '';
  
  // Se limpian los inputs de fecha para que no queden valores colgados
  const filtroDesde = document.getElementById('filtro-desde');
  const filtroHasta = document.getElementById('filtro-hasta');
  if (filtroDesde) filtroDesde.value = '';
  if (filtroHasta) filtroHasta.value = '';
  
  loadHistorial(1);
});

document.getElementById('filtro-busqueda').addEventListener('keydown', e => {
  if (e.key === 'Enter') loadHistorial(1);
});

// ── Exportar Excel ────────────────────────────────────────────────────────────
document.getElementById('btn-exportar')?.addEventListener('click', async () => {
  const categoria = document.getElementById('filtro-categoria').value;
  const prioridad = document.getElementById('filtro-prioridad').value;
  const desde     = document.getElementById('filtro-desde')?.value || '';
  const hasta     = document.getElementById('filtro-hasta')?.value || '';

  const params = new URLSearchParams();
  if (categoria) params.set('categoria', categoria);
  if (prioridad) params.set('prioridad', prioridad);
  if (desde)     params.set('desde', desde);
  if (hasta)     params.set('hasta', hasta);

  // Descarga directa
  const url = `${API}/exportar?${params}&token=${TOKEN}`;
  window.open(`http://localhost:3000/api/exportar?${params}`, '_blank');
});

// ── Gmail estado + sincronizar ────────────────────────────────────────────────
async function checkGmailEstado() {
  const badge = document.getElementById('gmail-estado-badge');
  if (!badge) return;
  try {
    const res  = await apiFetch('/gmail/estado');
    const data = await res.json();
    if (!data.credenciales) {
      badge.innerHTML = '<span style="color:var(--danger)">● Sin configurar</span>';
    } else if (!data.autorizado) {
      badge.innerHTML = '<span style="color:var(--warning)">● Pendiente de autorización</span>';
    } else {
      badge.innerHTML = '<span style="color:var(--success)">● Gmail conectado</span>';
    }
  } catch {
    badge.textContent = 'No disponible';
  }
}

document.getElementById('btn-sincronizar-gmail')?.addEventListener('click', async () => {
  const btn = document.getElementById('btn-sincronizar-gmail');
  const msg = document.getElementById('gmail-sync-msg');
  btn.disabled = true;
  msg.textContent = 'Sincronizando...';

  try {
    const res  = await apiFetch('/gmail/sincronizar', { method: 'POST' });
    const data = await res.json();
    if (data.error) {
      msg.textContent = '❌ ' + data.error;
    } else if (data.clasificados === 0) {
      msg.textContent = '📭 No hay correos nuevos en Gmail.';
    } else {
      msg.textContent = `✅ ${data.clasificados} correo(s) clasificados.`;
      await loadQuickStats();
      await loadHistorial(1);
    }
  } catch {
    msg.textContent = '❌ Error al conectar con el servidor.';
  } finally {
    btn.disabled = false;
  }
});

// Verificar estado de Gmail al cargar
checkGmailEstado();

function renderHistorial({ datos, total, pagina, totalPaginas }) {
  // Columna acciones solo para admin
  document.getElementById('th-acciones').textContent = USER?.role === 'admin' ? 'Acción' : '';

  if (!datos.length) {
    document.getElementById('history-body').innerHTML =
      '<tr><td colspan="8"><div class="empty-state"><p>No se encontraron registros.</p></div></td></tr>';
    document.getElementById('pagination').innerHTML = '';
    return;
  }

  document.getElementById('history-body').innerHTML = datos.map(item => `
    <tr>
      <td style="color:var(--text-muted)">#${item.id}</td>
      <td class="asunto-cell" title="${esc(item.asunto)}">${esc(item.asunto)}</td>
      <td>${esc(item.categoria)}</td>
      <td>${esc(item.area_responsable)}</td>
      <td><span class="badge badge-${item.prioridad.toLowerCase()}">${esc(item.prioridad)}</span></td>
      <td style="color:var(--text-muted)">${esc(item.usuario || '—')}</td>
      <td class="fecha-cell">${fmtDate(item.fecha_clasificacion)}</td>
      <td>${USER?.role === 'admin' ? `<button class="btn btn-danger" style="padding:4px 10px;font-size:12px" onclick="eliminar(${item.id})">Eliminar</button>` : ''}</td>
    </tr>
  `).join('');

  renderPagination('pagination', pagina, totalPaginas, loadHistorial);
}

document.getElementById('btn-filtrar').addEventListener('click', () => loadHistorial(1));
document.getElementById('btn-limpiar').addEventListener('click', () => {
  document.getElementById('filtro-busqueda').value  = '';
  document.getElementById('filtro-categoria').value = '';
  document.getElementById('filtro-prioridad').value = '';
  loadHistorial(1);
});
document.getElementById('filtro-busqueda').addEventListener('keydown', e => {
  if (e.key === 'Enter') loadHistorial(1);
});

// ── Estadísticas ──────────────────────────────────────────────────────────────
async function loadEstadisticas() {
  try {
    const res  = await apiFetch('/estadisticas');
    const data = await res.json();

    document.getElementById('kpi-total').textContent = data.totales.total;
    document.getElementById('kpi-alta').textContent  = data.totales.alta;
    document.getElementById('kpi-media').textContent = data.totales.media;
    document.getElementById('kpi-baja').textContent  = data.totales.baja;

    // Chart categorías
    const maxCat = Math.max(...data.porCategoria.map(c => c.total), 1);
    const colors = ['#2563EB','#7C3AED','#059669','#D97706','#DC2626','#0891B2','#6B7280'];
    document.getElementById('chart-categoria').innerHTML = `
      <div class="bar-chart">
        ${data.porCategoria.map((c, i) => `
          <div class="bar-row">
            <span>${c.categoria}</span>
            <div class="bar-track"><div class="bar-fill" style="width:${(c.total/maxCat*100).toFixed(1)}%;background:${colors[i % colors.length]}"></div></div>
            <span class="bar-count">${c.total}</span>
          </div>
        `).join('')}
      </div>`;

    // Chart prioridad
    const maxPri = Math.max(...data.porPrioridad.map(p => p.total), 1);
    const priColors = { Alta: '#DC2626', Media: '#D97706', Baja: '#059669' };
    document.getElementById('chart-prioridad').innerHTML = `
      <div class="bar-chart">
        ${data.porPrioridad.map(p => `
          <div class="bar-row">
            <span>${p.prioridad}</span>
            <div class="bar-track"><div class="bar-fill" style="width:${(p.total/maxPri*100).toFixed(1)}%;background:${priColors[p.prioridad]}"></div></div>
            <span class="bar-count">${p.total}</span>
          </div>
        `).join('')}
      </div>`;

    // Chart días
    const maxDia = Math.max(...data.porDia.map(d => d.total), 1);
    document.getElementById('chart-dias').innerHTML = `
      <div class="day-chart">
        ${data.porDia.length ? data.porDia.map(d => `
          <div class="day-col">
            <span class="day-val">${d.total}</span>
            <div class="day-bar" style="height:${Math.max(d.total/maxDia*90, 4)}px"></div>
            <span class="day-label">${new Date(d.dia).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit'})}</span>
          </div>
        `).join('') : '<p style="color:var(--text-muted);font-size:13px;margin:auto">Sin datos en los últimos 7 días.</p>'}
      </div>`;
  } catch {}
}

// ── Admin ─────────────────────────────────────────────────────────────────────
async function loadAdmin(pagina = 1) {
  adminPagina = pagina;
  try {
    const res  = await apiFetch(`/historial?pagina=${pagina}`);
    const data = await res.json();

    if (!data.datos.length) {
      document.getElementById('admin-body').innerHTML =
        '<tr><td colspan="7"><div class="empty-state"><p>No hay registros.</p></div></td></tr>';
      return;
    }

    document.getElementById('admin-body').innerHTML = data.datos.map(item => `
      <tr>
        <td style="color:var(--text-muted)">#${item.id}</td>
        <td class="asunto-cell" title="${esc(item.asunto)}">${esc(item.asunto)}</td>
        <td>${esc(item.categoria)}</td>
        <td><span class="badge badge-${item.prioridad.toLowerCase()}">${esc(item.prioridad)}</span></td>
        <td style="color:var(--text-muted)">${esc(item.usuario || '—')}</td>
        <td class="fecha-cell">${fmtDate(item.fecha_clasificacion)}</td>
        <td><button class="btn btn-danger" style="padding:4px 10px;font-size:12px" onclick="eliminar(${item.id}, true)">Eliminar</button></td>
      </tr>
    `).join('');

    renderPagination('admin-pagination', pagina, data.totalPaginas, loadAdmin);
  } catch {}
}

async function eliminar(id, fromAdmin = false) {
  if (!confirm(`¿Eliminar el registro #${id}?`)) return;
  try {
    const res = await apiFetch(`/correos/${id}`, { method: 'DELETE' });
    if (res.ok) {
      fromAdmin ? loadAdmin(adminPagina) : loadHistorial(historialPagina);
      loadQuickStats();
    }
  } catch {}
}

// Exponer globalmente para los onclick inline
window.eliminar = eliminar;

// ── Helpers ───────────────────────────────────────────────────────────────────
function renderPagination(containerId, pagina, totalPaginas, fn) {
  const el = document.getElementById(containerId);
  if (totalPaginas <= 1) { el.innerHTML = ''; return; }

  let html = '';
  for (let i = 1; i <= totalPaginas; i++) {
    html += `<button class="page-btn ${i === pagina ? 'active' : ''}" onclick="(${fn.name})(${i})">${i}</button>`;
  }
  el.innerHTML = html;
}

function setLoadingBtn(id, active) {
  const btn = document.getElementById(id);
  btn.disabled = active;
  btn.classList.toggle('loading', active);
}

function showError(msg) {
  const el = document.getElementById('error-msg');
  el.style.display = 'flex';
  el.querySelector('span').textContent = msg;
}

function clearError() {
  document.getElementById('error-msg').style.display = 'none';
  document.getElementById('result-section').style.display = 'none';
}

function fmtDate(iso) {
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function esc(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}