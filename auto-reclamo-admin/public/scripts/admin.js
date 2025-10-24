// admin.js
console.log('[admin] toasts cargados'); // debug:carga este archivo

const BASE = 'http://localhost:3000/api';
const API = {
  clientes:    ()       => `${BASE}/clientes`,
  cliente:     id       => `${BASE}/clientes/${id}`,
  reclamos:    id       => `${BASE}/clientes/${id}/reclamos`,
  reclamo:     id       => `${BASE}/reclamos/${id}`,
  update:      (t, id)  => `${BASE}/${t}/${id}`,
  comentarios: id       => `${BASE}/reclamos/${id}/comentarios`
};

/* ===========================Toast helpers=========================== */

function getQS(name){
  const sp = new URLSearchParams(location.search);
  const v = sp.get(name);
  return v === null ? '' : v; 
}

function goBackAfterEdit(){
  const from   = (getQS('from') || '').toLowerCase();
  const estado = getQS('estado') || '';
  const period = getQS('period') || getQS('mes') || '';

  // Base: lista general o por cliente
  let url = (from === 'all') ? 'reclamos.html?mode=all' : 'reclamos.html';

  // Si veníamos de la general y había filtros, preservarlos
  if (from === 'all') {
    const sp = new URLSearchParams();
    sp.set('mode', 'all');
    if (estado) sp.set('estado', estado);
    if (period) sp.set('period', period);
    url = `reclamos.html?${sp.toString()}`;
  }

  location.href = url;
}


function ensureToastStack() {
  let stack = document.getElementById('toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toast-stack';
    document.body.appendChild(stack);
  }
  return stack;
}
function toast(message, type = 'success', ms = 2200) {
  const stack = ensureToastStack();
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(-6px)';
    setTimeout(() => el.remove(), 250);
  }, ms);
}

/* =========================================Helper fetch JSON + manejo de errores========================================= */
async function apiJson(url, opts = {}) {
  const r = await fetch(url, opts);
  if (r.status === 401) {
    // location.href = 'login.html';
    throw new Error('No autorizado');
  }
  if (!r.ok) {
    let msg = 'Error';
    try { msg = (await r.json()).error || (await r.text()); } catch {}
    throw new Error(msg || 'Error');
  }
  return r.status === 204 ? null : r.json();
}

/* ===========================Router simple por pagina=========================== */
document.addEventListener('DOMContentLoaded', () => {
  const page = location.pathname.split('/').pop();

  if (!page || page === 'index.html') {actualizarEstadisticas();}
  if (page === 'clientes.html') {cargarClientes();enlazarAccionesClientes();}
  if (page === 'reclamos.html') {routerReclamos();}
  if (page === 'editar.html') {cargarFormularioReclamo();}
  if (page === 'editar_cliente.html') {cargarFormularioCliente();}
});


/* ===========================Dashboard=========================== */
async function actualizarEstadisticas() {
  // --- Total clientes ---
  try {
    const clientes = await apiJson(API.clientes());
    const elClientes = document.getElementById('total-clientes');
    if (elClientes) elClientes.textContent = Array.isArray(clientes) ? clientes.length : 0;
  } catch (err) {
    if (typeof toast === 'function') toast('No se pudo cargar el total de clientes', 'error');
    console.error(err);
  }

  // --- Reclamos total + breakdown ---
  try {
    const reclamos = await apiJson(`${BASE}/reclamos`);
    const total = Array.isArray(reclamos) ? reclamos.length : 0;

    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    setText('total-reclamos', total);

    // Conteo por estado (normalizado sin tildes)
    const counts = {
      'ingresado': 0,
      'en revision': 0,
      'aprobacion': 0,
      'reclamacion': 0,
      'gestion de pago': 0,
      'reclamo finalizado': 0,
      'pendiente': 0
    };

    // Conteo del mes actual
    const now = new Date();
    const curMonth = now.getMonth();
    const curYear  = now.getFullYear();
    let delMes = 0;

    for (const r of (reclamos || [])) {
      const k = normalizarEstado(r.estado);
      if (k in counts) counts[k]++;

      // Usa el parseFecha GLOBAL
      const df = parseFecha(r);
      if (df && df.getMonth() === curMonth && df.getFullYear() === curYear) delMes++;
    }

    // Pinta resultados
    setText('total-ingresado',    counts['ingresado']);
    setText('total-en-revision',  counts['en revision']);
    setText('total-aprobacion',   counts['aprobacion']);
    setText('total-reclamacion',  counts['reclamacion']);
    setText('total-gestion-pago', counts['gestion de pago']);
    setText('total-finalizado',   counts['reclamo finalizado']);
    setText('total-mes',          delMes);
  } catch (err) {
    if (typeof toast === 'function') toast('No se pudo cargar las estadísticas de reclamos', 'error');
    console.error(err);
  }
}








