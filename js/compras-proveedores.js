// ==================== PD CONS - PEDIDOS DE COMPRA ====================

let pdConsDB = JSON.parse(localStorage.getItem('dialistock_pdcons') || '[]');
let pdFiltroActual = 'todos';
let pdPDFStatus = null;

function savePDCons() {
  localStorage.setItem('dialistock_pdcons', JSON.stringify(pdConsDB));
}

function renderPDCons() {
  renderPDLista();
  updatePDStats();
}

function setPDFStatus(status) {
  pdPDFStatus = status;
  const btnCon = document.getElementById('pd-btn-confactura');
  const btnSin = document.getElementById('pd-btn-sinfactura');
  const comentBox = document.getElementById('pd-comentario-box');

  if (status === 'encontrada') {
    btnCon.style.borderColor = 'var(--accent)';
    btnCon.style.background = 'rgba(0,153,204,0.08)';
    btnCon.style.color = 'var(--accent)';
    btnSin.style.borderColor = 'var(--border)';
    btnSin.style.background = '#f8fbff';
    btnSin.style.color = 'var(--muted)';
    comentBox.style.display = 'none';
  } else {
    btnSin.style.borderColor = 'var(--danger)';
    btnSin.style.background = 'rgba(229,57,53,0.06)';
    btnSin.style.color = 'var(--danger)';
    btnCon.style.borderColor = 'var(--border)';
    btnCon.style.background = '#f8fbff';
    btnCon.style.color = 'var(--muted)';
    comentBox.style.display = 'block';
    document.getElementById('pd-comentario').value = 'No se encuentra factura en el Monitor';
  }
}

function agregarPDCons() {
  if (bloqueaPorSoloLectura()) return;
  const noc = document.getElementById('pd-noc').value.trim();
  const proveedor = document.getElementById('pd-proveedor').value.trim();
  const nfactura = document.getElementById('pd-nfactura').value.trim();
  const fecha = document.getElementById('pd-fecha').value;
  const monto = document.getElementById('pd-monto').value;
  const estado = document.getElementById('pd-estado').value;
  const comentario = document.getElementById('pd-comentario').value.trim();

  if (!noc) { showAlert('Ingresa el N° de Orden de Compra', 'error'); return; }
  if (!proveedor) { showAlert('Ingresa el proveedor', 'error'); return; }
  if (pdPDFStatus === null) { showAlert('Indica si el PDF fue encontrado en el Monitor', 'error'); return; }

  const oc = {
    id: genId(),
    noc,
    proveedor,
    nfactura,
    fecha,
    monto: parseFloat(monto) || 0,
    pdfStatus: pdPDFStatus,
    comentario: pdPDFStatus === 'no_encontrada' ? (comentario || 'No se encuentra factura en el Monitor') : '',
    estado,
    fechaRegistro: new Date().toISOString(),
    fechaIngreso: estado === 'ingresada' ? new Date().toISOString() : null
  };

  pdConsDB.unshift(oc);
  savePDCons();
  renderPDLista();
  updatePDStats();

  // Clear form
  document.getElementById('pd-noc').value = '';
  document.getElementById('pd-proveedor').value = '';
  document.getElementById('pd-nfactura').value = '';
  document.getElementById('pd-fecha').value = '';
  document.getElementById('pd-monto').value = '';
  document.getElementById('pd-estado').value = 'pendiente';
  pdPDFStatus = null;
  document.getElementById('pd-btn-confactura').style.cssText = 'padding:14px;border-radius:12px;border:2px solid var(--border);background:#f8fbff;color:var(--muted);font-family:Inter,sans-serif;font-weight:700;font-size:13px;cursor:pointer';
  document.getElementById('pd-btn-sinfactura').style.cssText = 'padding:14px;border-radius:12px;border:2px solid var(--border);background:#f8fbff;color:var(--muted);font-family:Inter,sans-serif;font-weight:700;font-size:13px;cursor:pointer';
  document.getElementById('pd-comentario-box').style.display = 'none';

  showAlert(`✅ OC ${noc} registrada · ${proveedor}`, 'success');
}

