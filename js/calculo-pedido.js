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

  const api = {
    redondearAFactorEmpaque,
    calcularProyeccionProducto,
    calcularProyeccionExcel,
    calcularNecesidadesKits,
    numeroODefault
  };

  // Funciona tanto en el navegador (window.CalculoPedido) como en Node (tests)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.CalculoPedido = api;
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