/* ===========================Clientes=========================== */
async function cargarClientes() {
  const tbody = document.getElementById('clients-tbody');
  const list  = await apiJson(API.clientes());

  tbody.innerHTML = list.map(c => `
    <tr>
      <td>${c.id}</td>
      <td>${c.nombre}</td>
      <td>${c.apellido}</td>
      <td>${c.dni}</td>
      <td>${c.telefono || '-'}</td>
      <td>${c.email}</td>
      <td>
        <div class="actions-group">
          <button type="button" class="btn-hero solid action"
                  data-action="reclamos" data-id="${c.id}"
                  data-name="${c.nombre} ${c.apellido}">
            Reclamos
          </button>
          <button type="button" class="btn-hero solid action"
                  data-action="editar-cliente" data-id="${c.id}">
            <i class="fas fa-edit"></i> Editar
          </button>
          <button type="button" class="btn-hero solid action"
                  data-action="eliminar" data-id="${c.id}">
            Eliminar
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function enlazarAccionesClientes() {
  const tbody = document.getElementById('clients-tbody');
  if (!tbody) return;

  tbody.addEventListener('click', async (e) => {
    const btn = e.target.closest('.action');
    if (!btn) return;

    const id   = btn.dataset.id;
    const name = btn.dataset.name || '';

    try {
      switch (btn.dataset.action) {
        case 'reclamos':
          sessionStorage.setItem('clienteId', id);
          sessionStorage.setItem('clienteName', name);
          location.href = 'reclamos.html';
          break;

        case 'editar-cliente':
          location.href = `editar_cliente.html?id=${id}`;
          break;

        case 'eliminar': {
          if (!confirm('¿Eliminar este cliente?')) return;

          // deshabilitar mientras elimina
          const oldText = btn.textContent;
          btn.disabled = true;
          btn.textContent = 'Eliminando';

          try {
            await apiJson(API.cliente(id), { method: 'DELETE' });
            toast('Cliente eliminado', 'success');
            await cargarClientes(); // recarga la tabla
          } catch (err) {
            toast(err.message || 'No se pudo eliminar', 'error');
          } finally {
            btn.disabled = false;
            btn.textContent = oldText;
          }
          break;
        }
      }
    } catch (err) {
      toast(err.message || 'Error', 'error');
    }
  });
}

/* ==================================Reclamos (listado + comentarios)================================== */
async function cargarReclamos() {
  const clienteId   = sessionStorage.getItem('clienteId');
  const clienteName = sessionStorage.getItem('clienteName') || 'Cliente';

  if (!clienteId) {
    location.href = 'clientes.html';
    return;
  }

  const title = document.getElementById('titulo-reclamos');
  if (title) title.textContent = `Reclamos de ${clienteName}`;

  const reclamos = await apiJson(API.reclamos(clienteId));
  const tbody    = document.querySelector('#tabla-reclamos tbody');

  tbody.innerHTML = reclamos.map(r => `
    <tr>
      <td>${r.id}</td>
      <td>${clienteName}</td>
      <td>${new Date(r.fecha_incidente).toLocaleDateString('es-AR')}</td>
      <td>${r.hora_incidente}</td>
      <td>${r.estado}</td>
      <td>
        <div class="actions-group">
          <button class="btn-hero solid small btn-editar" data-id="${r.id}">
             Detalles
          </button>
          <button class="btn-hero solid small btn-comentarios" data-id="${r.id}">
             Comentarios
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  // Detalles
  tbody.querySelectorAll('.btn-editar').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      location.href = `editar.html?id=${id}`;
    });
  });

  // Comentarios (abre modal)
  tbody.querySelectorAll('.btn-comentarios').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      abrirModalComentarios(id);
    });
  });
}

