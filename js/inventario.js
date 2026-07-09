// ==================== INVENTORY ====================
function renderInventory(filter = '') {
  const list = document.getElementById('inventory-list');
  const items = db.products.filter(p =>
    p.name.toLowerCase().includes(filter.toLowerCase()) ||
    p.code.toLowerCase().includes(filter.toLowerCase())
  );

  if (items.length === 0) {
    list.innerHTML = '<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/><path d="M16 3H8l-2 4h12l-2-4z"/></svg><p>Sin resultados</p></div>';
    return;
  }

  list.innerHTML = items.map(p => {
    const idx = db.products.indexOf(p);
    const cls = p.stock === 0 ? 'stock-out' : p.stock <= p.minStock ? 'stock-low' : 'stock-ok';
    return `
      <div class="product-item" onclick="openDetailModal(${idx})">
        <div class="product-icon">${p.emoji}</div>
        <div class="product-info">
          <div class="product-name">${p.name}</div>
          <div class="product-code">${p.code} · ${p.category}</div>
        </div>
        <div class="product-stock">
          <div class="stock-number ${cls}">${p.stock}</div>
          <div class="stock-unit">${p.unit}</div>
        </div>
      </div>
    `;
  }).join('');
}

function filterInventory(val) { renderInventory(val); }

// ==================== MOVEMENTS LOG ====================
function renderMovements() {
  const list = document.getElementById('movements-list');
  const all = db.movements.slice().reverse();
  if (all.length === 0) {
    list.innerHTML = '<div class="empty-state" data-icon="📋"><p>Sin movimientos</p><small>Registra el primer movimiento con el escáner</small></div>';
    return;
  }
  list.innerHTML = all.map(m => `
    <div class="movement-item">
      <div class="movement-dot ${m.type}">${m.type === 'entrada' ? '📥' : m.type === 'devolucion' ? '🔄' : '📤'}</div>
      <div class="movement-info">
        <div class="movement-name">${m.productName}</div>
        <div class="movement-time">${formatDate(m.date)}${m.note ? ' · ' + m.note : ''}${m.type === 'devolucion' ? ' <span style="color:#f57c00;font-size:10px;font-weight:700">DEVOLUCIÓN SALA</span>' : ''}</div>
      </div>
      <div class="movement-qty ${m.type}">${m.type === 'salida' ? '-' : '+'}${m.qty}</div>
    </div>
  `).join('');
}

// ==================== ADD PRODUCT ====================
// ==================== AUTO EMOJI ====================
const categoryEmojiMap = {
  'Diálisis': '🏥',
  'Acceso Vascular': '🩸',
  'Farmacia': '💊',
  'Soluciones': '💧',
  'Concentrados': '🧪',
  'Protección Personal': '🧤',
  'Limpieza y Desinfección': '🧽',
  'Curaciones': '🩹',
  'Descartables': '🗑️',
  'General': '📦'
};

// Map keywords in product name to emoji
const nameEmojiMap = [
  { keys: ['jeringa','aguja','avf','fistula'], emoji: '💉' },
  { keys: ['heparina','anticoag','warfar'], emoji: '🧬' },
  { keys: ['guante','vinilo','latex','nitrilo'], emoji: '🧤' },
  { keys: ['mascarilla','barbijo','epp','protec'], emoji: '😷' },
  { keys: ['solucion','sodio','cloruro','agua'], emoji: '💧' },
  { keys: ['concentrado','acido','bicarb'], emoji: '🧪' },
  { keys: ['bibag','dializador','filtro','linea'], emoji: '🏥' },
  { keys: ['apósito','aposito','vendaje','gasa','cura'], emoji: '🩹' },
  { keys: ['alcohol','antisep','gel','jabón','jabon'], emoji: '🧴' },
  { keys: ['paño','pano','toalla','limpi'], emoji: '🧽' },
  { keys: ['tapa','cap','conector','adaptador'], emoji: '🏷️' },
  { keys: ['medicamento','pastilla','capsula','comprim'], emoji: '💊' },
  { keys: ['ampolla','vial','inyect'], emoji: '🩺' },
];

