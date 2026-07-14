// ==================== LOGIN / CONTROL DE ACCESO ====================
// Requiere que cada persona inicie sesión con su cuenta (Firebase Auth,
// Email/Password) antes de poder usar DialiStock. El rol de cada cuenta
// (admin o lector) se guarda en Firestore, en la colección
// `dialistock_usuarios/{uid}` — ver FIRESTORE_SETUP.md para cómo crear
// cuentas y asignar roles desde la consola de Firebase.
//
// - admin   → puede ver y editar todo (como funcionaba la app hasta ahora)
// - lector  → puede ver todo, pero las acciones que modifican datos quedan
//             bloqueadas (con un aviso claro) tanto en la pantalla como,
//             más importante, en las reglas de Firestore del lado servidor.

let currentUser = null; // { uid, email, nombre, rol }

function esAdmin() {
  return !!currentUser && !!currentUser.centros && currentUser.centros[currentCentro] === 'admin';
}

// Se llama al inicio de cada función que modifica datos (agregar, eliminar,
// confirmar, descontar stock, etc). Si la cuenta es de solo lectura, avisa
// y devuelve true para que la función que llama corte de inmediato con
// `return`.
function bloqueaPorSoloLectura() {
  if (esAdmin()) return false;
  const msg = '🔒 Tu cuenta es de solo lectura — no puedes hacer cambios. Pídele a un administrador que te dé acceso de edición si lo necesitas.';
  if (typeof showAlert === 'function') {
    showAlert(msg, 'error');
  } else {
    alert(msg);
  }
  return true;
}

function mostrarLoginOverlay(mensaje) {
  const overlay = document.getElementById('login-overlay');
  if (overlay) overlay.style.display = 'flex';
  const err = document.getElementById('login-error');
  if (err) err.textContent = mensaje || '';
}

function ocultarLoginOverlay() {
  const overlay = document.getElementById('login-overlay');
  if (overlay) overlay.style.display = 'none';
}

function iniciarSesion(event) {
  if (event) event.preventDefault();
  const emailEl = document.getElementById('login-email');
  const passEl = document.getElementById('login-pass');
  const btn = document.getElementById('login-btn');
  const email = emailEl ? emailEl.value.trim() : '';
  const pass = passEl ? passEl.value : '';

  if (!email || !pass) {
    mostrarLoginOverlay('Ingresa tu correo y contraseña');
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Ingresando...'; }

  firebase.auth().signInWithEmailAndPassword(email, pass)
    .catch(function (err) {
      let msg = 'No se pudo iniciar sesión. Verifica tu correo y contraseña.';
      if (err.code === 'auth/too-many-requests') msg = 'Demasiados intentos fallidos. Intenta de nuevo en unos minutos.';
      if (err.code === 'auth/user-disabled') msg = 'Esta cuenta está deshabilitada. Contacta al administrador.';
      if (err.code === 'auth/invalid-email') msg = 'El correo ingresado no es válido.';
      mostrarLoginOverlay(msg);
    })
    .finally(function () {
      if (btn) { btn.disabled = false; btn.textContent = 'Ingresar'; }
    });
}

function cerrarSesion() {
  if (!confirm('¿Cerrar sesión de DialiStock?')) return;
  firebase.auth().signOut();
}

async function cargarPerfilUsuario(user) {
  try {
    const snap = await fbDb.collection('dialistock_usuarios').doc(user.uid).get();
    if (snap.exists) {
      const data = snap.data();
      let centros = data.centros;
      // Compatibilidad con perfiles creados antes de multi-centro (solo
      // tenían un campo `rol` plano) → se tratan como acceso únicamente a
      // Independencia con ese mismo rol, para no dejar a nadie sin acceso.
      if (!centros && data.rol) {
        centros = { independencia: data.rol === 'admin' ? 'admin' : 'lector' };
      }
      currentUser = { uid: user.uid, email: user.email, nombre: data.nombre || user.email, centros: centros || {} };
    } else {
      // Cuenta autenticada pero sin perfil creado todavía en dialistock_usuarios
      // → sin acceso a ningún centro, nunca acceso de edición por accidente.
      currentUser = { uid: user.uid, email: user.email, nombre: user.email, centros: {} };
      if (typeof showAlert === 'function') {
        showAlert('Tu cuenta no tiene centros asignados todavía. Pídele al administrador que te dé acceso.', 'warning');
      }
    }
  } catch (e) {
    console.warn('No se pudo cargar el perfil de usuario, se asume sin acceso:', e);
    currentUser = { uid: user.uid, email: user.email, nombre: user.email, centros: {} };
  }

  // Si el centro activo no está entre los accesos de esta cuenta, cae al
  // primero disponible — evita quedar "atascado" viendo un centro sin
  // permiso o una pantalla vacía sin explicación.
  if (!currentUser.centros[currentCentro]) {
    const disponibles = Object.keys(currentUser.centros);
    if (disponibles.length) {
      currentCentro = disponibles[0];
      localStorage.setItem('ds_centro_actual', currentCentro);
    }
  }

  actualizarUIRolUsuario();
  if (typeof actualizarUICentro === 'function') actualizarUICentro();
  if (typeof renderSelectorCentros === 'function') renderSelectorCentros();
}

function actualizarUIRolUsuario() {
  const nameEl = document.getElementById('user-name-badge');
  const roleEl = document.getElementById('user-role-badge');
  const banner = document.getElementById('readonly-banner');
  const rolActual = typeof rolEnCentroActual === 'function' ? rolEnCentroActual() : null;
  if (nameEl) nameEl.textContent = currentUser ? currentUser.nombre : '';
  if (roleEl) roleEl.textContent = rolActual === 'admin' ? '👑 Admin' : (rolActual === 'lector' ? '👁️ Solo lectura' : '⛔ Sin acceso');
  if (banner) banner.style.display = (rolActual && rolActual !== 'admin') ? 'block' : 'none';
}

try {
  if (typeof firebase === 'undefined') throw new Error('Firebase SDK no cargó');
  firebase.auth().onAuthStateChanged(function (user) {
    if (user && !user.isAnonymous) {
      fbReady = true;
      if (typeof resolveFbAuth === 'function') resolveFbAuth();
      ocultarLoginOverlay();
      cargarPerfilUsuario(user).then(function () {
        // Recarga el centro activo (puede haber cambiado dentro de
        // cargarPerfilUsuario si la cuenta no tenía acceso al centro por
        // defecto) — cargarCentroActual() ya hace la secuencia completa:
        // local → semilla si es centro nuevo → Firestore por encima.
        if (typeof cargarCentroActual === 'function') {
          cargarCentroActual();
        } else {
          if (typeof cargarDesdeFirestore === 'function') cargarDesdeFirestore();
          if (typeof cargarHistorialDesdeFirestore === 'function') cargarHistorialDesdeFirestore();
        }
      });
    } else {
      fbReady = false;
      currentUser = null;
      mostrarLoginOverlay();
    }
  });
} catch (e) {
  // Firebase no disponible (sin internet, bloqueado, mal configurado, etc).
  // No tiene sentido dejar a todo el equipo bloqueado en la pantalla de
  // login sin forma de validar identidad — se avisa y se deja entrar en
  // modo local (solo con lo que ya está guardado en este dispositivo).
  console.warn('No se pudo activar el login de Firebase, entrando en modo local:', e);
  if (typeof resolveFbAuth === 'function') resolveFbAuth();
  ocultarLoginOverlay();
}
