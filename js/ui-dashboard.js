// ==================== TABS ====================
function showPage(page, tab) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  tab.classList.add('active');

  if (page !== 'scanner') stopScanner();
  if (page === 'dashboard') { updateDashboard(); renderCharts(); }
  if (page === 'inventory') renderInventory();
  if (page === 'movements') renderMovements();
  if (page === 'pacientes') renderPacientes();
  if (page === 'dynamics') renderDynamicsPage();
  if (page === 'proveedores') { renderProveedores(); renderRecepcionOC(); }
  if (page === 'pdcons') renderPDCons();
  if (page === 'proyeccion') renderProyeccion();
  if (page === 'products') autoCode();
  if (page === 'vencimientos') renderVencimientos();
  // recepcion merged into proveedores
  // inventariofisico merged into inventory tab
  if (page === 'mermas') renderMermas();
  if (page === 'diario') { renderDiario(); switchDiarioTab('scanner'); }
  if (page !== 'inventory') stopInvFisScanner();
  if (page !== 'diario') stopScanner();
}

// ==================== DASHBOARD ====================
function animateCounter(el, target) {
  const start = parseInt(el.textContent) || 0;
  if (start === target) return;
  const dur = 500, step = 16;
  const inc = (target - start) / (dur / step);
  let cur = start;
  const t = setInterval(() => {
    cur += inc;
    if ((inc > 0 && cur >= target) || (inc < 0 && cur <= target)) {
      el.textContent = target; clearInterval(t);
    } else { el.textContent = Math.round(cur); }
  }, step);
}

function updateDashboard() {
  const total = db.products.length;
  const today = new Date().toDateString();
  const moves = db.movements.filter(m => new Date(m.date).toDateString() === today).length;
  const low = db.products.filter(p => p.stock > 0 && p.stock <= p.minStock).length;
  const out = db.products.filter(p => p.stock === 0).length;

  animateCounter(document.getElementById('stat-total'), total);
  animateCounter(document.getElementById('stat-moves'), moves);
  animateCounter(document.getElementById('stat-low'), low);
  animateCounter(document.getElementById('stat-out'), out);

  // KPI subtextos contextuales
  const kpiSubMoves = document.getElementById('kpi-sub-moves');
  if (kpiSubMoves) kpiSubMoves.textContent = moves === 1 ? 'movimiento hoy' : 'movimientos hoy';
  const kpiSubLow = document.getElementById('kpi-sub-low');
  if (kpiSubLow) kpiSubLow.textContent = low === 0 ? 'todo en orden' : 'bajo mínimo ⚠️';
  const kpiSubOut = document.getElementById('kpi-sub-out');
  if (kpiSubOut) kpiSubOut.textContent = out === 0 ? 'sin agotados ✅' : 'agotados 🚫';

  // Turno automático
  const turnoLabel = document.getElementById('turno-label');
  if (turnoLabel) {
    const h = new Date().getHours();
    let turno, emoji;
    if (h >= 7 && h < 12) { turno = 'Turno Mañana'; emoji = '🌅'; }
    else if (h >= 12 && h < 17) { turno = 'Turno Tarde'; emoji = '☀️'; }
    else if (h >= 17 && h < 22) { turno = 'Turno Tarde Noche'; emoji = '🌙'; }
    else { turno = 'Fuera de turno'; emoji = '💤'; }
    turnoLabel.textContent = emoji + ' ' + turno;
  }

  // Alerts
  const alertList = document.getElementById('alerts-list');
  const lowItems = db.products.filter(p => p.stock <= p.minStock);
  if (lowItems.length === 0) {
    alertList.innerHTML = '<div class="empty-state" data-icon="✅"><p>Todo en orden</p><small>Sin alertas de stock</small></div>';
  } else {
    alertList.innerHTML = lowItems.map(p => `
      <div class="movement-item" onclick="openDetailModal(${db.products.indexOf(p)})">
        <div class="movement-dot ${p.stock === 0 ? 'out' : 'in'}">${p.emoji}</div>
        <div class="movement-info">
          <div class="movement-name">${p.name}</div>
          <div class="movement-time">${p.code} · Mín: ${p.minStock} ${p.unit}</div>
        </div>
        <div class="movement-qty ${p.stock === 0 ? 'out' : 'in'}">
          ${p.stock === 0 ? '⚠️ SIN STOCK' : p.stock + ' ' + p.unit}
        </div>
      </div>
    `).join('');
  }

  // Recent movements
  const recentEl = document.getElementById('recent-movements');
  const recent = db.movements.slice(-5).reverse();
  if (recent.length === 0) {
    recentEl.innerHTML = '<div class="empty-state" data-icon="📋"><p>Sin movimientos</p><small>Registra el primer movimiento con el escáner</small></div>';
  } else {
    recentEl.innerHTML = recent.map(m => `
      <div class="movement-item">
        <div class="movement-dot ${m.type}">${m.type === 'entrada' ? '📥' : m.type === 'devolucion' ? '🔄' : '📤'}</div>
        <div class="movement-info">
          <div class="movement-name">${m.productName}</div>
          <div class="movement-time">${formatDate(m.date)}</div>
        </div>
        <div class="movement-qty ${m.type}">${m.type === 'salida' ? '-' : '+'}${m.qty}</div>
      </div>
    `).join('');
  }

  // KPIs REALES
  renderKpisReales();
}

