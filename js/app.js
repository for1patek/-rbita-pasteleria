// ─────────────────────────────────────────
// app.js — punto de entrada de pasteleria.html
// Inicializa todos los módulos en orden
// ─────────────────────────────────────────

import { iniciarSlider }           from './slider.js';
import { cargarProductos, renderizarMenu, productosDB } from './productos.js';
import { alCambiar, obtenerResumen, estaVacio, vaciar, obtenerTotal, calcularDelivery } from './carrito.js';
import { obtenerDeviceId }         from './seguridad.js';
import { obtenerOCrearCliente }    from './db.js';
import { obtenerUbicacionGuardada, guardarUbicacion, pedirGPS, limpiarUbicacionGuardada } from './ubicacion.js';
import { enviarPedido }            from './pedido.js';
import { DELIVERY }                from './config.js';

// ── Estado global de la app ───────────────
let deviceId   = null;
let ubicacion  = null;  // { texto, lat, lng } | null
let conDelivery = false;

// ── Inicializar ───────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Device ID y cliente en BD
  deviceId = obtenerDeviceId();
  obtenerOCrearCliente(deviceId).catch(() => {}); // no bloqueante

  // 2. Recuperar ubicación guardada
  ubicacion = obtenerUbicacionGuardada();

  // 3. Cargar productos desde BD y renderizar
  try {
    const productos = await cargarProductos('pasteleria');
    renderizarMenu(productos);
  } catch (e) {
    document.getElementById('menu-productos').innerHTML =
      '<p class="error-msg">No se pudo cargar el menú. Intenta recargar la página.</p>';
    return;
  }

  // 4. Iniciar slider
  iniciarSlider({ trackId: 'track', dotsId: 'dots' });

  // 5. Escuchar cambios del carrito → actualizar botón flotante
  alCambiar(actualizarBotonFlotante);

  // 6. Eventos del modal
  iniciarModal();
});

// ── Botón flotante del carrito ─────────────

function actualizarBotonFlotante(resumen) {
  const btn = document.getElementById('carrito-flotante');
  if (!btn) return;

  if (resumen.cantidad === 0) {
    btn.classList.remove('visible');
    return;
  }

  btn.classList.add('visible');
  btn.querySelector('.carrito-count').textContent  = `${resumen.cantidad} ${resumen.cantidad === 1 ? 'item' : 'items'}`;
  btn.querySelector('.carrito-total').textContent  = `$${resumen.subtotal.toLocaleString('es-CL')}`;
}

// ── Modal de pedido ───────────────────────

function iniciarModal() {
  const btn       = document.getElementById('carrito-flotante');
  const modal     = document.getElementById('modal-pedido');
  const cerrar    = document.getElementById('modal-cerrar');
  const btnRetiro   = document.getElementById('btn-retiro');
  const btnDelivery = document.getElementById('btn-delivery');
  const seccionUbicacion = document.getElementById('seccion-ubicacion');
  const btnGPS      = document.getElementById('btn-gps');
  const inputDir    = document.getElementById('input-direccion');
  const chkGuardar  = document.getElementById('chk-guardar');
  const inputNombre = document.getElementById('input-nombre');
  const btnWsp      = document.getElementById('btn-enviar-wsp');
  const btnIg       = document.getElementById('btn-enviar-ig');

  // Abrir modal
  btn?.addEventListener('click', () => {
    if (estaVacio()) return;
    renderizarResumenModal();
    modal.classList.add('visible');
    document.body.classList.add('modal-open');
  });

  // Cerrar modal
  cerrar?.addEventListener('click', cerrarModal);
  modal?.addEventListener('click', e => {
    if (e.target === modal) cerrarModal();
  });

  // Retiro / Delivery
  btnRetiro?.addEventListener('click', () => {
    conDelivery = false;
    btnRetiro.classList.add('activo');
    btnDelivery.classList.remove('activo');
    seccionUbicacion.style.display = 'none';
    actualizarTotalModal();
  });

  btnDelivery?.addEventListener('click', () => {
    conDelivery = true;
    btnDelivery.classList.add('activo');
    btnRetiro.classList.remove('activo');
    seccionUbicacion.style.display = 'block';
    // Si tiene ubicación guardada, mostrarla
    if (ubicacion) mostrarUbicacionGuardada();
    actualizarTotalModal();
  });

  // GPS
  btnGPS?.addEventListener('click', async () => {
    btnGPS.textContent = 'Obteniendo ubicación...';
    btnGPS.disabled = true;
    try {
      const coords = await pedirGPS();
      ubicacion = { lat: coords.lat, lng: coords.lng, texto: '' };
      if (chkGuardar?.checked) {
        await guardarUbicacion(deviceId, ubicacion);
      }
      btnGPS.textContent = '📍 Ubicación obtenida ✓';
      inputDir.style.display = 'none';
    } catch (e) {
      btnGPS.textContent = '📍 Intentar de nuevo';
      btnGPS.disabled = false;
      inputDir.style.display = 'block';
    } finally {
      btnGPS.disabled = false;
    }
  });

  // Dirección manual
  inputDir?.addEventListener('input', () => {
    ubicacion = { texto: inputDir.value, lat: null, lng: null };
  });

  // Limpiar ubicación guardada
  document.getElementById('btn-cambiar-ubicacion')?.addEventListener('click', () => {
    limpiarUbicacionGuardada();
    ubicacion = null;
    document.getElementById('ubicacion-guardada').style.display = 'none';
    document.getElementById('ubicacion-nueva').style.display = 'block';
  });

  // Enviar
  btnWsp?.addEventListener('click', () => enviar('whatsapp'));
  btnIg?.addEventListener('click',  () => enviar('instagram'));
}

