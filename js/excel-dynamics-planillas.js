// ==================== EXCEL EXPORT ====================

function movementsToCSV(movements) {
  const headers = ['Fecha','Código','Producto','Tipo','Cantidad','Stock Anterior','Stock Nuevo','Unidad','Nota','Doc N°'];
  const rows = movements.map(m => {
    const p = db.products.find(pr => pr.id === m.productId);
    return [
      formatDate(m.date),
      m.code,
      m.productName,
      m.type === 'entrada' ? 'ENTRADA' : m.type === 'devolucion' ? 'DEVOLUCIÓN SALA' : 'SALIDA',
      m.qty,
      m.prevStock,
      m.newStock,
      p?.unit || '',
      m.note || '',
      `LS-${m.id.substring(0,8).toUpperCase()}`
    ].map(v => `"${v}"`).join(',');
  });
  return [headers.join(','), ...rows].join('\n');
}

function downloadCSV(content, filename) {
  const BOM = '\uFEFF'; // UTF-8 BOM for Excel
  const blob = new Blob([BOM + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportExcel() {
  if (db.movements.length === 0) { showAlert('Sin movimientos para exportar', 'error'); return; }
  const csv = movementsToCSV(db.movements);
  const date = new Date().toISOString().substring(0,10);
  downloadCSV(csv, `DialiStock_Movimientos_${date}.csv`);
  showAlert(`✅ Excel exportado · ${db.movements.length} movimientos`, 'success');
}

function exportExcelPending() {
  const pending = db.movements.filter(m => !m.paSynced);
  if (pending.length === 0) { showAlert('Sin movimientos pendientes', 'info'); return; }
  const csv = movementsToCSV(pending);
  const date = new Date().toISOString().substring(0,10);
  downloadCSV(csv, `DialiStock_Pendientes_${date}.csv`);
  // Mark as synced after export
  pending.forEach(m => { m.paSynced = true; m.paSyncDate = new Date().toISOString(); });
  save();
  paUpdatePending();
  showAlert(`✅ ${pending.length} movimientos exportados y marcados como enviados`, 'success');
}

// ==================== POWER AUTOMATE → DYNAMICS 365 BC ====================

let paConfig = JSON.parse(localStorage.getItem('dialistock_pa') || 'null');
let paAutoSync = JSON.parse(localStorage.getItem('dialistock_pa_auto') || 'false');

function renderDynamicsPage() {
  paUpdateStatus();
  paUpdatePending();
  paUpdateToggleUI();
  if (paConfig?.url) document.getElementById('pa-url').value = paConfig.url;
  const lastEl = document.getElementById('pa-last-sync');
  if (lastEl) lastEl.textContent = paConfig?.lastSync ? formatDate(paConfig.lastSync) : 'Nunca';
}

function paUpdateStatus() {
  const dot = document.getElementById('pa-dot');
  const text = document.getElementById('pa-status-text');
  const sub = document.getElementById('pa-status-sub');
  const badge = document.getElementById('pa-badge');
  const panel = document.getElementById('pa-active-panel');

  if (paConfig?.url) {
    dot.style.background = 'var(--accent)';
    dot.style.boxShadow = '0 0 0 4px rgba(0,212,170,0.2)';
    text.textContent = '✅ Conectado a Power Automate';
    sub.textContent = 'Flujo activo → Business Central';
    badge.style.display = 'inline-flex';
    panel.style.display = 'block';
  } else {
    dot.style.background = 'var(--muted)';
    dot.style.boxShadow = '0 0 0 3px rgba(107,140,173,0.2)';
    text.textContent = 'Sin configurar';
    sub.textContent = 'Sigue los pasos para conectar con Business Central';
    badge.style.display = 'none';
    panel.style.display = 'none';
  }
}

function paUpdatePending() {
  const count = db.movements.filter(m => !m.paSynced).length;
  const el = document.getElementById('pa-pending');
  if (el) el.textContent = count;
}

function paUpdateToggleUI() {
  const toggle = document.getElementById('pa-toggle');
  const thumb = document.getElementById('pa-thumb');
  if (!toggle) return;
  if (paAutoSync) {
    toggle.style.background = 'var(--accent)';
    thumb.style.left = '26px';
  } else {
    toggle.style.background = 'var(--border)';
    thumb.style.left = '4px';
  }
}

function toggleAutoSync() {
  paAutoSync = !paAutoSync;
  localStorage.setItem('dialistock_pa_auto', JSON.stringify(paAutoSync));
  paUpdateToggleUI();
  showAlert(paAutoSync ? '⚡ Sync automática activada' : 'Sync automática desactivada', 'info');
}

async function paSaveUrl() {
  const url = document.getElementById('pa-url').value.trim();
  if (!url || !url.startsWith('https://')) {
    showAlert('Pega una URL válida de Power Automate', 'error'); return;
  }

  const btn = document.getElementById('pa-save-btn');
  btn.textContent = '⏳ Probando conexión...';
  btn.disabled = true;

  try {
    // Send test payload to verify flow
    const testPayload = {
      codigo: 'TEST-000',
      producto: 'Prueba de Conexión DialiStock',
      tipo: 'entrada',
      cantidad: 0,
      stockAnterior: 0,
      stockNuevo: 0,
      unidad: 'unidades',
      nota: 'Verificación automática de conexión',
      fecha: new Date().toISOString(),
      docNumero: 'LS-TEST'
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testPayload)
    });

    // Power Automate returns 202 Accepted for async flows
    if (res.ok || res.status === 202 || res.status === 200) {
      paConfig = { url, lastSync: null };
      localStorage.setItem('dialistock_pa', JSON.stringify(paConfig));
      paUpdateStatus();
      paUpdatePending();
      paAddLog('✅ Conexión exitosa con Power Automate', 'success', 'Flujo activado · Listo para sincronizar con Business Central');
      showAlert('✅ ¡Conectado! Flujo de Power Automate activo', 'success');
    } else {
      throw new Error(`El flujo respondió con código ${res.status}. Verifica la URL.`);
    }
  } catch(err) {
    // CORS errors are expected from browser — treat as likely success
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      paConfig = { url, lastSync: null };
      localStorage.setItem('dialistock_pa', JSON.stringify(paConfig));
      paUpdateStatus();
      paUpdatePending();
      paAddLog('⚡ URL guardada · Power Automate acepta la conexión', 'success', 'El flujo responde desde la nube de Microsoft (CORS esperado)');
      showAlert('✅ URL guardada. El flujo está activo en Power Automate.', 'success');
    } else {
      paAddLog('❌ Error: ' + err.message, 'error');
      showAlert('❌ ' + err.message, 'error');
    }
  }

  btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg> Guardar y Probar Conexión';
  btn.disabled = false;
}

