// ==================== DEMO DATA ====================
function cargarDemo() {
  if (!confirm('¿Cargar datos de demostración?\nEsto agregará movimientos, vencimientos, pacientes y mermas de prueba.')) return;

  // Fechas relativas
  const hoy = new Date();
  const hace = (d) => { const f = new Date(hoy); f.setDate(f.getDate() - d); return f.toISOString(); };
  const enDias = (d) => { const f = new Date(hoy); f.setDate(f.getDate() + d); return f.toISOString().split('T')[0]; };

  // ── Movimientos últimos 7 días ──
  const productosDemo = db.products.slice(0, 20);
  const tipos = ['salida','salida','salida','entrada','devolucion'];
  const turnos = ['Mañana','Tarde','Tarde Noche'];
  const movDemo = [];
  for (let d = 6; d >= 0; d--) {
    const cuantos = Math.floor(Math.random()*4) + 3;
    for (let i = 0; i < cuantos; i++) {
      const p = productosDemo[Math.floor(Math.random()*productosDemo.length)];
      const tipo = tipos[Math.floor(Math.random()*tipos.length)];
      const qty = Math.floor(Math.random()*5) + 1;
      movDemo.push({
        id: genId(),
        productId: p.id,
        productCode: p.code,
        productName: p.name,
        type: tipo,
        quantity: qty,
        unit: p.unit,
        turno: turnos[Math.floor(Math.random()*3)],
        date: hace(d),
        note: 'Demo'
      });
      // Ajustar stock simulado
      if (tipo === 'salida') p.stock = Math.max(0, p.stock - qty);
      else if (tipo === 'entrada') p.stock += qty;
    }
  }
  db.movements.push(...movDemo);

  // Forzar algunos productos con stock bajo/cero para que las alertas se vean
  if (db.products[0]) db.products[0].stock = 0;
  if (db.products[1]) db.products[1].stock = db.products[1].minStock - 1;
  if (db.products[4]) db.products[4].stock = Math.floor(db.products[4].minStock * 0.5);
  save();

  // ── Lotes y vencimientos ──
  const lotesDemo = [
    { code: '102-105-038', lote: 'L-2024-001', venc: enDias(12) },
    { code: '102-105-039', lote: 'L-2024-002', venc: enDias(25) },
    { code: '101-108-002', lote: 'L-2024-003', venc: enDias(45) },
    { code: '101-103-002', lote: 'L-2024-004', venc: enDias(90) },
    { code: '102-101-004', lote: 'L-2023-099', venc: enDias(5) },
    { code: '103-101-001', lote: 'L-2024-005', venc: enDias(180) },
  ];
  lotesDemo.forEach(l => {
    const p = db.products.find(x => x.code === l.code);
    if (!p) return;
    const existe = lotesDB.find(x => x.lote === l.lote);
    if (!existe) lotesDB.push({ id: genId(), productId: p.id, productName: p.name, code: p.code, lote: l.lote, qty: Math.floor(Math.random()*50)+10, vencimiento: l.venc, registrado: new Date().toISOString() });
  });
  saveLotes();

  // ── Recepciones OC ──
  const recDemo = [
    { code: '101-103-002', lote: 'L-2024-004', pedido: 50, recibido: 50, venc: enDias(90) },
    { code: '101-106-003', lote: 'L-2024-006', pedido: 100, recibido: 98, venc: enDias(120) },
    { code: '102-105-038', lote: 'L-2024-001', pedido: 30, recibido: 30, venc: enDias(12) },
  ];
  recDemo.forEach(r => {
    const p = db.products.find(x => x.code === r.code);
    if (!p) return;
    recepcionDB.push({ id: genId(), productId: p.id, productCode: r.code, productName: p.name, lote: r.lote, pedido: r.pedido, recibido: r.recibido, diferencia: r.recibido - r.pedido, vencimiento: r.venc, fecha: hace(Math.floor(Math.random()*5)) });
  });
  saveRecepcion();

  // ── Pacientes demo ──
  if (pacientesDB.length === 0) {
    const nombres = ['García R.','Martínez L.','López C.','Rodríguez M.','Pérez A.','González J.','Sánchez K.','Ramírez P.','Torres N.','Flores E.','Díaz S.','Morales T.','Castro B.','Reyes F.','Vargas I.'];
    const grupos = ['A','A','A','A','A','A','A','A','B','B','B','B','B','B','B'];
    const grpTurnos = { A: ['Mañana','Tarde','Tarde Noche'], B: ['Mañana','Tarde','Tarde Noche'] };
    nombres.forEach((n, i) => {
      const g = grupos[i];
      const tArr = grpTurnos[g];
      pacientesDB.push({ id: genId(), nombre: n, grupo: g, turno: tArr[i % 3], acceso: i % 3 === 0 ? 'CVC' : 'FAV', activo: true, fechaIngreso: hace(Math.floor(Math.random()*200)+30) });
    });
    savePacientes();
  }

  // ── Diario demo (hoy) ──
  if (diarioDB.length === 0) {
    const diariosDemo = [
      { code: '101-103-002', qty: 26 },
      { code: '101-101-001', qty: 26 },
      { code: '101-101-002', qty: 26 },
      { code: '101-106-003', qty: 9 },
      { code: '102-105-038', qty: 39 },
    ];
    diariosDemo.forEach(d => {
      const p = db.products.find(x => x.code === d.code);
      if (!p) return;
      diarioDB.push({ id: genId(), productId: p.id, productCode: p.code, productName: p.name, qty: d.qty, unit: p.unit, emoji: p.emoji, hora: new Date().toLocaleTimeString('es-CL', {hour:'2-digit',minute:'2-digit'}) });
    });
    saveDiario();
  }

  // Marcar como demo activo
  localStorage.setItem('ds_demo_active', '1');
  document.getElementById('demo-banner').style.borderColor = '#F5C518';
  document.getElementById('demo-banner').style.border = '1.5px solid #F5C518';

  // Refrescar dashboard
  updateDashboard();
  renderCharts && renderCharts();
  showAlert('✅ Datos demo cargados · 7 días de movimientos, vencimientos y pacientes', 'success');
}

