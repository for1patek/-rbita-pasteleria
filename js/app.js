// ─────────────────────────────────────────
// app.js — punto de entrada de pasteleria.html
// ─────────────────────────────────────────

import { iniciarSlider }           from './slider.js';
import { cargarProductos, renderizarMenu, productosDB } from './productos.js';
import { alCambiar, obtenerResumen, estaVacio, vaciar, calcularDelivery } from './carrito.js';
import { obtenerDeviceId }         from './seguridad.js';
import { obtenerOCrearCliente }    from './db.js';
import { obtenerUbicacionGuardada, guardarUbicacion, pedirGPS, limpiarUbicacionGuardada, coordsADireccion, coordsALink } from './ubicacion.js';
import { enviarPedido }            from './pedido.js';
import { DELIVERY }                from './config.js';
import { leerConfig, deliveryDisponible, minAHora } from './config-panel.js';

// ── Estado global ─────────────────────────
let deviceId    = null;
let ubicacion   = null;
let conDelivery = false;
let configApp   = null;

// ── Inicializar ───────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  deviceId = obtenerDeviceId();
  obtenerOCrearCliente(deviceId).catch(() => {});

  ubicacion = obtenerUbicacionGuardada();

  // Cargar config y productos en paralelo
  [configApp] = await Promise.all([
    leerConfig(),
    cargarProductos('pasteleria').then(renderizarMenu).catch(() => {
      document.getElementById('menu-productos').innerHTML =
        '<p class="error-msg">No se pudo cargar el menú. Intenta recargar la página.</p>';
    }),
  ]);

  iniciarSlider({ trackId: 'track', dotsId: 'dots' });
  alCambiar(actualizarBotonFlotante);
  iniciarModal();
  aplicarEstadoDelivery();
});

// ── Botón flotante ────────────────────────

function actualizarBotonFlotante(resumen) {
  const btn = document.getElementById('carrito-flotante');
  if (!btn) return;
  if (resumen.cantidad === 0) { btn.classList.remove('visible'); return; }
  btn.classList.add('visible');
  btn.querySelector('.carrito-count').textContent = `${resumen.cantidad} ${resumen.cantidad === 1 ? 'item' : 'items'}`;
  btn.querySelector('.carrito-total').textContent = `$${resumen.subtotal.toLocaleString('es-CL')}`;
}

// ── Modal ─────────────────────────────────

function iniciarModal() {
  const btn              = document.getElementById('carrito-flotante');
  const modal            = document.getElementById('modal-pedido');
  const cerrarBtn        = document.getElementById('modal-cerrar');
  const btnRetiro        = document.getElementById('btn-retiro');
  const btnDelivery      = document.getElementById('btn-delivery');
  const seccionUbicacion = document.getElementById('seccion-ubicacion');
  const btnGPS           = document.getElementById('btn-gps');
  const chkGuardar       = document.getElementById('chk-guardar');
  const inputNombre      = document.getElementById('input-nombre');
  const btnWsp           = document.getElementById('btn-enviar-wsp');
  const btnIg            = document.getElementById('btn-enviar-ig');

  btn?.addEventListener('click', () => {
    if (estaVacio()) return;
    renderizarResumenModal();
    modal.classList.add('visible');
    document.body.classList.add('modal-open');
  });

  cerrarBtn?.addEventListener('click', cerrarModal);
  modal?.addEventListener('click', e => { if (e.target === modal) cerrarModal(); });

  // Retiro
  btnRetiro?.addEventListener('click', () => {
    conDelivery = false;
    btnRetiro.classList.add('activo');
    btnDelivery.classList.remove('activo');
    seccionUbicacion.style.display = 'none';
    actualizarTotalModal();
  });

  // Delivery — verificar disponibilidad
  btnDelivery?.addEventListener('click', () => {
    const estado = deliveryDisponible(configApp || {});
    if (!estado.ok) return; // bloqueado por no-disponible
    conDelivery = true;
    btnDelivery.classList.add('activo');
    btnRetiro.classList.remove('activo');
    seccionUbicacion.style.display = 'block';
    if (ubicacion?.ubicacion_texto) mostrarUbicacionGuardada();
    actualizarTotalModal();
  });

  // GPS → dirección legible
  btnGPS?.addEventListener('click', async () => {
    btnGPS.textContent = 'Obteniendo ubicación...';
    btnGPS.disabled = true;
    try {
      const coords   = await pedirGPS();
      const direccion = await coordsADireccion(coords.lat, coords.lng);
      ubicacion = { ubicacion_texto: direccion, ubicacion_lat: coords.lat, ubicacion_lng: coords.lng };

      btnGPS.textContent = direccion
        ? `📍 ${direccion}`
        : '📍 Ubicación obtenida ✓';

      if (chkGuardar?.checked) {
        await guardarUbicacion(deviceId, ubicacion);
      }
    } catch (e) {
      btnGPS.textContent = '📍 Intentar de nuevo';
    } finally {
      btnGPS.disabled = false;
    }
  });

  // Cambiar ubicación guardada
  document.getElementById('btn-cambiar-ubicacion')?.addEventListener('click', () => {
    limpiarUbicacionGuardada();
    ubicacion = null;
    document.getElementById('ubicacion-guardada').style.display = 'none';
    document.getElementById('ubicacion-nueva').style.display    = 'block';
  });

  btnWsp?.addEventListener('click', () => enviar('whatsapp'));
  btnIg?.addEventListener('click',  () => enviar('instagram'));
}


