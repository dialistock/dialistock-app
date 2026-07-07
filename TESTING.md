# Pruebas automatizadas de DialiStock

## Qué se probó y por qué

Hasta ahora, las fórmulas de cálculo de pedido (cuánto pedir de cada insumo)
vivían mezcladas con el código de pantalla (HTML, botones, etc.) en 3 lugares
distintos de `proyeccion.js`, y una vez más en `pacientes.js` para los Kits
FAV/CVC. Eso es riesgoso: un cambio futuro en una pantalla puede romper sin
querer el cálculo de otra, y no había forma de comprobar automáticamente que
los números siguen siendo correctos.

Se extrajo esa lógica a un archivo nuevo, **`calculo-pedido.js`**, con
funciones puras (reciben números, devuelven números, no tocan pantalla ni la
base de datos). Las pantallas ahora llaman a esas funciones en vez de repetir
la fórmula. Y se escribió un conjunto de **18 pruebas automatizadas** que
verifican esas funciones con casos conocidos — incluyendo los casos reales de
ACF-213 y ACF-215 que revisamos juntos para el pedido de agosto.

## Cómo correr las pruebas

Necesitas tener [Node.js](https://nodejs.org) instalado (cualquier versión
18 o más nueva sirve). Luego, desde la carpeta del proyecto:

```
npm test
```

o directamente:

```
node --test test/*.test.js
```

Deberías ver algo como:

```
# tests 18
# pass 18
# fail 0
```

Si alguna vez cambias una fórmula de pedido y una prueba empieza a fallar
("not ok"), es una señal de que ese cambio alteró el resultado — revisa si
era intencional antes de subir el cambio a producción.

## Qué cubren las 18 pruebas

- **Redondeo al factor de empaque** (cajas): casos exactos, con resto, cero,
  negativos, y factor inválido (protege contra división por cero).
- **Proyección en vivo** (pestaña "Proyección"): cálculo básico, stock
  suficiente (nunca pedido negativo), factor de censo de pacientes, y
  redondeo a caja.
- **Proyección basada en Excel** (el motor detrás de los PDF/Excel de pedido
  que se envían a Gabriel): los 2 casos reales de ACF-213/ACF-215, el
  descuento por "días que faltan" del mes, y el cálculo de costo unitario.
- **Kits FAV/CVC** (pestaña Pacientes): multiplicación por pacientes y
  sesiones, acumulación de insumos compartidos entre ambos kits, y el caso
  de cero pacientes de un tipo.

## Si agregas una función de cálculo nueva

Agrégala a `calculo-pedido.js` como función pura (sin `document.getElementById`
ni variables globales adentro), y súmale sus pruebas en
`test/calculo-pedido.test.js`. Así cualquier persona (o Claude, en una sesión
futura) puede confirmar en segundos que el cálculo sigue siendo correcto,
sin tener que abrir la app y probar a mano cada escenario.
