// ==================== INVENTARIO FISICO ====================
let invFisData = [];
let invFisActivo = false;

function saveInvFisProgreso() {
  const payload = {
    data: invFisData,
    activo: invFisActivo,
    guardadoEn: new Date().toISOString()
  };
  localStorage.setItem(lsKeyFor('ds_invfis_progreso'), JSON.stringify(payload));
  // También sincronizar a Firestore para recuperarlo desde otro dispositivo
  if (fbReady) {
    clearTimeout(window._invFisSyncTimeout);
    const pathAlGuardar = fbPathFor('invfis_progreso');
    window._invFisSyncTimeout = setTimeout(() => {
      fbDb.doc(pathAlGuardar).set(payload).catch(err => console.warn('No se pudo sincronizar progreso de conteo:', err));
    }, 1000);
  }
}

function cargarInvFisProgreso() {
  try {
    const raw = localStorage.getItem(lsKeyFor('ds_invfis_progreso'));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}

function limpiarInvFisProgreso() {
  localStorage.removeItem(lsKeyFor('ds_invfis_progreso'));
}

const CONTEO_PRECARGADO_25_06 = {"102-101-002": 24, "102-101-003": 114, "102-101-001": 108, "102-105-011": 90, "102-105-012": 90, "101-108-005": 884, "101-108-002": 850, "101-108-003": 1150, "101-108-004": 50, "101-106-003": 352, "101-106-005": 53, "101-108-006": 870, "102-106-001": 12, "105-102-002": 16, "101-108-013": 80, "101-108-014": 52, "101-108-012": 80, "101-106-008": 187, "102-105-060": 255, "101-103-002": 28, "101-103-003": 9, "101-103-004": 155, "101-103-013": 48, "102-105-064": 31, "102-105-065": 45, "102-105-027": 850, "102-105-028": 220, "102-105-029": 8, "102-105-032": 3900, "102-105-034": 6700, "102-103-008": 156, "102-103-002": 2600, "102-103-003": 2300, "102-103-011": 5400, "102-103-012": 6900, "102-103-005": 4000, "102-103-004": 3800, "103-101-001": 370, "102-105-037": 1600, "102-105-038": 3350, "102-105-039": 2000, "102-105-040": 2000, "109-101-001": 120, "102-105-042": 2250, "102-110-004": 26000, "102-105-046": 100, "102-105-047": 2500, "102-105-048": 140, "102-106-002": 12, "102-105-052": 12, "101-106-009": 610, "101-106-012": 127, "101-106-011": 450, "102-105-055": 2650, "102-105-057": 408, "101-101-003": 17400, "102-101-004": 114, "101-101-004": 120, "101-101-005": 57, "101-103-009": 21, "101-103-010": 0, "101-103-016": 72, "101-108-036": 108, "101-108-037": 28, "102-101-007": 36, "102-103-006": 2000, "102-103-013": 6600, "102-105-018": 300, "102-105-024": 80, "102-105-026": 300, "102-105-044": 1100, "102-105-067": 200, "102-106-003": 10, "102-106-005": 10};

function iniciarInventario() {
  if (!db.products.length) { showAlert('Sin productos registrados', 'error'); return; }

  const progresoGuardado = cargarInvFisProgreso();
  if (progresoGuardado && progresoGuardado.activo && progresoGuardado.data.length) {
    const fechaG = new Date(progresoGuardado.guardadoEn).toLocaleString('es-CL', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    const contados = progresoGuardado.data.filter(p => p.contado).length;
    const continuar = confirm(`Hay un conteo en progreso guardado del ${fechaG} (${contados}/${progresoGuardado.data.length} contados).\n\n¿Continuar ese conteo? (Cancelar para empezar uno nuevo desde cero)`);
    if (continuar) {
      invFisData = progresoGuardado.data;
      invFisActivo = true;
      renderInvFisLista();
      document.getElementById('invfis-progress').style.display = 'block';
      document.getElementById('invfis-resumen-card').style.display = 'none';
      document.getElementById('invfis-scan-btn').style.display = 'inline-block';
      document.getElementById('invfis-save-btn').style.display = 'inline-block';
      showAlert('📂 Conteo recuperado · ' + contados + '/' + invFisData.length + ' contados', 'success');
      return;
    }
  }

  const precargar = currentCentro === 'independencia'
    ? confirm('¿Precargar el conteo físico realizado hoy (25-06)?\n\nSe completarán automáticamente los productos ya contados. Podrás revisar y ajustar cualquier valor antes de generar el informe.')
    : false;
  invFisData = db.products.map(p => {
    if (precargar && CONTEO_PRECARGADO_25_06[p.code] !== undefined) {
      return { ...p, stockReal: CONTEO_PRECARGADO_25_06[p.code], contado: true };
    }
    return { ...p, stockReal: null, contado: false };
  });
  invFisActivo = true;
  saveInvFisProgreso();
  renderInvFisLista();
  document.getElementById('invfis-progress').style.display = 'block';
  document.getElementById('invfis-resumen-card').style.display = 'none';
  document.getElementById('invfis-scan-btn').style.display = 'inline-block';
  document.getElementById('invfis-save-btn').style.display = 'inline-block';
  const precargados = invFisData.filter(p => p.contado).length;
  showAlert(precargados ? `Conteo iniciado · ${precargados} precargados de ${invFisData.length}` : 'Conteo iniciado · ' + invFisData.length + ' productos', 'success');
}

function guardarProgresoManual() {
  if (bloqueaPorSoloLectura()) return;
  if (!invFisActivo || !invFisData.length) { showAlert('No hay conteo activo para guardar', 'error'); return; }
  saveInvFisProgreso();
  const contados = invFisData.filter(p => p.contado).length;
  showAlert('💾 Progreso guardado · ' + contados + '/' + invFisData.length + ' contados', 'success');
}

// ==================== ESCÁNER CONTEO FÍSICO ====================
let invFisScannerActive = false;
let invFisQrCode = null;

async function toggleInvFisScanner() {
  if (invFisScannerActive) { stopInvFisScanner(); }
  else { startInvFisScanner(); }
}

async function startInvFisScanner() {
  if (!invFisActivo) { showAlert('Primero presiona "Iniciar conteo"', 'error'); return; }
  document.getElementById('invfis-scanner-overlay').style.display = 'block';
  document.getElementById('invfis-scan-btn').textContent = '⏹ Detener';
  try {
    invFisQrCode = new Html5Qrcode("invfis-qr-reader");
    await invFisQrCode.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 200, height: 200 }, aspectRatio: 1.0 },
      onInvFisScanSuccess,
      () => {}
    );
    invFisScannerActive = true;
  } catch (err) {
    showAlert('❌ Sin acceso a la cámara', 'error');
    document.getElementById('invfis-scanner-overlay').style.display = 'none';
    document.getElementById('invfis-scan-btn').textContent = '📷 Escanear';
  }
}

