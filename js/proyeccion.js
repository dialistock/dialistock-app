// ==================== PROYECCIÓN ====================

let proyFiltro = 'todos';
let proyAjustes = {};          // id -> cantidad final ajustada manualmente
let proyStockManual = {};      // id -> stock físico en bodega ingresado manualmente (sobrescribe p.stock del sistema)
let proyeccionesActuales = []; // último cálculo, para ajustes y solicitud de pedido

function renderProyeccion() {
  // Update labels
  const dias = parseInt(document.getElementById('proy-dias')?.value) || 26;
  const seguridad = parseInt(document.getElementById('proy-seguridad')?.value) || 12;
  const periodo = parseInt(document.getElementById('proy-periodo')?.value) || 30;
  const mesEl = document.getElementById('proy-mes');
  
  const elDias = document.getElementById('proy-dias-label');
  const elSeg = document.getElementById('proy-seg-label');
  if (elDias) elDias.textContent = dias;
  if (elSeg) elSeg.textContent = seguridad;

  // Set next month as default
  if (mesEl && !mesEl.dataset.set) {
    const nextMonth = new Date().getMonth() + 2;
    mesEl.value = nextMonth > 12 ? 1 : nextMonth;
    mesEl.dataset.set = '1';
  }

  // Calculate consumption per product in the period
  const now = new Date();
  const periodoStart = new Date(now.getTime() - periodo * 24 * 60 * 60 * 1000);

  const consumo = {};
  db.movements
    .filter(m => m.type === 'salida' && new Date(m.date) >= periodoStart)
    .forEach(m => {
      if (!consumo[m.productId]) consumo[m.productId] = 0;
      consumo[m.productId] += m.qty;
    });

  if (Object.keys(consumo).length === 0) {
    const lista = document.getElementById('proy-lista');
    if (lista) lista.innerHTML = '<div class="empty-state"><p>Sin movimientos en el período.<br>Registra consumos para ver la proyección.</p></div>';
    return;
  }

  // Factor de ajuste por pacientes (censo)
  const pacHist = parseInt(document.getElementById('proy-pac-hist')?.value) || 0;
  const pacProy = parseInt(document.getElementById('proy-pac-proy')?.value) || 0;
  const scope = document.getElementById('proy-ajuste-scope')?.value || 'dialisis';
  const factorCenso = (scope === 'ninguno' || pacHist <= 0 || pacProy <= 0) ? 1 : pacProy / pacHist;
  const aplicaFactor = (cat) => {
    if (scope === 'ninguno') return false;
    if (scope === 'todos') return true;
    if (scope === 'dialisis') return cat === 'Diálisis';
    if (scope === 'dialisis_medicos') return cat === 'Diálisis' || cat === 'Insumos Médicos';
    return false;
  };
  const elFactor = document.getElementById('proy-factor-label');
  if (elFactor) elFactor.textContent = factorCenso.toFixed(2).replace('.', ',');

  // Calculate projection for each product
  const proyecciones = db.products.map(p => {
    const consumoTotal = consumo[p.id] || 0;
    const factorP = aplicaFactor(p.category) ? factorCenso : 1;
    const stockBodega = (proyStockManual[p.id] !== undefined) ? proyStockManual[p.id] : p.stock;
    const calc = CalculoPedido.calcularProyeccionProducto({
      consumoTotal,
      periodoDias: periodo,
      diasNecesidad: dias,
      diasSeguridad: seguridad,
      factorAjuste: factorP,
      stockBodega,
      packFactor: p.packFactor || 1
    });

    return {
      ...p,
      stockBodega,
      stockManualIngresado: proyStockManual[p.id] !== undefined,
      consumoTotal,
      consumoDiario: calc.consumoDiario,
      necesidadMes: calc.necesidadMes,
      stockSeguridad: calc.stockSeguridad,
      totalNecesario: calc.totalNecesario,
      cantidadPedir: calc.cantidadPedir,
      cajasPedir: calc.cajasPedir,
      debePedir: calc.debePedir
    };
  }).filter(p => p.consumoTotal > 0 || p.stock <= p.minStock);

  // Sort: items to order first
  proyecciones.sort((a, b) => b.cantidadPedir - a.cantidadPedir);

  proyeccionesActuales = proyecciones;
  renderProyLista(proyecciones);
  renderReconciliacion();
}

function filtrarProy(filtro) {
  proyFiltro = filtro;
  ['todos','pedir','ok'].forEach(f => {
    const btn = document.getElementById('proy-fil-' + f);
    if (btn) {
      btn.style.borderColor = f === filtro ? 'var(--accent)' : 'var(--border)';
      btn.style.color = f === filtro ? 'var(--accent)' : 'var(--muted)';
    }
  });
  renderProyeccion();
}

