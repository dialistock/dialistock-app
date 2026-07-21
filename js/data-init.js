// Mobile error catcher
window.onerror = function(msg, src, line, col, err) {
  var existing = document.getElementById('mob-err');
  if (!existing) {
    var b = document.createElement('div');
    b.id = 'mob-err';
    b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#7f1d1d;color:#fca5a5;font-size:11px;padding:10px 12px;font-family:monospace;line-height:1.5;cursor:pointer;word-break:break-all';
    b.onclick = function(){this.remove();};
    document.body.appendChild(b);
    existing = b;
  }
  existing.innerHTML = '🔴 Error JS (toca para cerrar)<br><b>' + msg + '</b><br>Linea ' + line + (src ? ' · ' + src.split('/').pop() : '');
  return false;
};

// ==================== DATA ====================
let db = JSON.parse(localStorage.getItem(lsKeyFor('dialistock_db')) || '{"products":[],"movements":[]}');
let scannerActive = false;
let html5QrCode = null;
let currentProduct = null;
let currentType = 'entrada';
let currentProductIndex = -1;

// ==================== FIREBASE SYNC ====================
const firebaseConfig = {
  apiKey: "AIzaSyBvJkKZG3asz9k5zeGELQ7eutR9YhK8Yjo",
  authDomain: "dialistock.firebaseapp.com",
  projectId: "dialistock",
  storageBucket: "dialistock.firebasestorage.app",
  messagingSenderId: "996393837921",
  appId: "1:996393837921:web:a90553ea169becae0d5120"
};

let fbApp = null, fbDb = null, fbReady = false;
// La ruta de Firestore ya no es fija — depende del centro activo.
// Ver centros.js → fbPathFor().

// fbAuthPromise se resuelve cuando hay una sesión REAL (no anónima) iniciada
// con éxito — ver auth-login.js. Las reglas de seguridad de Firestore exigen
// una cuenta real con un rol asignado en la colección `dialistock_usuarios`
// (ver FIRESTORE_SETUP.md), así que no tiene sentido intentar leer/escribir
// antes de que el usuario inicie sesión desde la pantalla de login.
let resolveFbAuth;
let fbAuthPromise = new Promise(function (resolve) { resolveFbAuth = resolve; });

try {
  fbApp = firebase.initializeApp(firebaseConfig);
  fbDb = firebase.firestore();
} catch (e) {
  console.warn('Firebase no disponible, operando solo en LocalStorage:', e);
  resolveFbAuth(); // no bloquear la app si Firebase no cargó
}

function setSyncIndicator(state) {
  // state: 'synced' | 'syncing' | 'offline' | 'error'
  const el = document.getElementById('sync-indicator');
  if (!el) return;
  const map = {
    synced:  { icon: '☁️', color: 'rgba(0,153,204,0.9)',  title: 'Sincronizado con la nube' },
    syncing: { icon: '🔄', color: 'rgba(245,124,0,0.9)',  title: 'Sincronizando...' },
    offline: { icon: '📴', color: 'rgba(255,255,255,0.5)', title: 'Sin conexión · usando datos locales' },
    error:   { icon: '⚠️', color: 'rgba(229,57,53,0.9)',  title: 'Error de sincronización' }
  };
  const s = map[state] || map.offline;
  el.textContent = s.icon;
  el.style.color = s.color;
  el.title = s.title;
}

let _syncTimeout = null;
function save() {
  localStorage.setItem(lsKeyFor('dialistock_db'), JSON.stringify(db));
  localStorage.setItem(lsKeyFor('dialistock_last_local_save'), String(Date.now()));
  // Debounce la subida a Firestore para no saturar con escrituras (espera 800ms de inactividad)
  if (!fbReady) { setSyncIndicator('offline'); return; }
  clearTimeout(_syncTimeout);
  setSyncIndicator('syncing');
  // Se capturan la ruta Y el contenido AHORA (no dentro del timeout), para
  // que un cambio de centro durante el debounce no termine escribiendo los
  // datos del centro nuevo en la ruta del centro viejo (o viceversa).
  const pathAlGuardar = fbPathFor('main');
  const dbAlMomentoDeProgramar = JSON.parse(JSON.stringify(db));
  _syncTimeout = setTimeout(() => {
    guardarConFusionDeConflictos(pathAlGuardar, dbAlMomentoDeProgramar);
  }, 800);
}

// ==================== FUSIÓN DE CONFLICTOS (concurrencia) ====================
// Antes, cada guardado reemplazaba el documento completo en Firestore, sin
// importar si otro dispositivo/usuario había guardado algo distinto en el
// medio — el último en escribir borraba en silencio el cambio del otro.
//
// Ahora, save() usa una transacción: si nadie más escribió desde la última
// vez que este dispositivo sincronizó, guarda igual que antes (camino
// normal). Si alguien más SÍ escribió en el medio, en vez de aplastar su
// cambio, se fusionan los movimientos de ambos lados (son acumulables por
// naturaleza — cada uno con ID único, nunca se pierde ninguno) y se ajusta
// el stock de cada producto sumando el efecto de los movimientos que solo
// existían del otro lado.
//
// Límite conocido: ediciones manuales de stock/precio que NO generan un
// movimiento asociado (ej. "Editar stock del sistema" o "Editar precio
// unitario" dentro de Conteo Físico) y que ocurren en dos dispositivos
// sobre el mismo producto en el mismo instante, no se pueden fusionar de
// forma automática — gana la última en escribir, igual que antes. Es un
// caso mucho más raro que el de dos personas registrando movimientos.
async function guardarConFusionDeConflictos(pathAlGuardar, dbLocal) {
  try {
    const resultado = await fbDb.runTransaction(async (tx) => {
      const snap = await tx.get(fbDb.doc(pathAlGuardar));
      const ultimoRemotoConocido = localStorage.getItem(lsKeyFor('dialistock_last_remote_seen')) || '';
      let dbAEscribir = dbLocal;
      let huboFusion = false;

      if (snap.exists) {
        const remoto = snap.data();
        const remotoUpdatedAtLocal = remoto.updatedAtLocal || '';
        const huboEscrituraAjena = remotoUpdatedAtLocal && remotoUpdatedAtLocal !== ultimoRemotoConocido;

        if (huboEscrituraAjena) {
          const dbRemoto = JSON.parse(remoto.data);
          dbAEscribir = fusionarBases(dbLocal, dbRemoto);
          huboFusion = true;
        }
      }

      const nuevoTimestampLocal = new Date().toISOString();
      tx.set(fbDb.doc(pathAlGuardar), {
        data: JSON.stringify(dbAEscribir),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAtLocal: nuevoTimestampLocal
      });

      return { dbAEscribir, nuevoTimestampLocal, huboFusion };
    });

    // Todo lo que toca el DOM/localStorage pasa AQUÍ AFUERA de la
    // transacción (adentro no corresponde, porque Firestore puede
    // reintentar la función de la transacción varias veces si hay
    // contención, y no queremos efectos secundarios duplicados).
    db = resultado.dbAEscribir;
    localStorage.setItem(lsKeyFor('dialistock_db'), JSON.stringify(db));
    localStorage.setItem(lsKeyFor('dialistock_last_local_save'), String(Date.now()));
    localStorage.setItem(lsKeyFor('dialistock_last_remote_seen'), resultado.nuevoTimestampLocal);
    setSyncIndicator('synced');

    if (resultado.huboFusion) {
      if (typeof updateDashboard === 'function') updateDashboard();
      if (typeof renderInventory === 'function') renderInventory();
      if (typeof renderMovements === 'function') renderMovements();
      if (typeof showAlert === 'function') {
        showAlert('🔀 Se detectaron cambios de otro dispositivo y se fusionaron automáticamente', 'info');
      }
    }

    crearRespaldoSiCorresponde(db);
  } catch (err) {
    console.error('Error guardando en Firestore:', err);
    setSyncIndicator('error');
  }
}

// Fusiona la versión local con la remota cuando hubo una escritura ajena en
// el medio. Devuelve la base combinada, sin perder movimientos de ningún
// lado y con el stock ajustado según corresponda.
function fusionarBases(local, remoto) {
  const movimientosLocalIds = new Set(local.movements.map(function (m) { return m.id; }));
  const movimientosSoloRemotos = remoto.movements.filter(function (m) { return !movimientosLocalIds.has(m.id); });

  const movimientosFusionados = local.movements.concat(movimientosSoloRemotos)
    .sort(function (a, b) { return new Date(a.date) - new Date(b.date); });

  const productos = local.products.map(function (p) { return Object.assign({}, p); });
  movimientosSoloRemotos.forEach(function (m) {
    const p = productos.find(function (x) { return x.id === m.productId; });
    if (!p) return;
    if (m.type === 'salida') p.stock = Math.max(0, p.stock - m.qty);
    else p.stock = p.stock + m.qty; // 'entrada' y 'devolucion' suman stock
  });

  // Si el otro lado agregó un producto nuevo que localmente no existe
  // todavía (caso raro), se incorpora tal cual.
  const idsLocales = new Set(productos.map(function (p) { return p.id; }));
  remoto.products.forEach(function (p) {
    if (!idsLocales.has(p.id)) productos.push(Object.assign({}, p));
  });

  return { products: productos, movements: movimientosFusionados };
}
// ==================== /FUSIÓN DE CONFLICTOS ====================

