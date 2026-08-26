// ==================== LOTES / VENCIMIENTOS ====================
// lotesDB se inicializa vacío aquí; data-init.js lo reemplaza por la
// referencia real a db.lotes (sincronizado a la nube) apenas carga los
// datos del centro — ver la migración en data-init.js.
let lotesDB = [];
let filtroVenc = 'todos';

function saveLotes() { save(); }
function agregarLote() {
  if (bloqueaPorSoloLectura()) return;
  const pid = document.getElementById('venc-producto').value;
  const lote = document.getElementById('venc-lote').value.trim();
  const qty = parseInt(document.getElementById('venc-qty').value) || 0;
  const fecha = document.getElementById('venc-fecha').value;
  if (!pid || !fecha) { showAlert('Selecciona producto y fecha', 'error'); return; }
  const p = db.products.find(x => x.id === pid);
  lotesDB.push({ id: genId(), productId: pid, productName: p.name, code: p.code, lote, qty, vencimiento: fecha, registrado: new Date().toISOString() });
  saveLotes();
  document.getElementById('venc-lote').value = '';
  document.getElementById('venc-qty').value = '';
  document.getElementById('venc-fecha').value = '';
  renderVencimientos();
  showAlert('✅ Lote registrado · ' + p.name, 'success');
}

