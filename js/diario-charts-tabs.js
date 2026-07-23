// ==================== DIARIO DYNAMICS ====================
let diarioDB = JSON.parse(localStorage.getItem('ds_diario') || '[]');

function saveDiario() { localStorage.setItem('ds_diario', JSON.stringify(diarioDB)); }

// Compara el consumo de hoy de cada producto en el diario contra su
// promedio histórico diario para detectar posibles errores de digitación
// antes de cargar a Dynamics. La lógica pura vive en calculo-pedido.js →
// detectarAnomalias() (así se puede testear con node --test — ver
// test/calculo-pedido.test.js); aquí solo se conectan los datos reales.
function detectarAnomaliasDiario() {
  const hoyStr = new Date().toLocaleDateString('es-CL');
  return CalculoPedido.detectarAnomalias(diarioDB, db.movements, hoyStr);
}

function renderDiario() {
  // Populate product select
  var sel = document.getElementById('diario-producto');
  if (sel) {
    var cur = sel.value;
    sel.innerHTML = '<option value="">— Seleccionar o escanear QR —</option>' +
      db.products.map(function(p) {
        return '<option value="' + p.id + '">' + p.name + ' (' + p.code + ')</option>';
      }).join('');
    sel.value = cur;
  }

  var lista = document.getElementById('diario-lista');
  if (!lista) return;

  // Update stats
  var totalQty = diarioDB.reduce(function(s, d) { return s + d.qty; }, 0);
  var countEl = document.getElementById('diario-count');
  var qtyEl = document.getElementById('diario-total-qty');
  if (countEl) countEl.textContent = diarioDB.length;
  if (qtyEl) qtyEl.textContent = totalQty;

  if (!diarioDB.length) {
    lista.innerHTML = '<div class="empty-state"><p>Sin insumos registrados hoy.<br>Escanea un QR o agrega manualmente.</p></div>';
    return;
  }

  var anomalias = detectarAnomaliasDiario();
  var codigosAnomalos = {};
  anomalias.forEach(function (a) { codigosAnomalos[a.codigo] = a; });

  lista.innerHTML = diarioDB.map(function(d, i) {
    var anomalia = codigosAnomalos[d.codigo];
    var borderColor = anomalia ? '#f57c00' : 'var(--border)';
    var bg = anomalia ? 'rgba(245,124,0,0.05)' : 'transparent';
    return '<div style="padding:9px 6px;background:' + bg + ';border-bottom:1.5px solid ' + borderColor + '">' +
      '<div style="display:flex;align-items:center;gap:10px">' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (anomalia ? '⚠️ ' : '') + d.nombre + '</div>' +
        '<div style="font-size:10px;color:var(--muted);font-family:monospace">' + d.codigo + (d.lote ? ' · Lote: ' + d.lote : '') + '</div>' +
      '</div>' +
      '<div style="text-align:right;flex-shrink:0">' +
        '<div style="font-family:monospace;font-size:14px;font-weight:700;color:var(--danger)">-' + d.qty + '</div>' +
        '<div style="font-size:10px;color:var(--muted)">' + d.unidad + '</div>' +
      '</div>' +
      '<button onclick="eliminarDiario(' + i + ')" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:16px;padding:4px">×</button>' +
      '</div>' +
      (anomalia ? '<div style="font-size:10px;color:#f57c00;margin-top:4px;padding-left:2px">Fuera de lo normal · promedio diario: ' + anomalia.promedio + ' un.</div>' : '') +
    '</div>';
  }).join('');
}