function renderProyLista(proyecciones) {
  const lista = document.getElementById('proy-lista');
  if (!lista) return;

  let items = proyecciones;
  if (proyFiltro === 'pedir') items = proyecciones.filter(p => p.debePedir);
  if (proyFiltro === 'ok') items = proyecciones.filter(p => !p.debePedir);

  if (items.length === 0) {
    lista.innerHTML = '<div class="empty-state"><p>Sin resultados para este filtro</p></div>';
    return;
  }

  const totalPedir = proyecciones.filter(p => p.debePedir).length;
  const totalOK = proyecciones.filter(p => !p.debePedir).length;

  lista.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
      <div style="background:rgba(229,57,53,0.06);border:1.5px solid rgba(229,57,53,0.2);border-radius:10px;padding:10px;text-align:center">
        <div style="font-family:'Inter',sans-serif;font-size:22px;font-weight:700;color:var(--danger)">${totalPedir}</div>
        <div style="font-size:10px;color:var(--muted)">insumos a pedir</div>
      </div>
      <div style="background:rgba(0,153,204,0.06);border:1.5px solid rgba(0,153,204,0.2);border-radius:10px;padding:10px;text-align:center">
        <div style="font-family:'Inter',sans-serif;font-size:22px;font-weight:700;color:var(--accent)">${totalOK}</div>
        <div style="font-size:10px;color:var(--muted)">insumos con stock OK</div>
      </div>
    </div>
    ${items.map(p => {
      const color = p.debePedir ? 'var(--danger)' : 'var(--accent)';
      const bg = p.debePedir ? 'rgba(229,57,53,0.04)' : 'rgba(0,153,204,0.04)';
      const border = p.debePedir ? 'rgba(229,57,53,0.2)' : 'rgba(0,153,204,0.2)';
      const pct = Math.min(100, Math.round((p.stockBodega / Math.max(1, p.totalNecesario)) * 100));
      const final = (proyAjustes[p.id] !== undefined) ? proyAjustes[p.id] : p.cantidadPedir;
      const ajustado = proyAjustes[p.id] !== undefined && proyAjustes[p.id] !== p.cantidadPedir;

      return `
        <div style="padding:12px;background:${bg};border:1.5px solid ${border};border-radius:12px;margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px">
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.emoji} ${p.name}</div>
              <div style="font-family:'Inter',sans-serif;font-size:10px;color:var(--muted);margin-top:2px">${p.code}</div>
            </div>
            <div style="text-align:right;flex-shrink:0">
              <div style="font-family:'Inter',sans-serif;font-size:20px;font-weight:700;color:${final > 0 ? 'var(--danger)' : 'var(--accent)'}">${final > 0 ? '+' + final : '✓'}</div>
              <div style="font-size:10px;color:${ajustado ? 'var(--accent2)' : 'var(--muted)'}">${ajustado ? 'ajustado' : (final > 0 ? 'a pedir' : 'stock OK')}</div>
              ${(final > 0 && p.packFactor > 1 && !ajustado) ? `<div style="font-size:9px;color:var(--muted);margin-top:1px">≈ ${p.cajasPedir} caja${p.cajasPedir === 1 ? '' : 's'} x ${p.packFactor}</div>` : ''}
            </div>
          </div>
          <!-- Progress bar -->
          <div style="background:rgba(0,0,0,0.08);border-radius:4px;height:6px;margin-bottom:8px;overflow:hidden">
            <div style="height:100%;border-radius:4px;background:${color};width:${pct}%;transition:width 0.3s"></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:4px">
            <div style="text-align:center;padding:6px 4px;background:rgba(0,0,0,0.04);border-radius:6px">
              <div style="font-family:'Inter',sans-serif;font-size:11px;font-weight:700;color:var(--text)">${p.consumoTotal}</div>
              <div style="font-size:9px;color:var(--muted)">consumido</div>
            </div>
            <div style="text-align:center;padding:6px 4px;background:rgba(0,0,0,0.04);border-radius:6px">
              <div style="font-family:'Inter',sans-serif;font-size:11px;font-weight:700;color:var(--text)">${p.necesidadMes}</div>
              <div style="font-size:9px;color:var(--muted)">necesario</div>
            </div>
            <div style="text-align:center;padding:6px 4px;background:${p.stockManualIngresado ? 'rgba(0,153,204,0.1)' : 'rgba(0,0,0,0.04)'};border-radius:6px">
              <input type="number" min="0" value="${p.stockBodega}" onchange="setProyStockBodega('${p.id}', this.value)"
                style="width:100%;text-align:center;padding:0;border:none;background:transparent;font-family:'Inter',sans-serif;font-size:11px;font-weight:700;color:var(--text)">
              <div style="font-size:9px;color:var(--muted)">en bodega${p.stockManualIngresado ? ' ✎' : ''}</div>
            </div>
            <div style="text-align:center;padding:6px 4px;background:rgba(0,0,0,0.04);border-radius:6px">
              <div style="font-family:'Inter',sans-serif;font-size:11px;font-weight:700;color:${color}">${p.cantidadPedir}${p.packFactor > 1 ? ` <span style="font-size:9px;font-weight:400">(${p.cajasPedir}c)</span>` : ''}</div>
              <div style="font-size:9px;color:var(--muted)">a pedir · caja x${p.packFactor || 1}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid rgba(0,0,0,0.07)">
            <div style="font-size:10px;color:var(--muted)">Sugerido: <b style="color:var(--text)">${p.cantidadPedir}</b>${ajustado ? ' · <span style="color:var(--accent2);font-weight:700">ajustado</span>' : ''}</div>
            <div style="display:flex;align-items:center;gap:4px">
              <button onclick="ajustarProy('${p.id}',-1)" style="width:30px;height:30px;border-radius:8px;border:1.5px solid var(--border);background:var(--surface);color:var(--danger);font-size:18px;font-weight:700;cursor:pointer;line-height:1">−</button>
              <input type="number" min="0" value="${final}" onchange="setProyManual('${p.id}', this.value)" style="width:58px;text-align:center;padding:6px 2px;font-size:14px;border:1.5px solid var(--border);border-radius:8px;background:#f8fbff;color:var(--text)">
              <button onclick="ajustarProy('${p.id}',1)" style="width:30px;height:30px;border-radius:8px;border:1.5px solid var(--border);background:var(--surface);color:var(--accent);font-size:18px;font-weight:700;cursor:pointer;line-height:1">+</button>
              <button onclick="resetProyItem('${p.id}')" title="Volver al sugerido" style="width:30px;height:30px;border-radius:8px;border:1.5px solid var(--border);background:var(--surface);color:var(--muted);font-size:14px;cursor:pointer;line-height:1">↺</button>
            </div>
          </div>
        </div>`;
    }).join('')}`;
}

function setProyStockBodega(id, value) {
  const v = Math.max(0, parseInt(value) || 0);
  proyStockManual[id] = v;
  renderProyeccion();
}

function ajustarProy(id, delta) {
  const base = proyeccionesActuales.find(x => String(x.id) === String(id));
  const actual = (proyAjustes[id] !== undefined) ? proyAjustes[id] : (base ? base.cantidadPedir : 0);
  proyAjustes[id] = Math.max(0, actual + delta);
  renderProyLista(proyeccionesActuales);
}

function setProyManual(id, value) {
  proyAjustes[id] = Math.max(0, parseInt(value) || 0);
  renderProyLista(proyeccionesActuales);
}

function resetProyItem(id) {
  delete proyAjustes[id];
  renderProyLista(proyeccionesActuales);
}

function exportarSolicitudPedido() {
  const mesEl = document.getElementById('proy-mes');
  const mes = mesEl?.options[mesEl.selectedIndex]?.text || '';
  const fecha = new Date().toLocaleDateString('es-CL');

  const items = proyeccionesActuales
    .map(p => ({ ...p, final: (proyAjustes[p.id] !== undefined) ? proyAjustes[p.id] : p.cantidadPedir }))
    .filter(p => p.final > 0)
    .sort((a, b) => b.final - a.final);

  if (items.length === 0) { showAlert('No hay insumos con cantidad a pedir', 'warning'); return; }

  const rows = [
    ['SOLICITUD DE PEDIDO'],
    ['Centro:', 'Independencia · DaVita Chile'],
    ['Mes proyectado:', mes],
    ['Fecha:', fecha],
    [],
    ['Código', 'Insumo', 'Sugerido', 'Cantidad a pedir', 'Factor empaque', 'Cajas a pedir', 'Precio unitario', 'Subtotal'],
  ];
  let total = 0;
  items.forEach(p => {
    const precio = p.price || 0;
    const subtotal = Math.round(p.final * precio);
    total += subtotal;
    const factorEmp = p.packFactor || 1;
    const cajas = Math.ceil(p.final / factorEmp);
    rows.push([p.code, p.name, p.cantidadPedir, p.final, factorEmp, cajas, precio, subtotal]);
  });
  rows.push([]);
  rows.push(['', '', '', '', '', '', 'Total estimado', total]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 14 }, { wch: 46 }, { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Solicitud de Pedido');
  XLSX.writeFile(wb, `DialiStock_SolicitudPedido_${mes.replace(/\s/g, '_')}_${new Date().getFullYear()}.xlsx`);
  showAlert('✅ Solicitud de pedido generada', 'success');
}

function teoricoDiaPlanilla(tipo) {
  const map = {};
  const add = (code, q) => { if (!code || q <= 0) return; map[code] = (map[code] || 0) + q; };
  const concCode = { '924': '101-108-012', '925': '101-108-013', '926': '101-108-014' };
  const gv = (id) => { const el = document.getElementById(id); return el ? (parseInt(el.value) || 0) : 0; };
  ['s1', 's2', 's3'].forEach(s => {
    const f15 = gv(tipo + '-' + s + '-fav15'), f16 = gv(tipo + '-' + s + '-fav16'), f17 = gv(tipo + '-' + s + '-fav17');
    const fav = f15 + f16 + f17, cvc = gv(tipo + '-' + s + '-cvc');
    const conc = document.getElementById(tipo + '-' + s + '-conc') ? document.getElementById(tipo + '-' + s + '-conc').value : '924';
    add('101-108-002', f15 * 2);
    add('101-108-003', f16 * 2);
    add('101-108-004', f17 * 2);
    add('101-108-005', fav);
    add('101-108-006', cvc);
    if (fav + cvc > 0) {
      add(concCode[conc], Math.ceil(((fav + cvc) * 3.4) / 2.5));
      add('101-106-005', Math.ceil((fav + cvc) / 3));
      add('101-106-003', Math.ceil((fav + cvc) / 3));
    }
  });
  return map;
}

function renderReconciliacion() {
  const cont = document.getElementById('recon-lista');
  if (!cont) return;
  const dias = parseInt(document.getElementById('proy-dias')?.value) || 26;
  const periodo = parseInt(document.getElementById('proy-periodo')?.value) || 30;
  const diasGrupo = Math.max(1, Math.round(dias / 2));

  const teoricoMes = {};
  [teoricoDiaPlanilla('lmv'), teoricoDiaPlanilla('mjs')].forEach(m =>
    Object.keys(m).forEach(c => { teoricoMes[c] = (teoricoMes[c] || 0) + m[c] * diasGrupo; })
  );

  if (Object.values(teoricoMes).reduce((a, b) => a + b, 0) === 0) {
    cont.innerHTML = '<div style="font-size:12px;color:var(--muted);text-align:center;padding:12px 0">Llena una jornada tipo en Pacientes → LMV y MJS para calcular el teórico.</div>';
    return;
  }

  const now = new Date();
  const periodoStart = new Date(now.getTime() - periodo * 24 * 60 * 60 * 1000);
  const consumo = {};
  db.movements.filter(m => m.type === 'salida' && new Date(m.date) >= periodoStart).forEach(m => {
    const p = db.products.find(x => x.id === m.productId);
    if (p) consumo[p.code] = (consumo[p.code] || 0) + m.qty;
  });

  const filas = Object.keys(teoricoMes).map(code => {
    const p = db.products.find(x => x.code === code);
    const teorico = Math.round(teoricoMes[code]);
    const real = Math.round(((consumo[code] || 0) / periodo) * dias);
    const diff = teorico > 0 ? Math.round(((real - teorico) / teorico) * 100) : (real > 0 ? 100 : 0);
    const ad = Math.abs(diff);
    const nivel = ad <= 15 ? 'ok' : ad <= 35 ? 'medio' : 'alto';
    return { name: p ? p.name : code, emoji: p ? p.emoji : '📦', teorico, real, diff, nivel };
  }).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  const col = { ok: 'var(--accent)', medio: '#f57c00', alto: 'var(--danger)' };
  const dot = { ok: '🟢', medio: '🟡', alto: '🔴' };
  cont.innerHTML = filas.map(f => `
    <div style="display:flex;align-items:center;gap:10px;padding:10px;border:1.5px solid var(--border);border-radius:10px;margin-bottom:8px">
      <div style="font-size:15px">${dot[f.nivel]}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f.emoji} ${f.name}</div>
        <div style="font-size:10px;color:var(--muted)">Teórico ${f.teorico} · Real ${f.real}</div>
      </div>
      <div style="text-align:right;flex-shrink:0"><div style="font-family:'Inter',sans-serif;font-size:15px;font-weight:700;color:${col[f.nivel]}">${f.diff > 0 ? '+' : ''}${f.diff}%</div></div>
    </div>`).join('');
}

function exportarProyeccion() {
  const dias = parseInt(document.getElementById('proy-dias')?.value) || 26;
  const seguridad = parseInt(document.getElementById('proy-seguridad')?.value) || 12;
  const periodo = parseInt(document.getElementById('proy-periodo')?.value) || 30;
  const mes = document.getElementById('proy-mes')?.options[document.getElementById('proy-mes')?.selectedIndex]?.text || '';

  const now = new Date();
  const periodoStart = new Date(now.getTime() - periodo * 24 * 60 * 60 * 1000);
  const consumo = {};
  db.movements.filter(m => m.type === 'salida' && new Date(m.date) >= periodoStart)
    .forEach(m => { if (!consumo[m.productId]) consumo[m.productId] = 0; consumo[m.productId] += m.qty; });

  const rows = db.products
    .filter(p => consumo[p.id] || p.stock <= p.minStock)
    .map(p => {
      const ct = consumo[p.id] || 0;
      const cd = ct / periodo;
      const nm = Math.ceil(cd * dias);
      const ss = Math.ceil(cd * seguridad);
      const stockBodega = (proyStockManual[p.id] !== undefined) ? proyStockManual[p.id] : p.stock;
      const cpUnid = Math.max(0, Math.ceil(nm + ss - stockBodega));
      const factorEmp = p.packFactor || 1;
      const cajas = Math.ceil(cpUnid / factorEmp);
      const cp = cajas * factorEmp;
      return [p.code, p.name, ct, Math.round(cd*100)/100, nm, ss, stockBodega, factorEmp, cajas, cp, cp > 0 ? 'PEDIR' : 'OK'];
    });

  const headers = ['Código','Nombre','Consumo Período','Consumo Diario','Necesidad Mes','Stock Seguridad','Stock Actual','Factor Empaque','Cajas a Pedir','Cantidad a Pedir','Estado'];
  const BOM = '\uFEFF';
  const csv = BOM + [`Proyección Pedido ${mes} · Centro Independencia · Davita Chile`, '', headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `DialiStock_Proyeccion_${mes}_${now.getFullYear()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showAlert(`✅ Proyección ${mes} exportada`, 'success');
}