/* ===========================Editar Reclamo=========================== */
async function cargarFormularioReclamo() {
  const params = new URLSearchParams(location.search);
  const id     = params.get('id');
  if (!id) {
    location.href = 'reclamos.html';
    return;
  }

  const r = await apiJson(API.reclamo(id));

  Object.entries(r).forEach(([k, v]) => {
    const el = document.getElementById(k);
    if (el) el.value = v;
  });

  document.getElementById('form-editar').addEventListener('submit', async e => {
    e.preventDefault();

    const data = Object.fromEntries(new FormData(e.target));

    try {
      await apiJson(API.update('reclamos', id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      toast('Reclamo actualizado', 'success');
      setTimeout(() => goBackAfterEdit(), 800);
    } catch (err) {
      toast('Error al actualizar: ' + err.message, 'error');
    }
  });
}

/* ===========================Editar Cliente=========================== */
async function cargarFormularioCliente() {
  const params = new URLSearchParams(location.search);
  const id     = params.get('id');
  if (!id) {
    location.href = 'clientes.html';
    return;
  }

  const c = await apiJson(API.cliente(id));

  document.getElementById('id').value       = c.id;
  document.getElementById('nombre').value   = c.nombre;
  document.getElementById('apellido').value = c.apellido;
  document.getElementById('dni').value      = c.dni;
  document.getElementById('telefono').value = c.telefono || '';
  document.getElementById('email').value    = c.email;

  document.getElementById('form-editar-cliente').addEventListener('submit', async e => {
    e.preventDefault();

    const data = {
      nombre:   document.getElementById('nombre').value.trim(),
      apellido: document.getElementById('apellido').value.trim(),
      dni:      document.getElementById('dni').value.trim(),
      telefono: document.getElementById('telefono').value.trim(),
      email:    document.getElementById('email').value.trim()
    };

    try {
      await apiJson(API.cliente(id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      toast('Cliente actualizado', 'success');
      setTimeout(() => location.href = 'clientes.html', 800);
    } catch (err) {
      toast('Error: ' + err.message, 'error');
    }
  });
}

/* =========================================Comentarios========================================= */

// Estado interno del modal (reclamo actual)
let COM_RECLAMO_ID = null;

function abrirModalComentarios(reclamoId){
  COM_RECLAMO_ID = reclamoId;

  // limpiar form
  const autor = document.getElementById('autor-comentario');
  const texto = document.getElementById('texto-comentario');
  if (autor) autor.value = '';
  if (texto) texto.value = '';

  // abrir
  const overlay = document.getElementById('modal-comentarios');
  if (overlay) overlay.classList.add('is-open');

  // cargar historial
  cargarComentarios(reclamoId).catch(err => {
    toast('No se pudo cargar comentarios: ' + err.message, 'error');
  });
}

function cerrarModalComentarios(){
  const overlay = document.getElementById('modal-comentarios');
  if (overlay) overlay.classList.remove('is-open');
  COM_RECLAMO_ID = null;
}

async function cargarComentarios(reclamoId){
  // GET /reclamos/:id/comentarios
  const list = await apiJson(API.comentarios(reclamoId));
  renderComentarios(list || []);
}

function renderComentarios(items){
  const ul = document.getElementById('lista-comentarios');
  if (!ul) return;

  if (!Array.isArray(items) || !items.length){
    ul.innerHTML = '<li style="color:#666;">Sin comentarios todavía.</li>';
    return;
  }
  ul.innerHTML = items.map(it => `
    <li class="comentario-item">
      <div class="meta">
        <strong>${it.autor ? escapeHTML(it.autor) : 'Anónimo'}</strong>
        · <span>${formatearFechaHora(it.creado_en)}</span>
      </div>
      <div class="texto">${escapeHTML(it.texto || '')}</div>
    </li>
  `).join('');
}

function formatearFechaHora(iso){
  try{
    const d = new Date(iso);
    return d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
  }catch{ return iso || ''; }
}

// Evitar XSS al pintar texto libre
function escapeHTML(s){
  return (s || '').replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

// Enlazar controles del modal (una sola vez)
function bindModalComentarios(){
  const modal = document.getElementById('modal-comentarios');
  if (!modal) return;

  const btnClose = document.getElementById('btn-cerrar-modal');
  if (btnClose) btnClose.addEventListener('click', cerrarModalComentarios);

  // Cerrar con ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('is-open')) cerrarModalComentarios();
  });

  // Enviar comentario
  const form = document.getElementById('form-comentario');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!COM_RECLAMO_ID) return;

      const autor = (document.getElementById('autor-comentario')?.value || '').trim();
      const texto = (document.getElementById('texto-comentario')?.value || '').trim();
      if (!texto){
        toast('Escribir un comentario', 'error');
        return;
      }

      try{
        // POST /reclamos/:id/comentarios
        await apiJson(API.comentarios(COM_RECLAMO_ID), {
          method: 'POST',
          headers: { 'Content-Type':'application/json' },
          body: JSON.stringify({ autor, texto })
        });

        toast('Comentario guardado', 'success');
        const txt = document.getElementById('texto-comentario');
        if (txt) txt.value = '';
        await cargarComentarios(COM_RECLAMO_ID);
      }catch(err){
        toast('No se pudo guardar: ' + err.message, 'error');
      }
    });
  }
}