function renderKpisReales() {
  const el = document.getElementById('kpi-reales-section');
  if (!el) return;

  const fmt = (n) => '$' + Math.abs(Math.round(n)).toLocaleString('es-CL');

  // Último inventario desde historial
  let ultimoInv = null;
  if (typeof invFisHistorial !== 'undefined' && invFisHistorial.length) {
    ultimoInv = invFisHistorial[0];
  }

  // Próximos vencimientos (30 días)
  const hoy = new Date();
  const en30 = new Date(); en30.setDate(en30.getDate() + 30);
  const proximosVenc = (typeof lotesDB !== 'undefined' ? lotesDB : []).filter(l => {
    if (!l.vencimiento) return false;
    const v = new Date(l.vencimiento);
    return v >= hoy && v <= en30;
  }).sort((a,b) => new Date(a.vencimiento) - new Date(b.vencimiento));

  // Productos bajo mínimo %
  const total = db.products.length;
  const criticos = db.products.filter(p => p.stock <= p.minStock).length;
  const pctCriticos = total > 0 ? Math.round((criticos / total) * 100) : 0;

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">

      <!-- Último inventario -->
      <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:16px;padding:14px;border-left:4px solid var(--accent2)" onclick="showPage('inventory',document.querySelector('[onclick*=inventory]'))">
        <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">📋 Último Inventario</div>
        ${ultimoInv ? `
          <div style="font-size:13px;font-weight:800;color:var(--text)">${ultimoInv.fechaLabel}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">${ultimoInv.totales.totalDiferencias} diferencias</div>
          <div style="font-size:12px;font-weight:700;color:${ultimoInv.totales.impactoNeto < 0 ? 'var(--danger)' : 'var(--accent)'};margin-top:4px">${ultimoInv.totales.impactoNeto < 0 ? '-' : '+'}${fmt(ultimoInv.totales.impactoNeto)}</div>
        ` : `
          <div style="font-size:12px;color:var(--muted)">Sin conteos registrados</div>
          <div style="font-size:10px;color:var(--border);margin-top:4px">Inicia un Conteo Físico</div>
        `}
      </div>

      <!-- Vencimientos próximos -->
      <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:16px;padding:14px;border-left:4px solid ${proximosVenc.length > 0 ? 'var(--danger)' : 'var(--accent)'}">
        <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">📅 Vencimientos</div>
        ${proximosVenc.length > 0 ? `
          <div style="font-size:22px;font-weight:800;color:var(--danger)">${proximosVenc.length}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">en los próximos 30 días</div>
          <div style="font-size:10px;color:var(--danger);margin-top:4px;font-weight:600">⚠️ ${proximosVenc[0].productName.substring(0,20)}...</div>
        ` : `
          <div style="font-size:22px;font-weight:800;color:var(--accent)">0</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">sin vencimientos próximos</div>
          <div style="font-size:10px;color:var(--accent);margin-top:4px">✅ Todo en plazo</div>
        `}
      </div>

    </div>

    <!-- Salud del inventario -->
    <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:16px;padding:14px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-size:12px;font-weight:700;color:var(--text)">🏥 Salud del inventario</div>
        <div style="font-size:12px;font-weight:800;color:${pctCriticos > 20 ? 'var(--danger)' : pctCriticos > 10 ? 'var(--warning)' : 'var(--accent)'}">${100 - pctCriticos}% OK</div>
      </div>
      <div style="background:var(--surface2);border-radius:6px;height:8px;overflow:hidden">
        <div style="height:100%;width:${100 - pctCriticos}%;background:${pctCriticos > 20 ? 'var(--danger)' : pctCriticos > 10 ? '#f57c00' : 'var(--accent)'};border-radius:6px;transition:width .5s ease"></div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:10px;color:var(--muted)">
        <span>${total - criticos} productos OK</span>
        <span>${criticos} bajo mínimo</span>
      </div>
    </div>`;

  // Alertas de vencimiento en Dashboard
  const vencCard = document.getElementById('venc-dashboard-card');
  const vencList = document.getElementById('venc-dashboard-list');
  const hoy2 = new Date();
  const en60 = new Date(); en60.setDate(en60.getDate() + 60);
  const alertasVenc = (typeof lotesDB !== 'undefined' ? lotesDB : [])
    .filter(l => l.vencimiento && new Date(l.vencimiento) >= hoy2 && new Date(l.vencimiento) <= en60)
    .sort((a,b) => new Date(a.vencimiento) - new Date(b.vencimiento))
    .slice(0, 5);
  const vencidos = (typeof lotesDB !== 'undefined' ? lotesDB : [])
    .filter(l => l.vencimiento && new Date(l.vencimiento) < hoy2);

  if (vencCard && vencList && (alertasVenc.length > 0 || vencidos.length > 0)) {
    vencCard.style.display = 'block';
    const allItems = [...vencidos, ...alertasVenc].slice(0, 6);
    vencList.innerHTML = allItems.map(l => {
      const v = new Date(l.vencimiento);
      const diasRestantes = Math.ceil((v - hoy2) / (1000*60*60*24));
      const vencido = diasRestantes < 0;
      const color = vencido ? 'var(--danger)' : diasRestantes <= 7 ? '#f57c00' : diasRestantes <= 30 ? '#e6b800' : 'var(--accent)';
      const etiqueta = vencido ? '🔴 VENCIDO' : diasRestantes === 0 ? '🔴 Hoy' : diasRestantes === 1 ? '🟠 Mañana' : `🟡 ${diasRestantes} días`;
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border)">
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.productName}</div>
          <div style="font-size:10px;color:var(--muted)">Lote: ${l.lote || '-'} · ${v.toLocaleDateString('es-CL')}</div>
        </div>
        <div style="font-size:10px;font-weight:700;color:${color};margin-left:8px;white-space:nowrap">${etiqueta}</div>
      </div>`;
    }).join('');
  } else if (vencCard) {
    vencCard.style.display = 'none';
  }
}

function formatDate(d) {
  const dt = new Date(d);
  return dt.toLocaleDateString('es-CL') + ' ' + dt.toLocaleTimeString('es-CL', {hour:'2-digit', minute:'2-digit'});
}