// ==================== RESPALDO DE DATOS ====================
// Copia de seguridad automática (throttled a como máximo cada 6 horas) en
// una subcolección separada de Firestore, más un botón manual que descarga
// un respaldo instantáneo en JSON al computador — sin depender de la nube.
const RESPALDO_INTERVALO_MS = 6 * 60 * 60 * 1000; // cada 6 horas como máximo
const RESPALDOS_A_CONSERVAR = 30;

async function crearRespaldoSiCorresponde(dbActual) {
  if (!fbReady) return;
  try {
    const ultimaKey = lsKeyFor('dialistock_ultimo_respaldo');
    const ultima = parseInt(localStorage.getItem(ultimaKey) || '0');
    if (Date.now() - ultima < RESPALDO_INTERVALO_MS) return; // todavía no toca

    const ahora = new Date();
    const backupId = ahora.toISOString().replace(/[:.]/g, '-');
    const rutaRespaldo = fbPathFor('main') + '/respaldos/' + backupId;
    await fbDb.doc(rutaRespaldo).set({
      data: JSON.stringify(dbActual),
      creadoEn: ahora.toISOString(),
      totalProductos: dbActual.products.length,
      totalMovimientos: dbActual.movements.length
    });
    localStorage.setItem(ultimaKey, String(Date.now()));
    renderRespaldoInfo();
    limpiarRespaldosViejos().catch(function () {});
  } catch (err) {
    console.warn('No se pudo crear respaldo automático:', err);
  }
}

// Mantiene como máximo los últimos RESPALDOS_A_CONSERVAR respaldos, para no
// acumular indefinidamente. Se ejecuta después de crear uno nuevo.
async function limpiarRespaldosViejos() {
  const coleccion = fbDb.doc(fbPathFor('main')).collection('respaldos');
  const snap = await coleccion.orderBy('creadoEn', 'desc').get();
  if (snap.size <= RESPALDOS_A_CONSERVAR) return;
  const aBorrar = snap.docs.slice(RESPALDOS_A_CONSERVAR);
  await Promise.all(aBorrar.map(function (d) { return d.ref.delete(); }));
}

