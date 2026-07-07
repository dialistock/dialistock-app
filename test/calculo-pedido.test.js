// Pruebas automatizadas del motor de cálculo de DialiStock.
// Se ejecutan con: node --test test/
// (no requieren instalar nada; usan el test runner incluido en Node.js)

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  redondearAFactorEmpaque,
  calcularProyeccionProducto,
  calcularProyeccionExcel,
  calcularNecesidadesKits
} = require('../calculo-pedido.js');

// ==================== redondearAFactorEmpaque ====================

test('redondearAFactorEmpaque: sin resto, calza exacto', () => {
  const r = redondearAFactorEmpaque(200, 100);
  assert.equal(r.cajas, 2);
  assert.equal(r.cantidad, 200);
});

test('redondearAFactorEmpaque: con resto, redondea hacia arriba', () => {
  const r = redondearAFactorEmpaque(414, 4);
  assert.equal(r.cajas, 104);   // ceil(414/4) = ceil(103.5) = 104
  assert.equal(r.cantidad, 416); // 104 * 4
});

test('redondearAFactorEmpaque: factor 1 no cambia la cantidad', () => {
  const r = redondearAFactorEmpaque(973, 1);
  assert.equal(r.cajas, 973);
  assert.equal(r.cantidad, 973);
});

test('redondearAFactorEmpaque: 0 unidades pedidas da 0 cajas', () => {
  const r = redondearAFactorEmpaque(0, 50);
  assert.equal(r.cajas, 0);
  assert.equal(r.cantidad, 0);
});

test('redondearAFactorEmpaque: nunca da negativo aunque el input sea negativo', () => {
  const r = redondearAFactorEmpaque(-50, 10);
  assert.equal(r.cajas, 0);
  assert.equal(r.cantidad, 0);
});

test('redondearAFactorEmpaque: factor 0 o indefinido se trata como 1 (evita división por cero)', () => {
  const r1 = redondearAFactorEmpaque(10, 0);
  const r2 = redondearAFactorEmpaque(10, undefined);
  assert.equal(r1.cantidad, 10);
  assert.equal(r2.cantidad, 10);
});

// ==================== calcularProyeccionProducto (pestaña Proyección en vivo) ====================

test('calcularProyeccionProducto: caso básico sin ajuste de censo', () => {
  const r = calcularProyeccionProducto({
    consumoTotal: 300,
    periodoDias: 30,
    diasNecesidad: 26,
    diasSeguridad: 12,
    stockBodega: 50,
    packFactor: 1
  });
  // consumoDiario = 10 → necesidadMes = 260, stockSeguridad = 120, total = 380
  assert.equal(r.consumoDiario, 10);
  assert.equal(r.necesidadMes, 260);
  assert.equal(r.stockSeguridad, 120);
  assert.equal(r.totalNecesario, 380);
  // pedir = 380 - 50 = 330
  assert.equal(r.cantidadPedir, 330);
  assert.equal(r.debePedir, true);
});

test('calcularProyeccionProducto: stock suficiente da pedido cero (nunca negativo)', () => {
  const r = calcularProyeccionProducto({
    consumoTotal: 100,
    periodoDias: 30,
    diasNecesidad: 26,
    diasSeguridad: 12,
    stockBodega: 100000,
    packFactor: 1
  });
  assert.equal(r.cantidadPedir, 0);
  assert.equal(r.debePedir, false);
});

test('calcularProyeccionProducto: aplica el factor de censo de pacientes', () => {
  const sinAjuste = calcularProyeccionProducto({
    consumoTotal: 300, periodoDias: 30, diasNecesidad: 26, diasSeguridad: 12,
    stockBodega: 0, packFactor: 1, factorAjuste: 1
  });
  const conAjuste = calcularProyeccionProducto({
    consumoTotal: 300, periodoDias: 30, diasNecesidad: 26, diasSeguridad: 12,
    stockBodega: 0, packFactor: 1, factorAjuste: 1.5 // 50% más pacientes
  });
  assert.equal(conAjuste.cantidadPedir, Math.round(sinAjuste.cantidadPedir * 1.5));
});

test('calcularProyeccionProducto: redondea al factor de empaque', () => {
  const r = calcularProyeccionProducto({
    consumoTotal: 91, periodoDias: 30, diasNecesidad: 30, diasSeguridad: 0,
    stockBodega: 0, packFactor: 4
  });
  // necesario = 91 → 91/4 = 22.75 → 23 cajas → 92 unidades
  assert.equal(r.cajasPedir, 23);
  assert.equal(r.cantidadPedir, 92);
});

// ==================== calcularProyeccionExcel (motor detrás del PDF/Excel de pedido) ====================