function agregarDiario() {
  if (bloqueaPorSoloLectura()) return;
  var pid = document.getElementById('diario-producto').value;
  var qty = parseInt(document.getElementById('diario-qty').value) || 0;
  var lote = document.getElementById('diario-lote').value.trim();

  if (!pid) { showAlert('Selecciona un producto', 'error'); return; }
  if (!qty || qty <= 0) { showAlert('Ingresa una cantidad válida', 'error'); return; }

  var p = db.products.find(function(x) { return x.id === pid; });
  if (!p) return;

  if (qty > p.stock) {
    showAlert('Stock insuficiente (' + p.stock + ' ' + p.unit + ')', 'error');
    return;
  }

  // Check if already in diario - accumulate
  var existing = diarioDB.find(function(d) { return d.productId === pid; });
  if (existing) {
    existing.qty += qty;
  } else {
    diarioDB.push({
      id: genId(),
      productId: pid,
      codigo: p.code,
      nombre: p.name,
      qty: qty,
      lote: lote,
      unidad: 'UNIDAD',
      fecha: new Date().toLocaleDateString('es-CL')
    });
  }

  // Descontar stock real de DialiStock y dejar registro en Movimientos,
  // igual que cualquier otra salida (antes esto solo quedaba en el diario
  // interno, sin afectar el stock ni aparecer en el historial).
  var prev = p.stock;
  p.stock = Math.max(0, p.stock - qty);
  db.movements.push({
    id: genId(),
    productId: p.id,
    productName: p.name,
    code: p.code,
    type: 'salida',
    qty: qty,
    prevStock: prev,
    newStock: p.stock,
    note: 'Diario consumo' + (lote ? ' · Lote: ' + lote : ''),
    date: new Date().toISOString()
  });
  save();

  saveDiario();
  document.getElementById('diario-qty').value = '';
  document.getElementById('diario-lote').value = '';
  renderDiario();
  updateDashboard();
  showAlert('+' + qty + ' ' + p.name + ' agregado al diario', 'success');
}

function eliminarDiario(idx) {
  if (bloqueaPorSoloLectura()) return;
  var entry = diarioDB[idx];
  if (!entry) return;
  // Restaurar el stock que se había descontado al agregar esta entrada,
  // y dejar registro de la reversión en Movimientos.
  var p = db.products.find(function(x) { return x.id === entry.productId; });
  if (p) {
    var prev = p.stock;
    p.stock += entry.qty;
    db.movements.push({
      id: genId(),
      productId: p.id,
      productName: p.name,
      code: p.code,
      type: 'entrada',
      qty: entry.qty,
      prevStock: prev,
      newStock: p.stock,
      note: 'Reversión · eliminado de Diario',
      date: new Date().toISOString()
    });
    save();
  }
  diarioDB.splice(idx, 1);
  saveDiario();
  renderDiario();
  updateDashboard();
}

function limpiarDiario() {
  if (bloqueaPorSoloLectura()) return;
  if (!confirm('¿Limpiar el diario del día? Esta acción no se puede deshacer.\n\nEsto restaurará el stock descontado por estas entradas.')) return;
  diarioDB.forEach(function(entry) {
    var p = db.products.find(function(x) { return x.id === entry.productId; });
    if (!p) return;
    var prev = p.stock;
    p.stock += entry.qty;
    db.movements.push({
      id: genId(),
      productId: p.id,
      productName: p.name,
      code: p.code,
      type: 'entrada',
      qty: entry.qty,
      prevStock: prev,
      newStock: p.stock,
      note: 'Reversión · diario limpiado',
      date: new Date().toISOString()
    });
  });
  save();
  diarioDB = [];
  saveDiario();
  renderDiario();
  updateDashboard();
  showAlert('Diario limpiado · stock restaurado', 'success');
}

function agregarDiarioDesdeQR(productId, qty) {
  var p = db.products.find(function(x) { return x.id === productId; });
  if (!p) return;
  var existing = diarioDB.find(function(d) { return d.productId === productId; });
  if (existing) {
    existing.qty += qty;
  } else {
    diarioDB.push({
      id: genId(),
      productId: productId,
      codigo: p.code,
      nombre: p.name,
      qty: qty,
      lote: '',
      unidad: 'UNIDAD',
      fecha: new Date().toLocaleDateString('es-CL')
    });
  }
  saveDiario();
}