function cambiarEstadoPD(id, nuevoEstado) {
  if (bloqueaPorSoloLectura()) return;
  const oc = pdConsDB.find(o => o.id === id);
  if (!oc) return;
  oc.estado = nuevoEstado;
  if (nuevoEstado === 'ingresada') oc.fechaIngreso = new Date().toISOString();
  savePDCons();
  renderPDLista();
  updatePDStats();
  showAlert(`OC actualizada → ${nuevoEstado === 'ingresada' ? '✅ Ingresada' : nuevoEstado === 'con_problema' ? '⚠️ Con Problema' : '⏳ Pendiente'}`, 'success');
}

function eliminarPD(id) {
  if (bloqueaPorSoloLectura()) return;
  pdConsDB = pdConsDB.filter(o => o.id !== id);
  savePDCons();
  renderPDLista();
  updatePDStats();
  showAlert('OC eliminada', 'info');
}

function filtrarPD(filtro) {
  pdFiltroActual = filtro;
  ['todos','pendiente','ingresada'].forEach(f => {
    const btn = document.getElementById('pd-fil-' + f);
    if (btn) {
      btn.style.borderColor = f === filtro ? 'var(--accent)' : 'var(--border)';
      btn.style.color = f === filtro ? 'var(--accent)' : 'var(--muted)';
    }
  });
  renderPDLista();
}

function renderPDLista() {
  const lista = document.getElementById('pd-lista');
  if (!lista) return;

  let items = pdConsDB;
  if (pdFiltroActual !== 'todos') items = pdConsDB.filter(o => o.estado === pdFiltroActual);

  if (items.length === 0) {
    lista.innerHTML = '<div class="empty-state"><p>Sin órdenes registradas</p></div>';
    return;
  }

  lista.innerHTML = items.map(oc => {
    const estadoColor = oc.estado === 'ingresada' ? 'var(--accent)' : oc.estado === 'con_problema' ? 'var(--warning)' : 'var(--accent2)';
    const estadoLabel = oc.estado === 'ingresada' ? '✅ Ingresada' : oc.estado === 'con_problema' ? '⚠️ Con Problema' : '⏳ Pendiente';
    const pdfBadge = oc.pdfStatus === 'encontrada'
      ? `<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:rgba(0,153,204,0.1);color:var(--accent);font-weight:700">✅ PDF en Monitor</span>`
      : `<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:rgba(229,57,53,0.1);color:var(--danger);font-weight:700">❌ Sin PDF</span>`;

    return `
      <div style="padding:14px 0;border-bottom:1px solid rgba(184,212,240,0.5)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:8px">
          <div style="flex:1;min-width:0">
            <div style="font-family:'Inter',sans-serif;font-size:13px;font-weight:700;color:var(--text)">${oc.noc}</div>
            <div style="font-size:13px;font-weight:600;color:var(--text);margin-top:2px">${oc.proveedor}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px">
              ${oc.nfactura ? `Fact: ${oc.nfactura} · ` : ''}${oc.fecha || ''} ${oc.monto ? '· $' + oc.monto.toLocaleString('es-CL') : ''}
            </div>
            <div style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap">
              ${pdfBadge}
              <span style="font-size:10px;padding:2px 8px;border-radius:10px;background:rgba(0,0,0,0.05);color:${estadoColor};font-weight:700">${estadoLabel}</span>
            </div>
            ${oc.comentario ? `<div style="margin-top:6px;padding:8px 10px;background:rgba(229,57,53,0.06);border:1px solid rgba(229,57,53,0.15);border-radius:8px;font-size:11px;color:var(--danger)">💬 ${oc.comentario}</div>` : ''}
          </div>
          <button onclick="eliminarPD('${oc.id}')" style="background:rgba(229,57,53,0.08);border:1px solid rgba(229,57,53,0.2);color:var(--danger);border-radius:8px;padding:6px 10px;font-size:12px;cursor:pointer;flex-shrink:0">🗑</button>
        </div>
        ${oc.estado !== 'ingresada' ? `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
          <button onclick="cambiarEstadoPD('${oc.id}','ingresada')" style="padding:10px;border-radius:10px;background:rgba(0,153,204,0.1);border:1.5px solid rgba(0,153,204,0.3);color:var(--accent);font-family:'Inter',sans-serif;font-weight:700;font-size:12px;cursor:pointer">✅ Marcar Ingresada</button>
          <button onclick="cambiarEstadoPD('${oc.id}','con_problema')" style="padding:10px;border-radius:10px;background:rgba(245,124,0,0.08);border:1.5px solid rgba(245,124,0,0.3);color:var(--warning);font-family:'Inter',sans-serif;font-weight:700;font-size:12px;cursor:pointer">⚠️ Con Problema</button>
        </div>` : `
        <div style="font-size:11px;color:var(--muted);font-family:'Inter',sans-serif;margin-top:4px">
          Ingresada: ${oc.fechaIngreso ? formatDate(oc.fechaIngreso) : '--'}
        </div>`}
      </div>`;
  }).join('');
}

