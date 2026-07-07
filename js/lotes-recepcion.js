// ==================== LOTES / VENCIMIENTOS ====================
let lotesDB = JSON.parse(localStorage.getItem('ds_lotes') || '[]');
let filtroVenc = 'todos';

function saveLotes() { localStorage.setItem('ds_lotes', JSON.stringify(lotesDB)); }

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


