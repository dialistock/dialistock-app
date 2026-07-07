// ==================== PACIENTES ====================

const KIT_FAV = [
  { nombre: 'Kit FAV', codigo: 'KIT-FAV', cantidad: 1 },
  { nombre: 'AVF AGUJA (cualquier calibre)', codigo: '101-108-002', cantidad: 2 },
  { nombre: 'ALCOHOL SWAB PRE PADS (Sachet OH)', codigo: '102-101-004', cantidad: 4 },
  { nombre: 'JERINGA 20CC VENOTEK', codigo: '102-105-038', cantidad: 1 },
  { nombre: 'JERINGA 3CC VENOTEK', codigo: '102-105-039', cantidad: 1 },
];

const KIT_CVC = [
  { nombre: 'Kit CVC', codigo: 'KIT-CVC', cantidad: 1 },
  { nombre: 'ALCOHOL SWAB PRE PADS (Sachet OH)', codigo: '102-101-004', cantidad: 2 },
  { nombre: 'JERINGA 20CC VENOTEK', codigo: '102-105-038', cantidad: 1 },
  { nombre: 'JERINGA 3CC VENOTEK', codigo: '102-105-039', cantidad: 1 },
  { nombre: 'JERINGA 5CC VENOTEK', codigo: '102-105-040', cantidad: 2 },
  { nombre: 'CONECTOR TEGO', codigo: '102-105-060', cantidad: 2 },
  { nombre: 'TELA MICROP (Primapore/Tegaderm)', codigo: '102-105-057', cantidad: 1 },
  { nombre: 'GORRO DESECHABLE', codigo: '102-105-034', cantidad: 3 },
  { nombre: 'PECHERA CON MANGAS (EU)', codigo: '102-105-046', cantidad: 2 },
  { nombre: 'PECHERA CORTA (TENS)', codigo: '102-105-047', cantidad: 1 },
  { nombre: 'MASCARILLA DESECHABLE', codigo: '102-105-042', cantidad: 2 },
];

let pacFav = 13;
let pacCvc = 13;

function renderPacientes() {
  recalcularDesdeMonitores();
  renderPacientesLista();
}

function recalcularDesdeMonitores() {
  const monitores = parseInt(document.getElementById('pac-monitores')?.value) || 26;
  const sesionesNum = parseInt(document.getElementById('pac-sesiones-dia')?.value) || 3;
  const totalDia = monitores * sesionesNum;

  const elSesion = document.getElementById('pac-por-sesion');
  const elDia = document.getElementById('pac-total-dia');
  if (elSesion) elSesion.textContent = monitores;
  if (elDia) elDia.textContent = totalDia;

  const grupo = document.getElementById('pac-grupo')?.value || 'A';
  const grupoBadge = document.getElementById('pac-grupo-badge');
  const grupoDias = document.getElementById('pac-grupo-dias');
  if (grupoBadge) grupoBadge.textContent = grupo;
  if (grupoDias) grupoDias.textContent = grupo === 'A' ? 'Lun/Mié/Vie' : 'Mar/Jue/Sáb';

  pacFav = Math.floor(monitores / 2);
  pacCvc = monitores - pacFav;
  const elFav = document.getElementById('pac-fav-count');
  const elCvc = document.getElementById('pac-cvc-count');
  if (elFav) elFav.textContent = pacFav;
  if (elCvc) elCvc.textContent = pacCvc;

  actualizarTotalSesion();
  calcularInsumos();
  pushPacConfigToMirrors();
}

function actualizarTotalSesion() {
  const total = pacFav + pacCvc;
  const sesion = document.getElementById('pac-sesion')?.value || 'Mañana';
  const elTotal = document.getElementById('pac-total-sesion');
  const elLabel = document.getElementById('pac-sesion-label');
  const elNombre = document.getElementById('pac-sesion-nombre');
  if (elTotal) elTotal.textContent = total;
  if (elLabel) elLabel.textContent = `${total} pacientes · ${sesion}`;
  if (elNombre) elNombre.textContent = sesion;
}