// ==================== PROYECCIÓN EXCEL EXTERNO ====================
let excelProjData = [];

(function initExcelProj() {
  const dz = document.getElementById('proy-dropzone');
  const fi = document.getElementById('proy-file-input');
  if (!dz || !fi) return;

  dz.addEventListener('dragover', e => { e.preventDefault(); dz.style.borderColor = 'var(--accent)'; });
  dz.addEventListener('dragleave', () => { dz.style.borderColor = 'var(--border)'; });
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.style.borderColor = 'var(--border)';
    if (e.dataTransfer.files[0]) processExcelFile(e.dataTransfer.files[0]);
  });
  fi.addEventListener('change', () => { if (fi.files[0]) processExcelFile(fi.files[0]); });
})();

function processExcelFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      const keys = Object.keys(rows[0] || {});
      const find = hints => {
        for (const h of hints) {
          const k = keys.find(k => k.toLowerCase().includes(h.toLowerCase()));
          if (k) return k;
        }
        return undefined;
      };
      const colCod  = find(['nº producto','producto','codigo','cód','cod','sku']);
      const colDesc = find(['descripción','descripcion','description','nombre','desc']);
      const colQty  = find(['cantidad','qty','quantity','consumo']);
      const colCosto= find(['importe costo','costo','cost','importe','precio']);
      if (!colCod || !colDesc || !colQty) {
        showAlert('No se reconoció el formato. Verifica columnas Producto, Descripción y Cantidad.', 'error');
        return;
      }
      const agg = {};
      rows.forEach(r => {
        const cod  = String(r[colCod]  || '').trim();
        const desc = String(r[colDesc] || '').trim();
        const qty  = Math.abs(parseFloat(r[colQty])  || 0);
        const cost = colCosto ? Math.abs(parseFloat(r[colCosto]) || 0) : 0;
        if (!cod || !qty) return;
        if (!agg[cod]) agg[cod] = { cod, desc, consumo: 0, costoTotal: 0 };
        agg[cod].consumo    += qty;
        agg[cod].costoTotal += cost;
      });
      excelProjData = Object.values(agg).filter(d => d.consumo > 0).sort((a, b) => b.consumo - a.consumo);
      document.getElementById('proy-drop-label').textContent = '✅ ' + file.name + ' · ' + excelProjData.length + ' productos';
      document.getElementById('proy-dropzone').style.borderColor = 'var(--accent)';
      recalcExcelProj();
    } catch(err) {
      showAlert('Error al leer el archivo: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function recalcExcelProj() {
  if (!excelProjData.length) return;
  const ssRaw = parseFloat(document.getElementById('proy-excel-ss').value);
  const ss = (isNaN(ssRaw) ? 10 : Math.max(0, ssRaw)) / 100;
  const diasPeriodoRaw = parseFloat(document.getElementById('proy-excel-dias-periodo')?.value);
  const diasPeriodo = (isNaN(diasPeriodoRaw) || diasPeriodoRaw <= 0) ? 30 : diasPeriodoRaw;
  const diasRestantesRaw = parseFloat(document.getElementById('proy-excel-dias-restantes')?.value);
  const diasRestantes = isNaN(diasRestantesRaw) ? 0 : Math.max(0, diasRestantesRaw);
  excelProjData.forEach(d => {
    const prod = db.products.find(x => x.code === d.cod);
    d.packFactor = prod?.packFactor || 1;
    const calc = CalculoPedido.calcularProyeccionExcel({
      consumo: d.consumo,
      stockSeguridadPct: ss,
      diasPeriodo,
      diasRestantes,
      stockActual: d.stockActual || 0,
      enCamino: d.enCamino || 0,
      packFactor: d.packFactor,
      costoTotal: d.costoTotal || 0
    });
    d.seg = calc.seg;
    d.consumoDiario = calc.consumoDiario;
    d.consumoPendienteMes = calc.consumoPendienteMes;
    d.cajas = calc.cajas;
    d.pedido = calc.pedido;
    d.costoUnit = calc.costoUnit;
    d.costoTotalPed = calc.costoTotalPed;
  });
  const tPed = excelProjData.reduce((s, d) => s + d.pedido, 0);
  const tCosto = excelProjData.reduce((s, d) => s + (d.costoTotalPed || 0), 0);
  document.getElementById('proy-excel-stat-prod').textContent = excelProjData.length;
  document.getElementById('proy-excel-stat-ped').textContent  = tPed.toLocaleString('es-CL');
  document.getElementById('proy-excel-stat-costo').textContent = tCosto > 0 ? '$' + Math.round(tCosto).toLocaleString('es-CL') : 'S/D';
  document.getElementById('proy-excel-stats').style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px';
  document.getElementById('proy-excel-table-wrap').style.display = 'block';
  document.getElementById('proy-excel-empty').style.display   = 'none';
  renderExcelProjTable();
}

function renderExcelProjTable() {
  const q = (document.getElementById('proy-excel-search')?.value || '').toLowerCase();
  const filtered = (q ? excelProjData.filter(d => d.cod.toLowerCase().includes(q) || d.desc.toLowerCase().includes(q)) : excelProjData)
    .slice().sort((a, b) => a.cod.localeCompare(b.cod, undefined, { numeric: true, sensitivity: 'base' }));
  const tbody = document.getElementById('proy-excel-tbody');
  tbody.innerHTML = filtered.map((d, i) => {
    const globalIdx = excelProjData.indexOf(d);
    const stockActual = d.stockActual !== undefined ? d.stockActual : '';
    const enCamino = d.enCamino !== undefined ? d.enCamino : '';
    return `<tr style="border-top:1px solid var(--border);background:${i%2===0?'transparent':'rgba(0,153,204,0.02)'}">
      <td style="padding:7px 8px;font-family:monospace;font-size:10px;color:var(--muted);white-space:nowrap">${d.cod}</td>
      <td style="padding:7px 8px;font-size:11px;color:var(--text)">${d.desc}</td>
      <td style="padding:7px 8px;text-align:right;font-family:monospace">${d.consumo.toLocaleString('es-CL')}</td>
      <td style="padding:7px 8px;text-align:right;font-family:monospace;color:var(--muted)">${d.seg.toLocaleString('es-CL')}</td>
      <td style="padding:7px 8px;text-align:right">
        <input type="number" min="0" value="${stockActual}" placeholder="0"
          style="width:68px;padding:4px 6px;border:1.5px solid var(--border);border-radius:8px;font-size:12px;text-align:right;background:var(--surface);color:var(--text);font-family:monospace"
          oninput="updateExcelStockActual(${globalIdx}, this.value)">
        ${d.consumoPendienteMes > 0 ? `<div style="font-size:9px;color:var(--danger);margin-top:2px">-${d.consumoPendienteMes.toLocaleString('es-CL')} pend.</div>` : ''}
      </td>
      <td style="padding:7px 8px;text-align:right">
        <input type="number" min="0" value="${enCamino}" placeholder="0" title="Pedidos ya en camino o entregas semanales comprometidas que llegarán antes de fin de mes"
          style="width:68px;padding:4px 6px;border:1.5px solid var(--border);border-radius:8px;font-size:12px;text-align:right;background:var(--surface);color:var(--text);font-family:monospace"
          oninput="updateExcelEnCamino(${globalIdx}, this.value)">
      </td>
      <td style="padding:7px 8px;text-align:right;font-family:monospace;font-weight:700;color:var(--accent)" id="epedido-val-${globalIdx}">${d.pedido.toLocaleString('es-CL')}${d.packFactor > 1 ? ` <span style="font-weight:400;color:var(--muted)">(${d.cajas}c)</span>` : ''}</td>
      </tr>`;
  }).join('');
}

function updateStockActual(idx, val) {
  if (!projData[idx]) return;
  const stockActual = Math.max(0, parseInt(val) || 0);
  projData[idx].stockActual = stockActual;
  const pedido = Math.max(0, projData[idx].proyeccion + projData[idx].stockSeg - stockActual);
  projData[idx].pedido = pedido;
  projData[idx].costoTotalPed = pedido * (projData[idx].costoUnit || 0);
  // Update just the pedido cell
  const cell = document.getElementById('pedido-val-' + idx);
  if (cell) cell.textContent = pedido.toLocaleString('es-CL');
  // Update stats
  const tPed = projData.reduce((s, d) => s + d.pedido, 0);
  const tCosto = projData.reduce((s, d) => s + (d.costoTotalPed || 0), 0);
  const ps = document.getElementById('ps-ped');
  if (ps) ps.textContent = tPed.toLocaleString('es-CL');
  const pc = document.getElementById('ps-costo');
  if (pc) pc.textContent = tCosto > 0 ? '$' + Math.round(tCosto).toLocaleString('es-CL') : 'S/D';
}

function recomputePedidoExcel(idx) {
  const d = excelProjData[idx];
  if (!d) return;
  // d.seg ya viene calculado (con el % de stock de seguridad vigente) desde
  // recalcExcelProj(); acá solo se recalcula el pedido cuando el usuario edita
  // "En bodega" o "En camino" a mano.
  const stockActual = d.stockActual || 0;
  const enCamino = d.enCamino || 0;
  const consumoPendienteMes = d.consumoPendienteMes || 0;
  const stockDisponible = Math.max(0, stockActual - consumoPendienteMes);
  const pedidoUnid = Math.max(0, d.consumo + d.seg - stockDisponible - enCamino);
  const factorEmp = d.packFactor || 1;
  const { cajas, cantidad: pedido } = CalculoPedido.redondearAFactorEmpaque(pedidoUnid, factorEmp);
  d.cajas = cajas;
  d.pedido = pedido;
  d.costoTotalPed = pedido * (d.costoUnit || 0);
  const cell = document.getElementById('epedido-val-' + idx);
  if (cell) {
    cell.textContent = pedido.toLocaleString('es-CL') + (factorEmp > 1 ? ' (' + cajas + 'c)' : '');
    cell.style.color = pedido === 0 ? 'var(--muted)' : 'var(--accent)';
  }
  // Update totals
  const tPed = excelProjData.reduce((s, x) => s + x.pedido, 0);
  const tCosto = excelProjData.reduce((s, x) => s + (x.costoTotalPed || 0), 0);
  const ped = document.getElementById('proy-excel-stat-ped');
  if (ped) ped.textContent = tPed.toLocaleString('es-CL');
  const costo = document.getElementById('proy-excel-stat-costo');
  if (costo) costo.textContent = tCosto > 0 ? '$' + Math.round(tCosto).toLocaleString('es-CL') : 'S/D';
}

function updateExcelStockActual(idx, val) {
  if (!excelProjData[idx]) return;
  excelProjData[idx].stockActual = Math.max(0, parseInt(val) || 0);
  recomputePedidoExcel(idx);
}

function updateExcelEnCamino(idx, val) {
  if (!excelProjData[idx]) return;
  excelProjData[idx].enCamino = Math.max(0, parseInt(val) || 0);
  recomputePedidoExcel(idx);
}

function exportExcelProjCSV() {
  if (!excelProjData.length) return;
  const mes = document.getElementById('proy-excel-mes').value || 'Proyeccion';
  const ss  = document.getElementById('proy-excel-ss').value || '10';
  const h   = ['Código','Descripción','Consumo base','Stock seguridad ('+ss+'%)','Pedido sugerido','Costo unit.','Costo total estimado'];
  const rows = excelProjData.map(d => [d.cod, d.desc, d.consumo, d.seg, d.pedido, d.costoUnit||'', d.costoTotalPed||'']);
  const csv = '\uFEFF' + [h, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `DialiStock_Pedido_${mes.replace(/\s/g,'_')}.csv`;
  a.click();
  showAlert('✅ CSV exportado', 'success');
}

async function exportExcelProjXLSX() {
  if (!excelProjData.length) return;
  showAlert('Generando Excel...', 'info');
  const mes = document.getElementById('proy-excel-mes').value || 'Proyección';
  const ss  = document.getElementById('proy-excel-ss').value || '10';
  const fechaHoy = new Date().toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' });

  const DAVITA_BLUE = 'FF0057A8';
  const RED = 'FFC8102E';
  const GREEN = 'FF1D9E75';
  const WHITE = 'FFFFFFFF';

  const rows = excelProjData.map(d => ({
    cod: d.cod, desc: d.desc, consumo: d.consumo, seg: d.seg,
    bodega: d.stockActual || 0, enCamino: d.enCamino || 0, factorEmp: d.packFactor || 1, cajas: d.cajas || 0, pedido: d.pedido,
    costoUnit: d.costoUnit || 0, costoTotal: d.costoTotalPed || 0
  })).sort((a, b) => a.cod.localeCompare(b.cod, undefined, { numeric: true, sensitivity: 'base' }));
  const totalPedido = rows.reduce((s, r) => s + r.pedido, 0);
  const totalCajas = rows.reduce((s, r) => s + r.cajas, 0);
  const totalCosto = rows.reduce((s, r) => s + r.costoTotal, 0);
  const totalAPedir = rows.filter(r => r.pedido > 0).length;

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Proyección');
  ws.columns = [
    { width: 16 }, { width: 46 }, { width: 12 }, { width: 12 },
    { width: 12 }, { width: 12 }, { width: 12 }, { width: 11 }, { width: 14 }, { width: 12 }, { width: 16 }
  ];

  ws.mergeCells('A1:K1'); ws.getCell('A1').value = 'PROYECCIÓN DE PEDIDO — ' + mes.toUpperCase() + ' · DIALISTOCK';
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: WHITE } };
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DAVITA_BLUE } };
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 26;

  ws.mergeCells('A2:K2'); ws.getCell('A2').value = 'DaVita Chile · Centro Independencia C7848';
  ws.getCell('A2').font = { bold: true, size: 11, color: { argb: WHITE } };
  ws.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DAVITA_BLUE } };
  ws.getCell('A2').alignment = { horizontal: 'center' };

  ws.mergeCells('A3:K3'); ws.getCell('A3').value = fechaHoy + ' · Stock de seguridad: ' + ss + '%';
  ws.getCell('A3').font = { size: 10, color: { argb: WHITE } };
  ws.getCell('A3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DAVITA_BLUE } };
  ws.getCell('A3').alignment = { horizontal: 'center' };

  ws.getCell('A5').value = 'Productos analizados'; ws.getCell('A5').font = { bold: true };
  ws.getCell('B5').value = rows.length;
  ws.getCell('A6').value = 'Productos a pedir'; ws.getCell('A6').font = { bold: true };
  ws.getCell('B6').value = totalAPedir; ws.getCell('B6').font = { bold: true, color: { argb: RED } };
  ws.getCell('A7').value = 'Unidades / cajas totales a pedir'; ws.getCell('A7').font = { bold: true };
  ws.getCell('B7').value = totalPedido + ' un. (' + totalCajas + ' cajas)'; ws.getCell('B7').font = { bold: true, color: { argb: RED } };
  ws.getCell('A8').value = 'Costo total estimado'; ws.getCell('A8').font = { bold: true, size: 12 };
  ws.getCell('B8').value = Math.round(totalCosto); ws.getCell('B8').numFmt = '$#,##0';
  ws.getCell('B8').font = { bold: true, size: 12, color: { argb: DAVITA_BLUE } };

  const headers = ['Código','Descripción','Consumo base','Stock seg. (' + ss + '%)','En bodega','En camino','Factor empaque','Cajas a pedir','Pedido sugerido','Costo unit.','Costo total estimado'];
  const headerRow = ws.getRow(10);
  headers.forEach((hdr, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = hdr;
    cell.font = { bold: true, color: { argb: WHITE }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DAVITA_BLUE } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  headerRow.height = 26;

  rows.forEach((r, i) => {
    const rowNum = 11 + i;
    const row = ws.getRow(rowNum);
    const bg = r.pedido > 0 ? 'FFFDE8E8' : 'FFEAFAF1';
    const txt = r.pedido > 0 ? RED : GREEN;
    const vals = [r.cod, r.desc, r.consumo, r.seg, r.bodega, r.enCamino, r.factorEmp, r.cajas, r.pedido, r.costoUnit, r.costoTotal];
    vals.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.font = { size: 10, color: (ci === 7 || ci === 8) ? { argb: txt } : undefined, bold: ci === 7 || ci === 8 };
      cell.alignment = { vertical: 'middle', horizontal: ci >= 2 ? 'right' : 'left' };
      if (ci === 9 && typeof v === 'number') cell.numFmt = '$#,##0';
      if (ci === 10 && typeof v === 'number') cell.numFmt = '$#,##0';
    });
  });

  ws.views = [{ state: 'frozen', ySplit: 10 }];

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  saveAs(blob, `DialiStock_Pedido_${mes.replace(/\s/g,'_')}_${new Date().toISOString().slice(0,10)}.xlsx`);
  showAlert('✅ Excel detallado exportado', 'success');
}