function exportarDiarioDynamics() {
  if (!diarioDB.length) { showAlert('El diario está vacío', 'error'); return; }

  var anomalias = detectarAnomaliasDiario();
  if (anomalias.length) {
    var detalle = anomalias.map(function (a) {
      return '• ' + a.nombre + ': hoy ' + a.qty + ' un. (promedio ' + a.promedio + ' un./día)';
    }).join('\n');
    var continuar = confirm(
      '⚠️ ' + anomalias.length + ' producto' + (anomalias.length > 1 ? 's' : '') + ' con consumo fuera de lo normal hoy:\n\n' +
      detalle +
      '\n\nRevisa que no sea un error de digitación antes de cargar a Dynamics.\n\n¿Continuar de todas formas con la exportación?'
    );
    if (!continuar) return;
  }

  var ndoc = document.getElementById('diario-ndoc').value || 'C7848-00000419';
  var almacen = document.getElementById('diario-almacen').value || '7848';
  var ubicacion = document.getElementById('diario-ubicacion').value || '300.0';
  var location = document.getElementById('diario-location').value || '7848';
  var modality = document.getElementById('diario-modality').value || '300';
  var department = document.getElementById('diario-department').value || '400';
  var fecha = new Date().toLocaleDateString('es-CL').split('/').reverse().join('-');
  // Format: DD-MM-YYYY -> YYYY-MM-DD for Excel
  var fechaArr = new Date().toLocaleDateString('es-CL').split('/');
  var fechaExcel = fechaArr[2] + '-' + fechaArr[1].padStart(2,'0') + '-' + fechaArr[0].padStart(2,'0');

  var headers = [
    'Fecha registro', 'Tipo mov.', 'Nº documento', 'Nº producto',
    'Descripción', 'Cód. almacén', 'Cód. ubicación',
    'Cantidad', 'Nº lote', 'Fecha caducidad', 'Location Code',
    'Modality Code', 'Department Code', 'Cód. unidad medida'
  ];

  var rows = diarioDB.map(function(d) {
    return [
      fechaExcel,
      'Ajuste negativo',
      ndoc,
      d.codigo,
      d.nombre,
      almacen,
      ubicacion,
      d.qty,
      d.lote || '',
      '',
      location,
      modality,
      department,
      'UNIDAD'
    ];
  });

  var ws = XLSX.utils.aoa_to_sheet([headers].concat(rows));
  ws['!cols'] = [
    {wch:14},{wch:16},{wch:18},{wch:14},{wch:45},
    {wch:12},{wch:14},{wch:10},{wch:12},{wch:14},
    {wch:14},{wch:14},{wch:16},{wch:18}
  ];

  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Diario productos');
  var nombreArchivo = 'DiarioDynamics_' + fechaExcel + '_' + ndoc + '.xlsx';
  XLSX.writeFile(wb, nombreArchivo);
  showAlert('Diario exportado: ' + diarioDB.length + ' líneas', 'success');
}

// ==================== CHARTS ====================
function renderCharts() {
  renderChartStock();
  renderChartTopProducts();
  renderChartWeekly();
}

function renderChartStock() {
  const el = document.getElementById('chart-stock');
  if (!el) return;
  if (!db.products.length) {
    el.innerHTML = '<div class="empty-state"><p>Sin productos registrados</p></div>';
    return;
  }
  // Show top 8 products by criticality
  const sorted = db.products
    .filter(p => p.minStock > 0)
    .map(p => ({ ...p, pct: Math.round((p.stock / p.minStock) * 100) }))
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 8);

  if (!sorted.length) {
    el.innerHTML = '<div class="empty-state"><p>Sin datos de stock mínimo</p></div>';
    return;
  }

  el.innerHTML = sorted.map(p => {
    const pct = Math.min(p.pct, 200);
    const color = p.stock <= 0 ? '#ef4444' : p.stock <= p.minStock ? '#f57c00' : '#0099cc';
    const label = p.stock <= 0 ? 'SIN STOCK' : p.stock <= p.minStock ? 'BAJO' : 'OK';
    const barW = Math.min(100, Math.max(0, (p.stock / (p.minStock * 2)) * 100));
    return `<div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <div style="font-size:11px;color:var(--text);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;margin-left:8px">
          <span style="font-family:monospace;font-size:11px;color:var(--muted)">${p.stock}/${p.minStock}</span>
          <span style="font-size:9px;font-weight:700;color:${color};background:${color}18;border:1px solid ${color}30;border-radius:20px;padding:2px 6px">${label}</span>
        </div>
      </div>
      <div style="background:var(--surface2);border-radius:4px;height:8px;overflow:hidden">
        <div style="height:100%;border-radius:4px;background:${color};width:${barW}%;transition:width .5s ease"></div>
      </div>
      <div style="font-size:9px;color:var(--muted);margin-top:2px">Mínimo: ${p.minStock} ${p.unit}</div>
    </div>`;
  }).join('');
}