function autoEmojiByCategory() {
  const cat = document.getElementById('new-category').value;
  const name = (document.getElementById('new-name').value || '').toLowerCase();
  let emoji = categoryEmojiMap[cat] || '📦';
  // Check name keywords first (more specific)
  for (const entry of nameEmojiMap) {
    if (entry.keys.some(k => name.includes(k))) { emoji = entry.emoji; break; }
  }
  const sel = document.getElementById('new-emoji');
  if (sel) {
    // Try to find exact match in options
    const opt = Array.from(sel.options).find(o => o.value === emoji);
    if (opt) sel.value = emoji;
  }
  updateEmojiPreview();
}

function updateEmojiPreview() {
  const sel = document.getElementById('new-emoji');
  const prev = document.getElementById('emoji-preview');
  if (!sel || !prev) return;
  prev.textContent = sel.value;
  prev.style.display = 'block';
}

// Auto-detect emoji when typing product name
document.addEventListener('DOMContentLoaded', () => {
  const nameInput = document.getElementById('new-name');
  if (nameInput) nameInput.addEventListener('input', autoEmojiByCategory);
});

function addProduct() {
  if (bloqueaPorSoloLectura()) return;
  const name = document.getElementById('new-name').value.trim();
  const code = document.getElementById('new-code').value.trim().toUpperCase();
  const category = document.getElementById('new-category').value;
  const stock = parseInt(document.getElementById('new-stock').value) || 0;
  const minStock = CalculoPedido.numeroODefault(document.getElementById('new-min').value, 5);
  const unit = document.getElementById('new-unit').value;
  const emoji = document.getElementById('new-emoji').value;

  if (!name || !code) { showAlert('Nombre y código son obligatorios', 'error'); return; }
  if (db.products.find(p => p.code === code)) { showAlert('Código ya existe', 'error'); return; }

  const vencimiento = document.getElementById('new-vencimiento')?.value || '';
  const newProductId = genId();
  db.products.push({ id: newProductId, code, name, category, stock, minStock, unit, emoji });
  db.products.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }));
  if (vencimiento) {
    lotesDB.push({ id: genId(), productId: newProductId, productName: name, code, lote: 'Inicial', qty: stock, vencimiento, registrado: new Date().toISOString() });
    saveLotes();
  }
  save();
  showAlert('✅ ' + name + ' registrado', 'success');

  document.getElementById('new-name').value = '';
  document.getElementById('new-stock').value = '';
  document.getElementById('new-min').value = '';
  autoCode();
  updateDashboard();
}

// ==================== SCANNER ====================
async function toggleScanner() {
  if (scannerActive) {
    stopScanner();
  } else {
    startScanner();
  }
}

async function startScanner() {
  document.getElementById('scanner-status').textContent = 'Iniciando cámara...';
  document.getElementById('scanner-status').className = 'scanner-status scanning';
  document.getElementById('scanner-toggle-btn').textContent = '⏹ Detener Escáner';

  try {
    html5QrCode = new Html5Qrcode("qr-reader");
    await html5QrCode.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 200, height: 200 }, aspectRatio: 1.0 },
      onScanSuccess,
      onScanError
    );
    scannerActive = true;
    document.getElementById('scanner-overlay').style.display = 'flex';
    document.getElementById('scanner-status').textContent = '🟢 Escaneando... apunta al código QR';
  } catch (err) {
    document.getElementById('scanner-status').textContent = '❌ Sin acceso a la cámara. Usa el ingreso manual.';
    document.getElementById('scanner-status').className = 'scanner-status';
    document.getElementById('scanner-toggle-btn').innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9V6a3 3 0 013-3h3M15 3h3a3 3 0 013 3v3M3 15v3a3 3 0 003 3h3m6 0h3a3 3 0 003-3v-3"/></svg> Iniciar Escáner';
    scannerActive = false;
  }
}

function stopScanner() {
  if (html5QrCode && scannerActive) {
    html5QrCode.stop().catch(() => {});
    scannerActive = false;
  }
  document.getElementById('scanner-overlay').style.display = 'none';
  document.getElementById('scanner-status').textContent = 'Toca "Iniciar" para activar la cámara';
  document.getElementById('scanner-status').className = 'scanner-status';
  document.getElementById('scanner-toggle-btn').innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9V6a3 3 0 013-3h3M15 3h3a3 3 0 013 3v3M3 15v3a3 3 0 003 3h3m6 0h3a3 3 0 003-3v-3"/></svg> Iniciar Escáner';
}

function onScanSuccess(decodedText) {
  stopScanner();
  processCode(decodedText.trim().toUpperCase());
}

function onScanError() {} // Silent