function cambiarPac(tipo, delta) {
  if (tipo === 'fav') {
    pacFav = Math.max(0, pacFav + delta);
    document.getElementById('pac-fav-count').textContent = pacFav;
  } else {
    pacCvc = Math.max(0, pacCvc + delta);
    document.getElementById('pac-cvc-count').textContent = pacCvc;
  }
  actualizarTotalSesion();
  calcularInsumos();
}

function calcularInsumos() {
  const lista = document.getElementById('pac-insumos-lista');
  if (!lista) return;

  const sesionesNum = parseInt(document.getElementById('pac-sesiones-dia')?.value) || 3;
  const neededSesion = CalculoPedido.calcularNecesidadesKits(KIT_FAV, KIT_CVC, pacFav, pacCvc, sesionesNum);

  let alertas = [];
  let html = '';

  Object.values(neededSesion).forEach(item => {
    const isKit = item.codigo.startsWith('KIT-');
    const prod = db.products.find(p => p.code === item.codigo);
    const stock = prod ? prod.stock : null;
    const okSesion = stock === null || isKit || stock >= item.sesion;
    const okDia = stock === null || isKit || stock >= item.dia;

    if (!isKit && stock !== null && !okDia) alertas.push({ ...item, stockActual: stock });

    const color = isKit ? 'var(--muted)' : !okSesion ? 'var(--danger)' : !okDia ? 'var(--warning)' : 'var(--accent)';
    const stockBadge = isKit || stock === null ? '' :
      `<span style="font-size:10px;padding:2px 8px;border-radius:10px;font-family:'Inter',sans-serif;background:${!okSesion?'rgba(255,71,87,0.12)':!okDia?'rgba(255,165,2,0.12)':'rgba(0,212,170,0.1)'};color:${color}">Stock: ${stock}</span>`;

    html += `
      <div style="display:flex;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid rgba(30,58,95,0.4)">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${item.nombre}</div>
          <div style="margin-top:3px">${stockBadge}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-family:'Inter',sans-serif;font-size:20px;font-weight:700;color:${color}">${item.sesion}</div>
          <div style="font-size:10px;color:var(--muted)">esta sesión</div>
        </div>
      </div>`;
  });

  lista.innerHTML = html;

  const alertCard = document.getElementById('pac-alertas-card');
  const alertLista = document.getElementById('pac-alertas-lista');
  if (alertas.length > 0) {
    alertCard.style.display = 'block';
    alertLista.innerHTML = alertas.map(a => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid rgba(255,71,87,0.15)">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:var(--danger);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${a.nombre}</div>
          <div style="font-size:11px;color:var(--muted);font-family:'Inter',sans-serif">Día: ${a.dia} · Stock: ${a.stockActual} · Faltan: ${a.dia - a.stockActual}</div>
        </div>
        <div style="font-family:'Inter',sans-serif;font-size:16px;font-weight:700;color:var(--danger);flex-shrink:0;margin-left:8px">−${a.dia - a.stockActual}</div>
      </div>`).join('');
  } else {
    alertCard.style.display = 'none';
  }

  renderResumenDia();
}

function descontarInsumos() {
  if (bloqueaPorSoloLectura()) return;
  const sesion = document.getElementById('pac-sesion')?.value || 'Mañana';
  const grupo = document.getElementById('pac-grupo')?.value || 'A';
  const monitores = parseInt(document.getElementById('pac-monitores')?.value) || 26;

  const needed = {};
  [...KIT_FAV, ...KIT_CVC].forEach(item => {
    if (item.codigo.startsWith('KIT-')) return;
    if (!needed[item.codigo]) needed[item.codigo] = 0;
  });
  KIT_FAV.forEach(item => { if (!item.codigo.startsWith('KIT-')) needed[item.codigo] = (needed[item.codigo]||0) + item.cantidad * pacFav; });
  KIT_CVC.forEach(item => { if (!item.codigo.startsWith('KIT-')) needed[item.codigo] = (needed[item.codigo]||0) + item.cantidad * pacCvc; });

  Object.entries(needed).forEach(([codigo, qty]) => {
    if (!qty) return;
    const idx = db.products.findIndex(p => p.code === codigo);
    if (idx === -1) return;
    const p = db.products[idx];
    const prev = p.stock;
    p.stock = Math.max(0, p.stock - qty);
    db.movements.push({
      id: genId(), productId: p.id, productName: p.name, code: p.code,
      type: 'salida', qty, prevStock: prev, newStock: p.stock,
      note: `Sesión ${sesion} · Grupo ${grupo} · ${monitores} monitores · ${pacFav} FAV + ${pacCvc} CVC`,
      date: new Date().toISOString()
    });
  });

  save(); updateDashboard(); renderInventory(); renderMovements(); calcularInsumos();
  showAlert(`✅ Stock descontado · ${pacFav + pacCvc} pacientes · Sesión ${sesion}`, 'success');
}

function renderResumenDia() {
  const el = document.getElementById('pac-resumen-dia');
  if (!el) return;
  const sesionesNum = parseInt(document.getElementById('pac-sesiones-dia')?.value) || 3;
  const monitores = parseInt(document.getElementById('pac-monitores')?.value) || 26;
  const favDia = pacFav * sesionesNum;
  const cvcDia = pacCvc * sesionesNum;

  const totalNeeded = {};
  KIT_FAV.forEach(item => {
    if (item.codigo.startsWith('KIT-')) return;
    if (!totalNeeded[item.codigo]) totalNeeded[item.codigo] = { nombre: item.nombre, codigo: item.codigo, cantidad: 0 };
    totalNeeded[item.codigo].cantidad += item.cantidad * favDia;
  });
  KIT_CVC.forEach(item => {
    if (item.codigo.startsWith('KIT-')) return;
    if (!totalNeeded[item.codigo]) totalNeeded[item.codigo] = { nombre: item.nombre, codigo: item.codigo, cantidad: 0 };
    totalNeeded[item.codigo].cantidad += item.cantidad * cvcDia;
  });

  const sesLabels = ['🌅 Mañana','🌆 Tarde','🌙 T.Noche'];
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(${sesionesNum},1fr);gap:8px;margin-bottom:14px">
      ${sesLabels.slice(0,sesionesNum).map(s => `
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:10px;text-align:center">
          <div style="font-size:10px;color:var(--muted);font-weight:700;margin-bottom:4px">${s}</div>
          <div style="font-family:'Inter',sans-serif;font-size:22px;font-weight:700;color:var(--accent)">${monitores}</div>
          <div style="font-size:10px;color:var(--muted)">${pacFav} FAV · ${pacCvc} CVC</div>
        </div>`).join('')}
    </div>
    <div style="background:rgba(0,153,255,0.06);border:1px solid rgba(0,153,255,0.2);border-radius:12px;padding:12px">
      <div style="font-size:11px;font-weight:700;color:var(--accent2);margin-bottom:10px;text-transform:uppercase;letter-spacing:1px">
        Total día · ${monitores * sesionesNum} pacientes · (${favDia} FAV + ${cvcDia} CVC)
      </div>
      ${Object.values(totalNeeded).map(i => {
        const prod = db.products.find(p => p.code === i.codigo);
        const stock = prod?.stock ?? null;
        const ok = stock === null || stock >= i.cantidad;
        return `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid rgba(30,58,95,0.3)">
          <span style="font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:72%">${i.nombre}</span>
          <span style="font-family:'Inter',sans-serif;font-size:13px;font-weight:700;color:${ok?'var(--text)':'var(--danger)'};flex-shrink:0">${i.cantidad}</span>
        </div>`;}).join('')}
    </div>`;
}