function updatePDStats() {
  const total = pdConsDB.length;
  const conPDF = pdConsDB.filter(o => o.pdfStatus === 'encontrada').length;
  const sinPDF = pdConsDB.filter(o => o.pdfStatus === 'no_encontrada').length;
  const elTotal = document.getElementById('pd-stat-total');
  const elPDF = document.getElementById('pd-stat-pdf');
  const elNoPDF = document.getElementById('pd-stat-nopdf');
  if (elTotal) elTotal.textContent = total;
  if (elPDF) elPDF.textContent = conPDF;
  if (elNoPDF) elNoPDF.textContent = sinPDF;
}

function exportarPDCons() {
  if (pdConsDB.length === 0) { showAlert('Sin órdenes para exportar', 'error'); return; }
  const headers = ['N° OC','Proveedor','N° Factura','Fecha','Monto','PDF en Monitor','Estado','Comentario','Fecha Registro','Fecha Ingreso'];
  const rows = pdConsDB.map(o => [
    o.noc, o.proveedor, o.nfactura, o.fecha,
    o.monto, o.pdfStatus === 'encontrada' ? 'SÍ' : 'NO',
    o.estado === 'ingresada' ? 'INGRESADA' : o.estado === 'con_problema' ? 'CON PROBLEMA' : 'PENDIENTE',
    o.comentario, formatDate(o.fechaRegistro),
    o.fechaIngreso ? formatDate(o.fechaIngreso) : ''
  ].map(v => `"${v || ''}"`).join(','));

  const BOM = '\uFEFF';
  const csv = BOM + [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `DialiStock_PD_Cons_${new Date().toISOString().substring(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showAlert(`✅ ${pdConsDB.length} OC exportadas`, 'success');
}

// ==================== PROVEEDORES ====================

let provScanner = null;
let provScannerActive = false;
let currentProvProduct = null;
let provRecepciones = JSON.parse(localStorage.getItem('dialistock_prov') || '[]');

function saveProveedores() {
  localStorage.setItem('dialistock_prov', JSON.stringify(provRecepciones));
}

function renderProveedores() {
  renderProvHistorial();
}

async function toggleProvScanner() {
  if (provScannerActive) {
    stopProvScanner();
  } else {
    startProvScanner();
  }
}

async function startProvScanner() {
  const btn = document.getElementById('prov-scan-btn');
  const status = document.getElementById('prov-scanner-status');
  const reader = document.getElementById('prov-qr-reader');

  reader.style.display = 'block';
  status.textContent = '🟢 Escaneando... apunta al QR del insumo';
  status.className = 'scanner-status scanning';
  btn.textContent = '⏹ Detener';

  try {
    provScanner = new Html5Qrcode('prov-qr-reader');
    await provScanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 200, height: 200 } },
      (code) => {
        stopProvScanner();
        buscarInsumoProv(code.trim().toUpperCase());
      },
      () => {}
    );
    provScannerActive = true;
  } catch(err) {
    status.textContent = '❌ Sin acceso a cámara. Usa ingreso manual.';
    status.className = 'scanner-status';
    reader.style.display = 'none';
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="5" height="5" rx="1"/><rect x="16" y="3" width="5" height="5" rx="1"/><rect x="3" y="16" width="5" height="5" rx="1"/></svg> Escanear QR del Insumo';
  }
}

function stopProvScanner() {
  if (provScanner && provScannerActive) {
    provScanner.stop().catch(() => {});
    provScannerActive = false;
  }
  document.getElementById('prov-qr-reader').style.display = 'none';
  document.getElementById('prov-scanner-status').textContent = 'Toca "Escanear" para identificar el insumo';
  document.getElementById('prov-scanner-status').className = 'scanner-status';
  document.getElementById('prov-scan-btn').innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="5" height="5" rx="1"/><rect x="16" y="3" width="5" height="5" rx="1"/><rect x="3" y="16" width="5" height="5" rx="1"/><line x1="16" y1="16" x2="21" y2="16"/><line x1="16" y1="20" x2="21" y2="20"/><line x1="19" y1="16" x2="19" y2="21"/></svg> Escanear QR del Insumo';
}

function buscarInsumoProv(code) {
  const idx = db.products.findIndex(p => p.code === code);
  if (idx === -1) {
    showAlert('Código no encontrado: ' + code, 'error');
    return;
  }
  const p = db.products[idx];
  currentProvProduct = idx;
  document.getElementById('prov-insumo-name').textContent = p.name;
  document.getElementById('prov-insumo-code').textContent = p.code;
  document.getElementById('prov-stock-actual').textContent = p.stock + ' ' + p.unit;
  document.getElementById('prov-stock-nuevo').textContent = '--';
  document.getElementById('prov-cantidad').value = '';
  document.getElementById('prov-form-card').style.display = 'block';
  document.getElementById('prov-form-card').scrollIntoView({ behavior: 'smooth' });
  showAlert('✅ ' + p.name + ' identificado', 'success');
}

function buscarInsumoManualProv() {
  const code = document.getElementById('prov-manual-code').value.trim().toUpperCase();
  if (!code) { showAlert('Ingresa un código', 'error'); return; }
  buscarInsumoProv(code);
}

document.addEventListener('input', function(e) {
  if (e.target.id === 'prov-cantidad' && currentProvProduct >= 0) {
    const qty = parseInt(e.target.value) || 0;
    const p = db.products[currentProvProduct];
    if (p) {
      document.getElementById('prov-stock-nuevo').textContent = (p.stock + qty) + ' ' + p.unit;
    }
  }
});

function cancelarProv() {
  currentProvProduct = null;
  document.getElementById('prov-form-card').style.display = 'none';
  document.getElementById('prov-manual-code').value = '';
  document.getElementById('prov-nombre').value = '';
  document.getElementById('prov-factura').value = '';
  document.getElementById('prov-cantidad').value = '';
  document.getElementById('prov-vencimiento').value = '';
}

function confirmarRecepcion() {
  if (bloqueaPorSoloLectura()) return;
  if (currentProvProduct < 0) { showAlert('Escanea un insumo primero', 'error'); return; }

  const proveedor = document.getElementById('prov-nombre').value.trim();
  const factura = document.getElementById('prov-factura').value.trim();
  const cantidad = parseInt(document.getElementById('prov-cantidad').value);
  const vencimiento = document.getElementById('prov-vencimiento').value;

  if (!proveedor) { showAlert('Ingresa el nombre del proveedor', 'error'); return; }
  if (!factura) { showAlert('Ingresa el número de factura', 'error'); return; }
  if (!cantidad || cantidad <= 0) { showAlert('Ingresa una cantidad válida', 'error'); return; }

  const p = db.products[currentProvProduct];
  const prev = p.stock;
  p.stock += cantidad;

  // Register movement
  db.movements.push({
    id: genId(),
    productId: p.id,
    productName: p.name,
    code: p.code,
    type: 'entrada',
    qty: cantidad,
    prevStock: prev,
    newStock: p.stock,
    note: `Factura ${factura} · ${proveedor}${vencimiento ? ' · Vence: ' + vencimiento : ''}`,
    date: new Date().toISOString()
  });

  // Register in proveedores log
  provRecepciones.unshift({
    id: genId(),
    proveedor,
    factura,
    cantidad,
    vencimiento,
    productName: p.name,
    productCode: p.code,
    prevStock: prev,
    newStock: p.stock,
    unit: p.unit,
    date: new Date().toISOString()
  });

  save();
  saveProveedores();
  updateDashboard();
  renderInventory();
  renderMovements();
  renderProvHistorial();
  cancelarProv();
  showAlert(`✅ Recepción registrada · ${cantidad} ${p.unit} · Factura ${factura}`, 'success');
}

function renderProvHistorial() {
  const el = document.getElementById('prov-historial');
  if (!el) return;

  if (provRecepciones.length === 0) {
    el.innerHTML = '<div class="empty-state"><p>Sin recepciones registradas</p></div>';
    return;
  }

  el.innerHTML = provRecepciones.slice(0, 20).map(r => `
    <div style="padding:12px 0;border-bottom:1px solid rgba(30,58,95,0.4)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.productName}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">
            🏢 ${r.proveedor} · 📄 Fact. ${r.factura}
          </div>
          <div style="font-size:11px;color:var(--muted)">
            ${formatDate(r.date)}${r.vencimiento ? ' · Vence: ' + r.vencimiento : ''}
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-family:'Inter',sans-serif;font-size:18px;font-weight:700;color:var(--accent)">+${r.cantidad}</div>
          <div style="font-size:10px;color:var(--muted)">${r.unit}</div>
        </div>
      </div>
    </div>
  `).join('');
}

// ==================== REGISTRO DE PACIENTES ====================

let pacientesDB = JSON.parse(localStorage.getItem('dialistock_pacientes') || '[]');
let filtroActual = 'todos';

function savePacientes() {
  localStorage.setItem('dialistock_pacientes', JSON.stringify(pacientesDB));
}

function agregarPaciente() {
  if (bloqueaPorSoloLectura()) return;
  const nombre = document.getElementById('reg-nombre').value.trim();
  const tipo = document.getElementById('reg-tipo').value;
  const turno = document.getElementById('reg-turno').value;
  const grupo = document.getElementById('reg-grupo').value;
  const monitor = document.getElementById('reg-monitor').value;

  if (!nombre) { showAlert('Ingresa el nombre del paciente', 'error'); return; }

  const paciente = {
    id: genId(),
    nombre,
    tipo,
    turno,
    grupo,
    monitor: monitor || '-',
    fechaIngreso: new Date().toISOString(),
    activo: true
  };

  pacientesDB.push(paciente);
  savePacientes();

  // Clear form
  document.getElementById('reg-nombre').value = '';
  document.getElementById('reg-monitor').value = '';

  renderPacientesLista();
  showAlert(`✅ ${nombre} registrado · ${tipo} · Turno ${turno}`, 'success');

  // Update FAV/CVC counters
  sincronizarContadoresPacientes();
}

function eliminarPaciente(id) {
  if (bloqueaPorSoloLectura()) return;
  pacientesDB = pacientesDB.filter(p => p.id !== id);
  savePacientes();
  renderPacientesLista();
  sincronizarContadoresPacientes();
  showAlert('Paciente eliminado', 'info');
}

function togglePaciente(id) {
  const p = pacientesDB.find(p => p.id === id);
  if (p) {
    p.activo = !p.activo;
    savePacientes();
    renderPacientesLista();
    sincronizarContadoresPacientes();
  }
}

function filtrarPacientes(filtro) {
  filtroActual = filtro;
  // Update button styles
  ['todos','FAV','CVC'].forEach(f => {
    const btn = document.getElementById('fil-' + f.toLowerCase());
    if (btn) {
      btn.style.borderColor = f === filtro ? 'var(--accent)' : 'var(--border)';
      btn.style.color = f === filtro ? 'var(--accent)' : 'var(--muted)';
    }
  });
  renderPacientesLista();
}

function renderPacientesLista() {
  const lista = document.getElementById('pac-registro-lista');
  if (!lista) return;

  const sesionActual = document.getElementById('pac-sesion')?.value || 'Mañana';
  const grupoActual = document.getElementById('pac-grupo')?.value || 'A';

  let filtered = pacientesDB;
  if (filtroActual === 'FAV') filtered = pacientesDB.filter(p => p.tipo === 'FAV');
  if (filtroActual === 'CVC') filtered = pacientesDB.filter(p => p.tipo === 'CVC');

  if (filtered.length === 0) {
    lista.innerHTML = '<div class="empty-state"><p>Sin pacientes registrados.</p></div>';
    document.getElementById('pac-stats-box').style.display = 'none';
    return;
  }

  document.getElementById('pac-stats-box').style.display = 'grid';

  // Group by turno
  const turnos = ['Mañana', 'Tarde', 'Tarde Noche'];
  let html = '';

  turnos.forEach(turno => {
    const pacsTurno = filtered.filter(p => p.turno === turno);
    if (pacsTurno.length === 0) return;

    const icons = { 'Mañana': '🌅', 'Tarde': '🌆', 'Tarde Noche': '🌙' };
    html += `<div style="margin-bottom:14px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:8px;display:flex;align-items:center;gap:6px">
        <span>${icons[turno]}</span> ${turno} · ${pacsTurno.length} pacientes
      </div>`;

    pacsTurno.forEach(p => {
      const esFAV = p.tipo === 'FAV';
      const color = esFAV ? 'var(--accent)' : 'var(--accent2)';
      const bgColor = esFAV ? 'rgba(0,212,170,0.1)' : 'rgba(0,153,255,0.1)';
      const borderColor = esFAV ? 'rgba(0,212,170,0.3)' : 'rgba(0,153,255,0.3)';
      const icon = esFAV ? '💉' : '🩺';

      html += `
        <div style="display:flex;align-items:center;gap:12px;padding:12px;background:${p.activo ? bgColor : 'rgba(107,140,173,0.05)'};border:1px solid ${p.activo ? borderColor : 'var(--border)'};border-radius:12px;margin-bottom:8px;opacity:${p.activo ? '1' : '0.5'}">
          <div style="width:40px;height:40px;border-radius:12px;background:${bgColor};border:1px solid ${borderColor};display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">${icon}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.nombre}</div>
            <div style="display:flex;gap:6px;margin-top:3px;flex-wrap:wrap">
              <span style="font-size:10px;padding:2px 8px;border-radius:10px;background:${bgColor};color:${color};font-weight:700">${p.tipo}</span>
              <span style="font-size:10px;padding:2px 8px;border-radius:10px;background:rgba(107,140,173,0.1);color:var(--muted)">Monitor ${p.monitor}</span>
              <span style="font-size:10px;padding:2px 8px;border-radius:10px;background:rgba(107,140,173,0.1);color:var(--muted)">Grupo ${p.grupo}</span>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
            <button onclick="togglePaciente('${p.id}')" style="background:${p.activo ? 'rgba(0,212,170,0.15)' : 'rgba(107,140,173,0.1)'};border:1px solid ${p.activo ? 'rgba(0,212,170,0.3)' : 'var(--border)'};color:${p.activo ? 'var(--accent)' : 'var(--muted)'};border-radius:8px;padding:4px 8px;font-size:11px;cursor:pointer;font-weight:700">${p.activo ? '✓ Activo' : 'Ausente'}</button>
            <button onclick="eliminarPaciente('${p.id}')" style="background:rgba(255,71,87,0.1);border:1px solid rgba(255,71,87,0.2);color:var(--danger);border-radius:8px;padding:4px 8px;font-size:11px;cursor:pointer">🗑</button>
          </div>
        </div>`;
    });

    html += '</div>';
  });

  lista.innerHTML = html;

  // Update stats
  const total = pacientesDB.length;
  const favCount = pacientesDB.filter(p => p.tipo === 'FAV').length;
  const cvcCount = pacientesDB.filter(p => p.tipo === 'CVC').length;
  document.getElementById('stat-total-pac').textContent = total;
  document.getElementById('stat-fav-pac').textContent = favCount;
  document.getElementById('stat-cvc-pac').textContent = cvcCount;
}

function sincronizarContadoresPacientes() {
  // Sync FAV/CVC counters with registered patients for current session
  const sesion = document.getElementById('pac-sesion')?.value || 'Mañana';
  const grupo = document.getElementById('pac-grupo')?.value || 'A';

  const pacsActivos = pacientesDB.filter(p => p.activo && p.turno === sesion && p.grupo === grupo);
  if (pacsActivos.length > 0) {
    pacFav = pacsActivos.filter(p => p.tipo === 'FAV').length;
    pacCvc = pacsActivos.filter(p => p.tipo === 'CVC').length;
    const elFav = document.getElementById('pac-fav-count');
    const elCvc = document.getElementById('pac-cvc-count');
    if (elFav) elFav.textContent = pacFav;
    if (elCvc) elCvc.textContent = pacCvc;
    actualizarTotalSesion();
    calcularInsumos();
  }
}