function processManualCode() {
  const code = document.getElementById('manual-code').value.trim().toUpperCase();
  if (!code) { showAlert('Ingresa un código', 'error'); return; }
  processCode(code);
}

function processCode(code) {
  const idx = db.products.findIndex(p => p.code === code);
  if (idx === -1) {
    showAlert('Código no encontrado: ' + code, 'error');
    return;
  }
  openMovementModal(idx);
}

// ==================== MOVEMENT MODAL ====================
function openMovementModal(idx) {
  currentProductIndex = idx;
  const p = db.products[idx];
  document.getElementById('modal-product-name').textContent = p.name;
  document.getElementById('modal-code-badge').textContent = p.code;
  document.getElementById('modal-current-stock').textContent = p.stock + ' ' + p.unit;
  document.getElementById('modal-qty').value = '';
  document.getElementById('modal-note').value = '';
  setType('entrada');
  updateModalStock();
  document.getElementById('movement-modal').classList.add('open');
  setTimeout(() => document.getElementById('modal-qty').focus(), 300);
}

function closeModal() { document.getElementById('movement-modal').classList.remove('open'); }

document.getElementById('modal-qty').addEventListener('input', updateModalStock);

function updateModalStock() {
  if (currentProductIndex < 0) return;
  const p = db.products[currentProductIndex];
  const qty = parseInt(document.getElementById('modal-qty').value) || 0;
  const adds = currentType === 'entrada' || currentType === 'devolucion';
  const newStock = adds ? p.stock + qty : p.stock - qty;
  document.getElementById('modal-new-stock').textContent = Math.max(0, newStock) + ' ' + p.unit;
  document.getElementById('modal-new-stock').style.color = newStock < 0 ? 'var(--danger)' : (currentType === 'devolucion' ? '#f57c00' : 'var(--accent)');
}

function setType(type) {
  currentType = type;
  document.getElementById('btn-entrada').classList.toggle('active', type === 'entrada');
  document.getElementById('btn-salida').classList.toggle('active', type === 'salida');
  document.getElementById('btn-devolucion').classList.toggle('active', type === 'devolucion');
  // Update note placeholder based on type
  const noteInput = document.getElementById('modal-note');
  if (noteInput) {
    if (type === 'devolucion') noteInput.placeholder = 'Ej: Devuelto de sala sin abrir · Paciente 12';
    else if (type === 'entrada') noteInput.placeholder = 'Ej: Recepción proveedor';
    else noteInput.placeholder = 'Ej: Turno mañana';
  }
  updateModalStock();
}

function confirmMovement() {
  if (bloqueaPorSoloLectura()) return;
  const qty = parseInt(document.getElementById('modal-qty').value);
  if (!qty || qty <= 0) { showAlert('Ingresa una cantidad válida', 'error'); return; }
  const p = db.products[currentProductIndex];
  if (currentType === 'salida' && qty > p.stock) {
    showAlert('Stock insuficiente (' + p.stock + ' ' + p.unit + ')', 'error');
    return;
  }

  const note = document.getElementById('modal-note').value.trim();
  const prev = p.stock;
  const adds = currentType === 'entrada' || currentType === 'devolucion';
  p.stock = adds ? p.stock + qty : p.stock - qty;
  db.movements.push({
    id: genId(),
    productId: p.id,
    productName: p.name,
    code: p.code,
    type: currentType,
    qty,
    prevStock: prev,
    newStock: p.stock,
    note,
    date: new Date().toISOString()
  });

  save();
  closeModal();
  const icons = { entrada: '📥 +', salida: '📤 -', devolucion: '🔄 +' };
  showAlert((icons[currentType] || '+') + qty + ' ' + p.unit + ' · ' + p.name, 'success');
  updateDashboard();
  renderInventory();
  renderMovements();

  // Auto-sync to Power Automate if enabled
  const lastMov = db.movements[db.movements.length - 1];
  if (lastMov) paAutoSyncHook(lastMov);
}