function cerrarModal() {
  document.getElementById('modal-pedido')?.classList.remove('visible');
  document.body.classList.remove('modal-open');
}

function renderizarResumenModal() {
  const resumen = obtenerResumen();
  const lista   = document.getElementById('modal-lista-items');
  if (!lista) return;

  lista.innerHTML = '';
  for (const item of resumen.items) {
    const fila = document.createElement('div');
    fila.className = 'modal-item';

    const variante = item.variante ? ` <span class="modal-variante">(${item.variante})</span>` : '';
    const itemTotal = item.precio * item.cantidad;

    fila.innerHTML = `
      <div class="modal-item-info">
        <span class="modal-item-nombre">${item.nombre}${variante}</span>
        <div class="modal-item-qty">
          <button class="qty-btn" data-clave="${item.clave}" data-delta="-1">−</button>
          <span>${item.cantidad}</span>
          <button class="qty-btn" data-clave="${item.clave}" data-delta="1">+</button>
        </div>
      </div>
      <span class="modal-item-precio">$${itemTotal.toLocaleString('es-CL')}</span>
    `;
    lista.appendChild(fila);
  }

  // Eventos + / - dentro del modal
  lista.querySelectorAll('.qty-btn[data-clave]').forEach(btn => {
    btn.addEventListener('click', () => {
      const { cambiarCantidad } = window._carrito || {};
      import('./carrito.js').then(({ cambiarCantidad }) => {
        cambiarCantidad(btn.dataset.clave, parseInt(btn.dataset.delta));
        if (estaVacio()) { cerrarModal(); return; }
        renderizarResumenModal();
        actualizarTotalModal();
      });
    });
  });

  actualizarTotalModal();
}

function actualizarTotalModal() {
  const resumen = obtenerResumen();
  const costoD  = calcularDelivery(conDelivery);
  const total   = resumen.subtotal + costoD;

  const elSubtotal = document.getElementById('modal-subtotal');
  const elDelivery = document.getElementById('modal-delivery');
  const elTotal    = document.getElementById('modal-total');
  const elDeliveryRow = document.getElementById('modal-delivery-row');

  if (elSubtotal) elSubtotal.textContent = `$${resumen.subtotal.toLocaleString('es-CL')}`;

  if (elDeliveryRow) {
    elDeliveryRow.style.display = conDelivery ? 'flex' : 'none';
  }

  if (elDelivery) {
    elDelivery.textContent = costoD === 0 ? 'Gratis 🎉' : `$${costoD.toLocaleString('es-CL')}`;
    elDelivery.className   = costoD === 0 ? 'modal-delivery-gratis' : '';
  }

  if (elTotal) elTotal.textContent = `$${total.toLocaleString('es-CL')}`;

  // Actualizar texto del botón delivery
  const btnD = document.getElementById('btn-delivery');
  if (btnD) {
    if (resumen.subtotal >= DELIVERY.gratis_desde) {
      btnD.innerHTML = 'Delivery <span class="delivery-tag gratis">Gratis 🎉</span>';
    } else {
      btnD.innerHTML = `Delivery <span class="delivery-tag">+$${DELIVERY.costo.toLocaleString('es-CL')}</span>`;
    }
  }
}

function mostrarUbicacionGuardada() {
  const divGuardada = document.getElementById('ubicacion-guardada');
  const divNueva    = document.getElementById('ubicacion-nueva');
  const textoGuardado = document.getElementById('texto-ubicacion-guardada');

  if (!ubicacion) return;

  const texto = ubicacion.texto || (ubicacion.lat ? 'Ubicación GPS guardada' : '');
  if (textoGuardado) textoGuardado.textContent = texto;

  divGuardada.style.display = 'block';
  divNueva.style.display    = 'none';
}

async function enviar(canal) {
  const inputNombre = document.getElementById('input-nombre');
  const nombreCliente = inputNombre?.value?.trim() || '';
  const resumen = obtenerResumen();

  const btnEnviar = canal === 'whatsapp'
    ? document.getElementById('btn-enviar-wsp')
    : document.getElementById('btn-enviar-ig');

  btnEnviar.disabled = true;
  btnEnviar.textContent = 'Enviando...';

  try {
    await enviarPedido({
      deviceId,
      items:       resumen.items,
      productosDB: (await import('./productos.js')).productosDB,
      conDelivery,
      ubicacion,
      nombreCliente,
      canal,
    });

    btnEnviar.disabled = false;
    btnEnviar.textContent = canal === 'whatsapp' ? 'WhatsApp' : 'Instagram';
    vaciar();
    cerrarModal();
  } catch (e) {
    alert(`Error al enviar pedido: ${e.message}`);
    btnEnviar.disabled = false;
    btnEnviar.textContent = canal === 'whatsapp' ? 'WhatsApp' : 'Instagram';
  }
}
