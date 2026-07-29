// ==================== CARRO DE PARO ====================
// Control del carro de emergencia: por cada insumo/medicamento se registra
// la "norma" (cantidad que debería haber siempre lista), la existencia
// real, lote y vencimiento — calculando el déficit automáticamente.
// Es una lista separada del inventario general (el carro de paro es un kit
// físico aparte, no parte del stock de bodega), inspirado en cómo lo maneja
// Dialinet (sistema chileno de gestión de diálisis).
let carroParoDB = [];

function cargarCarroParoLocal() {
  try {
    const raw = localStorage.getItem(lsKeyFor('ds_carro_paro'));
    carroParoDB = raw ? JSON.parse(raw) : [];
  } catch (e) {
    carroParoDB = [];
  }
}
cargarCarroParoLocal();

function guardarCarroParo() {
  localStorage.setItem(lsKeyFor('ds_carro_paro'), JSON.stringify(carroParoDB));
  if (!fbReady) return;
  clearTimeout(window._carroParoSyncTimeout);
  const path = fbPathFor('carro_paro');
  const data = JSON.stringify(carroParoDB);
  window._carroParoSyncTimeout = setTimeout(function () {
    fbDb.doc(path).set({
      data: data,
      updatedAtLocal: new Date().toISOString()
    }).catch(function (err) { console.warn('No se pudo sincronizar Carro de Paro:', err); });
  }, 800);
}

async function cargarCarroParoDesdeFirestore() {
  if (!fbReady) return;
  try {
    const snap = await fbDb.doc(fbPathFor('carro_paro')).get();
    if (!snap.exists) return;
    const remoto = snap.data();
    if (remoto && remoto.data) {
      const local = parseInt(localStorage.getItem(lsKeyFor('ds_carro_paro_last_save')) || '0');
      const remotoTs = remoto.updatedAtLocal ? new Date(remoto.updatedAtLocal).getTime() : 0;
      if (remotoTs >= local) {
        carroParoDB = JSON.parse(remoto.data);
        localStorage.setItem(lsKeyFor('ds_carro_paro'), JSON.stringify(carroParoDB));
      }
    }
  } catch (err) {
    console.warn('Error cargando Carro de Paro desde Firestore:', err);
  }
}

function poblarSelectorProductoCarroParo() {
  const sel = document.getElementById('caroparo-producto');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Seleccionar producto —</option>' +
    db.products.map(function (p) {
      return '<option value="' + p.id + '">' + p.emoji + ' ' + p.name + ' (' + p.code + ')</option>';
    }).join('');
}

function agregarItemCarroParo() {
  if (bloqueaPorSoloLectura()) return;
  const sel = document.getElementById('caroparo-producto');
  const normaInput = document.getElementById('caroparo-norma');
  const existInput = document.getElementById('caroparo-existencia');
  const loteInput = document.getElementById('caroparo-lote');
  const vencInput = document.getElementById('caroparo-vencimiento');

  const productId = sel.value;
  if (!productId) { showAlert('Selecciona un producto', 'error'); return; }
  const p = db.products.find(function (x) { return x.id === productId; });
  if (!p) return;

  const norma = parseInt(normaInput.value) || 0;
  if (norma <= 0) { showAlert('Ingresa la norma (cantidad que debería haber)', 'error'); return; }
  const existencia = parseInt(existInput.value) || 0;

  if (carroParoDB.some(function (item) { return item.productId === productId; })) {
    showAlert('Ese producto ya está en el Carro de Paro. Edítalo directamente en la lista.', 'info');
    return;
  }

  carroParoDB.push({
    id: genId(),
    productId: p.id,
    codigo: p.code,
    nombre: p.name,
    emoji: p.emoji,
    norma: norma,
    existencia: existencia,
    lote: loteInput.value.trim(),
    vencimiento: vencInput.value || ''
  });

  guardarCarroParo();
  normaInput.value = '';
  existInput.value = '';
  loteInput.value = '';
  vencInput.value = '';
  sel.value = '';
  renderCarroParo();
  showAlert('✅ ' + p.name + ' agregado al Carro de Paro', 'success');
}

function actualizarCampoCarroParo(id, campo, valor) {
  if (bloqueaPorSoloLectura()) return;
  const item = carroParoDB.find(function (x) { return x.id === id; });
  if (!item) return;
  if (campo === 'norma' || campo === 'existencia') {
    item[campo] = Math.max(0, parseInt(valor) || 0);
  } else {
    item[campo] = valor;
  }
  guardarCarroParo();
  renderCarroParo();
}

function eliminarItemCarroParo(id) {
  if (bloqueaPorSoloLectura()) return;
  if (!confirm('¿Quitar este producto del Carro de Paro?')) return;
  carroParoDB = carroParoDB.filter(function (x) { return x.id !== id; });
  guardarCarroParo();
  renderCarroParo();
}