function exportExcelProjPDF() {
  if (!excelProjData.length) return;
  showAlert('Generando PDF...', 'info');
  const mes = document.getElementById('proy-excel-mes').value || 'Proyección';
  const ss  = document.getElementById('proy-excel-ss').value || '10';
  const fechaHoy = new Date().toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' });

  const rows = excelProjData.map(d => ({
    cod: d.cod, desc: d.desc, consumo: d.consumo, seg: d.seg,
    bodega: d.stockActual || 0, enCamino: d.enCamino || 0, factorEmp: d.packFactor || 1, cajas: d.cajas || 0, pedido: d.pedido,
    costoUnit: d.costoUnit || 0, costoTotal: d.costoTotalPed || 0
  })).sort((a, b) => a.cod.localeCompare(b.cod, undefined, { numeric: true, sensitivity: 'base' }));

  const totalPedido = rows.reduce((s, r) => s + r.pedido, 0);
  const totalCajas = rows.reduce((s, r) => s + r.cajas, 0);
  const totalCosto = rows.reduce((s, r) => s + r.costoTotal, 0);
  const totalAPedir = rows.filter(r => r.pedido > 0).length;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const DAVITA_BLUE = [0, 87, 168];
  const RED = [200, 16, 46];

  doc.setFillColor(...DAVITA_BLUE);
  doc.rect(0, 0, pageWidth, 62, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text('PROYECCIÓN DE PEDIDO — ' + mes.toUpperCase(), pageWidth / 2, 26, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.text('DaVita Chile · Centro Independencia C7848', pageWidth / 2, 42, { align: 'center' });
  doc.text(fechaHoy + ' · Stock de seguridad: ' + ss + '%', pageWidth / 2, 56, { align: 'center' });

  doc.setTextColor(30, 30, 30);
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  const summaryY = 82;
  doc.text('Productos analizados: ' + rows.length, 40, summaryY);
  doc.setTextColor(...RED);
  doc.text('Productos a pedir: ' + totalAPedir, 250, summaryY);
  doc.text('A pedir: ' + totalPedido.toLocaleString('es-CL') + ' un. (' + totalCajas.toLocaleString('es-CL') + ' cajas)', 430, summaryY);
  doc.setTextColor(...DAVITA_BLUE);
  doc.text('Costo total estimado: $' + Math.round(totalCosto).toLocaleString('es-CL'), 660, summaryY);

  doc.autoTable({
    startY: 96,
    head: [['Código','Descripción','Consumo base','Stock seg.','En bodega','En camino','Factor','Cajas','Pedido sugerido','Costo unit.','Costo total']],
    body: rows.map(r => [
      r.cod, r.desc, r.consumo.toLocaleString('es-CL'), r.seg.toLocaleString('es-CL'),
      r.bodega.toLocaleString('es-CL'), r.enCamino.toLocaleString('es-CL'), r.factorEmp.toLocaleString('es-CL'), r.cajas.toLocaleString('es-CL'),
      r.pedido.toLocaleString('es-CL'),
      r.costoUnit ? '$' + r.costoUnit.toLocaleString('es-CL') : '-',
      r.costoTotal ? '$' + Math.round(r.costoTotal).toLocaleString('es-CL') : '-'
    ]),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: DAVITA_BLUE, textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' },
      7: { halign: 'right', fontStyle: 'bold' }, 8: { halign: 'right', fontStyle: 'bold' }, 9: { halign: 'right' }, 10: { halign: 'right' }
    },
    didParseCell: data => {
      if (data.section === 'body' && (data.column.index === 7 || data.column.index === 8)) {
        const pedido = rows[data.row.index].pedido;
        if (pedido > 0) { data.cell.styles.textColor = RED; }
      }
    },
    didDrawPage: data => {
      const str = 'Página ' + doc.internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text(str, pageWidth - 60, doc.internal.pageSize.getHeight() - 15);
      doc.text('Generado por DialiStock', 40, doc.internal.pageSize.getHeight() - 15);
    }
  });

  doc.save(`DialiStock_Pedido_${mes.replace(/\s/g,'_')}_${new Date().toISOString().slice(0,10)}.pdf`);
  showAlert('✅ PDF detallado exportado', 'success');
}

