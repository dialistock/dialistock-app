# DialiStock — Login real con roles (admin / lector)

## Qué cambia con esto
- Ya no basta con abrir el link para usar DialiStock: cada persona necesita
  una cuenta (correo + contraseña) para entrar.
- Cada cuenta tiene un rol:
  - **admin** → puede ver y editar todo, igual que hoy.
  - **lector** → puede ver todo (dashboard, inventario, proyecciones, etc.)
    pero las acciones que modifican datos (agregar producto, registrar
    movimiento, descontar stock, confirmar recepción, etc.) quedan
    bloqueadas, con un aviso claro en pantalla.
- El bloqueo de "lector" no es solo cosmético: las reglas de Firestore
  (del lado del servidor) también exigen rol admin para escribir. Aunque
  alguien abra las herramientas de desarrollador del navegador, no puede
  saltarse el bloqueo.

## Paso 1 — Activar el proveedor Email/Password
1. https://console.firebase.google.com → proyecto **dialistock**
2. **Authentication** → pestaña **Sign-in method**
3. Busca **"Correo electrónico/contraseña"** → actívalo → Guardar

## Paso 2 — Crear una cuenta para cada persona
Repite esto por cada persona que deba entrar a DialiStock (tú, Constanza,
Gabriel, TENS, etc.):

1. **Authentication** → pestaña **Users** (Usuarios)
2. Click **"Agregar usuario"**
3. Ingresa su correo (puede ser el corporativo de DaVita) y una **contraseña
   temporal** (después cada persona puede cambiarla desde su cuenta de
   Google/Firebase si quieres agregar esa opción más adelante — por ahora
   avísales la clave temporal por un canal seguro, no por el chat del grupo)
4. Click **"Agregar usuario"**
5. **Copia el UID** que aparece en la lista junto a su correo (una cadena
   larga tipo `Ab12Cd34Ef...`) — lo necesitas para el siguiente paso

## Paso 3 — Asignar el rol de cada persona
1. **Firestore Database** → pestaña **Datos**
2. Click **"Iniciar colección"** (si es la primera vez) o **"Agregar
   colección"**
3. ID de la colección: `dialistock_usuarios`
4. ID del documento: pega el **UID** que copiaste en el paso anterior
   (importante: el ID del documento debe ser exactamente ese UID)
5. Agrega estos campos al documento:
   - `nombre` (string) → ej. "Juan Pablo Merino"
   - `rol` (string) → `admin` o `lector`
   - `email` (string) → su correo, solo como referencia
6. Guardar
7. Repite para cada persona (un documento por cada UID)

## Paso 4 — Reemplazar las reglas de Firestore
1. **Firestore Database** → pestaña **Reglas**
2. Borra todo y pega el contenido de `firestore.rules` (adjunto)
3. **Publicar**

## Paso 5 — (Recomendado) Desactivar el login anónimo
Ya no se usa — ahora que hay cuentas reales, déjalo desactivado para cerrar
esa puerta:
1. **Authentication** → **Sign-in method**
2. Busca **"Anonymous"** → click → apaga el interruptor → Guardar

## Paso 6 — Subir el código actualizado a Netlify
Reemplaza estos archivos (el resto del proyecto queda igual):
- `index.html`
- `data-init.js`
- `auth-login.js` (archivo nuevo)
- `calculo-pedido.js`
- `proyeccion.js`
- `pacientes.js`
- `inventario.js`
- `inventario-fisico.js`
- `compras-proveedores.js`
- `lotes-recepcion.js`
- `diario-charts-tabs.js`
- `sw.js`

(Te dejo el zip completo con todo ya en su lugar, más fácil que ir archivo
por archivo.)

## Cómo probar que quedó bien
1. Abre DialiStock en una pestaña de incógnito
2. Deberías ver la pantalla de login (correo + contraseña), no el dashboard
3. Entra con una cuenta que hayas marcado como **lector**:
   - Deberías ver una franja naranja arriba: "Modo solo lectura"
   - Intenta agregar un producto o registrar un movimiento → debería salir
     un aviso bloqueando la acción
4. Cierra sesión (botón 🚪 en el header) y entra con una cuenta **admin**:
   - No debería aparecer la franja naranja
   - Las acciones de edición deberían funcionar normal

## Si algo sale mal
- **"No se pudo iniciar sesión"**: revisa que el correo/clave estén bien
  escritos, y que activaste "Correo electrónico/contraseña" en el Paso 1.
- **Alguien inicia sesión pero queda en modo solo lectura sin querer**:
  revisa que el documento en `dialistock_usuarios` tenga el UID correcto
  (cópialo de nuevo desde Authentication → Users, es fácil equivocarse un
  carácter) y que el campo `rol` diga exactamente `admin` (en minúsculas).
- **Nadie puede escribir, ni siquiera los admin**: revisa que las reglas del
  Paso 4 se hayan publicado correctamente, y que el documento del admin en
  `dialistock_usuarios` realmente tenga `rol: "admin"`.