function renderCarroParo() {
  poblarSelectorProductoCarroParo();
  const lista = document.getElementById('caroparo-lista');
  if (!lista) return;

  if (!carroParoDB.length) {
    lista.innerHTML = '<div class="empty-state" data-icon="🚨"><p>Sin productos registrados en el Carro de Paro</p><small>Agrega los medicamentos e insumos que siempre deben estar listos para una emergencia</small></div>';
    actualizarAlertaCarroParoDashboard();
    return;
  }

  const hoy = new Date();
  const en30 = new Date(); en30.setDate(en30.getDate() + 30);

  lista.innerHTML = carroParoDB.map(function (item) {
    const deficit = Math.max(0, item.norma - item.existencia);
    const ok = deficit === 0;
    let vencAlerta = '';
    if (item.vencimiento) {
      const v = new Date(item.vencimiento);
      if (v < hoy) vencAlerta = '🔴 Vencido';
      else if (v <= en30) vencAlerta = '🟡 Vence pronto';
    }
    const borderColor = !ok ? 'var(--danger)' : vencAlerta ? '#f57c00' : 'var(--border)';
    const bg = !ok ? 'rgba(229,57,53,0.04)' : vencAlerta ? 'rgba(245,124,0,0.04)' : 'var(--surface)';

    return '<div style="padding:11px;background:' + bg + ';border:1.5px solid ' + borderColor + ';border-radius:12px;margin-bottom:8px">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px">' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:13px;font-weight:700">' + item.emoji + ' ' + item.nombre + '</div>' +
          '<div style="font-size:10px;color:var(--muted);font-family:monospace">' + item.codigo + '</div>' +
        '</div>' +
        '<div style="text-align:right;flex-shrink:0">' +
          (ok ?
            '<span style="font-size:11px;font-weight:700;color:var(--accent)">✅ OK</span>' :
            '<span style="font-family:\'Inter\',sans-serif;font-size:15px;font-weight:800;color:var(--danger)">-' + deficit + '</span><div style="font-size:9px;color:var(--danger)">déficit</div>'
          ) +
        '</div>' +
        '<button onclick="eliminarItemCarroParo(\'' + item.id + '\')" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:16px;padding:0 2px">×</button>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px">' +
        '<div>' +
          '<div style="font-size:9px;color:var(--muted);text-transform:uppercase;margin-bottom:3px">Norma</div>' +
          '<input type="number" min="0" value="' + item.norma + '" onchange="actualizarCampoCarroParo(\'' + item.id + '\',\'norma\',this.value)" style="width:100%;padding:6px 4px;border:1.5px solid var(--border);border-radius:8px;font-size:12px;text-align:center;background:var(--surface);color:var(--text)">' +
        '</div>' +
        '<div>' +
          '<div style="font-size:9px;color:var(--muted);text-transform:uppercase;margin-bottom:3px">Existencia</div>' +
          '<input type="number" min="0" value="' + item.existencia + '" onchange="actualizarCampoCarroParo(\'' + item.id + '\',\'existencia\',this.value)" style="width:100%;padding:6px 4px;border:1.5px solid ' + (ok ? 'var(--border)' : 'var(--danger)') + ';border-radius:8px;font-size:12px;text-align:center;background:var(--surface);color:var(--text)">' +
        '</div>' +
        '<div>' +
          '<div style="font-size:9px;color:var(--muted);text-transform:uppercase;margin-bottom:3px">Lote</div>' +
          '<input type="text" value="' + (item.lote || '') + '" onchange="actualizarCampoCarroParo(\'' + item.id + '\',\'lote\',this.value)" style="width:100%;padding:6px 4px;border:1.5px solid var(--border);border-radius:8px;font-size:11px;text-align:center;background:var(--surface);color:var(--text)">' +
        '</div>' +
        '<div>' +
          '<div style="font-size:9px;color:var(--muted);text-transform:uppercase;margin-bottom:3px">Vencimiento</div>' +
          '<input type="date" value="' + (item.vencimiento || '') + '" onchange="actualizarCampoCarroParo(\'' + item.id + '\',\'vencimiento\',this.value)" style="width:100%;padding:5px 2px;border:1.5px solid var(--border);border-radius:8px;font-size:10px;text-align:center;background:var(--surface);color:var(--text)">' +
        '</div>' +
      '</div>' +
      (vencAlerta ? '<div style="font-size:10px;font-weight:700;color:' + (vencAlerta.indexOf('🔴') === 0 ? 'var(--danger)' : '#f57c00') + ';margin-top:6px">' + vencAlerta + '</div>' : '') +
    '</div>';
  }).join('');

  actualizarAlertaCarroParoDashboard();
}

