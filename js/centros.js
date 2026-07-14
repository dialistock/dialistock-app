// ==================== MULTI-CENTRO (Etapa 1: Inventario + Movimientos) ====================
// Cada centro de DaVita guarda su propio inventario, movimientos y conteo
// físico, completamente aislados entre sí. Independencia usa las rutas
// históricas (colección dialistock_data, clave de localStorage sin sufijo)
// para no tocar ni migrar los datos reales que ya existían antes de esta
// función — los centros nuevos usan rutas separadas bajo /centros/{id}/data.
//
// Este archivo debe cargar ANTES que data-init.js, porque data-init.js usa
// currentCentro/lsKeyFor()/fbPathFor() ya en su primera línea (para saber
// qué clave de localStorage leer al iniciar).
//
// Módulos secundarios (Diario, Lotes, Recepción, Pacientes) todavía NO
// están separados por centro — eso queda para la Etapa 2.

const CENTROS = [
  { id: 'independencia', nombre: 'Independencia', codigo: 'C7848' },
  { id: 'recoleta',      nombre: 'Recoleta',       codigo: 'C7850' },
  { id: 'quilicura',     nombre: 'Quilicura',      codigo: 'C7852' },
  { id: 'huechuraba',    nombre: 'Huechuraba',     codigo: 'C7855' }
];

let currentCentro = localStorage.getItem('ds_centro_actual') || 'independencia';

function getCentroInfo(id) {
  const buscado = id || currentCentro;
  return CENTROS.find(function (c) { return c.id === buscado; }) || CENTROS[0];
}

// Ruta de Firestore para un documento dado (main / invfis_progreso /
// invfis_historial), según el centro activo.
function fbPathFor(docName) {
  if (currentCentro === 'independencia') return 'dialistock_data/' + docName;
  return 'centros/' + currentCentro + '/data/' + docName;
}

// Clave de localStorage para el centro activo. Independencia usa la clave
// histórica sin sufijo para no perder lo que ya está cacheado en el
// dispositivo; los centros nuevos usan un sufijo propio.
function lsKeyFor(baseKey) {
  if (currentCentro === 'independencia') return baseKey;
  return baseKey + '__' + currentCentro;
}

// Rol de la cuenta actual en el centro activo ('admin' | 'lector' | null).
function rolEnCentroActual() {
  if (typeof currentUser === 'undefined' || !currentUser || !currentUser.centros) return null;
  return currentUser.centros[currentCentro] || null;
}

// Lista de centros a los que la cuenta actual tiene algún acceso.
function centrosDisponibles() {
  if (typeof currentUser === 'undefined' || !currentUser || !currentUser.centros) return [];
  return Object.keys(currentUser.centros);
}

async function cambiarCentro(nuevoId) {
  if (nuevoId === currentCentro) return;
  const acceso = typeof currentUser !== 'undefined' && currentUser && currentUser.centros
    ? currentUser.centros[nuevoId] : null;
  if (!acceso) {
    if (typeof showAlert === 'function') {
      showAlert('Tu cuenta no tiene acceso al centro ' + getCentroInfo(nuevoId).nombre, 'error');
    }
    return;
  }
  currentCentro = nuevoId;
  localStorage.setItem('ds_centro_actual', nuevoId);
  await cargarCentroActual();
  actualizarUICentro();
  if (typeof actualizarUIRolUsuario === 'function') actualizarUIRolUsuario();
}

// Recarga db, invFisHistorial, etc. para el centro activo — desde
// localStorage primero (respuesta inmediata), y luego intenta traer lo
// último de Firestore por encima.
async function cargarCentroActual() {
  const raw = localStorage.getItem(lsKeyFor('dialistock_db'));
  if (raw) {
    db = JSON.parse(raw);
  } else {
    db = await sembrarCatalogoNuevoCentro();
    localStorage.setItem(lsKeyFor('dialistock_db'), JSON.stringify(db));
  }

  if (typeof invFisHistorial !== 'undefined') {
    invFisHistorial = JSON.parse(localStorage.getItem(lsKeyFor('ds_invfis_historial')) || '[]');
  }
  if (typeof window !== 'undefined') {
    try {
      window._invFisNotas = JSON.parse(localStorage.getItem(lsKeyFor('ds_invfis_notas')) || '{}');
    } catch (e) { window._invFisNotas = {}; }
  }
  // Un conteo físico en curso es específico del centro — no tiene sentido
  // dejarlo "colgado" en pantalla al cambiar de centro.
  if (typeof invFisData !== 'undefined') invFisData = [];
  if (typeof invFisActivo !== 'undefined') invFisActivo = false;

  if (typeof cargarDesdeFirestore === 'function') await cargarDesdeFirestore();
  if (typeof cargarHistorialDesdeFirestore === 'function') await cargarHistorialDesdeFirestore();

  if (typeof updateDashboard === 'function') updateDashboard();
  if (typeof renderInventory === 'function') renderInventory();
  if (typeof renderMovements === 'function') renderMovements();
  if (typeof renderCharts === 'function') renderCharts();
  if (typeof renderHistorialSummary === 'function') renderHistorialSummary();
}

// La primera vez que se visita un centro nuevo (sin datos locales ni en la
// nube todavía), se clona el catálogo REAL de Independencia con el stock
// en 0 — mismos productos, misma estructura — para que el centro parta
// ordenado en vez de empezar de cero a mano. Se lee de Firestore si hay
// conexión; si no, cae al catálogo cacheado en este dispositivo.
async function sembrarCatalogoNuevoCentro() {
  let base = null;
  try {
    if (fbDb) {
      const snap = await fbDb.doc('dialistock_data/main').get();
      if (snap.exists) base = JSON.parse(snap.data().data);
    }
  } catch (e) {
    console.warn('No se pudo leer el catálogo de Independencia desde la nube para sembrar el centro nuevo:', e);
  }
  if (!base) {
    const rawLocal = localStorage.getItem('dialistock_db');
    if (rawLocal) base = JSON.parse(rawLocal);
  }
  if (!base) base = { products: [], movements: [] };

  const productosClonados = base.products.map(function (p) {
    return Object.assign({}, p, { stock: 0 });
  });
  return { products: productosClonados, movements: [] };
}

// Pinta el selector de centros en el header, mostrando solo los centros a
// los que la cuenta actual tiene acceso.
function renderSelectorCentros() {
  const cont = document.getElementById('centro-selector');
  if (!cont) return;
  const disponibles = centrosDisponibles();
  if (disponibles.length <= 1) {
    cont.style.display = 'none';
    return;
  }
  cont.style.display = 'flex';
  cont.innerHTML = CENTROS.filter(function (c) { return disponibles.indexOf(c.id) !== -1; })
    .map(function (c) {
      const activo = c.id === currentCentro;
      return '<div class="centro-btn' + (activo ? ' active' : '') + '" data-centro="' + c.id + '" ' +
        'onclick="cambiarCentro(\'' + c.id + '\')">' + c.nombre + '</div>';
    }).join('');
}

function actualizarUICentro() {
  const info = getCentroInfo();
  const nameEl = document.getElementById('centro-actual-nombre');
  if (nameEl) nameEl.textContent = info.nombre;
  const codeEl = document.getElementById('centro-actual-codigo');
  if (codeEl) codeEl.textContent = info.codigo;
  document.querySelectorAll('.centro-btn').forEach(function (btn) {
    btn.classList.toggle('active', btn.dataset.centro === currentCentro);
  });
}