function stopInvFisScanner() {
  if (invFisQrCode && invFisScannerActive) {
    invFisQrCode.stop().catch(() => {});
    invFisScannerActive = false;
  }
  document.getElementById('invfis-scanner-overlay').style.display = 'none';
  document.getElementById('invfis-scan-btn').textContent = '📷 Escanear';
}

function onInvFisScanSuccess(decodedText) {
  stopInvFisScanner();
  const code = decodedText.trim().toUpperCase();
  const idx = invFisData.findIndex(p => p.code.toUpperCase() === code);
  if (idx === -1) {
    showAlert('Código no encontrado en el conteo: ' + code, 'error');
    return;
  }
  abrirConteoRapido(idx);
}

function abrirConteoRapido(idx) {
  const p = invFisData[idx];
  const modal = document.createElement('div');
  modal.id = 'conteo-rapido-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:3000;display:flex;align-items:center;justify-content:center;padding:20px';
  modal.innerHTML = `
    <div style="background:var(--surface);border-radius:18px;padding:22px;max-width:340px;width:100%;text-align:center">
      <div style="font-size:36px;margin-bottom:6px">${p.emoji}</div>
      <div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:2px">${p.name}</div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:14px">${p.code}</div>
      <div style="display:flex;gap:10px;margin-bottom:14px">
        <div style="flex:1;background:rgba(0,102,204,0.06);border:1.5px solid var(--accent2);border-radius:12px;padding:10px">
          <div style="font-size:9px;font-weight:800;color:var(--accent2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Sistema</div>
          <div style="font-family:'Inter',sans-serif;font-size:22px;font-weight:800;color:var(--accent2)">${p.stock}</div>
          <div style="font-size:9px;color:var(--muted)">${p.unit}</div>
        </div>
        <div style="flex:1;background:rgba(200,16,46,0.05);border:1.5px solid var(--danger);border-radius:12px;padding:10px">
          <div style="font-size:9px;font-weight:800;color:var(--danger);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Conteo físico</div>
          <input id="conteo-rapido-input" type="number" min="0" autofocus placeholder="0"
            style="width:100%;border:none;background:transparent;font-size:22px;font-weight:800;text-align:center;font-family:'Inter',sans-serif;color:var(--danger);padding:0">
        </div>
      </div>
      <div style="display:flex;gap:10px">
        <button onclick="document.getElementById('conteo-rapido-modal').remove()" style="flex:1;padding:12px;border-radius:12px;border:1.5px solid var(--border);background:var(--surface);color:var(--text);font-weight:700;font-size:13px;cursor:pointer;font-family:'Inter',sans-serif">Cancelar</button>
        <button onclick="confirmarConteoRapido(${idx})" style="flex:1;padding:12px;border-radius:12px;border:none;background:var(--accent);color:#fff;font-weight:700;font-size:13px;cursor:pointer;font-family:'Inter',sans-serif">✓ Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  setTimeout(() => document.getElementById('conteo-rapido-input').focus(), 100);
  document.getElementById('conteo-rapido-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmarConteoRapido(idx);
  });
}

function confirmarConteoRapido(idx) {
  if (bloqueaPorSoloLectura()) return;
  const val = document.getElementById('conteo-rapido-input').value;
  if (val === '') { showAlert('Ingresa una cantidad', 'error'); return; }
  contarProducto(idx, val);
  document.getElementById('conteo-rapido-modal').remove();
  showAlert('✅ ' + invFisData[idx].name.substring(0,30) + '... registrado', 'success');
  // Reabrir escáner automáticamente para seguir contando rápido
  setTimeout(() => startInvFisScanner(), 400);
}
// ==================== /ESCÁNER CONTEO FÍSICO ====================

function renderInvFisLista() {
  const lista = document.getElementById('invfis-lista');
  const contados = invFisData.filter(p => p.contado).length;
  const prog = document.getElementById('invfis-progtext');
  if (prog) prog.textContent = contados + ' / ' + invFisData.length + ' productos contados';
  if (!invFisActivo || !invFisData.length) { lista.innerHTML = '<div class="empty-state"><p>Presiona "Iniciar conteo" para comenzar</p></div>'; return; }

  const header = `<div style="display:flex;align-items:center;gap:8px;padding:8px 11px;margin-bottom:6px;position:sticky;top:0;background:var(--bg);z-index:5">
    <div style="width:24px"></div>
    <div style="flex:1;min-width:0;font-size:9px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Producto</div>
    <div style="width:64px;text-align:center;font-size:9px;font-weight:800;color:var(--accent2);text-transform:uppercase;letter-spacing:.5px">Sistema</div>
    <div style="width:64px;text-align:center;font-size:9px;font-weight:800;color:var(--danger);text-transform:uppercase;letter-spacing:.5px">Conteo</div>
    <div style="width:42px;text-align:center;font-size:9px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Dif.</div>
    <div style="width:70px;text-align:right;font-size:9px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Dif. $</div>
  </div>`;

  lista.innerHTML = header + invFisData.map((p, i) => {
    const diff = p.contado ? p.stockReal - p.stock : null;
    const valor = p.contado ? diff * (p.price || 0) : null;
    const bg = !p.contado ? 'var(--surface)' : diff === 0 ? 'rgba(0,153,204,0.04)' : diff > 0 ? 'rgba(245,124,0,0.04)' : 'rgba(229,57,53,0.04)';
    const border = !p.contado ? 'var(--border)' : diff === 0 ? 'rgba(0,153,204,0.2)' : diff > 0 ? 'rgba(245,124,0,0.2)' : 'rgba(229,57,53,0.2)';
    const fmtVal = (v) => (v<0?'-':'+') + '$' + Math.abs(Math.round(v)).toLocaleString('es-CL');
    return `<div style="padding:9px 11px;background:${bg};border:1.5px solid ${border};border-radius:12px;margin-bottom:7px">
      <div style="display:flex;align-items:center;gap:8px">
        <div style="font-size:22px;width:24px;text-align:center;flex-shrink:0">${p.emoji}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;font-weight:700;color:var(--text);line-height:1.25">${p.name}</div>
          <div style="font-size:9px;color:var(--muted)">${p.code}</div>
        </div>
        <div style="width:64px;flex-shrink:0">
          <input type="number" min="0" value="${p.stock}" title="Editar stock del sistema"
            style="width:100%;padding:6px 3px;border:1.5px dashed var(--accent2);border-radius:8px;font-size:13px;font-weight:800;font-family:'Inter',sans-serif;text-align:center;background:rgba(0,87,168,0.04);color:var(--accent2)"
            onchange="ajustarStockSistema(${i}, this.value)">
        </div>
        <div style="width:64px;flex-shrink:0">
          <input type="number" min="0" placeholder="—" value="${p.contado ? p.stockReal : ''}"
            style="width:100%;padding:6px 3px;border:1.5px solid ${p.contado ? 'var(--danger)' : 'var(--border)'};border-radius:8px;font-size:13px;font-weight:700;font-family:'Inter',sans-serif;text-align:center;background:var(--surface);color:var(--text)"
            onchange="contarProducto(${i}, this.value)">
        </div>
        <div style="width:42px;text-align:center;flex-shrink:0">
          ${p.contado ? `<span style="font-family:'Inter',sans-serif;font-size:12px;font-weight:800;color:${diff===0?'var(--accent)':diff>0?'#f57c00':'var(--danger)'}">${diff>0?'+':''}${diff}</span>` : '<span style="color:var(--border);font-size:11px">·</span>'}
        </div>
        <div style="width:70px;text-align:right;flex-shrink:0">
          ${p.contado && diff !== 0 ? `<span style="font-family:'Inter',sans-serif;font-size:11px;font-weight:800;color:${valor<0?'var(--danger)':'var(--accent)'}">${fmtVal(valor)}</span>` : '<span style="color:var(--border);font-size:11px">·</span>'}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;margin-top:6px;padding-left:32px">
        <span style="font-size:9px;color:var(--muted)">$ unit.</span>
        <input type="number" min="0" step="0.01" value="${p.price || 0}" title="Editar precio unitario"
          style="width:90px;padding:4px 6px;border:1px solid var(--border);border-radius:6px;font-size:10px;font-family:'Inter',sans-serif;background:var(--bg);color:var(--muted)"
          onchange="ajustarPrecioProducto(${i}, this.value)">
      </div>
    </div>`;
  }).join('') + (invFisData.every(p => p.contado) ? `<button class="btn btn-primary" style="margin-top:8px" onclick="finalizarInventario()">📝 Generar informe</button>` : '');
}

function contarProducto(idx, val) {
  invFisData[idx].stockReal = parseInt(val) || 0;
  invFisData[idx].contado = true;
  saveInvFisProgreso();
  renderInvFisLista();
}

function ajustarStockSistema(idx, val) {
  if (bloqueaPorSoloLectura()) return;
  const nuevoStock = parseInt(val) || 0;
  const p = invFisData[idx];
  p.stock = nuevoStock;
  // Reflejar también en el catálogo real para que quede consistente
  const real = db.products.find(x => x.code === p.code);
  if (real) { real.stock = nuevoStock; save(); }
  saveInvFisProgreso();
  renderInvFisLista();
  showAlert('Stock del sistema actualizado: ' + p.name.substring(0,30) + '...', 'info');
}

function ajustarPrecioProducto(idx, val) {
  if (bloqueaPorSoloLectura()) return;
  const nuevoPrecio = parseFloat(val) || 0;
  const p = invFisData[idx];
  p.price = nuevoPrecio;
  const real = db.products.find(x => x.code === p.code);
  if (real) { real.price = nuevoPrecio; save(); }
  saveInvFisProgreso();
  renderInvFisLista();
}

function getRecomendacion(p, diff, pctDiff) {
  if (diff === 0) return null;
  if (diff < 0) {
    if (p.stock > 0 && Math.abs(diff) >= p.stock * 0.5) return '🔴 Revisar registro de salidas — falta más del 50% del stock esperado. Verificar si hubo consumo no registrado o posible pérdida.';
    if (Math.abs(pctDiff) > 30) return '🟠 Confirmar últimas salidas y devoluciones registradas en el sistema de los últimos días.';
    return '🟡 Diferencia menor — podría ser error de digitación en un movimiento reciente. Revisar historial.';
  } else {
    if (diff >= p.stock) return '🔵 Sobrante igual o mayor al stock esperado — revisar si hubo una recepción de bodega no registrada en el sistema.';
    if (pctDiff > 30) return '🔵 Verificar si hubo entrada/recepción reciente no cargada en DialiStock.';
    return '⚪ Sobrante leve — puede deberse a una salida registrada de más en el sistema. Revisar historial.';
  }
}

// ==================== HISTORIAL DE INVENTARIOS ====================
let invFisHistorial = JSON.parse(localStorage.getItem(lsKeyFor('ds_invfis_historial')) || '[]');

function saveHistorial() {
  localStorage.setItem(lsKeyFor('ds_invfis_historial'), JSON.stringify(invFisHistorial));
  localStorage.setItem(lsKeyFor('ds_invfis_historial_last_save'), String(Date.now()));
  if (fbReady) {
    clearTimeout(window._historialSyncTimeout);
    const pathAlGuardar = fbPathFor('invfis_historial');
    window._historialSyncTimeout = setTimeout(() => {
      fbDb.doc(pathAlGuardar).set({
        historial: invFisHistorial,
        updatedAtLocal: new Date().toISOString()
      }).catch(err => console.warn('No se pudo sincronizar historial:', err));
    }, 1000);
  }
}

async function cargarHistorialDesdeFirestore() {
  if (!fbReady) return;
  try {
    const snap = await fbDb.doc(fbPathFor('invfis_historial')).get();
    if (!snap.exists) return;
    const remoto = snap.data();
    const remotoLocal = remoto.updatedAtLocal ? new Date(remoto.updatedAtLocal).getTime() : 0;
    const localTimestamp = parseInt(localStorage.getItem(lsKeyFor('ds_invfis_historial_last_save')) || '0');
    if (remotoLocal > localTimestamp && Array.isArray(remoto.historial)) {
      invFisHistorial = remoto.historial;
      localStorage.setItem(lsKeyFor('ds_invfis_historial'), JSON.stringify(invFisHistorial));
      localStorage.setItem(lsKeyFor('ds_invfis_historial_last_save'), String(remotoLocal));
      renderHistorialSummary();
    }
  } catch (err) {
    console.warn('Error cargando historial de Firestore:', err);
  }
}

function calcularTotalesConteo(data) {
  const diferencias = data.filter(p => p.contado && p.stockReal !== p.stock);
  let costoFaltante = 0, costoSobrante = 0;
  diferencias.forEach(p => {
    const diff = p.stockReal - p.stock;
    const valor = diff * (p.price || 0);
    if (valor < 0) costoFaltante += Math.abs(valor); else costoSobrante += valor;
  });
  return {
    totalProductos: data.filter(p => p.contado).length,
    totalDiferencias: diferencias.length,
    costoFaltante: Math.round(costoFaltante),
    costoSobrante: Math.round(costoSobrante),
    impactoNeto: Math.round(costoSobrante - costoFaltante)
  };
}

function registrarSnapshotHistorial(origen) {
  if (!invFisData.length) return;
  const totales = calcularTotalesConteo(invFisData);
  const snapshot = {
    id: genId(),
    fecha: new Date().toISOString(),
    fechaLabel: new Date().toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' }),
    origen,
    totales,
    productos: invFisData.filter(p => p.contado).map(p => ({ code: p.code, name: p.name, emoji: p.emoji, stock: p.stock, stockReal: p.stockReal, price: p.price || 0 }))
  };
  invFisHistorial.unshift(snapshot);
  if (invFisHistorial.length > 24) invFisHistorial = invFisHistorial.slice(0, 24); // tope ~2 años mensual
  saveHistorial();
  renderHistorialSummary();
  return snapshot;
}

function guardarConteoHistorial() {
  if (bloqueaPorSoloLectura()) return;
  const snap = registrarSnapshotHistorial('manual');
  if (snap) showAlert('💾 Conteo guardado en historial · ' + snap.fechaLabel, 'success');
}

function renderHistorialSummary() {
  const el = document.getElementById('historial-summary');
  if (!el) return;
  if (!invFisHistorial.length) { el.textContent = 'Sin conteos guardados aún. Al generar un informe, se guardará automáticamente aquí.'; return; }
  const ult = invFisHistorial[0];
  el.innerHTML = `<strong>${invFisHistorial.length}</strong> conteo${invFisHistorial.length>1?'s':''} guardado${invFisHistorial.length>1?'s':''} · último: <strong>${ult.fechaLabel}</strong> (${ult.totales.totalDiferencias} diferencias)`;
}

function toggleHistorialView() {
  const panel = document.getElementById('historial-panel');
  const btn = document.getElementById('historial-toggle-btn');
  const showing = panel.style.display === 'block';
  panel.style.display = showing ? 'none' : 'block';
  btn.textContent = showing ? 'Ver historial' : 'Ocultar';
  if (!showing) renderHistorialPanel();
}

function renderHistorialPanel() {
  const panel = document.getElementById('historial-panel');
  if (!invFisHistorial.length) {
    panel.innerHTML = '<div class="empty-state" data-icon="🗂️"><p>Sin conteos guardados</p><small>Genera un informe de Conteo Físico para empezar el historial</small></div>';
    return;
  }
  panel.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
      <select id="hist-fecha-a" style="flex:1;min-width:120px;font-size:11px;padding:7px;border-radius:8px;border:1.5px solid var(--border);background:var(--surface);color:var(--text)">
        ${invFisHistorial.map((h,i) => `<option value="${i}">${h.fechaLabel}</option>`).join('')}
      </select>
      <span style="font-size:11px;color:var(--muted);font-weight:700">vs</span>
      <select id="hist-fecha-b" style="flex:1;min-width:120px;font-size:11px;padding:7px;border-radius:8px;border:1.5px solid var(--border);background:var(--surface);color:var(--text)">
        ${invFisHistorial.map((h,i) => `<option value="${i}" ${i===1?'selected':''}>${h.fechaLabel}</option>`).join('')}
      </select>
      <button onclick="compararHistorial()" style="background:var(--accent2);color:#fff;border:none;border-radius:8px;padding:7px 12px;font-size:11px;font-weight:700;cursor:pointer">Comparar</button>
    </div>
    <div style="margin-bottom:10px">
      ${invFisHistorial.map((h,i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--surface);border:1px solid var(--border);border-radius:10px;margin-bottom:6px">
          <div>
            <div style="font-size:11px;font-weight:700">${h.fechaLabel} <span style="font-size:9px;color:var(--muted);font-weight:500">(${h.origen})</span></div>
            <div style="font-size:10px;color:var(--muted)">${h.totales.totalProductos} contados · ${h.totales.totalDiferencias} diferencias</div>
          </div>
          <div style="text-align:right">
            <div style="font-family:'Inter',sans-serif;font-size:12px;font-weight:800;color:${h.totales.impactoNeto<0?'var(--danger)':'var(--accent)'}">${h.totales.impactoNeto<0?'-':'+'}$${Math.abs(h.totales.impactoNeto).toLocaleString('es-CL')}</div>
            <span onclick="eliminarHistorial('${h.id}')" style="font-size:10px;color:var(--danger);cursor:pointer;text-decoration:underline">eliminar</span>
          </div>
        </div>`).join('')}
    </div>
    <div id="hist-comparacion"></div>`;
}

function eliminarHistorial(id) {
  if (bloqueaPorSoloLectura()) return;
  if (!confirm('¿Eliminar este registro del historial?')) return;
  invFisHistorial = invFisHistorial.filter(h => h.id !== id);
  saveHistorial();
  renderHistorialSummary();
  renderHistorialPanel();
}

function compararHistorial() {
  const idxA = parseInt(document.getElementById('hist-fecha-a').value);
  const idxB = parseInt(document.getElementById('hist-fecha-b').value);
  const a = invFisHistorial[idxA], b = invFisHistorial[idxB];
  const cont = document.getElementById('hist-comparacion');
  if (idxA === idxB) { cont.innerHTML = '<div style="text-align:center;padding:14px;color:var(--muted);font-size:12px">Selecciona dos fechas distintas</div>'; return; }

  const mapA = {}; a.productos.forEach(p => mapA[p.code] = p);
  const mapB = {}; b.productos.forEach(p => mapB[p.code] = p);
  const allCodes = [...new Set([...Object.keys(mapA), ...Object.keys(mapB)])];

  const fmt = (n) => (n<0?'-':'+') + '$' + Math.abs(Math.round(n)).toLocaleString('es-CL');
  const deltaImpacto = b.totales.impactoNeto - a.totales.impactoNeto;

  let filas = allCodes.map(code => {
    const pa = mapA[code], pb = mapB[code];
    const realA = pa ? pa.stockReal : null;
    const realB = pb ? pb.stockReal : null;
    if (realA === realB) return null; // sin cambio entre ambas fechas
    const nombre = (pb || pa).name;
    const emoji = (pb || pa).emoji;
    return { code, nombre, emoji, realA, realB, delta: (realB ?? 0) - (realA ?? 0) };
  }).filter(Boolean).sort((x,y) => Math.abs(y.delta) - Math.abs(x.delta));

  cont.innerHTML = `
    <div style="background:rgba(0,87,168,0.05);border:1.5px solid rgba(0,87,168,0.2);border-radius:12px;padding:12px;margin-bottom:10px">
      <div style="font-size:11px;font-weight:700;color:var(--accent2);margin-bottom:6px">${a.fechaLabel} → ${b.fechaLabel}</div>
      <div style="display:flex;justify-content:space-between;font-size:12px">
        <span>Variación impacto neto:</span>
        <strong style="color:${deltaImpacto<0?'var(--danger)':'var(--accent)'}">${fmt(deltaImpacto)}</strong>
      </div>
    </div>
    <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:6px">${filas.length} productos con cambio de stock real entre ambas fechas</div>` +
    filas.slice(0, 30).map(f => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border)">
        <div style="font-size:11px;flex:1;min-width:0">${f.emoji} ${f.nombre}</div>
        <div style="font-size:11px;color:var(--muted);white-space:nowrap">${f.realA ?? '—'} → ${f.realB ?? '—'}</div>
        <div style="font-family:'Inter',sans-serif;font-size:12px;font-weight:800;color:${f.delta<0?'var(--danger)':'var(--accent)'};margin-left:8px">${f.delta>0?'+':''}${f.delta}</div>
      </div>`).join('');
}
// ==================== /HISTORIAL DE INVENTARIOS ====================

function finalizarInventario() {
  if (bloqueaPorSoloLectura()) return;
  const diferencias = invFisData.filter(p => p.stockReal !== p.stock);
  const res = document.getElementById('invfis-resumen');
  document.getElementById('invfis-resumen-card').style.display = 'block';
  if (!diferencias.length) {
    res.innerHTML = '<div style="text-align:center;padding:20px;color:var(--accent);font-weight:700">✅ Sin diferencias. Inventario cuadrado.</div>';
    return;
  }

  // Cálculo de valorización
  let costoFaltante = 0, costoSobrante = 0;
  diferencias.forEach(p => {
    const diff = p.stockReal - p.stock;
    const valor = diff * (p.price || 0);
    if (valor < 0) costoFaltante += Math.abs(valor);
    else costoSobrante += valor;
  });
  const impactoNeto = costoSobrante - costoFaltante;
  const fmt = (n) => '$' + Math.round(n).toLocaleString('es-CL');

  // Ordenar por impacto absoluto (mayor a menor)
  const ordenadas = [...diferencias].sort((a, b) => {
    const valA = Math.abs((a.stockReal - a.stock) * (a.price || 0));
    const valB = Math.abs((b.stockReal - b.stock) * (b.price || 0));
    return valB - valA;
  });

  res.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
      <div style="background:rgba(229,57,53,0.06);border:1.5px solid rgba(229,57,53,0.25);border-radius:12px;padding:10px;text-align:center">
        <div style="font-size:9px;font-weight:700;color:var(--danger);text-transform:uppercase;letter-spacing:.5px">Costo faltante</div>
        <div style="font-family:'Inter',sans-serif;font-size:18px;font-weight:800;color:var(--danger)">${fmt(costoFaltante)}</div>
      </div>
      <div style="background:rgba(0,153,204,0.06);border:1.5px solid rgba(0,153,204,0.25);border-radius:12px;padding:10px;text-align:center">
        <div style="font-size:9px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.5px">Costo sobrante</div>
        <div style="font-family:'Inter',sans-serif;font-size:18px;font-weight:800;color:var(--accent)">${fmt(costoSobrante)}</div>
      </div>
    </div>
    <div style="background:${impactoNeto<0?'rgba(229,57,53,0.06)':'rgba(0,153,204,0.06)'};border:1.5px solid ${impactoNeto<0?'rgba(229,57,53,0.25)':'rgba(0,153,204,0.25)'};border-radius:12px;padding:10px;text-align:center;margin-bottom:14px">
      <div style="font-size:9px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Impacto neto del inventario</div>
      <div style="font-family:'Inter',sans-serif;font-size:22px;font-weight:800;color:${impactoNeto<0?'var(--danger)':'var(--accent)'}">${impactoNeto<0?'-':'+'}${fmt(Math.abs(impactoNeto))}</div>
    </div>
    <div style="margin-bottom:10px;font-size:12px;color:var(--muted);font-weight:600">${diferencias.length} productos con diferencia · ordenados por impacto</div>` +
    ordenadas.map((p, idx) => {
      const diff = p.stockReal - p.stock;
      const valor = diff * (p.price || 0);
      const pctDiff = p.stock > 0 ? (diff / p.stock) * 100 : 100;
      const color = diff > 0 ? 'var(--accent)' : 'var(--danger)';
      const rec = getRecomendacion(p, diff, pctDiff);
      const notaGuardada = (window._invFisNotas && window._invFisNotas[p.code]) || '';
      return `<div style="padding:11px;background:var(--surface);border:1.5px solid var(--border);border-radius:12px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:start;gap:8px">
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:700">${p.emoji} ${p.name}</div>
            <div style="font-size:10px;color:var(--muted)">${p.code} · Sistema: ${p.stock} → Real: ${p.stockReal}</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-family:'Inter',sans-serif;font-size:15px;font-weight:800;color:${color}">${diff>0?'+':''}${diff}</div>
            <div style="font-family:'Inter',sans-serif;font-size:11px;font-weight:700;color:${color}">${valor<0?'-':'+'}${fmt(Math.abs(valor))}</div>
          </div>
        </div>
        ${rec ? `<div style="font-size:11px;color:var(--text);background:rgba(0,0,0,0.03);border-radius:8px;padding:7px 9px;margin-top:8px;line-height:1.4">${rec}</div>` : ''}
        <input type="text" placeholder="✏️ Agregar nota / acción tomada..." value="${notaGuardada}"
          onchange="guardarNotaInventario('${p.code}', this.value)"
          style="width:100%;margin-top:7px;padding:7px 9px;border:1.5px solid var(--border);border-radius:8px;font-size:11px;font-family:'Inter',sans-serif;background:var(--bg);color:var(--text)">
      </div>`;
    }).join('') +
    `<div style="display:flex;gap:8px;margin-top:6px">
      <button class="btn" style="flex:1;background:var(--danger);color:#fff;border:none;border-radius:10px;padding:11px;font-weight:700;font-size:13px;cursor:pointer;font-family:'Inter',sans-serif" onclick="aplicarConteoAlSistema()">✓ Aplicar al sistema</button>
      <button class="btn" style="flex:1;background:var(--accent2);color:#fff;border:none;border-radius:10px;padding:11px;font-weight:700;font-size:13px;cursor:pointer;font-family:'Inter',sans-serif" onclick="exportarInventarioFisico()">⬇ Exportar Excel</button>
    </div>
    <button class="btn" style="width:100%;margin-top:8px;background:#f57c00;color:#fff;border:none;border-radius:10px;padding:11px;font-weight:700;font-size:13px;cursor:pointer;font-family:'Inter',sans-serif" onclick="compararConUltimoInventario()">🔄 Comparar con inventario anterior</button>
    <div id="comparacion-auto-resultado" style="margin-top:12px"></div>`;

  registrarSnapshotHistorial('automático');
  showAlert('Informe generado · ' + diferencias.length + ' diferencias · Impacto neto ' + (impactoNeto<0?'-':'+') + fmt(Math.abs(impactoNeto)), 'warning');
}