// Alerta compacta en el Dashboard — solo visible si hay algo que revisar,
// dado que esto es seguridad clínica (carro de emergencia) y no debería
// pasar desapercibido enterrado en una sub-pestaña.
function actualizarAlertaCarroParoDashboard() {
  const card = document.getElementById('carroparo-dashboard-card');
  const list = document.getElementById('carroparo-dashboard-list');
  if (!card || !list) return;

  const hoy = new Date();
  const en30 = new Date(); en30.setDate(en30.getDate() + 30);

  const problemas = carroParoDB.filter(function (item) {
    const deficit = item.norma - item.existencia;
    const vencido = item.vencimiento && new Date(item.vencimiento) < hoy;
    const vencePronto = item.vencimiento && new Date(item.vencimiento) >= hoy && new Date(item.vencimiento) <= en30;
    return deficit > 0 || vencido || vencePronto;
  });

  if (!problemas.length) { card.style.display = 'none'; return; }

  card.style.display = 'block';
  list.innerHTML = problemas.slice(0, 5).map(function (item) {
    const deficit = Math.max(0, item.norma - item.existencia);
    const vencido = item.vencimiento && new Date(item.vencimiento) < hoy;
    let etiqueta = '';
    if (deficit > 0) etiqueta = 'Faltan ' + deficit;
    else if (vencido) etiqueta = '🔴 Vencido';
    else etiqueta = '🟡 Vence pronto';
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">' +
      '<div style="font-size:11px;font-weight:600;color:var(--text);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + item.emoji + ' ' + item.nombre + '</div>' +
      '<div style="font-size:10px;font-weight:700;color:var(--danger);margin-left:8px;white-space:nowrap">' + etiqueta + '</div>' +
    '</div>';
  }).join('');
}

async function exportarCarroParoExcel() {
  if (!carroParoDB.length) { showAlert('El Carro de Paro está vacío', 'error'); return; }
  showAlert('Generando Excel...', 'info');

  const DAVITA_BLUE = 'FF0057A8', RED = 'FFC8102E', WHITE = 'FFFFFFFF';
  const centroInfo = (typeof getCentroInfo === 'function') ? getCentroInfo() : { nombre: 'Independencia', codigo: 'C7848' };
  const fechaHoy = new Date().toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' });

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Carro de Paro');
  ws.columns = [{ width: 14 }, { width: 42 }, { width: 10 }, { width: 12 }, { width: 10 }, { width: 14 }, { width: 14 }, { width: 14 }];

  ws.mergeCells('A1:H1');
  ws.getCell('A1').value = 'CARRO DE PARO · DIALISTOCK';
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: WHITE } };
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DAVITA_BLUE } };
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 26;

  ws.mergeCells('A2:H2');
  ws.getCell('A2').value = 'DaVita Chile · Centro ' + centroInfo.nombre + ' ' + centroInfo.codigo + ' · ' + fechaHoy;
  ws.getCell('A2').font = { bold: true, size: 10, color: { argb: WHITE } };
  ws.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DAVITA_BLUE } };
  ws.getCell('A2').alignment = { horizontal: 'center' };

  const headers = ['Código', 'Nombre', 'Norma', 'Existencia', 'Déficit', 'Lote', 'Vencimiento', 'Estado'];
  const headerRow = ws.getRow(4);
  headers.forEach(function (h, i) {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: WHITE }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DAVITA_BLUE } };
    cell.alignment = { horizontal: 'center' };
  });

  const hoy = new Date();
  carroParoDB.forEach(function (item, i) {
    const r = 5 + i;
    const deficit = Math.max(0, item.norma - item.existencia);
    const vencido = item.vencimiento && new Date(item.vencimiento) < hoy;
    const estado = deficit > 0 ? 'FALTANTE' : vencido ? 'VENCIDO' : 'OK';
    const bg = (deficit > 0 || vencido) ? 'FFFDE8E8' : 'FFEAFAF1';
    const vals = [item.codigo, item.nombre, item.norma, item.existencia, deficit, item.lote || '', item.vencimiento || '', estado];
    vals.forEach(function (v, ci) {
      const cell = ws.getRow(r).getCell(ci + 1);
      cell.value = v;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.font = { size: 10, bold: ci === 7, color: (deficit > 0 || vencido) ? { argb: RED } : undefined };
      cell.alignment = { horizontal: ci >= 2 && ci <= 4 ? 'center' : 'left' };
    });
  });

  ws.views = [{ state: 'frozen', ySplit: 4 }];
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  saveAs(blob, 'CarroDeParo_' + new Date().toISOString().slice(0, 10) + '.xlsx');
  showAlert('✅ Carro de Paro exportado', 'success');
}
// ==================== /CARRO DE PARO ====================