function limpiarDemo() {
  if (!confirm('¿Eliminar TODOS los datos demo?\nSe borrarán movimientos, vencimientos, recepciones, pacientes y diario.\n\nLos productos del inventario se mantendrán.')) return;

  // Limpiar movimientos demo
  db.movements = db.movements.filter(m => m.note !== 'Demo');
  // Restaurar stocks a valores originales (reinit)
  db.products = [];
  save();
  init();

  // Limpiar otras DBs
  lotesDB.length = 0; saveLotes();
  recepcionDB.length = 0; saveRecepcion();
  pacientesDB.length = 0; savePacientes();
  diarioDB.length = 0; saveDiario();
  localStorage.removeItem('ds_demo_active');

  document.getElementById('demo-banner').style.border = '';
  updateDashboard();
  renderCharts && renderCharts();
  showAlert('🗑 Datos demo eliminados · Sistema limpio', 'info');
}
// ==================== /DEMO DATA ====================

function exportarQRCatalogo() {
  if (!db.products.length) { showAlert('Sin productos en el catálogo', 'error'); return; }
  showAlert('Generando hoja de QR...', 'info');

  // Agrupar por categoría
  const cats = {};
  db.products.forEach(p => {
    if (!cats[p.category]) cats[p.category] = [];
    cats[p.category].push(p);
  });
  Object.values(cats).forEach(arr => arr.sort((a,b) => a.name.localeCompare(b.name)));

  const catOrder = ['Diálisis', 'Insumos Médicos', 'Farmacia', 'Higiene', 'Materiales'];
  const catIcons = { 'Diálisis': '🩺', 'Insumos Médicos': '🧴', 'Farmacia': '💊', 'Higiene': '🧼', 'Materiales': '📦' };

  const fecha = new Date().toLocaleDateString('es-CL', { day:'2-digit', month:'2-digit', year:'numeric' });

  let sectionsHtml = '';
  const ordenadas = [...catOrder, ...Object.keys(cats).filter(c => !catOrder.includes(c))];
  ordenadas.forEach(cat => {
    if (!cats[cat]) return;
    const items = cats[cat];
    const cards = items.map(p => {
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(p.code)}&color=1a2a3a&bgcolor=ffffff&margin=5&ecc=M`;
      const stockColor = p.stock === 0 ? '#C8102E' : p.stock <= p.minStock ? '#f57c00' : '#0099cc';
      return `<div style="background:white;border-radius:12px;padding:12px;text-align:center;box-shadow:0 2px 8px rgba(0,87,168,0.07);border:1.5px solid #dce8f5">
        <img src="${qrUrl}" style="width:110px;height:110px;margin:0 auto 8px;display:block;border-radius:6px" loading="lazy">
        <div style="font-size:9px;font-weight:700;color:#0057A8;background:#e8f2ff;border-radius:6px;padding:2px 7px;display:inline-block;margin-bottom:5px">${p.code}</div>
        <div style="font-size:10px;font-weight:700;color:#1a2a3a;line-height:1.25;margin-bottom:5px;min-height:25px">${p.emoji} ${p.name}</div>
        <div style="font-size:9px;font-weight:700;color:${stockColor}">Stock: ${p.stock} ${p.unit}</div>
      </div>`;
    }).join('');
    sectionsHtml += `<div style="margin-bottom:24px">
      <div style="font-size:13px;font-weight:800;color:#0057A8;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #dce8f5">${catIcons[cat]||'📦'} ${cat} (${items.length})</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px">${cards}</div>
    </div>`;
  });

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>QR Catálogo DialiStock · ${fecha}</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Inter,Arial,sans-serif;background:#f0f4f8;padding:20px}
  .no-print{}.header{background:linear-gradient(135deg,#0057A8,#0099cc);color:white;border-radius:16px;padding:20px 24px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center}
  @media print{body{background:white}.no-print{display:none!important}}</style></head><body>
  <div class="header"><div><h1 style="font-size:20px;font-weight:800">🩺 QR Catálogo Completo</h1><p style="font-size:12px;opacity:.8;margin-top:4px">DialiStock · DaVita Chile · Centro Independencia C7848 · ${fecha}</p></div>
  <span style="background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);border-radius:20px;padding:6px 14px;font-size:11px;font-weight:600">${db.products.length} productos</span></div>
  <div class="no-print" style="display:flex;gap:10px;margin-bottom:20px">
    <button onclick="window.print()" style="padding:10px 18px;border-radius:10px;border:none;font-size:13px;font-weight:700;cursor:pointer;background:#0057A8;color:white">🖨️ Imprimir</button>
    <input type="text" placeholder="🔍 Buscar..." oninput="filtrar(this.value)" style="padding:10px 14px;border-radius:10px;border:1.5px solid #b8d4f0;font-size:13px;flex:1;max-width:300px">
  </div>
  ${sectionsHtml}
  </body></html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `QR_DialiStock_${new Date().toISOString().slice(0,10)}.html`;
  a.click();
  showAlert(`✅ Hoja QR generada · ${db.products.length} productos`, 'success');
}

function importarDesdeDynamicsFisico(input) {
  const statusEl = document.getElementById('dynamics-import-status-fisico');
  statusEl.textContent = 'Leyendo archivo...';
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
      const stockPorCodigo = {};
      rows.forEach((row, i) => {
        if (i === 0) return;
        const code = row[0] ? String(row[0]).trim() : null;
        const qty = parseFloat(row[4]) || 0;
        if (!code || qty === 0) return;
        stockPorCodigo[code] = (stockPorCodigo[code] || 0) + qty;
      });
      if (Object.keys(stockPorCodigo).length === 0) {
        statusEl.textContent = '⚠️ No se encontraron datos válidos';
        showAlert('No se encontraron datos — verifica el formato del Excel', 'error');
        return;
      }
      let actualizados = 0, noEncontrados = 0;
      Object.entries(stockPorCodigo).forEach(([code, qty]) => {
        const p = db.products.find(x => x.code === code);
        if (p) { p.stock = Math.round(qty); actualizados++; }
        else noEncontrados++;
      });
      // Si hay conteo en curso, actualizar también el stock del sistema en invFisData
      if (invFisActivo && invFisData.length) {
        invFisData.forEach(p => {
          if (stockPorCodigo[p.code] !== undefined) p.stock = Math.round(stockPorCodigo[p.code]);
        });
        saveInvFisProgreso();
        renderInvFisLista();
      }
      save();
      const fecha = new Date().toLocaleString('es-CL', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
      statusEl.textContent = `✅ ${actualizados} productos actualizados · ${fecha}`;
      showAlert(`✅ Stock de Dynamics cargado · ${actualizados} productos actualizados`, 'success');
      input.value = '';
    } catch (err) {
      statusEl.textContent = '❌ Error al leer el archivo';
      showAlert('Error al leer el Excel — verifica el formato', 'error');
    }
  };
  reader.readAsArrayBuffer(input.files[0]);
}

function importarDesdeDynamics(input) {
  const file = input.files[0];
  if (!file) return;
  const statusEl = document.getElementById('dynamics-import-status');
  statusEl.textContent = 'Leyendo archivo...';

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

      // Agrupar por código sumando cantidades (hay múltiples lotes por producto)
      const stockPorCodigo = {};
      let filasDatos = 0;
      rows.forEach((row, i) => {
        if (i === 0) return; // saltar encabezado
        const code = row[0] ? String(row[0]).trim() : null;
        const qty = parseFloat(row[4]) || 0;
        if (!code || qty === 0) return;
        stockPorCodigo[code] = (stockPorCodigo[code] || 0) + qty;
        filasDatos++;
      });

      if (Object.keys(stockPorCodigo).length === 0) {
        statusEl.textContent = '⚠️ No se encontraron datos válidos';
        showAlert('No se encontraron datos en el Excel — verifica el formato', 'error');
        return;
      }

      // Actualizar stock en DialiStock
      let actualizados = 0, noEncontrados = 0;
      Object.entries(stockPorCodigo).forEach(([code, qty]) => {
        const p = db.products.find(x => x.code === code);
        if (p) { p.stock = Math.round(qty); actualizados++; }
        else noEncontrados++;
      });

      save();
      renderInventario();
      updateDashboard();

      const fecha = new Date().toLocaleString('es-CL', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
      statusEl.textContent = `✅ ${actualizados} actualizados · ${noEncontrados} sin match · ${fecha}`;
      showAlert(`✅ Stock actualizado desde Dynamics · ${actualizados} productos · ${noEncontrados} sin coincidencia`, 'success');

      // Limpiar input para permitir subir el mismo archivo de nuevo
      input.value = '';
    } catch (err) {
      console.error('Error importando Excel:', err);
      statusEl.textContent = '❌ Error al leer el archivo';
      showAlert('Error al leer el Excel — asegúrate que sea el formato correcto de Business Central', 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function abrirFacturaLink(inputId) {
  const url = document.getElementById(inputId).value.trim();
  if (!url) { showAlert('Primero ingresa el link de la factura', 'error'); return; }
  window.open(url, '_blank');
}

// ==================== GOOGLE DRIVE INTEGRATION ====================
const GDRIVE_CLIENT_ID = '996393837921-rhjjg60trrvsdmajt678udbcb278rfju.apps.googleusercontent.com';
const GDRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GDRIVE_FOLDER_NAME = 'DialiStock Facturas';
let gdriveToken = null;
let gdriveFolderId = null;
let gdriveReady = false;

function initGoogleDrive() {
  if (typeof google === 'undefined' || typeof gapi === 'undefined') {
    setTimeout(initGoogleDrive, 500);
    return;
  }
  gapi.load('client', async () => {
    await gapi.client.init({});
    await gapi.client.load('https://www.googleapis.com/discovery/v1/apis/drive/v3/rest');
    gdriveReady = true;
    // Intentar recuperar token guardado
    const savedToken = localStorage.getItem('ds_gdrive_token');
    const savedExpiry = parseInt(localStorage.getItem('ds_gdrive_token_expiry') || '0');
    if (savedToken && Date.now() < savedExpiry) {
      gdriveToken = savedToken;
      gapi.client.setToken({ access_token: gdriveToken });
      updateDriveButton(true);
    }
  });
}

function loginGoogleDrive() {
  const client = google.accounts.oauth2.initTokenClient({
    client_id: GDRIVE_CLIENT_ID,
    scope: GDRIVE_SCOPE,
    callback: async (response) => {
      if (response.error) { showAlert('Error al conectar con Google Drive', 'error'); return; }
      gdriveToken = response.access_token;
      gapi.client.setToken({ access_token: gdriveToken });
      // Guardar token con expiración de 1 hora
      localStorage.setItem('ds_gdrive_token', gdriveToken);
      localStorage.setItem('ds_gdrive_token_expiry', String(Date.now() + 3500000));
      updateDriveButton(true);
      showAlert('✅ Conectado a Google Drive', 'success');
      // Crear carpeta si no existe
      await ensureGDriveFolder();
    }
  });
  client.requestAccessToken();
}

function updateDriveButton(connected) {
  const btn = document.getElementById('gdrive-login-btn');
  if (!btn) return;
  if (connected) {
    btn.textContent = '✅ Drive conectado';
    btn.style.background = 'rgba(0,153,204,0.15)';
    btn.style.color = 'var(--accent)';
    btn.style.border = '1px solid var(--accent)';
    btn.onclick = null;
  } else {
    btn.textContent = '🔗 Conectar Google Drive';
    btn.style.background = 'var(--accent2)';
    btn.style.color = '#fff';
    btn.style.border = 'none';
    btn.onclick = loginGoogleDrive;
  }
}

async function ensureGDriveFolder() {
  try {
    const res = await gapi.client.drive.files.list({
      q: `name='${GDRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id,name)'
    });
    if (res.result.files.length > 0) {
      gdriveFolderId = res.result.files[0].id;
    } else {
      const folder = await gapi.client.drive.files.create({
        resource: { name: GDRIVE_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' },
        fields: 'id'
      });
      gdriveFolderId = folder.result.id;
    }
  } catch (e) { console.warn('Error creando carpeta Drive:', e); }
}

async function subirFacturaDrive(file, nombreArchivo) {
  if (!gdriveToken) { showAlert('Primero conecta Google Drive', 'error'); return null; }
  if (!gdriveFolderId) await ensureGDriveFolder();
  try {
    const metadata = { name: nombreArchivo, parents: gdriveFolderId ? [gdriveFolderId] : [] };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + gdriveToken },
      body: form
    });
    if (!res.ok) throw new Error('Upload failed: ' + res.status);
    const data = await res.json();
    // Hacer el archivo público para ver desde cualquier dispositivo
    await fetch(`https://www.googleapis.com/drive/v3/files/${data.id}/permissions`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + gdriveToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' })
    });
    return `https://drive.google.com/file/d/${data.id}/view`;
  } catch (e) {
    console.error('Error subiendo a Drive:', e);
    showAlert('Error al subir foto a Drive — verifica la conexión', 'error');
    return null;
  }
}

