// ==================== MOTOR DE CÁLCULO (puro, sin DOM) ====================
// Este archivo NO debe tocar el DOM ni variables globales de la app (db, etc).
// Cada función recibe números simples y devuelve números simples, para que
// se puedan probar con datos de ejemplo sin tener que abrir la app entera.
//
// Se usa desde:
//   - proyeccion.js  → renderProyeccion() y exportarProyeccion()
//   - proyeccion.js  → recalcExcelProj() y recomputePedidoExcel() (motor detrás
//     de los PDF/Excel de "Proyección de Pedido" que se envían a Gabriel)
//   - pacientes.js   → calcularInsumos() (Kit FAV / Kit CVC)

(function (root) {
  'use strict';

  /**
   * Redondea una cantidad de unidades al factor de empaque (caja) más cercano
   * hacia arriba. Ej: 91 unidades con factor 4 → 23 cajas → 92 unidades.
   */
  function redondearAFactorEmpaque(unidades, packFactor) {
    const factor = (packFactor && packFactor > 0) ? packFactor : 1;
    const cajas = Math.ceil(Math.max(0, unidades) / factor);
    return { cajas, cantidad: cajas * factor };
  }

  /**
   * Determina si un movimiento de salida debe contarse como consumo real de
   * pacientes al calcular la base de la Proyección de Pedido.
   *
   * Los domingos, en los centros, se hacen "consumos" que en realidad son
   * ajustes para cuadrar algún insumo — no reflejan atención real de
   * pacientes. Si se suman igual que un día normal, distorsionan el
   * promedio diario y la proyección termina sobre o subestimando el pedido.
   * Por eso se excluyen de la base de cálculo (el movimiento sigue existiendo
   * y sigue afectando el stock real — solo no cuenta para este cálculo).
   *
   * @param {string} fechaISO - fecha del movimiento (m.date)
   * @returns {boolean} true si el movimiento debe contarse como consumo típico
   */
  function esConsumoValidoParaProyeccion(fechaISO) {
    const dia = new Date(fechaISO).getDay(); // 0 = domingo
    return dia !== 0;
  }

  /**
   * Fórmula usada en la pestaña "Proyección" en vivo (renderProyeccion).
   * Calcula cuánto pedir de un producto a partir de su consumo histórico.
   *
   * @param {Object} p
   * @param {number} p.consumoTotal   - unidades consumidas en el período analizado
   * @param {number} p.periodoDias    - largo del período analizado (ej. 30 días)
   * @param {number} p.diasNecesidad  - días de cobertura que se quieren asegurar
   * @param {number} p.diasSeguridad  - días extra de stock de seguridad
   * @param {number} [p.factorAjuste] - factor de censo de pacientes (1 = sin ajuste)
   * @param {number} p.stockBodega    - stock físico disponible hoy
   * @param {number} [p.packFactor]   - unidades por caja (1 = sin empaque)
   */
  function calcularProyeccionProducto(p) {
    const factorAjuste = p.factorAjuste || 1;
    const consumoDiario = (p.consumoTotal / p.periodoDias) * factorAjuste;
    const necesidadMes = consumoDiario * p.diasNecesidad;
    const stockSeguridad = consumoDiario * p.diasSeguridad;
    const totalNecesario = necesidadMes + stockSeguridad;
    const cantidadPedirUnidades = Math.max(0, Math.ceil(totalNecesario - p.stockBodega));
    const { cajas, cantidad } = redondearAFactorEmpaque(cantidadPedirUnidades, p.packFactor);
    return {
      consumoDiario: Math.round(consumoDiario * 100) / 100,
      necesidadMes: Math.ceil(necesidadMes),
      stockSeguridad: Math.ceil(stockSeguridad),
      totalNecesario: Math.ceil(totalNecesario),
      cantidadPedirUnidades,
      cajasPedir: cajas,
      cantidadPedir: cantidad,
      debePedir: cantidad > 0
    };
  }

  /**
   * Fórmula usada en las proyecciones basadas en Excel importado
   * (recalcExcelProj / recomputePedidoExcel) — es el motor detrás de los
   * PDF/Excel "Proyección de Pedido" que se envían al gerente.
   *
   * @param {Object} p
   * @param {number} p.consumo              - consumo base del período
   * @param {number} p.stockSeguridadPct     - fracción de stock de seguridad (0.10 = 10%)
   * @param {number} p.diasPeriodo           - días que cubre el consumo base
   * @param {number} [p.diasRestantes]       - días que faltan del mes en curso (consumo pendiente)
   * @param {number} [p.stockActual]         - stock físico en bodega
   * @param {number} [p.enCamino]            - unidades ya pedidas/en tránsito
   * @param {number} [p.packFactor]          - unidades por caja
   * @param {number} [p.costoTotal]          - costo total histórico consumido (para costo unitario)
   */
  function calcularProyeccionExcel(p) {
    const ss = p.stockSeguridadPct || 0;
    const diasRestantes = p.diasRestantes || 0;
    const stockActual = p.stockActual || 0;
    const enCamino = p.enCamino || 0;
    const costoTotal = p.costoTotal || 0;

    const seg = Math.round(p.consumo * ss);
    const consumoDiario = p.consumo / p.diasPeriodo;
    const consumoPendienteMes = Math.round(consumoDiario * diasRestantes);
    const stockDisponible = Math.max(0, stockActual - consumoPendienteMes);
    const pedidoUnid = Math.max(0, p.consumo + seg - stockDisponible - enCamino);
    const { cajas, cantidad: pedido } = redondearAFactorEmpaque(pedidoUnid, p.packFactor);
    const costoUnit = costoTotal > 0 ? Math.round(costoTotal / p.consumo) : 0;
    const costoTotalPed = pedido * costoUnit;

    return {
      seg,
      consumoDiario,
      consumoPendienteMes,
      stockDisponible,
      pedidoUnid,
      cajas,
      pedido,
      costoUnit,
      costoTotalPed
    };
  }

  /**
   * Agrega las necesidades de insumos de los kits FAV y CVC para una
   * cantidad de pacientes y sesiones dadas. Refleja calcularInsumos() de
   * pacientes.js, sin tocar el DOM.
   *
   * @param {Array} kitFav   - lista de items { nombre, codigo, cantidad }
   * @param {Array} kitCvc   - lista de items { nombre, codigo, cantidad }
   * @param {number} pacFav  - Nº de pacientes FAV en la sesión
   * @param {number} pacCvc  - Nº de pacientes CVC en la sesión
   * @param {number} sesionesDia - sesiones por día (para el total del día)
   * @returns {Object} mapa código -> { nombre, codigo, sesion, dia }
   */
  function calcularNecesidadesKits(kitFav, kitCvc, pacFav, pacCvc, sesionesDia) {
    const favDia = pacFav * sesionesDia;
    const cvcDia = pacCvc * sesionesDia;
    const needed = {};

    function addNeeded(kit, countSesion, countDia) {
      kit.forEach(function (item) {
        const key = item.codigo;
        if (!needed[key]) needed[key] = { nombre: item.nombre, codigo: item.codigo, sesion: 0, dia: 0 };
        needed[key].sesion += item.cantidad * countSesion;
        needed[key].dia += item.cantidad * countDia;
      });
    }

    addNeeded(kitFav, pacFav, favDia);
    addNeeded(kitCvc, pacCvc, cvcDia);
    return needed;
  }

  /**
   * Convierte el valor de un campo numérico a número, respetando un 0
   * explícito como valor válido (a diferencia de `parseInt(v) || default`,
   * que confunde "el usuario escribió 0" con "el campo está vacío" y
   * silenciosamente reemplaza el 0 por el valor por defecto).
   * Solo cae al valor por defecto si el campo está vacío o no es un número.
   */
  function numeroODefault(valorCrudo, valorPorDefecto) {
    if (valorCrudo === '' || valorCrudo === null || valorCrudo === undefined) {
      return valorPorDefecto;
    }
    const n = parseInt(valorCrudo, 10);
    return Number.isNaN(n) ? valorPorDefecto : n;
  }

  /**
   * Fusiona la versión local de la base con la remota cuando, al guardar,
   * se detecta que otro dispositivo/usuario escribió en el medio (ver
   * data-init.js → guardarConFusionDeConflictos). Los movimientos son
   * acumulables por naturaleza — cada uno con ID único — así que se unen
   * sin perder ninguno, y el stock de cada producto se ajusta sumando el
   * efecto de los movimientos que solo existían del otro lado.
   *
   * @param {Object} local  - { products, movements } tal como está en este dispositivo
   * @param {Object} remoto - { products, movements } tal como está en Firestore
   * @returns {Object} { products, movements } fusionados
   */
  function fusionarBases(local, remoto) {
    const movimientosLocalIds = new Set(local.movements.map(function (m) { return m.id; }));
    const movimientosSoloRemotos = remoto.movements.filter(function (m) { return !movimientosLocalIds.has(m.id); });

    const movimientosFusionados = local.movements.concat(movimientosSoloRemotos)
      .sort(function (a, b) { return new Date(a.date) - new Date(b.date); });

    const productos = local.products.map(function (p) { return Object.assign({}, p); });
    movimientosSoloRemotos.forEach(function (m) {
      const p = productos.find(function (x) { return x.id === m.productId; });
      if (!p) return;
      if (m.type === 'salida') p.stock = Math.max(0, p.stock - m.qty);
      else p.stock = p.stock + m.qty; // 'entrada' y 'devolucion' suman stock
    });

    const idsLocales = new Set(productos.map(function (p) { return p.id; }));
    remoto.products.forEach(function (p) {
      if (!idsLocales.has(p.id)) productos.push(Object.assign({}, p));
    });

    return { products: productos, movements: movimientosFusionados };
  }

  /**
   * Detecta, dentro de las entradas del diario de hoy, cuáles se salen mucho
   * del patrón histórico de consumo diario de ese producto — para alertar
   * antes de exportar a Dynamics (ver diario-charts-tabs.js). No excluye
   * nada automáticamente, solo marca para que la persona revise.
   *
   * @param {Array} entradasDiario  - [{ productId, codigo, nombre, qty }]
   * @param {Array} movimientos     - historial completo: [{ productId, type, qty, date }]
   * @param {string} hoyStr         - fecha de hoy en 'es-CL', para excluirla del promedio
   * @param {number} [diasHistorial] - días atrás a considerar (default 30)
   * @param {Date} [ahora]          - momento de referencia (default: ahora mismo; parametrizable para tests)
   * @returns {Array} alertas: [{ nombre, codigo, qty, promedio }]
   */
  function detectarAnomalias(entradasDiario, movimientos, hoyStr, diasHistorial, ahora) {
    const dias = diasHistorial || 30;
    const ahoraRef = ahora || new Date();
    const desde = new Date(ahoraRef.getTime() - dias * 24 * 60 * 60 * 1000);
    const alertas = [];

    entradasDiario.forEach(function (d) {
      const histPorDia = {};
      movimientos.forEach(function (m) {
        if (m.type !== 'salida' || m.productId !== d.productId) return;
        const fechaMov = new Date(m.date);
        if (fechaMov < desde) return;
        const fechaLabel = fechaMov.toLocaleDateString('es-CL');
        if (fechaLabel === hoyStr) return;
        histPorDia[fechaLabel] = (histPorDia[fechaLabel] || 0) + m.qty;
      });

      const valoresDiarios = Object.values(histPorDia);
      if (!valoresDiarios.length) return;

      const promedio = valoresDiarios.reduce(function (a, b) { return a + b; }, 0) / valoresDiarios.length;
      const umbral = Math.max(promedio * 2, promedio + 5);
      if (d.qty > umbral && (d.qty - promedio) >= 5) {
        alertas.push({
          nombre: d.nombre,
          codigo: d.codigo,
          qty: d.qty,
          promedio: Math.round(promedio * 10) / 10
        });
      }
    });

    return alertas;
  }

  const api = {
    redondearAFactorEmpaque,
    esConsumoValidoParaProyeccion,
    calcularProyeccionProducto,
    calcularProyeccionExcel,
    calcularNecesidadesKits,
    numeroODefault,
    fusionarBases,
    detectarAnomalias
  };

  // Funciona tanto en el navegador (window.CalculoPedido) como en Node (tests)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.CalculoPedido = api;
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