function aplicarConteoAlSistema() {
  if (bloqueaPorSoloLectura()) return;
  const diferencias = invFisData.filter(p => p.contado && p.stockReal !== p.stock);
  if (!diferencias.length) { showAlert('No hay diferencias para aplicar', 'info'); return; }
  if (!confirm(`¿Actualizar el stock del sistema al valor contado para los ${diferencias.length} productos con diferencia?\n\nEsto reemplazará el stock actual de DialiStock por lo contado físicamente.`)) return;
  diferencias.forEach(p => {
    const real = db.products.find(x => x.code === p.code);
    if (!real) return;
    const prev = real.stock;
    real.stock = p.stockReal;
    p.stock = p.stockReal;
    db.movements.push({
      id: genId(),
      productId: real.id,
      productName: real.name,
      code: real.code,
      type: p.stockReal >= prev ? 'entrada' : 'salida',
      qty: Math.abs(p.stockReal - prev),
      prevStock: prev,
      newStock: real.stock,
      note: 'Ajuste por Conteo Físico',
      date: new Date().toISOString()
    });
  });
  save();
  renderInvFisLista();
  finalizarInventario();
  updateDashboard();
  showAlert('✅ Stock del sistema actualizado · ' + diferencias.length + ' productos ajustados', 'success');
}