test('calcularProyeccionExcel: caso real ACF-213 (fusión 924-A + 925-A) verificado con JP', () => {
  const r = calcularProyeccionExcel({
    consumo: 252.5,
    stockSeguridadPct: 0.10,
    diasPeriodo: 30,
    diasRestantes: 0,
    stockActual: 30,
    enCamino: 80,
    packFactor: 2
  });
  assert.equal(r.seg, 25); // round(252.5 * 0.10) = round(25.25) = 25
  // pedidoUnid = 252.5 + 25 - 30 - 80 = 167.5 → redondeado a factor 2 → 168
  assert.equal(r.pedido, 168);
  assert.equal(r.cajas, 84);
});

test('calcularProyeccionExcel: caso real ACF-215 (reemplaza 926-A) — stock ya cubre la necesidad', () => {
  const r = calcularProyeccionExcel({
    consumo: 234,
    stockSeguridadPct: 0.10,
    diasPeriodo: 30,
    diasRestantes: 0,
    stockActual: 130,
    enCamino: 616,
    packFactor: 2
  });
  assert.equal(r.seg, 23);
  // 234 + 23 - 130 - 616 = -489 → clamp a 0
  assert.equal(r.pedidoUnid, 0);
  assert.equal(r.pedido, 0);
  assert.equal(r.cajas, 0);
});

test('calcularProyeccionExcel: consumo pendiente del mes descuenta del stock disponible', () => {
  // Si quedan 10 días del mes y se van a consumir 5/día, hay que reservar 50
  // unidades del stock actual — no están realmente "libres" para cubrir el pedido.
  const r = calcularProyeccionExcel({
    consumo: 150,
    stockSeguridadPct: 0.10,
    diasPeriodo: 30,   // consumoDiario = 5
    diasRestantes: 10, // consumoPendienteMes = 50
    stockActual: 100,
    enCamino: 0,
    packFactor: 1
  });
  assert.equal(r.consumoPendienteMes, 50);
  assert.equal(r.stockDisponible, 50); // 100 - 50
  // pedidoUnid = 150 + 15 - 50 - 0 = 115
  assert.equal(r.pedidoUnid, 115);
});

test('calcularProyeccionExcel: calcula costo unitario y total a partir del costo histórico', () => {
  const r = calcularProyeccionExcel({
    consumo: 100,
    stockSeguridadPct: 0.10,
    diasPeriodo: 30,
    stockActual: 0,
    enCamino: 0,
    packFactor: 1,
    costoTotal: 10000 // costo unit = 100
  });
  assert.equal(r.costoUnit, 100);
  assert.equal(r.costoTotalPed, r.pedido * 100);
});

test('calcularProyeccionExcel: sin costo histórico, el costo unitario es 0 (no divide por cero)', () => {
  const r = calcularProyeccionExcel({
    consumo: 100, stockSeguridadPct: 0.10, diasPeriodo: 30,
    stockActual: 0, enCamino: 0, packFactor: 1
  });
  assert.equal(r.costoUnit, 0);
  assert.equal(r.costoTotalPed, 0);
});

// ==================== calcularNecesidadesKits (Kit FAV / Kit CVC) ====================

const KIT_FAV_TEST = [
  { nombre: 'Kit FAV', codigo: 'KIT-FAV', cantidad: 1 },
  { nombre: 'AVF AGUJA', codigo: '101-108-002', cantidad: 2 },
  { nombre: 'ALCOHOL SWAB', codigo: '102-101-004', cantidad: 4 }
];
const KIT_CVC_TEST = [
  { nombre: 'Kit CVC', codigo: 'KIT-CVC', cantidad: 1 },
  { nombre: 'ALCOHOL SWAB', codigo: '102-101-004', cantidad: 2 },
  { nombre: 'CONECTOR TEGO', codigo: '102-105-060', cantidad: 2 }
];

test('calcularNecesidadesKits: multiplica cantidad del kit x pacientes x sesiones', () => {
  const r = calcularNecesidadesKits(KIT_FAV_TEST, KIT_CVC_TEST, 13, 13, 3);
  // AVF AGUJA: solo en kit FAV, 2 por paciente
  assert.equal(r['101-108-002'].sesion, 13 * 2);       // 26 por sesión
  assert.equal(r['101-108-002'].dia, 13 * 3 * 2);      // 78 por día (3 sesiones)
});

test('calcularNecesidadesKits: acumula insumos compartidos entre ambos kits (ALCOHOL SWAB)', () => {
  const r = calcularNecesidadesKits(KIT_FAV_TEST, KIT_CVC_TEST, 13, 13, 3);
  // FAV aporta 4 x 13 = 52, CVC aporta 2 x 13 = 26 → total sesión = 78
  assert.equal(r['102-101-004'].sesion, 13 * 4 + 13 * 2);
});

test('calcularNecesidadesKits: con 0 pacientes de un tipo, sus insumos exclusivos dan 0', () => {
  const r = calcularNecesidadesKits(KIT_FAV_TEST, KIT_CVC_TEST, 0, 10, 3);
  assert.equal(r['101-108-002'].sesion, 0);   // exclusivo de FAV
  assert.equal(r['102-105-060'].sesion, 20);  // exclusivo de CVC, 10 pacientes x 2
});