async function tomarFotoFactura() {
  if (!gdriveToken) {
    const conectar = confirm('Para guardar fotos necesitas conectar Google Drive primero.\n¿Conectar ahora?');
    if (conectar) { loginGoogleDrive(); return; }
    return;
  }
  // Abrir cámara o selector de archivo
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.capture = 'environment'; // cámara trasera en celular
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const statusEl = document.getElementById('rec-factura-foto-status');
    if (statusEl) statusEl.textContent = '⬆️ Subiendo foto a Drive...';
    const fecha = new Date().toISOString().slice(0,10);
    const orden = document.getElementById('rec-orden')?.value || 'sin-oc';
    const nombreArchivo = `Factura_${orden}_${fecha}.${file.name.split('.').pop()}`;
    const link = await subirFacturaDrive(file, nombreArchivo);
    if (link) {
      const linkInput = document.getElementById('rec-factura-link');
      if (linkInput) linkInput.value = link;
      if (statusEl) statusEl.textContent = '✅ Foto guardada en Drive';
      showAlert('✅ Foto de factura guardada en Google Drive', 'success');
    } else {
      if (statusEl) statusEl.textContent = '❌ Error al subir';
    }
  };
  input.click();
}

setTimeout(initGoogleDrive, 1000);
// ==================== /GOOGLE DRIVE INTEGRATION ====================