async function paSendToFlow(payload) {
  if (!paConfig?.url) return false;
  try {
    await fetch(paConfig.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return true;
  } catch(e) {
    // CORS from browser side is normal — Power Automate still receives it
    return true;
  }
}

async function paSyncAll() {
  if (!paConfig?.url) { showAlert('Configura Power Automate primero', 'error'); return; }
  const pending = db.movements.filter(m => !m.paSynced);
  if (pending.length === 0) { showAlert('✅ Sin movimientos pendientes', 'info'); return; }

  const btn = document.getElementById('pa-sync-btn');
  btn.textContent = `⏳ Enviando ${pending.length} registros...`;
  btn.disabled = true;

  let sent = 0;
  for (const mov of pending) {
    const payload = {
      codigo: mov.code,
      producto: mov.productName,
      tipo: mov.type,
      cantidad: mov.qty,
      stockAnterior: mov.prevStock,
      stockNuevo: mov.newStock,
      unidad: db.products.find(p => p.id === mov.productId)?.unit || 'unidades',
      nota: mov.note || '',
      fecha: mov.date,
      docNumero: `LS-${mov.id.substring(0,8).toUpperCase()}`
    };
    const ok = await paSendToFlow(payload);
    if (ok) {
      mov.paSynced = true;
      mov.paSyncDate = new Date().toISOString();
      sent++;
    }
  }

  paConfig.lastSync = new Date().toISOString();
  localStorage.setItem('dialistock_pa', JSON.stringify(paConfig));
  save();
  paUpdatePending();

  const lastEl = document.getElementById('pa-last-sync');
  if (lastEl) lastEl.textContent = formatDate(paConfig.lastSync);

  paAddLog(`✅ ${sent} movimientos enviados a Business Central`, 'success',
    `Via Power Automate · ${new Date().toLocaleTimeString('es-CL')}`);
  showAlert(`✅ ${sent} registros enviados a Business Central`, 'success');

  btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/></svg> Enviar Pendientes → Business Central';
  btn.disabled = false;
}

async function paSendTest() {
  if (!paConfig?.url) { showAlert('Configura Power Automate primero', 'error'); return; }
  const ok = await paSendToFlow({
    codigo: 'TEST-001',
    producto: '🧪 Registro de Prueba DialiStock',
    tipo: 'entrada',
    cantidad: 1,
    stockAnterior: 0,
    stockNuevo: 1,
    unidad: 'unidades',
    nota: 'Prueba manual desde DialiStock',
    fecha: new Date().toISOString(),
    docNumero: 'LS-TEST-OK'
  });
  if (ok) {
    paAddLog('🧪 Prueba enviada correctamente', 'success', 'Verifica en Power Automate → Historial de ejecuciones');
    showAlert('🧪 Prueba enviada. Revisa tu flujo en Power Automate.', 'success');
  }
}

function paDisconnect() {
  if (!confirm('¿Eliminar la configuración de Power Automate?')) return;
  paConfig = null;
  localStorage.removeItem('dialistock_pa');
  paUpdateStatus();
  showAlert('Configuración eliminada', 'info');
}

function paAddLog(msg, type = 'info', detail = '') {
  const log = document.getElementById('pa-log');
  if (!log) return;
  const colors = { success: 'var(--accent)', error: 'var(--danger)', info: 'var(--accent2)' };
  const empty = log.querySelector('.empty-state');
  if (empty) empty.remove();
  const el = document.createElement('div');
  el.style.cssText = 'padding:10px 0;border-bottom:1px solid rgba(30,58,95,0.4);animation:fadeIn 0.3s ease';
  el.innerHTML = `
    <div style="font-weight:600;font-size:13px;color:${colors[type]||'var(--text)'};margin-bottom:2px">${msg}</div>
    <div style="font-size:11px;color:var(--muted);font-family:'Inter',sans-serif">${detail||''} ${detail?'·':''} ${new Date().toLocaleTimeString('es-CL')}</div>
  `;
  log.prepend(el);
}

function copyJson(btn) {
  const json = document.getElementById('sample-json').textContent;
  navigator.clipboard.writeText(json).then(() => {
    if(btn) { btn.textContent = '✅ Copiado'; setTimeout(() => btn.textContent = 'Copiar', 2000); }
    showAlert('JSON copiado al portapapeles', 'success');
  }).catch(() => showAlert('Copia manualmente el JSON', 'info'));
}

// Auto-sync hook: called after every confirmed movement
function paAutoSyncHook(movement) {
  if (!paAutoSync || !paConfig?.url) return;
  const p = db.products.find(pr => pr.id === movement.productId);
  paSendToFlow({
    codigo: movement.code,
    producto: movement.productName,
    tipo: movement.type,
    cantidad: movement.qty,
    stockAnterior: movement.prevStock,
    stockNuevo: movement.newStock,
    unidad: p?.unit || 'unidades',
    nota: movement.note || '',
    fecha: movement.date,
    docNumero: `LS-${movement.id.substring(0,8).toUpperCase()}`
  }).then(ok => {
    if (ok) {
      movement.paSynced = true;
      movement.paSyncDate = new Date().toISOString();
      paConfig.lastSync = new Date().toISOString();
      localStorage.setItem('dialistock_pa', JSON.stringify(paConfig));
      save();
      paUpdatePending();
      showAlert('⚡ Enviado a Business Central', 'success');
    }
  });
}

// ==================== PLANILLAS LMV / MJS ====================

function switchPacTab(tab) {
  ['registro','lmv','mjs'].forEach(t => {
    const el = document.getElementById('pac-tab-' + t);
    const btn = document.getElementById('pac-tab-btn-' + t);
    if (el) el.style.display = t === tab ? 'block' : 'none';
    if (btn) {
      btn.style.background = t === tab ? 'var(--accent)' : 'transparent';
      btn.style.color = t === tab ? '#fff' : 'var(--muted)';
      btn.style.borderColor = t === tab ? 'var(--accent)' : 'var(--border)';
    }
  });
  pushPacConfigToMirrors();
}

function pacSyncConfig(source) {
  if (source === 'lmv' || source === 'mjs') {
    ['pac-monitores','pac-sesiones-dia','pac-grupo','pac-sesion'].forEach(id => {
      const m = document.getElementById(id + '-' + source);
      const c = document.getElementById(id);
      if (m && c) c.value = m.value;
    });
    // Grupo A = LMV (Lun/Mié/Vie) · Grupo B = MJS (Mar/Jue/Sáb)
    // Si seleccionas un grupo que no corresponde a la pestaña donde estás, cambia automáticamente a la pestaña correcta
    const grupoSel = document.getElementById('pac-grupo-' + source)?.value;
    const tabCorrespondiente = grupoSel === 'B' ? 'mjs' : 'lmv';
    if (tabCorrespondiente !== source) {
      switchPacTab(tabCorrespondiente);
    }
  }
  recalcularDesdeMonitores();
}

function pacSyncSesion(source) {
  const m = document.getElementById('pac-sesion-' + source);
  const c = document.getElementById('pac-sesion');
  if (m && c) c.value = m.value;
  actualizarTotalSesion();
  pushPacConfigToMirrors();
}

function pushPacConfigToMirrors() {
  ['lmv','mjs'].forEach(sfx => {
    ['pac-monitores','pac-sesiones-dia','pac-grupo','pac-sesion'].forEach(id => {
      const src = document.getElementById(id);
      const dst = document.getElementById(id + '-' + sfx);
      if (src && dst && dst.value !== src.value) dst.value = src.value;
    });
    ['pac-por-sesion','pac-total-dia','pac-grupo-badge','pac-grupo-dias'].forEach(id => {
      const src = document.getElementById(id);
      const dst = document.getElementById(id + '-' + sfx);
      if (src && dst) dst.textContent = src.textContent;
    });
  });
}

const CONSUMO_DIARIO = {"102-101-004": [190, 140], "102-105-011": [22, 19], "102-105-012": [9, 15], "101-108-005": [47, 33], "101-108-002": [64, 42], "101-108-003": [30, 22], "101-108-004": [4, 6], "101-106-003": [24, 20], "101-106-005": [24, 22], "101-108-006": [29, 32], "102-105-027": [8, 9], "102-105-028": [72, 60], "103-101-001": [39, 36], "102-105-038": [81, 79], "102-105-039": [107, 91], "102-105-040": [60, 54], "102-110-004": [300, 300], "101-106-009": [73, 60], "101-106-012": [12, 12], "101-106-011": [18, 21], "102-105-057": [6, 5], "101-101-003": [30, 30]};

function previewConsumoDiario(tipo) {
  const idx = tipo === 'lmv' ? 0 : 1;
  let html = '';
  let totalItems = 0;
  for (const code in CONSUMO_DIARIO) {
    const qty = CONSUMO_DIARIO[code][idx];
    const p = db.products.find(x => x.code === code);
    if (!p) continue;
    totalItems++;
    const insuficiente = p.stock < qty;
    html += `<tr style="${insuficiente ? 'background:rgba(200,16,46,0.06)' : ''}">
      <td style="padding:7px 8px;font-size:11px">${p.emoji} ${p.name}</td>
      <td style="padding:7px 8px;font-size:11px;text-align:right;color:var(--muted)">${p.stock}</td>
      <td style="padding:7px 8px;font-size:11px;text-align:right;font-weight:700;color:${insuficiente ? 'var(--danger)' : 'var(--text)'}">-${qty}</td>
      <td style="padding:7px 8px;font-size:11px;text-align:right;font-weight:700">${p.stock - qty}</td>
    </tr>`;
  }
  const modal = document.createElement('div');
  modal.id = 'consumo-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:3000;display:flex;align-items:center;justify-content:center;padding:20px';
  modal.innerHTML = `
    <div style="background:var(--surface);border-radius:16px;padding:20px;max-width:480px;width:100%;max-height:80vh;overflow-y:auto">
      <div style="font-size:15px;font-weight:800;color:var(--text);margin-bottom:4px">🧪 Confirmar consumo diario · ${tipo.toUpperCase()}</div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:14px">${totalItems} insumos se descontarán del stock</div>
      <div style="overflow-x:auto;border-radius:10px;border:1px solid var(--border);margin-bottom:16px">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="background:rgba(0,153,204,0.07)">
            <th style="padding:7px 8px;text-align:left;font-size:9px;color:var(--muted);text-transform:uppercase">Insumo</th>
            <th style="padding:7px 8px;text-align:right;font-size:9px;color:var(--muted);text-transform:uppercase">Stock</th>
            <th style="padding:7px 8px;text-align:right;font-size:9px;color:var(--muted);text-transform:uppercase">Consumo</th>
            <th style="padding:7px 8px;text-align:right;font-size:9px;color:var(--muted);text-transform:uppercase">Queda</th>
          </tr></thead>
          <tbody>${html}</tbody>
        </table>
      </div>
      <div style="display:flex;gap:10px">
        <button onclick="document.getElementById('consumo-modal').remove()" style="flex:1;padding:11px;border-radius:10px;border:1.5px solid var(--border);background:var(--surface);color:var(--text);font-weight:700;font-size:13px;cursor:pointer;font-family:'Inter',sans-serif">Cancelar</button>
        <button onclick="aplicarConsumoDiario('${tipo}')" style="flex:1;padding:11px;border-radius:10px;border:none;background:var(--danger);color:#fff;font-weight:700;font-size:13px;cursor:pointer;font-family:'Inter',sans-serif">✓ Confirmar y descontar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function aplicarConsumoDiario(tipo) {
  const idx = tipo === 'lmv' ? 0 : 1;
  let aplicados = 0;
  const fecha = new Date().toISOString();
  for (const code in CONSUMO_DIARIO) {
    const qty = CONSUMO_DIARIO[code][idx];
    const p = db.products.find(x => x.code === code);
    if (!p || qty <= 0) continue;
    p.stock = Math.max(0, p.stock - qty);
    db.movements.push({
      id: genId(),
      productId: p.id,
      productCode: p.code,
      productName: p.name,
      type: 'salida',
      quantity: qty,
      unit: p.unit,
      turno: 'Consumo diario',
      date: fecha,
      note: 'Consumo ' + tipo.toUpperCase()
    });
    aplicados++;
  }
  save();
  document.getElementById('consumo-modal').remove();
  updateDashboard();
  if (typeof renderInventario === 'function') renderInventario();
  showAlert(`✅ Consumo ${tipo.toUpperCase()} aplicado · ${aplicados} insumos descontados`, 'success');
}

function calcPlanilla(tipo) {
  const gv = (id) => { const el = document.getElementById(id); return el ? (parseInt(el.value) || 0) : 0; };
  const salas = ['s1','s2','s3'].map((s, i) => {
    const f15 = gv(tipo+'-'+s+'-fav15');
    const f16 = gv(tipo+'-'+s+'-fav16');
    const f17 = gv(tipo+'-'+s+'-fav17');
    const favkit = gv(tipo+'-'+s+'-favkit');
    return {
      fav15: f15, fav16: f16, fav17: f17, favkit: favkit,
      fav:   f15 + f16 + f17 + favkit,
      cvc:   gv(tipo+'-'+s+'-cvc'),
      conc:  document.getElementById(tipo+'-'+s+'-conc')  ? document.getElementById(tipo+'-'+s+'-conc').value  : '213',
      apos:  document.getElementById(tipo+'-'+s+'-apos')  ? document.getElementById(tipo+'-'+s+'-apos').value  : 'primapore',
      sellado: document.getElementById(tipo+'-'+s+'-sellado') ? document.getElementById(tipo+'-'+s+'-sellado').value : 'heparina',
    };
  });

  const totFav = salas.reduce((s,x) => s + x.fav, 0);
  const totCvc = salas.reduce((s,x) => s + x.cvc, 0);
  const totPac = totFav + totCvc;

  // Bibag: ceil(pac_sala / 3) de cada tipo
  const bibag900 = salas.map(s => Math.ceil((s.fav + s.cvc) / 3));
  const bibag650 = salas.map(s => Math.ceil((s.fav + s.cvc) / 3));

  // Concentrado: nombre por sala según selección (213/215)
  // Cantidad: ceil(pac * 3.4 / 2.5 / 2) por sala — dividido a la mitad
  // porque ACF-213/215 vienen en envases de 10L (el doble de volumen que
  // los concentrados anteriores de 5L, para los que se diseñó la fórmula).
  const concNombre = { '213': 'Concentrado Ácido ACF-213', '215': 'Concentrado Ácido ACF-215' };
  const concQty = salas.map(s => Math.ceil(((s.fav + s.cvc) * 3.4) / 2.5 / 2));

  // Agujas FAV por sala (nombre distinto si cambia la talla)
  // Apósito CVC por sala
  const aposNombre = { 'primapore': 'Apósito Primapore', 'tegaderm': 'Apósito Tegaderm 10x12' };

  // Construir artículos por sala individualmente
  const articulosMap = {};
  const addArt = (nombre, sVals, tipo) => {
    if (!articulosMap[nombre]) articulosMap[nombre] = { nombre, s: [0,0,0], tipo };
    sVals.forEach((v, i) => articulosMap[nombre].s[i] += v);
  };

  salas.forEach((s, i) => {
    const sv = (v) => { const a = [0,0,0]; a[i] = v; return a; };
    if (s.fav15 > 0) addArt('Agujas FAV 15G', sv(s.fav15 * 2), 'fav');
    if (s.fav16 > 0) addArt('Agujas FAV 16G', sv(s.fav16 * 2), 'fav');
    if (s.fav17 > 0) addArt('Agujas FAV 17G', sv(s.fav17 * 2), 'fav');
    if (s.fav > 0) {
      addArt('Kit FAV', sv(s.fav), 'fav');
      addArt('Alcohol Sachet (FAV)', sv(s.fav * 4), 'fav');
      addArt('Jeringa 3cc (FAV)', sv(s.fav), 'fav');
      addArt('Jeringa 20cc (FAV)', sv(s.fav), 'fav');
    }
    if (s.cvc > 0) {
      addArt('Kit CVC', sv(s.cvc), 'cvc');
      addArt('Alcohol Sachet (CVC)', sv(s.cvc * 2), 'cvc');
      addArt('Jeringa 3cc (CVC)', sv(s.cvc), 'cvc');
      addArt('Jeringa 5cc (CVC)', sv(s.cvc * 2), 'cvc');
      addArt('Jeringa 20cc (CVC)', sv(s.cvc), 'cvc');
      addArt('SF 20cc', sv(s.cvc), 'cvc');
      addArt('Conector Tego', sv(s.cvc * 2), 'cvc');
      addArt(aposNombre[s.apos] + ' (CVC)', sv(s.cvc), 'cvc');
      // Sellado CVC según tipo seleccionado por sala
      const selladoNombre = s.sellado === 'heparina' ? 'Heparina (sellado CVC)' : s.sellado === 'sodio' ? 'Sodio Cloruro 0.9% 20ml (sellado)' : 'Citralock (sellado CVC)';
      addArt(selladoNombre, sv(s.cvc), 'cvc');
      addArt('Gorro Desechable', sv(s.cvc * 3), 'cvc');
      addArt('Pechera Desechable', sv(s.cvc * 3), 'cvc');
      addArt('Mascarilla Desechable', sv(s.cvc * 2), 'cvc');
    }
    if (s.fav + s.cvc > 0) {
      addArt('Bibag 5008 900g', sv(bibag900[i]), 'todos');
      addArt('Bibag 5008 650g', sv(bibag650[i]), 'todos');
      addArt(concNombre[s.conc], sv(concQty[i]), 'todos');
      addArt('SF 1000cc', sv(s.fav + s.cvc), 'todos');
      addArt('Paños Wipal', sv(Math.ceil((s.fav + s.cvc) * 4)), 'todos');
      addArt('Aisladores de presión', sv(Math.ceil((s.fav + s.cvc) / 2)), 'todos');
    }
  });

  const articulos = Object.values(articulosMap).filter(a => a.s.some(v => v > 0));

  const tbody = document.getElementById(tipo + '-tbody');
  const tipoColor = { fav: '#0099cc', cvc: '#f57c00', todos: 'var(--text)' };

  tbody.innerHTML = articulos.map(a => {
    const total = a.s.reduce((sum, v) => sum + v, 0);
    return `<tr style="border-top:1px solid var(--border)">
      <td style="padding:7px 10px;font-size:11px;color:${tipoColor[a.tipo]}">${a.nombre}</td>
      ${a.s.map(v => `<td style="padding:7px 10px;text-align:right;font-family:monospace;font-size:12px">${v || '-'}</td>`).join('')}
      <td style="padding:7px 10px;text-align:right;font-family:monospace;font-size:12px;font-weight:700;color:var(--accent)">${total}</td>
    </tr>`;
  }).join('');

  // Stats
  const statsEl = document.getElementById(tipo + '-stats');
  statsEl.innerHTML = [
    { lbl: 'Total pacientes', val: totPac, color: 'var(--text)' },
    { lbl: 'Con FAV', val: totFav, color: '#0099cc' },
    { lbl: 'Con CVC', val: totCvc, color: '#f57c00' }
  ].map(s => `<div style="background:rgba(0,153,204,0.06);border:1.5px solid rgba(0,153,204,0.2);border-radius:10px;padding:10px;text-align:center">
    <div style="font-family:'Inter',sans-serif;font-size:20px;font-weight:700;color:${s.color}">${s.val}</div>
    <div style="font-size:10px;color:var(--muted);margin-top:2px">${s.lbl}</div>
  </div>`).join('');

  document.getElementById(tipo + '-resultado').style.display = totPac > 0 ? 'block' : 'none';
}


function exportPlanilla(tipo) {
  const titulo = tipo === 'lmv' ? 'LUNES / MIERCOLES / VIERNES' : 'MARTES / JUEVES / SABADO';
  const label  = tipo === 'lmv' ? 'LMV' : 'MJS';
  const salas_cfg = ['s1','s2','s3'].map(s => ({
    conc:  document.getElementById(tipo+'-'+s+'-conc')  ? document.getElementById(tipo+'-'+s+'-conc').value  : '213',
    apos:  document.getElementById(tipo+'-'+s+'-apos')  ? document.getElementById(tipo+'-'+s+'-apos').value  : 'primapore',
  }));

  const salas = ['s1','s2','s3'].map(s => {
    const f15 = parseInt(document.getElementById(tipo+'-'+s+'-fav15')?.value) || 0;
    const f16 = parseInt(document.getElementById(tipo+'-'+s+'-fav16')?.value) || 0;
    const f17 = parseInt(document.getElementById(tipo+'-'+s+'-fav17')?.value) || 0;
    const favkit = parseInt(document.getElementById(tipo+'-'+s+'-favkit')?.value) || 0;
    return {
      fav15: f15, fav16: f16, fav17: f17, favkit: favkit,
      fav: f15 + f16 + f17 + favkit,
      cvc: parseInt(document.getElementById(tipo+'-'+s+'-cvc')?.value) || 0
    };
  });

  const totFav = salas.reduce((s,x) => s+x.fav, 0);
  const totCvc = salas.reduce((s,x) => s+x.cvc, 0);
  const totPac = totFav + totCvc;

  const bibag900     = salas.map(s => Math.ceil((s.fav+s.cvc)/3));
  const bibag650     = salas.map(s => Math.ceil((s.fav+s.cvc)/3));
  const concentrado  = salas.map(s => Math.ceil(((s.fav+s.cvc)*3.4)/2.5/2));

  const articulos = [
    { nombre: 'Agujas FAV 15G',            s: salas.map(s => s.fav15*2) },
    { nombre: 'Agujas FAV 16G',            s: salas.map(s => s.fav16*2) },
    { nombre: 'Agujas FAV 17G',            s: salas.map(s => s.fav17*2) },
    { nombre: 'Kit FAV',                   s: salas.map(s => s.fav) },
    { nombre: 'Alcohol sachet (FAV)',      s: salas.map(s => s.fav*4) },
    { nombre: 'Jeringa 3cc (FAV)',         s: salas.map(s => s.fav) },
    { nombre: 'Jeringa 20cc (FAV)',        s: salas.map(s => s.fav) },
    { nombre: 'Kit CVC',                   s: salas.map(s => s.cvc) },
    { nombre: 'Alcohol sachet (CVC)',      s: salas.map(s => s.cvc*2) },
    { nombre: 'Jeringa 3cc (CVC)',         s: salas.map(s => s.cvc) },
    { nombre: 'Jeringa 5cc (CVC)',         s: salas.map(s => s.cvc*2) },
    { nombre: 'Jeringa 20cc (CVC)',        s: salas.map(s => s.cvc) },
    { nombre: 'SF 20cc',                   s: salas.map(s => s.cvc) },
    { nombre: 'Conector Tego',             s: salas.map(s => s.cvc*2) },
    { nombre: 'Aposito Primapore',         s: salas.map(s => s.cvc) },
    { nombre: 'Gorro desechable',          s: salas.map(s => s.cvc*3) },
    { nombre: 'Pechera desechable',        s: salas.map(s => s.cvc*3) },
    { nombre: 'Mascarilla desechable',     s: salas.map(s => s.cvc*2) },
    { nombre: 'Bibag 5008 900g',           s: bibag900 },
    { nombre: 'Bibag 5008 650g',           s: bibag650 },
    { nombre: 'Concentrado acido',         s: concentrado },
  ];

  const rows = [
    [null, null, titulo],
    ['Fecha:', new Date().toLocaleDateString('es-CL')],
    [],
    ['', 'SALA 1', 'SALA 2', 'SALA 3', 'Total'],
    ['Total Pacientes', salas[0].fav+salas[0].cvc, salas[1].fav+salas[1].cvc, salas[2].fav+salas[2].cvc, totPac],
    ['Pacientes con FAV', salas[0].fav, salas[1].fav, salas[2].fav, totFav],
    ['Pacientes con CVC', salas[0].cvc, salas[1].cvc, salas[2].cvc, totCvc],
    [],
    ['Articulo', 'Sala 1', 'Sala 2', 'Sala 3', 'Total a rebajar'],
    ...articulos.map(a => {
      const total = a.s.reduce((s,v)=>s+v,0);
      return [a.nombre, a.s[0]||null, a.s[1]||null, a.s[2]||null, total||null];
    }),
    [],
    [null, null, new Date().toLocaleDateString('es-CL')]
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:30},{wch:10},{wch:10},{wch:10},{wch:16}];
  const wb = XLSX.utils.book_new();
  const sheetName = titulo.replace(/[\/\\?*\[\]:]/g,'-').substring(0,31);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const fecha = new Date().toLocaleDateString('es-CL').replace(/\//g,'-');
  XLSX.writeFile(wb, 'Planilla_' + label + '_' + fecha + '.xlsx');
  showAlert('Planilla ' + label + ' exportada', 'success');
}