window._invFisNotas = window._invFisNotas || {};
function guardarNotaInventario(code, valor) {
  window._invFisNotas[code] = valor;
  localStorage.setItem(lsKeyFor('ds_invfis_notas'), JSON.stringify(window._invFisNotas));
}
(function loadInvFisNotas() {
  try { window._invFisNotas = JSON.parse(localStorage.getItem(lsKeyFor('ds_invfis_notas')) || '{}'); } catch(e) { window._invFisNotas = {}; }
})();

async function exportarInventarioFisico() {
  if (!invFisData.length) return;
  showAlert('Generando Excel...', 'info');

  const rows = invFisData.map(p => {
    const diff = p.contado ? p.stockReal - p.stock : null;
    const valor = p.contado ? diff * (p.price || 0) : null;
    const pctDiff = p.contado && p.stock > 0 ? (diff / p.stock) * 100 : 0;
    const estado = !p.contado ? 'No contado' : diff === 0 ? 'OK' : diff > 0 ? 'Sobrante' : 'Faltante';
    const rec = p.contado && diff !== 0 ? (getRecomendacion(p, diff, pctDiff) || '').replace(/[🔴🟠🟡🔵⚪]/g, '').trim() : '';
    const nota = window._invFisNotas[p.code] || '';
    return { code: p.code, name: p.name, stock: p.stock, real: p.contado ? p.stockReal : null, diff, price: p.price || 0, valor, estado, rec, nota };
  });
  const totalFaltante = rows.reduce((s,r) => r.diff < 0 ? s + Math.abs(r.valor) : s, 0);
  const totalSobrante = rows.reduce((s,r) => r.diff > 0 ? s + r.valor : s, 0);
  const impactoNeto = totalSobrante - totalFaltante;
  const fechaHoy = new Date().toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' });

  const DAVITA_BLUE = 'FF0057A8';
  const RED = 'FFC8102E';
  const BLUE_TXT = 'FF0099CC';
  const WHITE = 'FFFFFFFF';

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Inventario Físico');

  ws.columns = [
    { width: 14 }, { width: 42 }, { width: 12 }, { width: 11 }, { width: 11 },
    { width: 11 }, { width: 13 }, { width: 11 }, { width: 46 }, { width: 30 }
  ];

  // Título
  ws.mergeCells('A1:J1'); ws.getCell('A1').value = 'INVENTARIO FÍSICO · DIALISTOCK';
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: WHITE } };
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DAVITA_BLUE } };
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 26;

  ws.mergeCells('A2:J2'); ws.getCell('A2').value = 'DaVita Chile · Centro Independencia C7848';
  ws.getCell('A2').font = { bold: true, size: 11, color: { argb: WHITE } };
  ws.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DAVITA_BLUE } };
  ws.getCell('A2').alignment = { horizontal: 'center' };

  ws.mergeCells('A3:J3'); ws.getCell('A3').value = fechaHoy;
  ws.getCell('A3').font = { size: 10, color: { argb: WHITE } };
  ws.getCell('A3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DAVITA_BLUE } };
  ws.getCell('A3').alignment = { horizontal: 'center' };

  // Totales
  ws.getCell('A5').value = 'Costo total faltante'; ws.getCell('A5').font = { bold: true };
  ws.getCell('B5').value = Math.round(totalFaltante); ws.getCell('B5').numFmt = '$#,##0';
  ws.getCell('B5').font = { bold: true, color: { argb: RED } };

  ws.getCell('A6').value = 'Costo total sobrante'; ws.getCell('A6').font = { bold: true };
  ws.getCell('B6').value = Math.round(totalSobrante); ws.getCell('B6').numFmt = '$#,##0';
  ws.getCell('B6').font = { bold: true, color: { argb: BLUE_TXT } };

  ws.getCell('A7').value = 'Impacto neto'; ws.getCell('A7').font = { bold: true, size: 12 };
  ws.getCell('B7').value = Math.round(impactoNeto); ws.getCell('B7').numFmt = '$#,##0;-$#,##0';
  ws.getCell('B7').font = { bold: true, size: 12, color: { argb: impactoNeto < 0 ? RED : BLUE_TXT } };

  // Encabezados tabla (fila 9)
  const headers = ['Código','Nombre','Stock sistema','Stock real','Diferencia','Valor unit.','Impacto $','Estado','Recomendación','Nota'];
  const headerRow = ws.getRow(9);
  headers.forEach((hdr, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = hdr;
    cell.font = { bold: true, color: { argb: WHITE }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DAVITA_BLUE } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  headerRow.height = 20;

  // Filas de datos
  const bgByEstado = { Faltante: 'FFFDE8E8', Sobrante: 'FFE8F4FB', OK: 'FFEAFAF1', 'No contado': 'FFF5F5F5' };
  const txtByEstado = { Faltante: RED, Sobrante: DAVITA_BLUE, OK: 'FF1A2A3A', 'No contado': 'FF777777' };

  rows.forEach((r, i) => {
    const rowNum = 10 + i;
    const row = ws.getRow(rowNum);
    const bg = bgByEstado[r.estado] || 'FFFFFFFF';
    const txt = txtByEstado[r.estado] || 'FF1A2A3A';
    const vals = [r.code, r.name, r.stock, r.real ?? 'N/C', r.diff ?? 'N/C', r.price, r.valor !== null ? Math.round(r.valor) : 'N/C', r.estado, r.rec, r.nota];
    vals.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.font = { size: 10, color: { argb: txt }, bold: ci === 6 };
      cell.alignment = { vertical: 'middle', wrapText: ci === 8 || ci === 9 };
      if (ci === 5) cell.numFmt = '$#,##0.00';
      if (ci === 6 && typeof v === 'number') cell.numFmt = '$#,##0;-$#,##0';
    });
  });

  ws.views = [{ state: 'frozen', ySplit: 9 }];

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  saveAs(blob, 'InventarioFisico_Valorizado_' + new Date().toISOString().slice(0,10) + '.xlsx');
  showAlert('✅ Informe valorizado exportado (Excel)', 'success');
}