function renderChartTopProducts() {
  const el = document.getElementById('chart-topproducts');
  if (!el) return;

  // Get current month movements
  const now = new Date();
  const monthMovs = db.movements.filter(m => {
    const d = new Date(m.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && m.type === 'salida';
  });

  if (!monthMovs.length) {
    el.innerHTML = '<div class="empty-state"><p>Sin movimientos este mes</p></div>';
    return;
  }

  // Aggregate by product
  const agg = {};
  monthMovs.forEach(m => {
    if (!agg[m.productId]) agg[m.productId] = { name: m.productName, qty: 0 };
    agg[m.productId].qty += m.qty;
  });

  const top = Object.values(agg).sort((a,b) => b.qty - a.qty).slice(0, 6);
  const maxVal = top[0]?.qty || 1;

  el.innerHTML = top.map((p, i) => {
    const pct = Math.round((p.qty / maxVal) * 100);
    const colors = ['#0099cc','#0077aa','#005580','#f57c00','#e65100','#ef4444'];
    const color = colors[i] || '#0099cc';
    const medals = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣'];
    return `<div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
        <div style="font-size:11px;color:var(--text);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${medals[i]} ${p.name}</div>
        <div style="font-family:monospace;font-size:12px;font-weight:700;color:${color};margin-left:8px;flex-shrink:0">${p.qty.toLocaleString('es-CL')} un.</div>
      </div>
      <div style="background:var(--surface2);border-radius:4px;height:10px;overflow:hidden">
        <div style="height:100%;border-radius:4px;background:${color};width:${pct}%;transition:width .6s ease"></div>
      </div>
    </div>`;
  }).join('');
}

function renderChartWeekly() {
  const el = document.getElementById('chart-weekly');
  if (!el) return;

  // Get last 7 days
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({
      label: d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric' }),
      date: d.toLocaleDateString('es-CL'),
      total: 0
    });
  }

  // Count movements per day
  db.movements.filter(m => m.type === 'salida').forEach(m => {
    const movDate = new Date(m.date).toLocaleDateString('es-CL');
    const day = days.find(d => d.date === movDate);
    if (day) day.total += m.qty;
  });

  const maxVal = Math.max(...days.map(d => d.total), 1);

  if (days.every(d => d.total === 0)) {
    el.innerHTML = '<div class="empty-state"><p>Sin movimientos en los últimos 7 días</p></div>';
    return;
  }

  el.innerHTML = `
    <div style="display:flex;align-items:flex-end;gap:6px;height:80px;margin-bottom:8px">
      ${days.map(d => {
        const h = Math.max(4, Math.round((d.total / maxVal) * 72));
        const isToday = d.date === new Date().toLocaleDateString('es-CL');
        return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px">
          <div style="font-size:10px;font-family:monospace;color:var(--muted)">${d.total || ''}</div>
          <div style="width:100%;height:${h}px;background:${isToday ? '#0099cc' : 'rgba(0,153,204,0.35)'};border-radius:4px 4px 0 0;transition:height .5s ease"></div>
        </div>`;
      }).join('')}
    </div>
    <div style="display:flex;gap:6px">
      ${days.map(d => {
        const isToday = d.date === new Date().toLocaleDateString('es-CL');
        return `<div style="flex:1;text-align:center;font-size:9px;color:${isToday ? '#0099cc' : 'var(--muted)'};font-weight:${isToday ? '700' : '400'}">${d.label}</div>`;
      }).join('')}
    </div>`;
}

// ==================== DIARIO TABS ====================
function switchDiarioTab(tab) {
  ['scanner','diario','config'].forEach(function(t) {
    var el = document.getElementById('diario-tab-' + t);
    var btn = document.getElementById('diario-tab-btn-' + t);
    if (el) el.style.display = t === tab ? 'block' : 'none';
    if (btn) {
      btn.style.background = t === tab ? 'var(--accent)' : 'transparent';
      btn.style.color = t === tab ? '#fff' : 'var(--muted)';
      btn.style.borderColor = t === tab ? 'var(--accent)' : 'var(--border)';
    }
  });
  if (tab === 'diario') renderDiario();
}

// After QR scan - add to diario automatically
var _origOnQRCode = null;

// ==================== INVENTORY TABS ====================
function switchInvTab(tab) {
  ['lista','fisico'].forEach(function(t) {
    var el = document.getElementById('inv-tab-' + t);
    var btn = document.getElementById('inv-tab-btn-' + t);
    if (el) el.style.display = t === tab ? 'block' : 'none';
    if (btn) {
      btn.style.background = t === tab ? 'var(--accent)' : 'transparent';
      btn.style.color = t === tab ? '#fff' : 'var(--muted)';
      btn.style.borderColor = t === tab ? 'var(--accent)' : 'var(--border)';
    }
  });
}

// ==================== DARK MODE ====================