// Botón manual: descarga un respaldo del inventario actual como archivo
// JSON al computador, al instante — no depende de la nube ni de Firestore,
// funciona incluso sin conexión.
function descargarRespaldoManual() {
  const info = (typeof getCentroInfo === 'function') ? getCentroInfo() : { nombre: 'Independencia', codigo: 'C7848' };
  const contenido = JSON.stringify({
    centro: info.nombre,
    codigo: info.codigo,
    generadoEn: new Date().toISOString(),
    db: db
  }, null, 2);
  const blob = new Blob([contenido], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'DialiStock_Respaldo_' + info.nombre + '_' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
  if (typeof showAlert === 'function') showAlert('📥 Respaldo descargado', 'success');
}

// Actualiza el texto "último respaldo automático: ..." en el Dashboard, si
// el elemento existe en la página actual.
function renderRespaldoInfo() {
  const el = document.getElementById('respaldo-info-label');
  if (!el) return;
  const ultima = parseInt(localStorage.getItem(lsKeyFor('dialistock_ultimo_respaldo')) || '0');
  if (!ultima) { el.textContent = 'Sin respaldo automático registrado aún'; return; }
  const fecha = new Date(ultima);
  el.textContent = 'Último respaldo automático: ' + fecha.toLocaleDateString('es-CL') + ' ' + fecha.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}
// ==================== /RESPALDO DE DATOS ====================

async function cargarDesdeFirestore() {
  if (!fbReady) { setSyncIndicator('offline'); return; }
  setSyncIndicator('syncing');
  try {
    const snap = await fbDb.doc(fbPathFor('main')).get();
    if (!snap.exists) { setSyncIndicator('synced'); return; }
    const remoto = snap.data();
    const remotoLocal = remoto.updatedAtLocal ? new Date(remoto.updatedAtLocal).getTime() : 0;
    const localTimestamp = parseInt(localStorage.getItem(lsKeyFor('dialistock_last_local_save')) || '0');
    if (remotoLocal > localTimestamp) {
      db = JSON.parse(remoto.data);
      localStorage.setItem(lsKeyFor('dialistock_db'), JSON.stringify(db));
      localStorage.setItem(lsKeyFor('dialistock_last_local_save'), String(remotoLocal));
      if (typeof updateDashboard === 'function') updateDashboard();
      if (typeof renderHistorialSummary === 'function') renderHistorialSummary();
      showAlert('☁️ Datos actualizados desde la nube', 'info');
    }
    // Se registra siempre (haya cambiado o no el contenido) para que save()
    // sepa cuál es la última versión remota que efectivamente vimos, y así
    // pueda detectar más adelante si alguien más escribió después de esto.
    if (remoto.updatedAtLocal) {
      localStorage.setItem(lsKeyFor('dialistock_last_remote_seen'), remoto.updatedAtLocal);
    }
    setSyncIndicator('synced');
  } catch (err) {
    console.error('Error cargando de Firestore:', err);
    setSyncIndicator('error');
  }
}
// ==================== /FIREBASE SYNC ====================


// ==================== INIT ====================
function init() {
  // Load sample data if empty
  if (db.products.length === 0) {
    db.products = [
  { id: genId(), code: "102-101-002", name: "ALCOHOL DESNATURALIZADO 70% 1000ML CAJA X 12 UN", category: "Insumos Médicos", stock: 8, minStock: 10, unit: "unidades", emoji: "🧴", price: 800.87, packFactor: 12 },
  { id: genId(), code: "102-101-003", name: "ALCOHOL DESNATURALIZADO 70% 500ML CAJA X 20 UN", category: "Insumos Médicos", stock: 108, minStock: 10, unit: "unidades", emoji: "🧴", price: 1205.47, packFactor: 20 },
  { id: genId(), code: "102-101-001", name: "ALCOHOL DESNATURALIZADO 70% 250ML CAJA X 24 UN", category: "Insumos Médicos", stock: 108, minStock: 79, unit: "unidades", emoji: "🧴", price: 800.87, packFactor: 24 },
  { id: genId(), code: "102-105-011", name: "APOSITO 10X12 CM CAJA X 50 UN", category: "Insumos Médicos", stock: 0, minStock: 61, unit: "unidades", emoji: "🩹", price: 578.34, packFactor: 50 },
  { id: genId(), code: "102-105-012", name: "APOSITO 10X8 CM CAJA X 50 UN", category: "Insumos Médicos", stock: 0, minStock: 31, unit: "unidades", emoji: "🩹", price: 297.5, packFactor: 50 },
  { id: genId(), code: "101-108-005", name: "AVF DRESSING KIT CAJA X 160 UN", category: "Diálisis", stock: 551, minStock: 71, unit: "unidades", emoji: "📦", price: 583, packFactor: 160 },
  { id: genId(), code: "101-108-002", name: "AVF AGUJA 15G 1 INCH 30 CM CAJA X 50 UN", category: "Diálisis", stock: 488, minStock: 28, unit: "unidades", emoji: "💉", price: 259.44, packFactor: 50 },
  { id: genId(), code: "101-108-003", name: "AVF AGUJA 16G 1 INCH 30 CM CAJA X 50 UN", category: "Diálisis", stock: 2084, minStock: 27, unit: "unidades", emoji: "💉", price: 259.44, packFactor: 50 },
  { id: genId(), code: "101-108-004", name: "AVF AGUJA 17G 1 INCH 30 CM CAJA X 50 UN", category: "Diálisis", stock: 20, minStock: 28, unit: "unidades", emoji: "💉", price: 259.44, packFactor: 50 },
  { id: genId(), code: "101-106-003", name: "BIBAG 5008 650G L.A. CAJA X 16 UN", category: "Diálisis", stock: 376, minStock: 192, unit: "unidades", emoji: "📦", price: 2198.98, packFactor: 16 },
  { id: genId(), code: "101-106-005", name: "BIBAG 5008 900G L.A. CAJA X 12 UN", category: "Diálisis", stock: 52, minStock: 279, unit: "unidades", emoji: "📦", price: 3294.02, packFactor: 12 },
  { id: genId(), code: "101-108-006", name: "CATHETER DRESSING KIT CAJA X 80 UN", category: "Diálisis", stock: 671, minStock: 130, unit: "unidades", emoji: "🩺", price: 1020, packFactor: 80 },
  { id: genId(), code: "102-106-001", name: "CISTERIL 5LT X BIDON", category: "Insumos Médicos", stock: 0, minStock: 5, unit: "unidades", emoji: "🧴", price: 42774.79, packFactor: 1 },
  { id: genId(), code: "105-102-002", name: "CLORO HIPOCLORITO SODIO 5% ENV 5LT X BIDON", category: "Higiene", stock: 2, minStock: 355, unit: "unidades", emoji: "🧴", price: 3546.2, packFactor: 1 },
  { id: genId(), code: "101-108-013", name: "CONCENTRADO ACIDO 925-A CAJA X 4 UN", category: "Diálisis", stock: 134, minStock: 525, unit: "unidades", emoji: "⚗️", price: 6327.64, packFactor: 4 },
  { id: genId(), code: "101-108-014", name: "CONCENTRADO ACIDO 926-A CAJA X 4 UN", category: "Diálisis", stock: 0, minStock: 4, unit: "unidades", emoji: "⚗️", price: 7367.69, packFactor: 4 },
  { id: genId(), code: "101-108-012", name: "CONCENTRADO ACIDO 924-A CAJA X 4 UN", category: "Diálisis", stock: 0, minStock: 4, unit: "unidades", emoji: "⚗️", price: 6368.7, packFactor: 4 },
  { id: genId(), code: "101-106-008", name: "CONECTORES LINEAS AV CAJA X 150 UN", category: "Diálisis", stock: 187, minStock: 90, unit: "unidades", emoji: "🔗", price: 1059.1, packFactor: 150 },
  { id: genId(), code: "102-105-060", name: "CONECTOR TEGO CAJA X 250 UN", category: "Insumos Médicos", stock: 388, minStock: 119, unit: "unidades", emoji: "🔗", price: 1190, packFactor: 250 },
  { id: genId(), code: "101-103-002", name: "DIALIZADOR FX CORDIAX 100 X CAJA 24 UN", category: "Diálisis", stock: 18, minStock: 995, unit: "unidades", emoji: "⚙️", price: 11559.51, packFactor: 24 },
  { id: genId(), code: "101-103-003", name: "DIALIZADOR FX CORDIAX 60 X CAJA 24 UN", category: "Diálisis", stock: 7, minStock: 996, unit: "unidades", emoji: "⚙️", price: 11514.94, packFactor: 24 },
  { id: genId(), code: "101-103-004", name: "DIALIZADOR FX CORDIAX 80 X CAJA 24 UN", category: "Diálisis", stock: 134, minStock: 989, unit: "unidades", emoji: "⚙️", price: 11529.8, packFactor: 24 },
  { id: genId(), code: "101-103-013", name: "DIALIZADOR B-18H", category: "Diálisis", stock: 48, minStock: 920, unit: "unidades", emoji: "⚙️", price: 8866, packFactor: 1 },
  { id: genId(), code: "102-105-064", name: "DIALY-TEST CONC. AC. PERACETICO 100 TIRAS", category: "Insumos Médicos", stock: 30, minStock: 1130, unit: "unidades", emoji: "🧪", price: 11305, packFactor: 1 },
  { id: genId(), code: "102-105-065", name: "DIALY-TEST RESIDUAL AC. PERACETICO 100 TIRAS", category: "Insumos Médicos", stock: 50, minStock: 1117, unit: "unidades", emoji: "🧪", price: 11305, packFactor: 1 },
  { id: genId(), code: "102-105-027", name: "EQUIPO MACROGOTEO C/SEGMENTO BOLSA X 25 UN", category: "Insumos Médicos", stock: 451, minStock: 12, unit: "unidades", emoji: "🩺", price: 132.09, packFactor: 25 },
  { id: genId(), code: "102-105-028", name: "EQUIPO MACROGOTEO S/SEGMENTO BOLSA X 25 UN", category: "Insumos Médicos", stock: 60, minStock: 12, unit: "unidades", emoji: "🩺", price: 95.2, packFactor: 25 },
  { id: genId(), code: "102-105-029", name: "FILTRO DIASAFE PLUS X UN", category: "Insumos Médicos", stock: 8, minStock: 2460, unit: "unidades", emoji: "🔬", price: 29040.61, packFactor: 1 },
  { id: genId(), code: "102-105-032", name: "GASA 7.5X7.5 X2 ESTERIL CAJA X 50 UN", category: "Insumos Médicos", stock: 2650, minStock: 5, unit: "unidades", emoji: "🩹", price: 39.27, packFactor: 50 },
  { id: genId(), code: "102-105-034", name: "GORRO DESECHABLE CAJA X 100 UN", category: "Insumos Médicos", stock: 5450, minStock: 5, unit: "unidades", emoji: "👷", price: 11.9, packFactor: 100 },
  { id: genId(), code: "102-103-008", name: "GUANTE QUIRURGICO ESTERIL 7 PAR CAJA X 50 UN", category: "Insumos Médicos", stock: 160, minStock: 29, unit: "unidades", emoji: "🧤", price: 285.6, packFactor: 50 },
  { id: genId(), code: "102-103-002", name: "GUANTE EXAMEN MUNCARE AQL 1.5 M CAJA X 100 UN", category: "Insumos Médicos", stock: 1100, minStock: 5, unit: "unidades", emoji: "🧤", price: 26.18, packFactor: 100 },
  { id: genId(), code: "102-103-003", name: "GUANTE EXAMEN MUNCARE AQL 1.5 XS CAJA X 100 UN", category: "Insumos Médicos", stock: 2000, minStock: 5, unit: "unidades", emoji: "🧤", price: 26.18, packFactor: 100 },
  { id: genId(), code: "102-103-011", name: "GUANTE VINILO L CAJA X 100 UN", category: "Insumos Médicos", stock: 4600, minStock: 5, unit: "unidades", emoji: "🧤", price: 16.66, packFactor: 100 },
  { id: genId(), code: "102-103-012", name: "GUANTE VINILO M CAJA X 100 UN", category: "Insumos Médicos", stock: 2000, minStock: 5, unit: "unidades", emoji: "🧤", price: 16.66, packFactor: 100 },
  { id: genId(), code: "102-103-005", name: "GUANTE NITRILO M CAJA X 100 UN", category: "Insumos Médicos", stock: 500, minStock: 5, unit: "unidades", emoji: "🧤", price: 23.8, packFactor: 100 },
  { id: genId(), code: "102-103-004", name: "GUANTE NITRILO L CAJA X 100 UN", category: "Insumos Médicos", stock: 2200, minStock: 5, unit: "unidades", emoji: "🧤", price: 23.8, packFactor: 100 },
  { id: genId(), code: "103-101-001", name: "HEPARINA SODICA 25000 UI/ML FCO 5ML CAJA X 50 UN", category: "Farmacia", stock: 310, minStock: 343, unit: "unidades", emoji: "💊", price: 2380, packFactor: 50 },
  { id: genId(), code: "102-105-037", name: "JERINGA 10CC C/AG 21G VENOTEK CAJA X 100 UN", category: "Insumos Médicos", stock: 1600, minStock: 5, unit: "unidades", emoji: "💉", price: 51.17, packFactor: 100 },
  { id: genId(), code: "102-105-038", name: "JERINGA 20CC C/AG 21G VENOTEK CAJA X 50 UN", category: "Insumos Médicos", stock: 2083, minStock: 7, unit: "unidades", emoji: "💉", price: 72.59, packFactor: 50 },
  { id: genId(), code: "102-105-039", name: "JERINGA 3CC C/AG 21G VENOTEK CAJA X 100 UN", category: "Insumos Médicos", stock: 2554, minStock: 5, unit: "unidades", emoji: "💉", price: 32.13, packFactor: 100 },
  { id: genId(), code: "102-105-040", name: "JERINGA 5CC C/AG 21G VENOTEK CAJA X 100 UN", category: "Insumos Médicos", stock: 0, minStock: 5, unit: "unidades", emoji: "💉", price: 32.13, packFactor: 100 },
  { id: genId(), code: "101-101-001", name: "LINEA ARTERIAL BT-102-8MM CAJA X 48 UN", category: "Diálisis", stock: 53, minStock: 7, unit: "unidades", emoji: "🩺", price: 3053.21, packFactor: 48 },
  { id: genId(), code: "101-101-002", name: "LINEA VENOSA UNIVERSAL CAJA X 48 UN", category: "Diálisis", stock: 35, minStock: 5, unit: "unidades", emoji: "🩺", price: 2233.05, packFactor: 48 },
  { id: genId(), code: "109-101-001", name: "MANGA PLASTICA 100 MICRONES 30 CM 20 KG X MANGA", category: "Materiales", stock: 60, minStock: 351, unit: "unidades", emoji: "📦", price: 3510.5, packFactor: 1 },
  { id: genId(), code: "102-105-042", name: "MASCARILLA DESECHABLE CAJA X 50 UN", category: "Insumos Médicos", stock: 1700, minStock: 5, unit: "unidades", emoji: "😷", price: 20.23, packFactor: 50 },
  { id: genId(), code: "102-110-004", name: "PANO LIMP NET 20X20 CAJA X 1000 UN", category: "Insumos Médicos", stock: 22800, minStock: 5, unit: "unidades", emoji: "🧹", price: 19.04, packFactor: 1000 },
  { id: genId(), code: "102-105-046", name: "PECHERA CON MANGAS CAJA X 100 UN", category: "Insumos Médicos", stock: 6, minStock: 17, unit: "unidades", emoji: "🥼", price: 190.4, packFactor: 100 },
  { id: genId(), code: "102-105-047", name: "PECHERA CORTA PLASTSIMPLE BLANCA CAJA X 100 UN", category: "Insumos Médicos", stock: 2600, minStock: 5, unit: "unidades", emoji: "🥼", price: 22.61, packFactor: 100 },
  { id: genId(), code: "102-105-048", name: "PINZA CLAMP AZUL CAJA X 10 UN", category: "Insumos Médicos", stock: 137, minStock: 149, unit: "unidades", emoji: "🔧", price: 1332.8, packFactor: 10 },
  { id: genId(), code: "102-105-049", name: "PRODIGY AUTOCODE TIRAS REACTIVAS X 50 UN", category: "Insumos Médicos", stock: 250, minStock: 24, unit: "unidades", emoji: "🧪", price: 164.22, packFactor: 50 },
  { id: genId(), code: "102-106-002", name: "PURISTRIL 340 X BIDON", category: "Insumos Médicos", stock: 8, minStock: 2469, unit: "unidades", emoji: "🧴", price: 28071.19, packFactor: 1 },
  { id: genId(), code: "102-105-052", name: "SAL INDUSTRIAL REGULAR S/ADITIVOS 20 KG X UN", category: "Insumos Médicos", stock: 24, minStock: 428, unit: "unidades", emoji: "📦", price: 3593.8, packFactor: 1 },
  { id: genId(), code: "101-106-009", name: "SODIO CLORURO 0.9% 1000ML APIROFLEX CAJA X 10 UN", category: "Diálisis", stock: 234, minStock: 66, unit: "unidades", emoji: "🧴", price: 654.5, packFactor: 10 },
  { id: genId(), code: "101-106-012", name: "SODIO CLORURO 0.9% 250ML APIROFLEX X 20 UN", category: "Diálisis", stock: 98, minStock: 38, unit: "unidades", emoji: "🧴", price: 401.03, packFactor: 20 },
  { id: genId(), code: "101-106-011", name: "SODIO CLORURO 0.9% 20ML APIROFLEX X 100 UN", category: "Diálisis", stock: 490, minStock: 14, unit: "unidades", emoji: "🧴", price: 226.1, packFactor: 100 },
  { id: genId(), code: "102-105-055", name: "TAPA ROJA CAJA X 200 UN", category: "Insumos Médicos", stock: 2483, minStock: 5, unit: "unidades", emoji: "📦", price: 30.94, packFactor: 200 },
  { id: genId(), code: "102-105-057", name: "TELA MICROP 2.5CMX9.1M CAJA X 12 UN", category: "Insumos Médicos", stock: 360, minStock: 57, unit: "unidades", emoji: "🩹", price: 565.25, packFactor: 12 },
  { id: genId(), code: "101-101-003", name: "TRANSDUCER PROTECTOR CAJA X 100 UN", category: "Diálisis", stock: 17992, minStock: 38, unit: "unidades", emoji: "🔬", price: 254.66, packFactor: 100 },
  { id: genId(), code: "102-101-004", name: "ALCOHOL SWAB PRE PADS CAJA X 200 UN", category: "Insumos Médicos", stock: 0, minStock: 5, unit: "unidades", emoji: "🧴", price: 5.95, packFactor: 200 },
  { id: genId(), code: "101-101-004", name: "ARTERIAL LINE BT-102", category: "Diálisis", stock: 77, minStock: 8, unit: "unidades", emoji: "🩺", price: 2078, packFactor: 48 },
  { id: genId(), code: "101-101-005", name: "VENOUS LINE BT-102", category: "Diálisis", stock: 75, minStock: 8, unit: "unidades", emoji: "🩺", price: 1589, packFactor: 48 },
  { id: genId(), code: "101-103-009", name: "DIALIZADOR ELISIO-210H (BAJO FLUJO)", category: "Diálisis", stock: 19, minStock: 2, unit: "unidades", emoji: "⚙️", price: 17701, packFactor: 24 },
  { id: genId(), code: "101-103-010", name: "DIALIZADOR B-18HF", category: "Diálisis", stock: 48, minStock: 5, unit: "unidades", emoji: "⚙️", price: 8866, packFactor: 24 },
  { id: genId(), code: "101-103-016", name: "HEMODIALIZADOR ALTO FLUJO 1.8 TAPA REMOVIBLE V-HIGH-80", category: "Diálisis", stock: 72, minStock: 7, unit: "unidades", emoji: "⚙️", price: 9044, packFactor: 24 },
  { id: genId(), code: "101-108-036", name: "CONCENTRADO ÁCIDO ACF-215 10L", category: "Diálisis", stock: 36, minStock: 4, unit: "unidades", emoji: "⚗️", price: 11394, packFactor: 2 },
  { id: genId(), code: "101-108-037", name: "CONCENTRADO ÁCIDO ACF-213 10L", category: "Diálisis", stock: 20, minStock: 2, unit: "unidades", emoji: "⚗️", price: 11394, packFactor: 2 },
  { id: genId(), code: "102-101-007", name: "ALCOHOL GEL", category: "Insumos Médicos", stock: 36, minStock: 4, unit: "unidades", emoji: "🧴", price: 2330, packFactor: 12 },
  { id: genId(), code: "102-103-006", name: "GUANTE NITRILO S CAJA X 100 UN", category: "Insumos Médicos", stock: 2000, minStock: 5, unit: "unidades", emoji: "🧤", price: 23.8, packFactor: 100 },
  { id: genId(), code: "102-103-013", name: "GUANTE VINILO S CAJA X 100 UN", category: "Insumos Médicos", stock: 6600, minStock: 5, unit: "unidades", emoji: "🧤", price: 23.8, packFactor: 100 },
  { id: genId(), code: "102-105-018", name: "CUBRECALZADO CAJA X 100 UN", category: "Insumos Médicos", stock: 300, minStock: 5, unit: "unidades", emoji: "👞", price: 50, packFactor: 100 },
  { id: genId(), code: "102-105-024", name: "DISPOS ELEKTRODE PACK 40PCS BCM X BOLSA", category: "Insumos Médicos", stock: 62, minStock: 6, unit: "unidades", emoji: "🔬", price: 19034.43, packFactor: 40 },
  { id: genId(), code: "102-105-026", name: "DURALOCK-C 30.0% 2.5 ML PRE-FILLED SYRINGE CAJA X 30 UN", category: "Insumos Médicos", stock: 300, minStock: 30, unit: "unidades", emoji: "💉", price: 2645, packFactor: 30 },
  { id: genId(), code: "102-105-044", name: "MASCARILLA N95 X UN", category: "Insumos Médicos", stock: 1100, minStock: 5, unit: "unidades", emoji: "😷", price: 2324, packFactor: 1 },
  { id: genId(), code: "102-105-067", name: "CONECTOR TEGO CAJA X 100 UN MEG", category: "Insumos Médicos", stock: 200, minStock: 20, unit: "unidades", emoji: "🔗", price: 1190, packFactor: 100 },
  { id: genId(), code: "102-106-003", name: "CITROT3K (ACIDO CITRICO-21%) 5 LT X BIDON", category: "Insumos Médicos", stock: 10, minStock: 1, unit: "unidades", emoji: "🧴", price: 27251, packFactor: 1 },
  { id: genId(), code: "102-106-005", name: "PRC ACIDO CITRICO 21% 5 LT X BIDON", category: "Insumos Médicos", stock: 8, minStock: 1, unit: "unidades", emoji: "🧴", price: 19632, packFactor: 1 }
];

    // Movimientos reales registrados: consumo diario 23-25 junio 2026
    db.movements.push(
      { id: genId(), productId: db.products.find(p=>p.code==="102-101-002").id, productCode: "102-101-002", productName: "ALCOHOL DESNATURALIZADO 70% 1000ML CAJA X 12 UN", type: "salida", quantity: 2, unit: "unidades", turno: "Consumo diario", date: "2026-06-23T14:00:00", note: "Consumo MJS 2026-06-23" },
      { id: genId(), productId: db.products.find(p=>p.code==="102-101-003").id, productCode: "102-101-003", productName: "ALCOHOL DESNATURALIZADO 70% 500ML CAJA X 20 UN", type: "salida", quantity: 2, unit: "unidades", turno: "Consumo diario", date: "2026-06-23T14:00:00", note: "Consumo MJS 2026-06-23" },
      { id: genId(), productId: db.products.find(p=>p.code==="102-101-004").id, productCode: "102-101-004", productName: "ALCOHOL SWAB PRE PADS CAJA X 200 UN", type: "salida", quantity: 140, unit: "unidades", turno: "Consumo diario", date: "2026-06-23T14:00:00", note: "Consumo MJS 2026-06-23" },
      { id: genId(), productId: db.products.find(p=>p.code==="102-105-011").id, productCode: "102-105-011", productName: "APOSITO 10X12 CM CAJA X 50 UN", type: "salida", quantity: 19, unit: "unidades", turno: "Consumo diario", date: "2026-06-23T14:00:00", note: "Consumo MJS 2026-06-23" },
      { id: genId(), productId: db.products.find(p=>p.code==="102-105-012").id, productCode: "102-105-012", productName: "APOSITO 10X8 CM CAJA X 50 UN", type: "salida", quantity: 15, unit: "unidades", turno: "Consumo diario", date: "2026-06-23T14:00:00", note: "Consumo MJS 2026-06-23" },
      { id: genId(), productId: db.products.find(p=>p.code==="101-108-005").id, productCode: "101-108-005", productName: "AVF DRESSING KIT CAJA X 160 UN", type: "salida", quantity: 33, unit: "unidades", turno: "Consumo diario", date: "2026-06-23T14:00:00", note: "Consumo MJS 2026-06-23" },
      { id: genId(), productId: db.products.find(p=>p.code==="101-108-002").id, productCode: "101-108-002", productName: "AVF AGUJA 15G 1 INCH 30 CM CAJA X 50 UN", type: "salida", quantity: 42, unit: "unidades", turno: "Consumo diario", date: "2026-06-23T14:00:00", note: "Consumo MJS 2026-06-23" },
      { id: genId(), productId: db.products.find(p=>p.code==="101-108-003").id, productCode: "101-108-003", productName: "AVF AGUJA 16G 1 INCH 30 CM CAJA X 50 UN", type: "salida", quantity: 22, unit: "unidades", turno: "Consumo diario", date: "2026-06-23T14:00:00", note: "Consumo MJS 2026-06-23" },
      { id: genId(), productId: db.products.find(p=>p.code==="101-108-004").id, productCode: "101-108-004", productName: "AVF AGUJA 17G 1 INCH 30 CM CAJA X 50 UN", type: "salida", quantity: 6, unit: "unidades", turno: "Consumo diario", date: "2026-06-23T14:00:00", note: "Consumo MJS 2026-06-23" },
      { id: genId(), productId: db.products.find(p=>p.code==="101-106-003").id, productCode: "101-106-003", productName: "BIBAG 5008 650G L.A. CAJA X 16 UN", type: "salida", quantity: 20, unit: "unidades", turno: "Consumo diario", date: "2026-06-23T14:00:00", note: "Consumo MJS 2026-06-23" },
      { id: genId(), productId: db.products.find(p=>p.code==="101-106-005").id, productCode: "101-106-005", productName: "BIBAG 5008 900G L.A. CAJA X 12 UN", type: "salida", quantity: 22, unit: "unidades", turno: "Consumo diario", date: "2026-06-23T14:00:00", note: "Consumo MJS 2026-06-23" },
      { id: genId(), productId: db.products.find(p=>p.code==="101-108-006").id, productCode: "101-108-006", productName: "CATHETER DRESSING KIT CAJA X 80 UN", type: "salida", quantity: 32, unit: "unidades", turno: "Consumo diario", date: "2026-06-23T14:00:00", note: "Consumo MJS 2026-06-23" },
      { id: genId(), productId: db.products.find(p=>p.code==="101-106-008").id, productCode: "101-106-008", productName: "CONECTORES LINEAS AV CAJA X 150 UN", type: "salida", quantity: 6, unit: "unidades", turno: "Consumo diario", date: "2026-06-23T14:00:00", note: "Consumo MJS 2026-06-23" },
      { id: genId(), productId: db.products.find(p=>p.code==="101-103-003").id, productCode: "101-103-003", productName: "DIALIZADOR FX CORDIAX 60 X CAJA 24 UN", type: "salida", quantity: 4, unit: "unidades", turno: "Consumo diario", date: "2026-06-23T14:00:00", note: "Consumo MJS 2026-06-23" },
      { id: genId(), productId: db.products.find(p=>p.code==="102-105-064").id, productCode: "102-105-064", productName: "DIALY-TEST CONC. AC. PERACETICO 100 TIRAS", type: "salida", quantity: 1, unit: "unidades", turno: "Consumo diario", date: "2026-06-23T14:00:00", note: "Consumo MJS 2026-06-23" },
      { id: genId(), productId: db.products.find(p=>p.code==="102-105-065").id, productCode: "102-105-065", productName: "DIALY-TEST RESIDUAL AC. PERACETICO 100 TIRAS", type: "salida", quantity: 1, unit: "unidades", turno: "Consumo diario", date: "2026-06-23T14:00:00", note: "Consumo MJS 2026-06-23" },
      { id: genId(), productId: db.products.find(p=>p.code==="102-105-027").id, productCode: "102-105-027", productName: "EQUIPO MACROGOTEO C/SEGMENTO BOLSA X 25 UN", type: "salida", quantity: 9, unit: "unidades", turno: "Consumo diario", date: "2026-06-23T14:00:00", note: "Consumo MJS 2026-06-23" },
      { id: genId(), productId: db.products.find(p=>p.code==="102-105-028").id, productCode: "102-105-028", productName: "EQUIPO MACROGOTEO S/SEGMENTO BOLSA X 25 UN", type: "salida", quantity: 60, unit: "unidades", turno: "Consumo diario", date: "2026-06-23T14:00:00", note: "Consumo MJS 2026-06-23" },
      { id: genId(), productId: db.products.find(p=>p.code==="102-105-032").id, productCode: "102-105-032", productName: "GASA 7.5X7.5 X2 ESTERIL CAJA X 50 UN", type: "salida", quantity: 50, unit: "unidades", turno: "Consumo diario", date: "2026-06-23T14:00:00", note: "Consumo MJS 2026-06-23" },
      { id: genId(), productId: db.products.find(p=>p.code==="102-105-034").id, productCode: "102-105-034", productName: "GORRO DESECHABLE CAJA X 100 UN", type: "salida", quantity: 50, unit: "unidades", turno: "Consumo diario", date: "2026-06-23T14:00:00", note: "Consumo MJS 2026-06-23" },
      { id: genId(), productId: db.products.find(p=>p.code==="102-103-003").id, productCode: "102-103-003", productName: "GUANTE EXAMEN MUNCARE AQL 1.5 XS CAJA X 100 UN", type: "salida", quantity: 100, unit: "unidades", turno: "Consumo diario", date: "2026-06-23T14:00:00", note: "Consumo MJS 2026-06-23" },
      { id: genId(), productId: db.products.find(p=>p.code==="103-101-001").id, productCode: "103-101-001", productName: "HEPARINA SODICA 25000 UI/ML FCO 5ML CAJA X 50 UN", type: "salida", quantity: 36, unit: "unidades", turno: "Consumo diario", date: "2026-06-23T14:00:00", note: "Consumo MJS 2026-06-23" },
      { id: genId(), productId: db.products.find(p=>p.code==="102-105-038").id, productCode: "102-105-038", productName: "JERINGA 20CC C/AG 21G VENOTEK CAJA X 50 UN", type: "salida", quantity: 79, unit: "unidades", turno: "Consumo diario", date: "2026-06-23T14:00:00", note: "Consumo MJS 2026-06-23" },
      { id: genId(), productId: db.products.find(p=>p.code==="102-105-039").id, productCode: "102-105-039", productName: "JERINGA 3CC C/AG 21G VENOTEK CAJA X 100 UN", type: "salida", quantity: 91, unit: "unidades", turno: "Consumo diario", date: "2026-06-23T14:00:00", note: "Consumo MJS 2026-06-23" },
      { id: genId(), productId: db.products.find(p=>p.code==="102-105-040").id, productCode: "102-105-040", productName: "JERINGA 5CC C/AG 21G VENOTEK CAJA X 100 UN", type: "salida", quantity: 54, unit: "unidades", turno: "Consumo diario", date: "2026-06-23T14:00:00", note: "Consumo MJS 2026-06-23" },
      { id: genId(), productId: db.products.find(p=>p.code==="101-101-001").id, productCode: "101-101-001", productName: "LINEA ARTERIAL BT-102-8MM CAJA X 48 UN", type: "salida", quantity: 4, unit: "unidades", turno: "Consumo diario", date: "2026-06-23T14:00:00", note: "Consumo MJS 2026-06-23" },
      { id: genId(), productId: db.products.find(p=>p.code==="101-101-002").id, productCode: "101-101-002", productName: "LINEA VENOSA UNIVERSAL CAJA X 48 UN", type: "salida", quantity: 10, unit: "unidades", turno: "Consumo diario", date: "2026-06-23T14:00:00", note: "Consumo MJS 2026-06-23" },
      { id: genId(), productId: db.products.find(p=>p.code==="102-110-004").id, productCode: "102-110-004", productName: "PANO LIMP NET 20X20 CAJA X 1000 UN", type: "salida", quantity: 300, unit: "unidades", turno: "Consumo diario", date: "2026-06-23T14:00:00", note: "Consumo MJS 2026-06-23" },
      { id: genId(), productId: db.products.find(p=>p.code==="102-106-002").id, productCode: "102-106-002", productName: "PURISTRIL 340 X BIDON", type: "salida", quantity: 1, unit: "unidades", turno: "Consumo diario", date: "2026-06-23T14:00:00", note: "Consumo MJS 2026-06-23" },
      { id: genId(), productId: db.products.find(p=>p.code==="101-108-013").id, productCode: "101-108-013", productName: "CONCENTRADO ACIDO 925-A CAJA X 4 UN", type: "salida", quantity: 20, unit: "unidades", turno: "Consumo diario", date: "2026-06-23T14:00:00", note: "Consumo MJS 2026-06-23" },
      { id: genId(), productId: db.products.find(p=>p.code==="101-108-014").id, productCode: "101-108-014", productName: "CONCENTRADO ACIDO 926-A CAJA X 4 UN", type: "salida", quantity: 15, unit: "unidades", turno: "Consumo diario", date: "2026-06-23T14:00:00", note: "Consumo MJS 2026-06-23" },
      { id: genId(), productId: db.products.find(p=>p.code==="102-101-004").id, productCode: "102-101-004", productName: "ALCOHOL SWAB PRE PADS CAJA X 200 UN", type: "salida", quantity: 190, unit: "unidades", turno: "Consumo diario", date: "2026-06-24T14:00:00", note: "Consumo LMV 2026-06-24" },
      { id: genId(), productId: db.products.find(p=>p.code==="102-105-011").id, productCode: "102-105-011", productName: "APOSITO 10X12 CM CAJA X 50 UN", type: "salida", quantity: 22, unit: "unidades", turno: "Consumo diario", date: "2026-06-24T14:00:00", note: "Consumo LMV 2026-06-24" },
      { id: genId(), productId: db.products.find(p=>p.code==="102-105-012").id, productCode: "102-105-012", productName: "APOSITO 10X8 CM CAJA X 50 UN", type: "salida", quantity: 9, unit: "unidades", turno: "Consumo diario", date: "2026-06-24T14:00:00", note: "Consumo LMV 2026-06-24" },
      { id: genId(), productId: db.products.find(p=>p.code==="101-108-005").id, productCode: "101-108-005", productName: "AVF DRESSING KIT CAJA X 160 UN", type: "salida", quantity: 47, unit: "unidades", turno: "Consumo diario", date: "2026-06-24T14:00:00", note: "Consumo LMV 2026-06-24" },
      { id: genId(), productId: db.products.find(p=>p.code==="101-108-002").id, productCode: "101-108-002", productName: "AVF AGUJA 15G 1 INCH 30 CM CAJA X 50 UN", type: "salida", quantity: 64, unit: "unidades", turno: "Consumo diario", date: "2026-06-24T14:00:00", note: "Consumo LMV 2026-06-24" },
      { id: genId(), productId: db.products.find(p=>p.code==="101-108-003").id, productCode: "101-108-003", productName: "AVF AGUJA 16G 1 INCH 30 CM CAJA X 50 UN", type: "salida", quantity: 30, unit: "unidades", turno: "Consumo diario", date: "2026-06-24T14:00:00", note: "Consumo LMV 2026-06-24" },
      { id: genId(), productId: db.products.find(p=>p.code==="101-108-004").id, productCode: "101-108-004", productName: "AVF AGUJA 17G 1 INCH 30 CM CAJA X 50 UN", type: "salida", quantity: 4, unit: "unidades", turno: "Consumo diario", date: "2026-06-24T14:00:00", note: "Consumo LMV 2026-06-24" },
      { id: genId(), productId: db.products.find(p=>p.code==="101-106-003").id, productCode: "101-106-003", productName: "BIBAG 5008 650G L.A. CAJA X 16 UN", type: "salida", quantity: 24, unit: "unidades", turno: "Consumo diario", date: "2026-06-24T14:00:00", note: "Consumo LMV 2026-06-24" },
      { id: genId(), productId: db.products.find(p=>p.code==="101-106-005").id, productCode: "101-106-005", productName: "BIBAG 5008 900G L.A. CAJA X 12 UN", type: "salida", quantity: 24, unit: "unidades", turno: "Consumo diario", date: "2026-06-24T14:00:00", note: "Consumo LMV 2026-06-24" },
      { id: genId(), productId: db.products.find(p=>p.code==="101-108-006").id, productCode: "101-108-006", productName: "CATHETER DRESSING KIT CAJA X 80 UN", type: "salida", quantity: 29, unit: "unidades", turno: "Consumo diario", date: "2026-06-24T14:00:00", note: "Consumo LMV 2026-06-24" },
      { id: genId(), productId: db.products.find(p=>p.code==="101-106-008").id, productCode: "101-106-008", productName: "CONECTORES LINEAS AV CAJA X 150 UN", type: "salida", quantity: 2, unit: "unidades", turno: "Consumo diario", date: "2026-06-24T14:00:00", note: "Consumo LMV 2026-06-24" },
      { id: genId(), productId: db.products.find(p=>p.code==="101-103-004").id, productCode: "101-103-004", productName: "DIALIZADOR FX CORDIAX 80 X CAJA 24 UN", type: "salida", quantity: 5, unit: "unidades", turno: "Consumo diario", date: "2026-06-24T14:00:00", note: "Consumo LMV 2026-06-24" },
      { id: genId(), productId: db.products.find(p=>p.code==="102-105-027").id, productCode: "102-105-027", productName: "EQUIPO MACROGOTEO C/SEGMENTO BOLSA X 25 UN", type: "salida", quantity: 8, unit: "unidades", turno: "Consumo diario", date: "2026-06-24T14:00:00", note: "Consumo LMV 2026-06-24" },
      { id: genId(), productId: db.products.find(p=>p.code==="102-105-028").id, productCode: "102-105-028", productName: "EQUIPO MACROGOTEO S/SEGMENTO BOLSA X 25 UN", type: "salida", quantity: 72, unit: "unidades", turno: "Consumo diario", date: "2026-06-24T14:00:00", note: "Consumo LMV 2026-06-24" },
      { id: genId(), productId: db.products.find(p=>p.code==="102-105-029").id, productCode: "102-105-029", productName: "FILTRO DIASAFE PLUS X UN", type: "salida", quantity: 2, unit: "unidades", turno: "Consumo diario", date: "2026-06-24T14:00:00", note: "Consumo LMV 2026-06-24" },
      { id: genId(), productId: db.products.find(p=>p.code==="102-105-032").id, productCode: "102-105-032", productName: "GASA 7.5X7.5 X2 ESTERIL CAJA X 50 UN", type: "salida", quantity: 50, unit: "unidades", turno: "Consumo diario", date: "2026-06-24T14:00:00", note: "Consumo LMV 2026-06-24" },
      { id: genId(), productId: db.products.find(p=>p.code==="102-103-011").id, productCode: "102-103-011", productName: "GUANTE VINILO L CAJA X 100 UN", type: "salida", quantity: 200, unit: "unidades", turno: "Consumo diario", date: "2026-06-24T14:00:00", note: "Consumo LMV 2026-06-24" },
      { id: genId(), productId: db.products.find(p=>p.code==="103-101-001").id, productCode: "103-101-001", productName: "HEPARINA SODICA 25000 UI/ML FCO 5ML CAJA X 50 UN", type: "salida", quantity: 39, unit: "unidades", turno: "Consumo diario", date: "2026-06-24T14:00:00", note: "Consumo LMV 2026-06-24" },
      { id: genId(), productId: db.products.find(p=>p.code==="102-105-038").id, productCode: "102-105-038", productName: "JERINGA 20CC C/AG 21G VENOTEK CAJA X 50 UN", type: "salida", quantity: 81, unit: "unidades", turno: "Consumo diario", date: "2026-06-24T14:00:00", note: "Consumo LMV 2026-06-24" },
      { id: genId(), productId: db.products.find(p=>p.code==="102-105-039").id, productCode: "102-105-039", productName: "JERINGA 3CC C/AG 21G VENOTEK CAJA X 100 UN", type: "salida", quantity: 107, unit: "unidades", turno: "Consumo diario", date: "2026-06-24T14:00:00", note: "Consumo LMV 2026-06-24" },
      { id: genId(), productId: db.products.find(p=>p.code==="102-105-040").id, productCode: "102-105-040", productName: "JERINGA 5CC C/AG 21G VENOTEK CAJA X 100 UN", type: "salida", quantity: 60, unit: "unidades", turno: "Consumo diario", date: "2026-06-24T14:00:00", note: "Consumo LMV 2026-06-24" },
      { id: genId(), productId: db.products.find(p=>p.code==="101-101-001").id, productCode: "101-101-001", productName: "LINEA ARTERIAL BT-102-8MM CAJA X 48 UN", type: "salida", quantity: 8, unit: "unidades", turno: "Consumo diario", date: "2026-06-24T14:00:00", note: "Consumo LMV 2026-06-24" },
      { id: genId(), productId: db.products.find(p=>p.code==="101-101-002").id, productCode: "101-101-002", productName: "LINEA VENOSA UNIVERSAL CAJA X 48 UN", type: "salida", quantity: 8, unit: "unidades", turno: "Consumo diario", date: "2026-06-24T14:00:00", note: "Consumo LMV 2026-06-24" },
      { id: genId(), productId: db.products.find(p=>p.code==="109-101-001").id, productCode: "109-101-001", productName: "MANGA PLASTICA 100 MICRONES 30 CM 20 KG X MANGA", type: "salida", quantity: 20, unit: "unidades", turno: "Consumo diario", date: "2026-06-24T14:00:00", note: "Consumo LMV 2026-06-24" },
      { id: genId(), productId: db.products.find(p=>p.code==="102-105-042").id, productCode: "102-105-042", productName: "MASCARILLA DESECHABLE CAJA X 50 UN", type: "salida", quantity: 100, unit: "unidades", turno: "Consumo diario", date: "2026-06-24T14:00:00", note: "Consumo LMV 2026-06-24" },
      { id: genId(), productId: db.products.find(p=>p.code==="102-110-004").id, productCode: "102-110-004", productName: "PANO LIMP NET 20X20 CAJA X 1000 UN", type: "salida", quantity: 300, unit: "unidades", turno: "Consumo diario", date: "2026-06-24T14:00:00", note: "Consumo LMV 2026-06-24" },
      { id: genId(), productId: db.products.find(p=>p.code==="101-106-009").id, productCode: "101-106-009", productName: "SODIO CLORURO 0.9% 1000ML APIROFLEX CAJA X 10 UN", type: "salida", quantity: 73, unit: "unidades", turno: "Consumo diario", date: "2026-06-24T14:00:00", note: "Consumo LMV 2026-06-24" },
      { id: genId(), productId: db.products.find(p=>p.code==="102-101-004").id, productCode: "102-101-004", productName: "ALCOHOL SWAB PRE PADS CAJA X 200 UN", type: "salida", quantity: 140, unit: "unidades", turno: "Consumo diario", date: "2026-06-25T14:00:00", note: "Consumo MJS 2026-06-25" },
      { id: genId(), productId: db.products.find(p=>p.code==="102-105-011").id, productCode: "102-105-011", productName: "APOSITO 10X12 CM CAJA X 50 UN", type: "salida", quantity: 19, unit: "unidades", turno: "Consumo diario", date: "2026-06-25T14:00:00", note: "Consumo MJS 2026-06-25" },
      { id: genId(), productId: db.products.find(p=>p.code==="102-105-012").id, productCode: "102-105-012", productName: "APOSITO 10X8 CM CAJA X 50 UN", type: "salida", quantity: 15, unit: "unidades", turno: "Consumo diario", date: "2026-06-25T14:00:00", note: "Consumo MJS 2026-06-25" },
      { id: genId(), productId: db.products.find(p=>p.code==="101-108-005").id, productCode: "101-108-005", productName: "AVF DRESSING KIT CAJA X 160 UN", type: "salida", quantity: 33, unit: "unidades", turno: "Consumo diario", date: "2026-06-25T14:00:00", note: "Consumo MJS 2026-06-25" },
      { id: genId(), productId: db.products.find(p=>p.code==="101-108-002").id, productCode: "101-108-002", productName: "AVF AGUJA 15G 1 INCH 30 CM CAJA X 50 UN", type: "salida", quantity: 42, unit: "unidades", turno: "Consumo diario", date: "2026-06-25T14:00:00", note: "Consumo MJS 2026-06-25" },
      { id: genId(), productId: db.products.find(p=>p.code==="101-108-003").id, productCode: "101-108-003", productName: "AVF AGUJA 16G 1 INCH 30 CM CAJA X 50 UN", type: "salida", quantity: 22, unit: "unidades", turno: "Consumo diario", date: "2026-06-25T14:00:00", note: "Consumo MJS 2026-06-25" },
      { id: genId(), productId: db.products.find(p=>p.code==="101-108-004").id, productCode: "101-108-004", productName: "AVF AGUJA 17G 1 INCH 30 CM CAJA X 50 UN", type: "salida", quantity: 6, unit: "unidades", turno: "Consumo diario", date: "2026-06-25T14:00:00", note: "Consumo MJS 2026-06-25" },
      { id: genId(), productId: db.products.find(p=>p.code==="101-106-003").id, productCode: "101-106-003", productName: "BIBAG 5008 650G L.A. CAJA X 16 UN", type: "salida", quantity: 20, unit: "unidades", turno: "Consumo diario", date: "2026-06-25T14:00:00", note: "Consumo MJS 2026-06-25" },
      { id: genId(), productId: db.products.find(p=>p.code==="101-106-005").id, productCode: "101-106-005", productName: "BIBAG 5008 900G L.A. CAJA X 12 UN", type: "salida", quantity: 22, unit: "unidades", turno: "Consumo diario", date: "2026-06-25T14:00:00", note: "Consumo MJS 2026-06-25" },
      { id: genId(), productId: db.products.find(p=>p.code==="101-108-006").id, productCode: "101-108-006", productName: "CATHETER DRESSING KIT CAJA X 80 UN", type: "salida", quantity: 32, unit: "unidades", turno: "Consumo diario", date: "2026-06-25T14:00:00", note: "Consumo MJS 2026-06-25" },
      { id: genId(), productId: db.products.find(p=>p.code==="102-105-027").id, productCode: "102-105-027", productName: "EQUIPO MACROGOTEO C/SEGMENTO BOLSA X 25 UN", type: "salida", quantity: 9, unit: "unidades", turno: "Consumo diario", date: "2026-06-25T14:00:00", note: "Consumo MJS 2026-06-25" },
      { id: genId(), productId: db.products.find(p=>p.code==="102-105-028").id, productCode: "102-105-028", productName: "EQUIPO MACROGOTEO S/SEGMENTO BOLSA X 25 UN", type: "salida", quantity: 60, unit: "unidades", turno: "Consumo diario", date: "2026-06-25T14:00:00", note: "Consumo MJS 2026-06-25" },
      { id: genId(), productId: db.products.find(p=>p.code==="103-101-001").id, productCode: "103-101-001", productName: "HEPARINA SODICA 25000 UI/ML FCO 5ML CAJA X 50 UN", type: "salida", quantity: 36, unit: "unidades", turno: "Consumo diario", date: "2026-06-25T14:00:00", note: "Consumo MJS 2026-06-25" },
      { id: genId(), productId: db.products.find(p=>p.code==="102-105-038").id, productCode: "102-105-038", productName: "JERINGA 20CC C/AG 21G VENOTEK CAJA X 50 UN", type: "salida", quantity: 79, unit: "unidades", turno: "Consumo diario", date: "2026-06-25T14:00:00", note: "Consumo MJS 2026-06-25" },
      { id: genId(), productId: db.products.find(p=>p.code==="102-105-039").id, productCode: "102-105-039", productName: "JERINGA 3CC C/AG 21G VENOTEK CAJA X 100 UN", type: "salida", quantity: 91, unit: "unidades", turno: "Consumo diario", date: "2026-06-25T14:00:00", note: "Consumo MJS 2026-06-25" },
      { id: genId(), productId: db.products.find(p=>p.code==="102-105-040").id, productCode: "102-105-040", productName: "JERINGA 5CC C/AG 21G VENOTEK CAJA X 100 UN", type: "salida", quantity: 54, unit: "unidades", turno: "Consumo diario", date: "2026-06-25T14:00:00", note: "Consumo MJS 2026-06-25" },
      { id: genId(), productId: db.products.find(p=>p.code==="102-110-004").id, productCode: "102-110-004", productName: "PANO LIMP NET 20X20 CAJA X 1000 UN", type: "salida", quantity: 300, unit: "unidades", turno: "Consumo diario", date: "2026-06-25T14:00:00", note: "Consumo MJS 2026-06-25" }
    );

    save();
  }
  // Migración: rellenar packFactor en productos guardados antes de que existiera este campo
  const PACK_FACTORS_MIGRACION = {
    "102-101-002":12, "102-101-003":20, "102-101-001":24, "102-105-011":50, "102-105-012":50,
    "101-108-005":160, "101-108-002":50, "101-108-003":50, "101-108-004":50, "101-106-003":16,
    "101-106-005":12, "101-108-006":80, "102-106-001":1, "105-102-002":1, "101-108-013":4,
    "101-108-014":4, "101-108-012":4, "101-106-008":150, "102-105-060":250, "101-103-002":24,
    "101-103-003":24, "101-103-004":24, "101-103-013":1, "102-105-064":1, "102-105-065":1,
    "102-105-027":25, "102-105-028":25, "102-105-029":1, "102-105-032":50, "102-105-034":100,
    "102-103-008":50, "102-103-002":100, "102-103-003":100, "102-103-011":100, "102-103-012":100,
    "102-103-005":100, "102-103-004":100, "103-101-001":50, "102-105-037":100, "102-105-038":50,
    "102-105-039":100, "102-105-040":100, "101-101-001":48, "101-101-002":48, "109-101-001":1,
    "102-105-042":50, "102-110-004":1000, "102-105-046":100, "102-105-047":100, "102-105-048":10,
    "102-105-049":50, "102-106-002":1, "102-105-052":1, "101-106-009":10, "101-106-012":20,
    "101-106-011":100, "102-105-055":200, "102-105-057":12, "101-101-003":100, "102-101-004":200,
    "101-101-004":48, "101-101-005":48, "101-103-009":24, "101-103-010":24, "101-103-016":24,
    "101-108-036":2, "101-108-037":2, "102-101-007":12, "102-103-006":100, "102-103-013":100,
    "102-105-018":100, "102-105-024":40, "102-105-026":30, "102-105-044":1, "102-105-067":100,
    "102-106-003":1, "102-106-005":1, "102-105-031":50, "101-103-016":24
  };
  let migracionAplicada = false;
  db.products.forEach(p => {
    if (p.packFactor === undefined || p.packFactor === null) {
      p.packFactor = PACK_FACTORS_MIGRACION[p.code] || 1;
      migracionAplicada = true;
    }
  });
  if (migracionAplicada) save();
  // Ordenar catálogo por código de menor a mayor (aplica siempre, sea data nueva o ya guardada)
  db.products.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }));
  updateDashboard();
  renderInventory();
  renderMovements();
  updateClock();
  setInterval(updateClock, 1000);
 autoCode();
  renderRespaldoInfo();
}