// ==================== COMPARACIÓN AUTOMÁTICA (último vs actual) ====================
let _ultimaComparacionAuto = null;

function compararConUltimoInventario() {
  if (invFisHistorial.length < 2) {
    showAlert('Todavía no hay un inventario anterior guardado para comparar. Este quedará guardado como el primero.', 'info');
    return;
  }
  const actual = invFisHistorial[0];
  const anterior = invFisHistorial[1];

  const mapA = {}; anterior.productos.forEach(p => mapA[p.code] = p);
  const mapB = {}; actual.productos.forEach(p => mapB[p.code] = p);
  const allCodes = [...new Set([...Object.keys(mapA), ...Object.keys(mapB)])];

  const filas = allCodes.map(code => {
    const pa = mapA[code], pb = mapB[code];
    const realA = pa ? pa.stockReal : null;
    const realB = pb ? pb.stockReal : null;
    if (realA === realB) return null;
    const nombre = (pb || pa).name;
    const emoji = (pb || pa).emoji;
    const price = (pb || pa).price || 0;
    const delta = (realB ?? 0) - (realA ?? 0);
    return { code, nombre, emoji, realA, realB, delta, valor: delta * price };
  }).filter(Boolean).sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));

  const deltaImpacto = actual.totales.impactoNeto - anterior.totales.impactoNeto;
  _ultimaComparacionAuto = { anterior, actual, filas, deltaImpacto };

  renderComparacionAutoResultado();
  showAlert('📊 Comparado ' + anterior.fechaLabel + ' → ' + actual.fechaLabel, 'success');
}