// ==================== DETAIL MODAL ====================
function openDetailModal(idx) {
  const p = db.products[idx];
  const cls = p.stock === 0 ? 'chip-red' : p.stock <= p.minStock ? 'chip-orange' : 'chip-green';
  const label = p.stock === 0 ? 'SIN STOCK' : p.stock <= p.minStock ? 'STOCK BAJO' : 'OK';

  document.getElementById('detail-content').innerHTML = `
    <div style="text-align:center; margin-bottom:20px">
      <div style="font-size:48px; margin-bottom:8px">${p.emoji}</div>
      <div style="font-size:22px; font-weight:800; margin-bottom:6px">${p.name}</div>
      <span class="chip ${cls}">${label}</span>
    </div>
    <div class="card" style="margin-bottom:12px">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px">
        <div>
          <div class="card-title">Código</div>
          <div style="font-family:'Inter',sans-serif; font-size:16px; font-weight:700">${p.code}</div>
        </div>
        <div>
          <div class="card-title">Categoría</div>
          <div style="font-weight:600">${p.category}</div>
        </div>
        <div>
          <div class="card-title">Stock Actual</div>
          <div style="font-family:'Inter',sans-serif; font-size:24px; font-weight:700; color:var(--accent)">${p.stock} <span style="font-size:12px; color:var(--muted)">${p.unit}</span></div>
        </div>
        <div>
          <div class="card-title">Stock Mínimo</div>
          <div style="font-family:'Inter',sans-serif; font-size:24px; font-weight:700; color:var(--warning)">${p.minStock} <span style="font-size:12px; color:var(--muted)">${p.unit}</span></div>
        </div>
      </div>
    </div>
    <div class="qr-display">
      <canvas id="qr-canvas-${idx}" width="180" height="180"></canvas>
    </div>
    <p style="text-align:center; font-size:11px; color:var(--muted); margin-bottom:12px; font-family:'Inter',sans-serif">Escanea para registrar movimiento</p>
    <button class="btn btn-primary" onclick="closeDetailModal(); openMovementModal(${idx})">
      ➕ Registrar Movimiento
    </button>
    <button class="btn btn-danger" onclick="deleteProduct(${idx})" style="margin-top:8px">
      🗑 Eliminar Insumo
    </button>
  `;
  document.getElementById('detail-modal').classList.add('open');
  setTimeout(() => generateQR(idx, p.code), 100);
}

function closeDetailModal() { document.getElementById('detail-modal').classList.remove('open'); }

function deleteProduct(idx) {
  if (bloqueaPorSoloLectura()) return;
  if (!confirm('¿Eliminar este insumo?')) return;
  db.products.splice(idx, 1);
  save();
  closeDetailModal();
  showAlert('Insumo eliminado', 'info');
  updateDashboard();
  renderInventory();
}

// ==================== QR GENERATOR ====================
function generateQR(idx, code) {
  const canvas = document.getElementById('qr-canvas-' + idx);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const size = 180;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#0a0e17';

  // Simple QR-like pattern based on code hash
  const hash = [...code].reduce((acc, c) => acc * 31 + c.charCodeAt(0), 0);
  const cellSize = 6;
  const cols = Math.floor(size / cellSize);

  // Fixed finder patterns (corners)
  const drawFinder = (ox, oy) => {
    ctx.fillStyle = '#0a0e17';
    ctx.fillRect(ox, oy, 7*cellSize, 7*cellSize);
    ctx.fillStyle = '#fff';
    ctx.fillRect(ox+cellSize, oy+cellSize, 5*cellSize, 5*cellSize);
    ctx.fillStyle = '#0a0e17';
    ctx.fillRect(ox+2*cellSize, oy+2*cellSize, 3*cellSize, 3*cellSize);
  };
  drawFinder(0, 0);
  drawFinder(size - 7*cellSize, 0);
  drawFinder(0, size - 7*cellSize);

  // Data modules
  for (let r = 0; r < cols; r++) {
    for (let c = 0; c < cols; c++) {
      if ((r < 8 && c < 8) || (r < 8 && c > cols-9) || (r > cols-9 && c < 8)) continue;
      const val = (hash * (r+1) * (c+7) + r*13 + c*7) % 3;
      ctx.fillStyle = val === 0 ? '#0a0e17' : '#fff';
      ctx.fillRect(c*cellSize, r*cellSize, cellSize, cellSize);
    }
  }

  // Code label at bottom
  ctx.fillStyle = '#0a0e17';
  ctx.fillRect(0, size-18, size, 18);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(code, size/2, size-5);
}

// ==================== ALERT ====================
function showAlert(msg, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.innerHTML = `<span class="toast-icon"></span><span class="toast-msg">${msg}</span><span class="toast-close" onclick="this.parentElement.remove()">✕</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 280);
  }, 2800);
}