function cerrarModal() {
  document.getElementById('modal-pedido')?.classList.remove('visible');
  document.body.classList.remove('modal-open');
  conDelivery = false;
  const btnRetiro   = document.getElementById('btn-retiro');
  const btnDelivery = document.getElementById('btn-delivery');
  const seccion     = document.getElementById('seccion-ubicacion');
  btnRetiro?.classList.remove('activo');
  btnDelivery?.classList.remove('activo');
  if (seccion) seccion.style.display = 'none';
}

function renderizarResumenModal() {
  const resumen = obtenerResumen();
  const lista   = document.getElementById('modal-lista-items');
  if (!lista) return;
  lista.innerHTML = '';

  for (const item of resumen.items) {
    const fila = document.createElement('div');
    fila.className = 'modal-item';
    const variante  = item.variante ? ` <span class="modal-variante">(${item.variante})</span>` : '';
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

  lista.querySelectorAll('.qty-btn[data-clave]').forEach(btn => {
    btn.addEventListener('click', () => {
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
  const resumen    = obtenerResumen();
  const costoD     = calcularDelivery(conDelivery);
  const total      = resumen.subtotal + costoD;

  const elSubtotal    = document.getElementById('modal-subtotal');
  const elDelivery    = document.getElementById('modal-delivery');
  const elTotal       = document.getElementById('modal-total');
  const elDeliveryRow = document.getElementById('modal-delivery-row');

  if (elSubtotal)    elSubtotal.textContent = `$${resumen.subtotal.toLocaleString('es-CL')}`;
  if (elDeliveryRow) elDeliveryRow.style.display = conDelivery ? 'flex' : 'none';
  if (elDelivery) {
    elDelivery.textContent = costoD === 0 ? 'Gratis 🎉' : `$${costoD.toLocaleString('es-CL')}`;
    elDelivery.className   = costoD === 0 ? 'modal-delivery-gratis' : '';
  }
  if (elTotal) elTotal.textContent = `$${total.toLocaleString('es-CL')}`;

  const btnD = document.getElementById('btn-delivery');
  if (btnD) {
    btnD.innerHTML = resumen.subtotal >= DELIVERY.gratis_desde
      ? 'Delivery <span class="delivery-tag gratis">Gratis 🎉</span>'
      : `Delivery <span class="delivery-tag">+$${DELIVERY.costo.toLocaleString('es-CL')}</span>`;
  }
}

function mostrarUbicacionGuardada() {
  const divGuardada   = document.getElementById('ubicacion-guardada');
  const divNueva      = document.getElementById('ubicacion-nueva');
  const textoGuardado = document.getElementById('texto-ubicacion-guardada');
  if (!ubicacion) return;
  const texto = ubicacion.ubicacion_texto || (ubicacion.ubicacion_lat ? 'Ubicación GPS guardada' : '');
  if (textoGuardado) textoGuardado.textContent = texto;
  if (divGuardada) divGuardada.style.display = 'block';
  if (divNueva)    divNueva.style.display    = 'none';
}

async function enviar(canal) {
  const inputNombre   = document.getElementById('input-nombre');
  const nombreCliente = inputNombre?.value?.trim() || '';
  const resumen       = obtenerResumen();
  const btnEnviar     = document.getElementById(canal === 'whatsapp' ? 'btn-enviar-wsp' : 'btn-enviar-ig');

  btnEnviar.disabled    = true;
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
    btnEnviar.disabled    = false;
    btnEnviar.textContent = canal === 'whatsapp' ? 'WhatsApp' : 'Instagram';
    vaciar();
    cerrarModal();
  } catch (e) {
    alert(`Error al enviar pedido: ${e.message}`);
    btnEnviar.disabled    = false;
    btnEnviar.textContent = canal === 'whatsapp' ? 'WhatsApp' : 'Instagram';
  }
}