function routerReclamos(){
  const params     = new URLSearchParams(location.search);
  const mode       = (params.get('mode') || '').toLowerCase();
  const estadoQS   = params.get('estado') || '';
  const periodQS   = (params.get('period') || params.get('mes') || '').toLowerCase();

  const clienteId  = sessionStorage.getItem('clienteId');

  // Si el usuario pidió explícitamente la vista general, olvidamos el contexto por cliente
  if (mode === 'all') {
    sessionStorage.removeItem('clienteId');
  }

  if (mode === 'all' || !clienteId){
    cargarReclamosGeneral({ estadoQS, periodQS }).catch(err => {
      console.error(err);
      if (typeof toast === 'function') toast(err.message || 'No se pudo cargar reclamos', 'error');
    });
    if (typeof bindModalComentarios === 'function') bindModalComentarios();
  } else {
    if (typeof cargarReclamos === 'function') cargarReclamos();
    if (typeof bindModalComentarios === 'function') bindModalComentarios();
  }
}



let RECLAMOS_CACHE = [];
let CLIENTES_MAP   = {};

function normalizarEstado(s) {
  if (s == null) return '';
  // a) string básico en minúsculas
  let x = String(s).trim().toLowerCase();

  // b) quitar tildes/diacríticos (revisión→revision)
  x = x.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // c) unificar separadores: guiones → espacio, colapsar espacios
  x = x.replace(/-/g, ' ').replace(/\s+/g, ' ');

  return x;
}


function parseFecha(r){
  const f = r.fecha_incidente || r.fecha;
  if (!f) return null;
  if (typeof f === 'string') {
    if (f.includes('-')) { // ISO
      const d = new Date(f);
      return isNaN(d) ? null : d;
    }
    const p = f.split('/');
    if (p.length === 3) {
      const d = parseInt(p[0], 10), m = parseInt(p[1], 10), y = parseInt(p[2], 10);
      const dt = new Date(y, m - 1, d);
      return isNaN(dt) ? null : dt;
    }
  }
  const dt = new Date(f);
  return isNaN(dt) ? null : dt;
}