function toggleDarkMode() {
  var body = document.body;
  var btn = document.getElementById('dark-mode-btn');
  var isDark = body.classList.toggle('dark-mode');
  btn.textContent = isDark ? '☀️' : '🌙';
  localStorage.setItem('ds_darkmode', isDark ? '1' : '0');
}

function initDarkMode() {
  var saved = localStorage.getItem('ds_darkmode');
  var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (saved === '1' || (saved === null && prefersDark)) {
    document.body.classList.add('dark-mode');
  }
  // Update button after DOM is ready
  document.addEventListener('DOMContentLoaded', function() {
    var btn = document.getElementById('dark-mode-btn');
    if (btn && document.body.classList.contains('dark-mode')) {
      btn.textContent = '☀️';
    }
  });
}

// START
initDarkMode();
init();
setTimeout(renderHistorialSummary, 300);
setTimeout(renderCharts, 500);
fbAuthPromise.then(() => {
  cargarDesdeFirestore();
  cargarHistorialDesdeFirestore();
});

// Splash screen - cierre garantizado
(function() {
  function hide() {
    var s = document.getElementById('splash-screen');
    if (s) { s.style.opacity = '0'; s.style.transition = 'opacity 0.4s'; setTimeout(function(){ s.style.display = 'none'; }, 450); }
  }
  // Animar barra
  var bar = document.getElementById('splash-bar');
  if (bar) {
    var w = 0;
    var iv = setInterval(function() { w += 3; if(w>=100){w=100;clearInterval(iv);} bar.style.width = w+'%'; }, 75);
  }
  setTimeout(hide, 2800);
  setTimeout(hide, 5000); // failsafe
})();
if (paConfig) setTimeout(paUpdateStatus, 200);

