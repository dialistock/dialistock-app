# DialiStock — Multi-centro (Etapa 1: Inventario + Movimientos)

## Qué se construyó
- DialiStock ahora soporta 4 centros: **Independencia** (el real, sin
  tocar), **Recoleta**, **Quilicura**, **Huechuraba**.
- Cada centro tiene su propio inventario y su propio historial de
  Movimientos, completamente aislados.
- Selector de centro en el header — solo aparece si tu cuenta tiene acceso
  a más de uno.
- Los roles (admin/lector) ahora son **por centro** — puedes ser admin en
  Independencia y lector en Recoleta, por ejemplo.
- Los centros nuevos parten con el mismo catálogo de 77 productos que
  Independencia, pero con el stock en 0 — para que los vayas cargando con
  la realidad de cada uno.

## Qué NO cambió todavía (Etapa 2, más adelante)
Diario, Vencimientos/Lotes, Recepción, Conteo — espera, Conteo Físico SÍ
quedó separado (es parte de Inventario). Lo que sigue **compartido entre
los 4 centros** por ahora: Diario, Vencimientos/Lotes, Recepción de
proveedores, Pacientes. No se rompe nada, solo no está aislado todavía.

## Paso 1 — Migrar tu perfil de usuario a la nueva estructura

Tu cuenta admin actual tiene un campo `rol: "admin"` plano. Hay que
cambiarlo a la nueva estructura de `centros`:

1. Ve a **console.firebase.google.com** → proyecto **dialistock** →
   **Firestore Database** → colección **`dialistock_usuarios`**
2. Abre tu documento (el UID de tu cuenta admin)
3. **Borra el campo `rol`** (pasa el mouse sobre el campo → ícono de
   basurero)
4. **Agrega un campo nuevo**: `centros` → tipo **map**
5. Dentro de ese map, agrega 4 campos (todos tipo string):
   - `independencia` → `admin`
   - `recoleta` → `admin`
   - `quilicura` → `admin`
   - `huechuraba` → `admin`
6. Guardar

(Si tienes más de una cuenta admin por el incidente de la contraseña, repite
esto en cada una.)

## Paso 2 — Publicar las reglas de Firestore nuevas

1. **Firestore Database** → pestaña **Reglas**
2. Borra todo y pega el contenido de `firestore.rules` (adjunto)
3. **Publicar**

## Paso 3 — Subir el código a GitHub

Sube el contenido del zip completo (reemplaza todo, como siempre) a tu
repositorio `dialistock-app`. Archivos nuevos/cambiados en esta etapa:
- `centros.js` (nuevo)
- `data-init.js`
- `auth-login.js`
- `inventario-fisico.js`
- `index.html`
- `styles.css`
- `firestore.rules`
- `sw.js`

## Cómo probarlo

1. Abre DialiStock, inicia sesión con tu cuenta (ya migrada al Paso 1)
2. Deberías ver un selector con 4 botones bajo el header: Independencia,
   Recoleta, Quilicura, Huechuraba
3. Confirma que **Independencia** sigue mostrando tus 77 productos reales,
   igual que siempre (nada debería verse distinto)
4. Toca **Recoleta** — debería cargar los mismos 77 productos, pero todos
   con stock en 0 (recién sembrado)
5. Haz un movimiento de prueba en Recoleta (ej. una entrada de 10 unidades
   de algo) y confirma que:
   - Se ve en Movimientos de Recoleta
   - Vuelve a Independencia y confirma que **no aparece ahí** (están
     aislados)
6. Revisa en Firestore que se haya creado la colección
   `centros/recoleta/data/main` con esos datos

## Si algo sale mal

- **El selector no aparece**: revisa que tu perfil en `dialistock_usuarios`
  tenga el campo `centros` (map) con al menos 2 centros — con solo 1, el
  selector se oculta a propósito (no tiene sentido mostrarlo).
- **"Tu cuenta no tiene acceso a este centro"**: falta agregar ese centro
  al map `centros` de tu perfil (Paso 1).
- **Independencia se ve distinto o con datos raros**: avísame de inmediato,
  no debería haber cambiado nada ahí — mándame captura.