function renderVencimientos() {
  // Populate product select
  const sel = document.getElementById('venc-producto');
  if (sel) {
    const cur = sel.value;
    sel.innerHTML = '<option value="">— Seleccionar —</option>' + db.products.map(p => `<option value="${p.id}">${p.name} (${p.code})</option>`).join('');
    sel.value = cur;
  }
  const now = new Date(); now.setHours(0,0,0,0);
  const d30 = new Date(now); d30.setDate(d30.getDate() + 30);
  let items = lotesDB.slice().sort((a,b) => new Date(a.vencimiento) - new Date(b.vencimiento));
  if (filtroVenc === 'vencido') items = items.filter(l => new Date(l.vencimiento) < now);
  if (filtroVenc === 'pronto') items = items.filter(l => { const d = new Date(l.vencimiento); return d >= now && d <= d30; });
  ['vencido','pronto','todos'].forEach(f => {
    const b = document.getElementById('vbtn-' + f);
    if (b) { b.style.borderColor = f === filtroVenc ? 'var(--accent)' : 'var(--border)'; b.style.color = f === filtroVenc ? 'var(--accent)' : 'var(--muted)'; }
  });
  const lista = document.getElementById('venc-lista');
  if (!lista) return;
  if (!items.length) { lista.innerHTML = '<div class="empty-state"><p>Sin lotes en este filtro</p></div>'; return; }
  lista.innerHTML = items.map(l => {
    const vd = new Date(l.vencimiento); vd.setHours(0,0,0,0);
    const dias = Math.round((vd - now) / 86400000);
    const isVencido = dias < 0;
    const isProximo = dias >= 0 && dias <= 30;
    const color = isVencido ? 'var(--danger)' : isProximo ? '#f57c00' : 'var(--accent)';
    const bg = isVencido ? 'rgba(229,57,53,0.04)' : isProximo ? 'rgba(245,124,0,0.04)' : 'rgba(0,153,204,0.04)';
    const border = isVencido ? 'rgba(229,57,53,0.2)' : isProximo ? 'rgba(245,124,0,0.2)' : 'rgba(0,153,204,0.2)';
    const label = isVencido ? '🔴 VENCIDO' : isProximo ? `🟡 Vence en ${dias} días` : `🟢 ${dias} días`;
    return `<div style="padding:11px;background:${bg};border:1.5px solid ${border};border-radius:12px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:700;color:var(--text)">${l.productName}</div>
          <div style="font-family:'Inter',sans-serif;font-size:10px;color:var(--muted);margin-top:2px">Lote: ${l.lote||'S/N'} · ${l.qty} un.</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:11px;font-weight:700;color:${color}">${label}</div>
          <div style="font-family:'Inter',sans-serif;font-size:10px;color:var(--muted);margin-top:2px">${l.vencimiento}</div>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ==================== RECEPCION DE PEDIDO ====================
let recepcionDB = JSON.parse(localStorage.getItem('ds_recepcion') || '[]');
function saveRecepcion() { localStorage.setItem('ds_recepcion', JSON.stringify(recepcionDB)); }

function confirmarRecepcion() {
  if (bloqueaPorSoloLectura()) return;
  const pid = document.getElementById('rec-producto').value;
  const orden = document.getElementById('rec-orden').value.trim();
  const proveedor = document.getElementById('rec-proveedor').value.trim();
  const pedido = parseInt(document.getElementById('rec-pedido').value) || 0;
  const recibido = parseInt(document.getElementById('rec-recibido').value) || 0;
  const lote = document.getElementById('rec-lote').value.trim();
  const vencimiento = document.getElementById('rec-vencimiento').value;
  if (!pid || !recibido) { showAlert('Selecciona producto e ingresa cantidad recibida', 'error'); return; }
  const p = db.products.find(x => x.id === pid);
  const prev = p.stock;
  p.stock += recibido;
  const rec = { id: genId(), productId: pid, productName: p.name, code: p.code, orden, proveedor, pedido, recibido, diferencia: recibido - pedido, lote, vencimiento, prevStock: prev, newStock: p.stock, date: new Date().toISOString() };
  recepcionDB.push(rec);
  db.movements.push({ id: genId(), productId: pid, productName: p.name, code: p.code, type: 'entrada', qty: recibido, prevStock: prev, newStock: p.stock, note: `Recepción OC ${orden} · ${proveedor}`, date: new Date().toISOString() });
  if (lote && vencimiento) {
    lotesDB.push({ id: genId(), productId: pid, productName: p.name, code: p.code, lote, qty: recibido, vencimiento, registrado: new Date().toISOString() });
    saveLotes();
  }
  save(); saveRecepcion();
  ['rec-orden','rec-proveedor','rec-pedido','rec-recibido','rec-lote','rec-vencimiento'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  renderRecepcionOC(); updateDashboard();
  const diff = recibido - pedido;
  showAlert(`✅ Recibido: ${recibido} · Pedido: ${pedido} · ${diff >= 0 ? '+' : ''}${diff}`, diff < 0 ? 'warning' : 'success');
}

function confirmarRecepcionOC() {
  if (bloqueaPorSoloLectura()) return;
  const pid = document.getElementById('rec-producto').value;
  const orden = document.getElementById('rec-orden').value.trim();
  const proveedor = document.getElementById('rec-proveedor-oc').value.trim();
  const pedido = parseInt(document.getElementById('rec-pedido').value) || 0;
  const recibido = parseInt(document.getElementById('rec-recibido').value) || 0;
  const lote = document.getElementById('rec-lote').value.trim();
  const vencimiento = document.getElementById('rec-vencimiento').value;
  const facturaLink = document.getElementById('rec-factura-link').value.trim();
  if (!pid || !recibido) { showAlert('Selecciona producto e ingresa cantidad recibida', 'error'); return; }
  const p = db.products.find(x => x.id === pid);
  const prev = p.stock;
  p.stock += recibido;
  const rec = { id: genId(), productId: pid, productName: p.name, code: p.code, orden, proveedor, pedido, recibido, diferencia: recibido - pedido, lote, vencimiento, prevStock: prev, newStock: p.stock, facturaLink, date: new Date().toISOString() };
  recepcionDB.push(rec);
  db.movements.push({ id: genId(), productId: pid, productName: p.name, code: p.code, type: 'entrada', qty: recibido, prevStock: prev, newStock: p.stock, note: 'Recepción OC ' + orden + ' · ' + proveedor, date: new Date().toISOString() });
  if (lote && vencimiento) { lotesDB.push({ id: genId(), productId: pid, productName: p.name, code: p.code, lote, qty: recibido, vencimiento, registrado: new Date().toISOString() }); saveLotes(); }
  save(); saveRecepcion();
  ['rec-orden','rec-proveedor-oc','rec-pedido','rec-recibido','rec-lote','rec-vencimiento','rec-factura-link'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  renderRecepcionOC(); updateDashboard();
  const diff = recibido - pedido;
  showAlert('✅ Recibido: ' + recibido + ' · Pedido: ' + pedido + ' · ' + (diff >= 0 ? '+' : '') + diff + (facturaLink ? ' · 📎 Factura adjunta' : ''), diff < 0 ? 'warning' : 'success');
}

function renderRecepcionOC() {
  const sel = document.getElementById('rec-producto');
  if (sel) { const cur = sel.value; sel.innerHTML = '<option value="">— Seleccionar —</option>' + db.products.map(p => '<option value="' + p.id + '">' + p.name + ' (' + p.code + ')</option>').join(''); sel.value = cur; }
  const hist = document.getElementById('rec-historial-oc');
  if (!hist) return;
  const items = recepcionDB.slice().reverse();
  if (!items.length) { hist.innerHTML = '<div class="empty-state"><p>Sin recepciones registradas</p></div>'; return; }
  hist.innerHTML = items.slice(0, 15).map(r => {
    const diff = r.recibido - r.pedido;
    const diffColor = diff < 0 ? 'var(--danger)' : diff > 0 ? '#f57c00' : 'var(--accent)';
    const diffLabel = diff === 0 ? '✓ Completo' : diff < 0 ? '⚠️ Falta ' + Math.abs(diff) : '+' + diff + ' extra';
    return '<div style="padding:10px 0;border-bottom:1px solid var(--border)">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">' +
      '<div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:600;color:var(--text)">' + r.productName + '</div>' +
      '<div style="font-size:10px;color:var(--muted)">' + (r.proveedor||'-') + ' · OC: ' + (r.orden||'-') + '</div>' +
      '<div style="font-size:10px;color:var(--muted)">' + new Date(r.date).toLocaleDateString('es-CL') + '</div>' +
      (r.facturaLink ? '<a href="' + r.facturaLink + '" target="_blank" style="font-size:10px;color:var(--accent);font-weight:600;text-decoration:none">📎 Ver factura</a>' : '<span style="font-size:10px;color:var(--border)">Sin factura</span>') +
      '</div>' +
      '<div style="text-align:right;flex-shrink:0">' +
      '<div style="font-family:monospace;font-size:14px;font-weight:700;color:var(--text)">' + r.recibido + ' <span style="font-size:10px;color:var(--muted)">/ ' + (r.pedido||'?') + '</span></div>' +
      '<div style="font-size:10px;font-weight:700;color:' + diffColor + '">' + diffLabel + '</div>' +
      '</div></div></div>';
  }).join('');
}
// ==================== DESCUENTO FEFO ====================
// Descuenta stock de los lotes registrados en lotesDB siguiendo
// la lógica FEFO (First Expired, First Out): primero se descuenta
// del lote con vencimiento más próximo. Si un lote se agota,
// continúa con el siguiente lote más próximo a vencer.
// Retorna la cantidad que NO alcanzó a cubrirse con lotes
// registrados (0 si todo se descontó correctamente contra lotes).
function descontarLotesFEFO(productId, qty) {
  let restante = qty;
  const lotesProducto = lotesDB
    .filter(l => l.productId === productId && l.qty > 0)
    .sort((a, b) => new Date(a.vencimiento) - new Date(b.vencimiento));

  for (const lote of lotesProducto) {
    if (restante <= 0) break;
    const descuento = Math.min(lote.qty, restante);
    lote.qty -= descuento;
    restante -= descuento;
  }
  saveLotes();
  renderVencimientos(); // refresca la vista de vencimientos si está abierta
  return restante;
}

// ==================== CONTEO POR LOTE ====================
let loteConteoData = [];
let loteConteoActivo = false;

function saveLoteConteoProgreso() {
  localStorage.setItem(lsKeyFor('ds_lote_conteo_progreso'), JSON.stringify({ data: loteConteoData, activo: loteConteoActivo }));
}

function cargarLoteConteoProgreso() {
  try {
    const raw = localStorage.getItem(lsKeyFor('ds_lote_conteo_progreso'));
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function iniciarConteoLote() {
  if (!lotesDB.length) { showAlert('No hay lotes registrados para contar', 'error'); return; }
  const progresoGuardado = cargarLoteConteoProgreso();
  if (progresoGuardado && progresoGuardado.activo && progresoGuardado.data.length) {
    const continuar = confirm('Hay un conteo por lote en progreso. ¿Continuarlo? (Cancelar para empezar uno nuevo)');
    if (continuar) {
      loteConteoData = progresoGuardado.data;
      loteConteoActivo = true;
      renderConteoLoteLista();
      document.getElementById('lote-progress').style.display = 'block';
      document.getElementById('lote-save-btn').style.display = 'inline-block';
      document.getElementById('lote-resumen-card').style.display = 'none';
      return;
    }
  }
  loteConteoData = lotesDB.filter(l => l.qty > 0).map(l => ({ ...l, qtyReal: null, contado: false }));
  loteConteoActivo = true;
  saveLoteConteoProgreso();
  renderConteoLoteLista();
  document.getElementById('lote-progress').style.display = 'block';
  document.getElementById('lote-save-btn').style.display = 'inline-block';
  document.getElementById('lote-resumen-card').style.display = 'none';
  showAlert('Conteo por lote iniciado · ' + loteConteoData.length + ' lotes', 'success');
}

function guardarProgresoLoteManual() {
  if (bloqueaPorSoloLectura()) return;
  if (!loteConteoActivo || !loteConteoData.length) { showAlert('No hay conteo por lote activo', 'error'); return; }
  saveLoteConteoProgreso();
  const contados = loteConteoData.filter(l => l.contado).length;
  showAlert('💾 Progreso guardado · ' + contados + '/' + loteConteoData.length + ' lotes contados', 'success');
}

function renderConteoLoteLista() {
  const lista = document.getElementById('lote-conteo-lista');
  const contados = loteConteoData.filter(l => l.contado).length;
  const prog = document.getElementById('lote-progtext');
  if (prog) prog.textContent = contados + ' / ' + loteConteoData.length + ' lotes contados';
  if (!loteConteoActivo || !loteConteoData.length) { lista.innerHTML = '<div class="empty-state"><p>Presiona "Iniciar conteo" para comenzar</p></div>'; return; }

  lista.innerHTML = loteConteoData.map((l, i) => {
    const diff = l.contado ? l.qtyReal - l.qty : null;
    const bg = !l.contado ? 'var(--surface)' : diff === 0 ? 'rgba(0,153,204,0.04)' : diff > 0 ? 'rgba(245,124,0,0.04)' : 'rgba(229,57,53,0.04)';
    const border = !l.contado ? 'var(--border)' : diff === 0 ? 'rgba(0,153,204,0.2)' : diff > 0 ? 'rgba(245,124,0,0.2)' : 'rgba(229,57,53,0.2)';
    return `<div style="padding:10px 11px;background:${bg};border:1.5px solid ${border};border-radius:12px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:700;color:var(--text)">${l.productName}</div>
          <div style="font-size:10px;color:var(--muted)">Lote: ${l.lote || 'S/N'} · Vence: ${l.vencimiento || '-'}</div>
        </div>
        <div style="width:60px;text-align:center;flex-shrink:0">
          <div style="font-size:9px;color:var(--muted);font-weight:700">Sistema</div>
          <div style="font-family:'Inter',sans-serif;font-size:14px;font-weight:800;color:var(--accent2)">${l.qty}</div>
        </div>
        <div style="width:70px;flex-shrink:0">
          <input type="number" min="0" placeholder="—" value="${l.contado ? l.qtyReal : ''}"
            style="width:100%;padding:6px 3px;border:1.5px solid ${l.contado ? 'var(--danger)' : 'var(--border)'};border-radius:8px;font-size:13px;font-weight:700;font-family:'Inter',sans-serif;text-align:center;background:var(--surface);color:var(--text)"
            onchange="contarLote(${i}, this.value)">
        </div>
        <div style="width:36px;text-align:center;flex-shrink:0">
          ${l.contado ? `<span style="font-family:'Inter',sans-serif;font-size:12px;font-weight:800;color:${diff===0?'var(--accent)':diff>0?'#f57c00':'var(--danger)'}">${diff>0?'+':''}${diff}</span>` : '<span style="color:var(--border);font-size:11px">·</span>'}
        </div>
      </div>
    </div>`;
  }).join('') + (loteConteoData.every(l => l.contado) ? `<button class="btn btn-primary" style="margin-top:8px" onclick="finalizarConteoLote()">📝 Generar informe</button>` : '');
}

function contarLote(idx, val) {
  loteConteoData[idx].qtyReal = parseInt(val) || 0;
  loteConteoData[idx].contado = true;
  saveLoteConteoProgreso();
  renderConteoLoteLista();
}

function finalizarConteoLote() {
  if (bloqueaPorSoloLectura()) return;
  const diferencias = loteConteoData.filter(l => l.qtyReal !== l.qty);
  const res = document.getElementById('lote-resumen');
  document.getElementById('lote-resumen-card').style.display = 'block';
  if (!diferencias.length) {
    res.innerHTML = '<div style="text-align:center;padding:20px;color:var(--accent);font-weight:700">✅ Sin diferencias. Lotes cuadrados.</div>';
    return;
  }
  res.innerHTML = `<div style="margin-bottom:10px;font-size:12px;color:var(--muted);font-weight:600">${diferencias.length} lotes con diferencia</div>` +
    diferencias.map(l => {
      const diff = l.qtyReal - l.qty;
      const color = diff > 0 ? 'var(--accent)' : 'var(--danger)';
      return `<div style="padding:10px;background:var(--surface);border:1.5px solid var(--border);border-radius:10px;margin-bottom:8px">
        <div style="font-size:12px;font-weight:700">${l.productName}</div>
        <div style="font-size:10px;color:var(--muted)">Lote: ${l.lote || 'S/N'} · Sistema: ${l.qty} → Real: ${l.qtyReal}</div>
        <div style="font-family:'Inter',sans-serif;font-size:14px;font-weight:800;color:${color};margin-top:4px">${diff>0?'+':''}${diff}</div>
      </div>`;
    }).join('');
  showAlert('Informe generado · ' + diferencias.length + ' diferencias', 'warning');
}

function aplicarConteoLoteAlSistema() {
  if (bloqueaPorSoloLectura()) return;
  const diferencias = loteConteoData.filter(l => l.contado && l.qtyReal !== l.qty);
  if (!diferencias.length) { showAlert('No hay diferencias para aplicar', 'info'); return; }
  if (!confirm(`¿Actualizar ${diferencias.length} lotes al valor contado? Esto también ajustará el stock total del producto.`)) return;
  diferencias.forEach(l => {
    const loteReal = lotesDB.find(x => x.id === l.id);
    if (!loteReal) return;
    const deltaLote = l.qtyReal - loteReal.qty;
    loteReal.qty = l.qtyReal;
    const p = db.products.find(x => x.id === l.productId || x.code === l.code);
    if (p) {
      const prevStock = p.stock;
      p.stock = Math.max(0, p.stock + deltaLote);
      db.movements.push({
        id: genId(),
        productId: p.id,
        productName: p.name,
        code: p.code,
        type: deltaLote >= 0 ? 'entrada' : 'salida',
        qty: Math.abs(deltaLote),
        prevStock,
        newStock: p.stock,
        note: 'Ajuste por Conteo por Lote (' + (l.lote || 'S/N') + ')',
        date: new Date().toISOString()
      });
    }
  });
  saveLotes();
  save();
  loteConteoActivo = false;
  saveLoteConteoProgreso();
  renderConteoLoteLista();
  renderVencimientos();
  updateDashboard();
  showAlert('✅ Lotes actualizados · ' + diferencias.length + ' ajustados', 'success');
}
// ==================== IMPORTAR LOTES DESDE DYNAMICS ====================
function importarDesdeDynamicsLote(input) {
  const file = input.files[0];
  if (!file) return;
  const statusEl = document.getElementById('dynamics-import-status-lote');
  statusEl.textContent = 'Leyendo archivo...';

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array', cellDates: true });

      let rows = [], codeIdx = -1, qtyIdx = -1;
      for (const sheetName of wb.SheetNames) {
        const candidateRows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null });
        const candidateHeaders = (candidateRows[0] || []).map(h => (h || '').toString().trim().toLowerCase());
        const cIdx = candidateHeaders.findIndex(h => h.includes('producto'));
        const qIdx = candidateHeaders.findIndex(h => h.includes('cantidad'));
        if (cIdx !== -1 && qIdx !== -1) {
          rows = candidateRows; codeIdx = cIdx; qtyIdx = qIdx;
          break;
        }
      }

      if (codeIdx === -1 || qtyIdx === -1) {
        statusEl.textContent = '⚠️ No se encontraron columnas de producto/cantidad';
        showAlert('No se encontraron datos válidos — verifica el formato del Excel', 'error');
        return;
      }

      const headersFinal = (rows[0] || []).map(h => (h || '').toString().trim().toLowerCase());
      const loteIdx = headersFinal.findIndex(h => h.includes('lote'));
      const vencIdx = headersFinal.findIndex(h => h.includes('caduc') || h.includes('vencim'));

      if (loteIdx === -1) {
        statusEl.textContent = '⚠️ El Excel no tiene columna de lote';
        showAlert('Este Excel no trae número de lote — usa "Actualizar stock" en Conteo Físico para solo actualizar cantidades', 'error');
        return;
      }

      let actualizados = 0, creados = 0, sinCoincidencia = 0;
      rows.forEach((row, i) => {
        if (i === 0) return;
        const code = row[codeIdx] ? String(row[codeIdx]).trim() : null;
        const qty = parseFloat(row[qtyIdx]) || 0;
        const lote = row[loteIdx] ? String(row[loteIdx]).trim() : '';
        if (!code || !lote) return;

        const p = db.products.find(x => x.code === code);
        if (!p) { sinCoincidencia++; return; }

        let vencimiento = '';
        const vencRaw = vencIdx !== -1 ? row[vencIdx] : null;
        if (vencRaw instanceof Date) vencimiento = vencRaw.toISOString().slice(0, 10);
        else if (vencRaw != null && String(vencRaw).trim()) vencimiento = String(vencRaw).trim();

        const existente = lotesDB.find(l => l.code === code && l.lote === lote);
        if (existente) {
          existente.qty = Math.round(qty);
          existente.productId = p.id;
          existente.productName = p.name;
          if (vencimiento) existente.vencimiento = vencimiento;
          actualizados++;
        } else {
          lotesDB.push({ id: genId(), productId: p.id, productName: p.name, code, lote, qty: Math.round(qty), vencimiento, registrado: new Date().toISOString() });
          creados++;
        }
      });

      saveLotes();
      renderVencimientos();
      if (typeof renderConteoLoteLista === 'function') renderConteoLoteLista();

      const fecha = new Date().toLocaleString('es-CL', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
      statusEl.textContent = `✅ ${creados} lotes nuevos · ${actualizados} actualizados · ${fecha}`;
      showAlert(`✅ Lotes cargados desde Dynamics · ${creados} nuevos · ${actualizados} actualizados${sinCoincidencia ? ' · ' + sinCoincidencia + ' sin coincidencia' : ''}`, 'success');
      input.value = '';
    } catch (err) {
      console.error('Error importando lotes desde Excel:', err);
      statusEl.textContent = '❌ Error al leer el archivo';
      showAlert('Error al leer el Excel — verifica el formato', 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}