function genId() { return Date.now().toString(36) + Math.random().toString(36).substr(2); }
function autoCode() {
  const next = 'INS-' + String(db.products.length + 1).padStart(3, '0');
  document.getElementById('new-code').value = next;
}

function mostrarResumenDia() {
  const hoy = new Date();
  const todayStr = hoy.toDateString();
  const movHoy = db.movements.filter(m => new Date(m.date).toDateString() === todayStr);
  const entradas = movHoy.filter(m => m.type === 'entrada');
  const salidas = movHoy.filter(m => m.type === 'salida');
  const devoluciones = movHoy.filter(m => m.type === 'devolucion');
  const bajo = db.products.filter(p => p.stock > 0 && p.stock <= p.minStock);
  const agotados = db.products.filter(p => p.stock === 0);

  // Calcular consumo valorizado del día
  const consumoValor = salidas.reduce((s, m) => {
    const p = db.products.find(x => x.id === m.productId || x.code === m.productCode);
    return s + ((p?.price || 0) * (m.quantity || m.qty || 0));
  }, 0);

  const fmt = (n) => '$' + Math.round(n).toLocaleString('es-CL');

  const pendientes = [];
  if (agotados.length > 0) pendientes.push(`⚠️ ${agotados.length} producto${agotados.length>1?'s':''} sin stock`);
  if (bajo.length > 0) pendientes.push(`🟡 ${bajo.length} producto${bajo.length>1?'s':''} bajo mínimo`);
  if (movHoy.length === 0) pendientes.push('📋 Sin movimientos registrados hoy');

  document.getElementById('resumen-dia-fecha').textContent = hoy.toLocaleDateString('es-CL', { weekday:'long', day:'numeric', month:'long' });
  document.getElementById('resumen-dia-content').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
      <div style="background:rgba(0,153,204,0.08);border-radius:12px;padding:10px;text-align:center">
        <div style="font-size:22px;font-weight:800;color:var(--accent)">${movHoy.length}</div>
        <div style="font-size:10px;color:var(--muted)">Movimientos totales</div>
      </div>
      <div style="background:rgba(200,16,46,0.06);border-radius:12px;padding:10px;text-align:center">
        <div style="font-size:22px;font-weight:800;color:var(--danger)">${fmt(consumoValor)}</div>
        <div style="font-size:10px;color:var(--muted)">Consumo valorizado</div>
      </div>
      <div style="background:rgba(0,153,204,0.05);border-radius:12px;padding:10px;text-align:center">
        <div style="font-size:18px;font-weight:800;color:var(--accent)">+${entradas.length}</div>
        <div style="font-size:10px;color:var(--muted)">Entradas</div>
      </div>
      <div style="background:rgba(200,16,46,0.04);border-radius:12px;padding:10px;text-align:center">
        <div style="font-size:18px;font-weight:800;color:var(--danger)">-${salidas.length}</div>
        <div style="font-size:10px;color:var(--muted)">Salidas</div>
      </div>
    </div>
    ${pendientes.length > 0 ? `
    <div style="background:rgba(245,124,0,0.08);border:1.5px solid rgba(245,124,0,0.2);border-radius:12px;padding:10px;margin-bottom:10px">
      <div style="font-size:11px;font-weight:700;color:#f57c00;margin-bottom:6px">⚠️ Pendientes para mañana</div>
      ${pendientes.map(p => `<div style="font-size:11px;color:var(--text);padding:3px 0">${p}</div>`).join('')}
    </div>` : `
    <div style="background:rgba(0,153,204,0.06);border:1.5px solid rgba(0,153,204,0.2);border-radius:12px;padding:10px;margin-bottom:10px;text-align:center">
      <div style="font-size:13px;font-weight:700;color:var(--accent)">✅ Todo en orden</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px">Sin alertas pendientes</div>
    </div>`}
    ${salidas.length > 0 ? `
    <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Top salidas del día</div>
    ${salidas.slice(-3).reverse().map(m => `
      <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:11px">
        <span style="color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.productName}</span>
        <span style="color:var(--danger);font-weight:700;margin-left:8px">-${m.quantity || m.qty || 0}</span>
      </div>`).join('')}` : ''}
  `;
  document.getElementById('resumen-dia-modal').style.display = 'flex';
}

// Auto-mostrar resumen al final del turno (20:00, una vez por día)
function checkResumenAutomatico() {
  const now = new Date();
  const h = now.getHours();
  const hoy = now.toDateString();
  const yaVisto = localStorage.getItem('ds_resumen_visto');
  if (h >= 17 && yaVisto !== hoy && db.movements.length > 0) {
    const movHoy = db.movements.filter(m => new Date(m.date).toDateString() === hoy);
    if (movHoy.length > 0) {
      localStorage.setItem('ds_resumen_visto', hoy);
      setTimeout(mostrarResumenDia, 2000);
    }
  }
}
setInterval(checkResumenAutomatico, 60000); // revisar cada minuto

function updateClock() {
  const now = new Date();
  document.getElementById('current-time').textContent =
    now.getHours().toString().padStart(2,'0') + ':' +
    now.getMinutes().toString().padStart(2,'0');
}