// ==================== PWA ====================
let deferredPrompt = null;

// Desregistrar TODOS los service workers para forzar versión fresca
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(r => r.unregister());
    console.log('SW limpiado');
  });
  // Limpiar todos los cachés
  if ('caches' in window) {
    caches.keys().then(keys => {
      keys.forEach(k => caches.delete(k));
    });
  }
}

// Capture install prompt
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  showInstallBanner();
});

function showInstallBanner() {
  const banner = document.createElement('div');
  banner.id = 'install-banner';
  banner.style.cssText = `
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    background: var(--accent); color: #ffffff; padding: 14px 20px;
    border-radius: 50px; font-weight: 700; font-size: 14px;
    display: flex; align-items: center; gap: 10px; z-index: 9999;
    box-shadow: 0 8px 24px rgba(0,212,170,0.4); cursor: pointer;
    white-space: nowrap; animation: alertIn 0.3s ease;
  `;
  banner.innerHTML = `
    <span>📲</span>
    <span>Instalar DialiStock como App</span>
    <span onclick="document.getElementById('install-banner').remove()" 
          style="margin-left:8px;opacity:0.7;font-size:18px;line-height:1">✕</span>
  `;
  banner.addEventListener('click', async (e) => {
    if (e.target.tagName === 'SPAN' && e.target.textContent === '✕') return;
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') showAlert('✅ DialiStock instalado como app', 'success');
      deferredPrompt = null;
      banner.remove();
    }
  });
  document.body.appendChild(banner);
  setTimeout(() => { if (banner.parentNode) banner.remove(); }, 15000);
}

// iOS install instructions
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isInStandalone = window.navigator.standalone;
if (isIOS && !isInStandalone) {
  setTimeout(() => {
    const iosBanner = document.createElement('div');
    iosBanner.style.cssText = `
      position: fixed; bottom: 0; left: 0; right: 0;
      background: var(--surface); border-top: 1px solid var(--border);
      padding: 16px 20px; z-index: 9999; text-align: center;
    `;
    iosBanner.innerHTML = `
      <div style="font-weight:700;margin-bottom:6px;font-size:14px">📲 Instalar DialiStock en iPhone</div>
      <div style="font-size:12px;color:var(--muted);line-height:1.6">
        Toca <strong style="color:var(--text)">Compartir</strong> (el ícono de la cajita con flecha) 
        → <strong style="color:var(--text)">"Agregar a pantalla de inicio"</strong>
      </div>
      <button onclick="this.parentNode.remove()" style="margin-top:10px;background:var(--border);border:none;color:var(--text);padding:8px 20px;border-radius:8px;cursor:pointer;font-size:13px">Entendido</button>
    `;
    document.body.appendChild(iosBanner);
  }, 3000);
}