function isEsteMes(r){
  const d = parseFecha(r);
  if (!d) return false;
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

async function cargarReclamosGeneral({ estadoQS = '', periodQS = '' } = {}){
  const title = document.getElementById('titulo-reclamos');
  if (title) title.textContent = 'Reclamos – Todos';

  ensureBarraFiltros();

  const [reclamos, clientes] = await Promise.all([
    apiJson(`${BASE}/reclamos`),
    apiJson(API.clientes())
  ]);

  RECLAMOS_CACHE = Array.isArray(reclamos) ? reclamos : [];

  CLIENTES_MAP = {};
  (Array.isArray(clientes) ? clientes : []).forEach(c => {
    const nombre = [c.nombre, c.apellido].filter(Boolean).join(' ').trim() || (c.razon_social || '');
    CLIENTES_MAP[c.id] = nombre || `Cliente #${c.id}`;
  });

  // Preselección desde QS
  const selEstado  = document.getElementById('filtro-estado');
  const selPeriodo = document.getElementById('filtro-periodo');

  if (estadoQS && selEstado)  selEstado.value = estadoQS;
  if (periodQS && selPeriodo) {
    if (['mes', 'actual', 'este-mes', 'this-month'].includes(periodQS)) selPeriodo.value = 'mes';
  }

  aplicarYRenderFiltro();
}

function ensureBarraFiltros(){
  const tabla = document.getElementById('tabla-reclamos');
  if (!tabla) return;
  if (document.getElementById('reclamos-filtros')) return;

  const wrapper = document.createElement('section');
  wrapper.id = 'reclamos-filtros';
  wrapper.className = 'filters-bar';
  wrapper.innerHTML = `
    <div class="filters">
  <label for="filtro-estado">Estado</label>
  <select id="filtro-estado">
    <option value="">Todos</option>
    <option value="ingresado">Ingresado</option>
    <option value="en-revision">En revisión</option>
    <option value="aprobacion">Aprobación</option>
    <option value="reclamacion">Reclamación</option>
    <option value="gestion-de-pago">Gestión de pago</option>
    <option value="reclamo-finalizado">Reclamo finalizado</option>
  </select>

  <label for="filtro-periodo">Periodo</label>
  <select id="filtro-periodo">
    <option value="">Todos</option>
    <option value="mes">Este mes</option>
  </select>

  <button type="button" id="btn-limpiar-filtros" class="btn-hero solid">Limpiar</button>
</div>

  `;
  tabla.parentElement.insertBefore(wrapper, tabla);

  const selEstado   = wrapper.querySelector('#filtro-estado');
  const selPeriodo  = wrapper.querySelector('#filtro-periodo');
  const btnLimpiar  = wrapper.querySelector('#btn-limpiar-filtros');

  selEstado.addEventListener('change', aplicarYRenderFiltro);
  selPeriodo.addEventListener('change', aplicarYRenderFiltro);
  btnLimpiar.addEventListener('click', () => {
    selEstado.value  = '';
    selPeriodo.value = '';
    aplicarYRenderFiltro();
    const url = new URL(location.href);
    url.searchParams.delete('estado');
    url.searchParams.delete('period');
    url.searchParams.delete('mes');
    history.replaceState(null, '', url);
  });
}

function aplicarYRenderFiltro(){
  const selEstado  = document.getElementById('filtro-estado');
  const selPeriodo = document.getElementById('filtro-periodo');
  const estado  = selEstado ? selEstado.value : '';
  const periodo = selPeriodo ? selPeriodo.value : '';

  let data = RECLAMOS_CACHE;

  // Filtro por estado
  if (estado) {
    const e = normalizarEstado(estado);
    data = data.filter(r => normalizarEstado(r.estado) === e);
  }

  // Filtro por periodo
  if (periodo === 'mes') {
    data = data.filter(isEsteMes);
  }

  renderReclamosGeneralRows(data);
}

function renderReclamosGeneralRows(lista){
  const tbody = document.querySelector('#tabla-reclamos tbody');
  if (!tbody) return;

  tbody.innerHTML = (lista || []).map(r => {
    const clienteName = escapeHTML(CLIENTES_MAP[r.cliente_id] || `Cliente #${r.cliente_id || ''}`);
    const d = parseFecha(r);
    const fecha = d ? d.toLocaleDateString('es-AR') : '-';
    const hora   = escapeHTML(r.hora_incidente || r.hora || '-');
    const estado = escapeHTML(r.estado || '-');

    return `
      <tr>
        <td>${r.id}</td>
        <td>${clienteName}</td>
        <td>${fecha}</td>
        <td>${hora}</td>
        <td>${estado}</td>
        <td>
          <div class="actions-group">
            <button class="btn-hero solid small btn-editar" data-id="${r.id}">Detalles</button>
            <button class="btn-hero solid small btn-comentarios" data-id="${r.id}">Comentarios</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

 tbody.querySelectorAll('.btn-editar').forEach(btn => {
  btn.addEventListener('click', () => {
    const id = btn.dataset.id;

    // Lee filtros actuales del select
    const estadoSel  = document.getElementById('filtro-estado')?.value || '';
    const periodoSel = document.getElementById('filtro-periodo')?.value || '';

    const qs = new URLSearchParams();
    qs.set('id', id);
    qs.set('from', 'all');          // origen: vista general
    if (estadoSel)  qs.set('estado', estadoSel);     // preserva estado
    if (periodoSel) qs.set('period', periodoSel);    // preserva periodo (ej. 'mes')

    location.href = `editar.html?${qs.toString()}`;
  });
});


  // Comentarios (sin cambios)
  tbody.querySelectorAll('.btn-comentarios').forEach(btn => {
    btn.addEventListener('click', () => abrirModalComentarios(btn.dataset.id));
  });
}