function renderComparacionAutoResultado() {
  const cont = document.getElementById('comparacion-auto-resultado');
  if (!cont || !_ultimaComparacionAuto) return;
  const { anterior, actual, filas, deltaImpacto } = _ultimaComparacionAuto;
  const fmt = (n) => (n < 0 ? '-' : '+') + '$' + Math.abs(Math.round(n)).toLocaleString('es-CL');

  cont.innerHTML = `
    <div style="background:rgba(245,124,0,0.06);border:1.5px solid rgba(245,124,0,0.25);border-radius:12px;padding:12px;margin-bottom:10px">
      <div style="font-size:11px;font-weight:700;color:#f57c00;margin-bottom:6px">🔄 ${anterior.fechaLabel} → ${actual.fechaLabel}</div>
      <div style="display:flex;justify-content:space-between;font-size:12px">
        <span>Variación impacto neto:</span>
        <strong style="color:${deltaImpacto < 0 ? 'var(--danger)' : 'var(--accent)'}">${fmt(deltaImpacto)}</strong>
      </div>
    </div>
    <div style="font-size:11px;font-weight:700;color:var(--muted);margin-bottom:6px">${filas.length} productos con cambio de stock real entre ambas fechas</div>` +
    filas.slice(0, 30).map(f => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border)">
        <div style="font-size:11px;flex:1;min-width:0">${f.emoji} ${f.nombre}</div>
        <div style="font-size:11px;color:var(--muted);white-space:nowrap">${f.realA ?? '—'} → ${f.realB ?? '—'}</div>
        <div style="text-align:right;margin-left:8px;flex-shrink:0">
          <div style="font-family:'Inter',sans-serif;font-size:12px;font-weight:800;color:${f.delta < 0 ? 'var(--danger)' : 'var(--accent)'}">${f.delta > 0 ? '+' : ''}${f.delta}</div>
          <div style="font-family:'Inter',sans-serif;font-size:10px;font-weight:700;color:${f.valor < 0 ? 'var(--danger)' : 'var(--accent)'}">${fmt(f.valor)}</div>
        </div>
      </div>`).join('') +
    `<div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn" style="flex:1;background:var(--accent2);color:#fff;border:none;border-radius:10px;padding:10px;font-weight:700;font-size:12px;cursor:pointer;font-family:'Inter',sans-serif" onclick="exportarComparacionExcel()">⬇ Excel</button>
      <button class="btn" style="flex:1;background:var(--danger);color:#fff;border:none;border-radius:10px;padding:10px;font-weight:700;font-size:12px;cursor:pointer;font-family:'Inter',sans-serif" onclick="exportarComparacionPDF()">⬇ PDF</button>
    </div>`;
}

async function exportarComparacionExcel() {
  if (!_ultimaComparacionAuto) return;
  const { anterior, actual, filas, deltaImpacto } = _ultimaComparacionAuto;
  showAlert('Generando Excel...', 'info');

  const DAVITA_BLUE = 'FF0057A8', RED = 'FFC8102E', BLUE_TXT = 'FF0099CC', WHITE = 'FFFFFFFF';
  const centroNombre = getCentroInfo().nombre;
  const centroCodigo = getCentroInfo().codigo;

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Comparación Inventarios');
  ws.columns = [{ width: 14 }, { width: 42 }, { width: 14 }, { width: 14 }, { width: 12 }, { width: 14 }];

  ws.mergeCells('A1:F1'); ws.getCell('A1').value = 'COMPARACIÓN DE INVENTARIOS · DIALISTOCK';
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: WHITE } };
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DAVITA_BLUE } };
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 26;

  ws.mergeCells('A2:F2'); ws.getCell('A2').value = `DaVita Chile · Centro ${centroNombre} ${centroCodigo}`;
  ws.getCell('A2').font = { bold: true, size: 11, color: { argb: WHITE } };
  ws.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DAVITA_BLUE } };
  ws.getCell('A2').alignment = { horizontal: 'center' };

  ws.mergeCells('A3:F3'); ws.getCell('A3').value = `${anterior.fechaLabel}  →  ${actual.fechaLabel}`;
  ws.getCell('A3').font = { size: 10, color: { argb: WHITE } };
  ws.getCell('A3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DAVITA_BLUE } };
  ws.getCell('A3').alignment = { horizontal: 'center' };

  ws.getCell('A5').value = 'Variación impacto neto'; ws.getCell('A5').font = { bold: true, size: 12 };
  ws.getCell('B5').value = Math.round(deltaImpacto); ws.getCell('B5').numFmt = '$#,##0;-$#,##0';
  ws.getCell('B5').font = { bold: true, size: 12, color: { argb: deltaImpacto < 0 ? RED : BLUE_TXT } };

  const headers = ['Código', 'Nombre', `Real ${anterior.fechaLabel}`, `Real ${actual.fechaLabel}`, 'Diferencia', 'Impacto $'];
  const headerRow = ws.getRow(7);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: WHITE }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DAVITA_BLUE } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  headerRow.height = 20;

  filas.forEach((f, i) => {
    const rowNum = 8 + i;
    const row = ws.getRow(rowNum);
    const bg = f.delta < 0 ? 'FFFDE8E8' : 'FFE8F4FB';
    const txt = f.delta < 0 ? RED : BLUE_TXT;
    const vals = [f.code, f.nombre, f.realA ?? 'N/C', f.realB ?? 'N/C', f.delta, Math.round(f.valor)];
    vals.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.font = { size: 10, color: { argb: txt }, bold: ci === 5 };
      cell.alignment = { vertical: 'middle' };
      if (ci === 5) cell.numFmt = '$#,##0;-$#,##0';
    });
  });

  ws.views = [{ state: 'frozen', ySplit: 7 }];
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  saveAs(blob, 'Comparacion_Inventarios_' + new Date().toISOString().slice(0, 10) + '.xlsx');
  showAlert('✅ Comparación exportada (Excel)', 'success');
}

function exportarComparacionPDF() {
  if (!_ultimaComparacionAuto) return;
  const { anterior, actual, filas, deltaImpacto } = _ultimaComparacionAuto;
  showAlert('Generando PDF...', 'info');

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const centroNombre = getCentroInfo().nombre;
  const centroCodigo = getCentroInfo().codigo;
  const fmt = (n) => (n < 0 ? '-$' : '+$') + Math.abs(Math.round(n)).toLocaleString('es-CL');

  doc.setFillColor(0, 87, 168);
  doc.rect(0, 0, 210, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text('COMPARACIÓN DE INVENTARIOS · DIALISTOCK', 105, 10, { align: 'center' });
  doc.setFontSize(10);
  doc.text(`DaVita Chile · Centro ${centroNombre} ${centroCodigo}`, 105, 17, { align: 'center' });

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  doc.text(`${anterior.fechaLabel}  →  ${actual.fechaLabel}`, 14, 30);
  doc.setFontSize(12);
  doc.setTextColor(deltaImpacto < 0 ? 200 : 0, deltaImpacto < 0 ? 16 : 100, deltaImpacto < 0 ? 46 : 180);
  doc.text('Variación impacto neto: ' + fmt(deltaImpacto), 14, 38);
  doc.setTextColor(0, 0, 0);

  const body = filas.map(f => [
    f.code, f.nombre, f.realA ?? 'N/C', f.realB ?? 'N/C',
    (f.delta > 0 ? '+' : '') + f.delta, fmt(f.valor)
  ]);

  doc.autoTable({
    startY: 44,
    head: [['Código', 'Nombre', `Real ${anterior.fechaLabel}`, `Real ${actual.fechaLabel}`, 'Dif.', 'Impacto $']],
    body,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [0, 87, 168], textColor: [255, 255, 255] },
    didParseCell: function (data) {
      if (data.section === 'body' && data.column.index === 5) {
        const val = filas[data.row.index]?.valor;
        if (val < 0) data.cell.styles.textColor = [200, 16, 46];
        else if (val > 0) data.cell.styles.textColor = [0, 100, 180];
      }
    }
  });

  doc.save('Comparacion_Inventarios_' + new Date().toISOString().slice(0, 10) + '.pdf');
  showAlert('✅ Comparación exportada (PDF)', 'success');
}
// ==================== /COMPARACIÓN AUTOMÁTICA ====================

// ==================== MERMAS ====================
function renderMermas() {
  const movsDev = db.movements.filter(m => m.type === 'devolucion');
  document.getElementById('merma-total-movs').textContent = movsDev.length;
  const totalUnits = movsDev.reduce((s, m) => s + m.qty, 0);
  document.getElementById('merma-total-units').textContent = totalUnits;
  const lista = document.getElementById('merma-lista');
  if (!lista) return;
  if (!movsDev.length) { lista.innerHTML = '<div class="empty-state" data-icon="📉"><p>Sin devoluciones</p><small>Los datos aparecerán cuando haya devoluciones</small></div>'; return; }
  const agg = {};
  movsDev.forEach(m => {
    if (!agg[m.productId]) agg[m.productId] = { name: m.productName, code: m.code, total: 0, count: 0 };
    agg[m.productId].total += m.qty;
    agg[m.productId].count++;
  });
  const sorted = Object.values(agg).sort((a, b) => b.total - a.total);
  const maxVal = sorted[0]?.total || 1;
  lista.innerHTML = sorted.map(p => {
    const pct = Math.round((p.total / maxVal) * 100);
    return `<div style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <div style="font-size:12px;font-weight:600;color:var(--text);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
        <div style="font-family:'Inter',sans-serif;font-size:12px;font-weight:700;color:#f57c00;margin-left:8px;flex-shrink:0">🔄 ${p.total} un.</div>
      </div>
      <div style="background:rgba(0,0,0,0.06);border-radius:4px;height:8px;overflow:hidden">
        <div style="height:100%;border-radius:4px;background:#f57c00;width:${pct}%;transition:width .3s"></div>
      </div>
      <div style="font-size:10px;color:var(--muted);margin-top:3px">${p.count} registro${p.count>1?'s':''} · Código: ${p.code}</div>
    </div>`;
  }).join('');
}
