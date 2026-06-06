// ─────────────────────────────────────────
// app.js — punto de entrada de pasteleria.html
// ─────────────────────────────────────────

import { iniciarSlider }           from './slider.js';
import { cargarProductos, renderizarMenu, productosDB } from './productos.js';
import { alCambiar, obtenerResumen, estaVacio, vaciar, calcularDelivery, calcularDescuento } from './carrito.js';
import { obtenerDeviceId }         from './seguridad.js';
import { obtenerOCrearCliente }    from './db.js';
import { obtenerUbicacionGuardada, guardarUbicacion, limpiarUbicacionGuardada } from './ubicacion.js';
import { enviarPedido }            from './pedido.js';
import { DELIVERY }                from './config.js';
import { leerConfig, deliveryDisponible, minAHora } from './config-panel.js';
import { obtenerSesion, cerrarSesion, registrar, login, estaLogueado } from './auth.js';

// ── Estado global ─────────────────────────
let deviceId      = null;
let ubicacion     = null;
let conDelivery   = false;
let configApp     = null;
let descuentoPct  = 0;    // % leído desde config_pasteleria
let esPrimerPedido = false; // se verifica al abrir el modal

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

  descuentoPct = parseInt(configApp?.descuento_primer_pedido ?? '0') || 0;

  iniciarSlider({ trackId: 'track', dotsId: 'dots' });
  alCambiar(actualizarBotonFlotante);
  iniciarModal();
  aplicarEstadoDelivery();
  iniciarAuth();
});


// ── Estado visual del botón delivery ─────

function aplicarEstadoDelivery() {
  const btnD = document.getElementById('btn-delivery');
  const msg  = document.getElementById('delivery-mensaje');
  if (!btnD || !configApp) return;

  const estado = deliveryDisponible(configApp);
  if (!estado.ok) {
    btnD.style.opacity       = '0.45';
    btnD.style.cursor        = 'not-allowed';
    btnD.style.pointerEvents = 'none';
    if (msg) {
      const mensajes = {
        desactivado:     'Delivery no disponible por ahora.',
        cerrado_hoy:     'Sin delivery hoy. Puedes pasar a buscarlo.',
        fuera_horario:   `Delivery disponible de ${minAHora(estado.ini)} a ${minAHora(estado.fin)} hrs.`,
        horario_invalido:'Delivery no disponible por ahora.',
      };
      msg.textContent   = mensajes[estado.motivo] || 'Delivery no disponible.';
      msg.style.display = 'block';
    }
  } else {
    btnD.style.opacity       = '';
    btnD.style.cursor        = '';
    btnD.style.pointerEvents = '';
    if (msg) msg.style.display = 'none';
  }
}

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
  const chkGuardar       = document.getElementById('chk-guardar');
  const inputNombre      = document.getElementById('input-nombre');
  const btnWsp           = document.getElementById('btn-enviar-wsp');

  btn?.addEventListener('click', async () => {
    if (estaVacio()) return;

    // Verificar si es primer pedido (solo si hay sesión registrada)
    esPrimerPedido = false;
    const sesion = obtenerSesion();
    if (sesion?.telefono && descuentoPct > 0) {
      try {
        const { SUPABASE_URL, SUPABASE_KEY } = await import('./config.js');
        // Usar el device_id de la sesión, no el del dispositivo actual
        const idAConsultar = sesion.device_id || deviceId;
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/pedidos?device_id=eq.${encodeURIComponent(idAConsultar)}&select=id&limit=1`,
          { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
        );
        const prev = await res.json().catch(() => [null]);
        esPrimerPedido = prev.length === 0;
      } catch { esPrimerPedido = false; }
    }

    renderizarResumenModal();
    mostrarBannerDescuento();
    mostrarBannerRegistro();

    // Autocompletar nombre si hay sesión
    const inputNombre = document.getElementById('input-nombre');
    const sesionActual = obtenerSesion();
    if (inputNombre && sesionActual?.nombre) {
      inputNombre.value = sesionActual.nombre;
    }

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
    document.getElementById('seccion-retiro').style.display = 'block';
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
    document.getElementById('seccion-retiro').style.display = 'none';
    if (ubicacion?.ubicacion_texto) mostrarUbicacionGuardada();
    actualizarTotalModal();
  });

  // Campo de dirección — actualiza ubicacion en tiempo real
  const inputDir = document.getElementById('input-direccion');
  inputDir?.addEventListener('input', () => {
    const texto = inputDir.value.trim();
    ubicacion = texto ? { ubicacion_texto: texto, ubicacion_lat: null, ubicacion_lng: null } : null;
  });

  // Guardar dirección al marcar checkbox
  chkGuardar?.addEventListener('change', async () => {
    if (chkGuardar.checked && inputDir?.value.trim()) {
      ubicacion = { ubicacion_texto: inputDir.value.trim(), ubicacion_lat: null, ubicacion_lng: null };
      await guardarUbicacion(deviceId, ubicacion);
    }
  });

  // Cambiar ubicación guardada
  document.getElementById('btn-cambiar-ubicacion')?.addEventListener('click', () => {
    const textoAnterior = ubicacion?.ubicacion_texto || '';
    limpiarUbicacionGuardada();
    ubicacion = null;
    document.getElementById('ubicacion-guardada').style.display = 'none';
    document.getElementById('ubicacion-nueva').style.display    = 'block';
    const inputDir = document.getElementById('input-direccion');
    if (inputDir && textoAnterior) inputDir.value = textoAnterior;
  });

  btnWsp?.addEventListener('click', () => enviar('whatsapp'));
}


function cerrarModal() {
  document.getElementById('modal-pedido')?.classList.remove('visible');
  document.body.classList.remove('modal-open');
  conDelivery = null;
  const btnRetiro   = document.getElementById('btn-retiro');
  const btnDelivery = document.getElementById('btn-delivery');
  const seccion     = document.getElementById('seccion-ubicacion');
  btnRetiro?.classList.remove('activo');
  btnDelivery?.classList.remove('activo');
  if (seccion) seccion.style.display = 'none';
  const seccionRetiro = document.getElementById('seccion-retiro');
  if (seccionRetiro) seccionRetiro.style.display = 'none';
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
  const resumen      = obtenerResumen();
  const descuento    = esPrimerPedido ? calcularDescuento(resumen.subtotal, descuentoPct) : 0;
  const costoD       = calcularDelivery(conDelivery);
  const total        = resumen.subtotal - descuento + costoD;

  const elSubtotal      = document.getElementById('modal-subtotal');
  const elDelivery      = document.getElementById('modal-delivery');
  const elTotal         = document.getElementById('modal-total');
  const elDeliveryRow   = document.getElementById('modal-delivery-row');
  const elDescRow       = document.getElementById('modal-descuento-row');
  const elDescMonto     = document.getElementById('modal-descuento-monto');
  const elDeliveryNota  = document.getElementById('modal-delivery-nota');

  if (elSubtotal)    elSubtotal.textContent = `$${resumen.subtotal.toLocaleString('es-CL')}`;

  // Fila descuento
  if (elDescRow) {
    if (descuento > 0) {
      elDescRow.style.display = 'flex';
      if (elDescMonto) elDescMonto.textContent = `-$${descuento.toLocaleString('es-CL')}`;
    } else {
      elDescRow.style.display = 'none';
    }
  }

  // Fila delivery
  if (elDeliveryRow) elDeliveryRow.style.display = conDelivery ? 'flex' : 'none';
  if (elDelivery) {
    elDelivery.textContent = costoD === 0 ? 'Gratis 🎉' : `$${costoD.toLocaleString('es-CL')}`;
    elDelivery.className   = costoD === 0 ? 'modal-delivery-gratis' : '';
  }

  // Nota delivery gratis calculada sobre precio original
  if (elDeliveryNota && conDelivery) {
    if (costoD === 0) {
      elDeliveryNota.textContent = descuento > 0
        ? `Gratis porque tu compra original supera $${(DELIVERY.gratis_desde).toLocaleString('es-CL')}`
        : '';
      elDeliveryNota.style.display = descuento > 0 ? 'block' : 'none';
    } else {
      elDeliveryNota.style.display = 'none';
    }
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
  const texto = ubicacion.ubicacion_texto || '';
  if (!texto) return; // no mostrar si no hay texto
  if (textoGuardado) textoGuardado.textContent = texto;
  if (divGuardada) divGuardada.style.display = 'block';
  if (divNueva)    divNueva.style.display    = 'none';
}

function mostrarBannerDescuento() {
  const banner = document.getElementById('banner-descuento');
  if (!banner) return;
  if (esPrimerPedido && descuentoPct > 0) {
    banner.textContent = `🎉 Tienes un ${descuentoPct}% de descuento en tu primer pedido`;
    banner.style.display = 'block';
  } else {
    banner.style.display = 'none';
  }
}

function mostrarBannerRegistro() {
  const banner = document.getElementById('banner-registro');
  if (!banner) return;
  const sesion = obtenerSesion();
  if (!sesion?.telefono) {
    banner.style.display = 'block';
    banner.onclick = () => {
      cerrarModal();
      setTimeout(() => {
        const modal = document.getElementById('modal-auth');
        if (modal) modal.style.display = 'flex';
      }, 200);
    };
  } else {
    banner.style.display = 'none';
  }
}

async function enviar(canal) {
  // Retiro o delivery es obligatorio
  if (conDelivery === null) {
    const msg = document.getElementById('delivery-mensaje');
    if (msg) { msg.textContent = 'Elige Retiro en local o Delivery para continuar.'; msg.style.display = 'block'; setTimeout(() => { msg.style.display = 'none'; }, 3500); }
    return;
  }

  const inputNombre   = document.getElementById('input-nombre');
  const nombreCliente = inputNombre?.value?.trim() || '';
  const resumen       = obtenerResumen();
  const btnEnviar     = document.getElementById(canal === 'whatsapp' ? 'btn-enviar-wsp' : 'btn-enviar-ig');

  btnEnviar.disabled    = true;
  btnEnviar.textContent = 'Enviando...';

  try {
    // Normalizar claves de ubicación para pedido.js
    const ubicacionNorm = ubicacion ? {
      texto: ubicacion.ubicacion_texto || ubicacion.texto || '',
      lat:   ubicacion.ubicacion_lat   ?? ubicacion.lat   ?? null,
      lng:   ubicacion.ubicacion_lng   ?? ubicacion.lng   ?? null,
    } : null;

    await enviarPedido({
      deviceId: obtenerSesion()?.device_id || deviceId,
      items:       resumen.items,
      productosDB: (await import('./productos.js')).productosDB,
      conDelivery,
      ubicacion: ubicacionNorm,
      nombreCliente,
      canal,
      descuentoPct,
      esPrimerPedido,
    });
    btnEnviar.disabled    = false;
    btnEnviar.textContent = canal === 'whatsapp' ? 'WhatsApp' : 'Instagram';
    vaciar();
    cerrarModal();
    mostrarPromptRegistro();
  } catch (e) {
    alert(`Error al enviar pedido: ${e.message}`);
    btnEnviar.disabled    = false;
    btnEnviar.textContent = canal === 'whatsapp' ? 'WhatsApp' : 'Instagram';
  }
}

// ── Auth ──────────────────────────────────

function iniciarAuth() {
  actualizarChipSesion();
  iniciarModalAuth();
  iniciarHistorial();

  // Chip de sesión
  document.getElementById('chip-sesion')?.addEventListener('click', () => {
    const sesion = obtenerSesion();
    if (!sesion) {
      const modal = document.getElementById('modal-auth');
      if (modal) modal.style.display = 'flex';
      return;
    }
    const menu = document.getElementById('menu-sesion');
    if (menu) menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
  });

  document.getElementById('btn-cerrar-sesion')?.addEventListener('click', () => {
    cerrarSesion();
    actualizarChipSesion();
    document.getElementById('menu-sesion').style.display = 'none';
  });

  document.getElementById('btn-ver-historial')?.addEventListener('click', () => {
    document.getElementById('menu-sesion').style.display = 'none';
    abrirHistorial();
  });

  // Cerrar menu al clickear fuera
  document.addEventListener('click', e => {
    const chip = document.getElementById('chip-sesion');
    const menu = document.getElementById('menu-sesion');
    if (menu && chip && !chip.contains(e.target) && !menu.contains(e.target)) {
      menu.style.display = 'none';
    }
  });
}

function actualizarChipSesion() {
  const chip   = document.getElementById('chip-sesion');
  const nombre = document.getElementById('chip-nombre');
  const sesion = obtenerSesion();
  if (!chip) return;
  chip.style.display = 'block';
  if (sesion?.nombre) {
    nombre.textContent = sesion.nombre.split(' ')[0];
    chip.title = 'Mi cuenta';
  } else if (sesion) {
    nombre.textContent = 'Mi cuenta';
  } else {
    nombre.textContent = 'Ingresar';
    chip.title = 'Iniciar sesión o registrarse';
  }
}

function iniciarModalAuth() {
  const modal    = document.getElementById('modal-auth');
  const cerrarBtn = document.getElementById('auth-cerrar');
  const tabs     = document.querySelectorAll('.auth-tab');
  const errorEl  = document.getElementById('auth-error');
  const exitoEl  = document.getElementById('auth-exito');

  cerrarBtn?.addEventListener('click', () => modal.style.display = 'none');
  modal?.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });

  // Tabs
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => {
        t.classList.remove('activo');
        t.style.background = '#f0ebe0';
        t.style.color      = '#555';
      });
      tab.classList.add('activo');
      tab.style.background = '#8B1A2F';
      tab.style.color      = '#fff';
      document.getElementById('tab-registro').style.display = tab.dataset.tab === 'registro' ? 'block' : 'none';
      document.getElementById('tab-login').style.display    = tab.dataset.tab === 'login'    ? 'block' : 'none';
      errorEl.textContent = '';
      exitoEl.textContent = '';
    });
  });

  // Registro
  document.getElementById('btn-registrar')?.addEventListener('click', async () => {
    const btn    = document.getElementById('btn-registrar');
    const nombre = document.getElementById('auth-nombre').value.trim();
    const tel    = document.getElementById('auth-telefono-reg').value.trim();
    const pin    = document.getElementById('auth-pin-reg').value.trim();

    errorEl.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Creando cuenta...';

    const r = await registrar({ deviceId, telefono: tel, pin, nombre });

    btn.disabled = false;
    btn.textContent = 'Crear cuenta';

    if (r.ok) {
      exitoEl.textContent = `¡Bienvenido/a ${r.cliente.nombre || ''}! Cuenta creada.`;
      actualizarChipSesion();
      setTimeout(() => modal.style.display = 'none', 1500);
    } else {
      errorEl.textContent = r.error;
    }
  });

  // Login
  document.getElementById('btn-login')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-login');
    const tel = document.getElementById('auth-telefono-login').value.trim();
    const pin = document.getElementById('auth-pin-login').value.trim();

    errorEl.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Ingresando...';

    const r = await login({ telefono: tel, pin });

    btn.disabled = false;
    btn.textContent = 'Ingresar';

    if (r.ok) {
      exitoEl.textContent = `¡Hola ${r.cliente.nombre || ''}!`;
      actualizarChipSesion();
      setTimeout(() => modal.style.display = 'none', 1200);
    } else {
      errorEl.textContent = r.error;
    }
  });
}

// ── Prompt de registro post-pedido ────────

export function mostrarPromptRegistro() {
  const sesion = obtenerSesion();
  if (sesion?.telefono) return; // ya está registrado

  setTimeout(() => {
    const modal = document.getElementById('modal-auth');
    if (modal) modal.style.display = 'flex';
  }, 800);
}

// ── Historial ─────────────────────────────

function iniciarHistorial() {
  document.getElementById('historial-cerrar')?.addEventListener('click', () => {
    document.getElementById('modal-historial').style.display = 'none';
  });
}

async function abrirHistorial() {
  const modal  = document.getElementById('modal-historial');
  const lista  = document.getElementById('lista-historial');
  const sesion = obtenerSesion();
  if (!modal || !lista || !sesion) return;

  modal.style.display = 'flex';
  lista.innerHTML     = '<p style="color:#888; font-size:.9rem; text-align:center;">Cargando...</p>';

  try {
    const { SUPABASE_URL, SUPABASE_KEY } = await import('./config.js');
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/pedidos?device_id=eq.${encodeURIComponent(sesion.device_id)}&order=created_at.desc&limit=20`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const pedidos = await res.json();

    if (!pedidos.length) {
      lista.innerHTML = '<p style="color:#888; font-size:.9rem; text-align:center;">No tienes pedidos aún</p>';
      return;
    }

    lista.innerHTML = '';
    for (const p of pedidos) {
      const fecha = new Date(p.created_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
      const hora  = new Date(p.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
      const items = Array.isArray(p.items)
        ? p.items.map(i => `${i.nombre}${i.variante ? ` (${i.variante})` : ''} x${i.cantidad}`).join(', ')
        : '';
      const descuentoTag = p.descuento_aplicado
        ? `<span style="font-size:.75rem;background:#e8f5e9;color:#2d6a4f;padding:.15rem .5rem;border-radius:4px;margin-left:.4rem;">20% desc.</span>`
        : '';
      const div = document.createElement('div');
      div.style.cssText = 'border-bottom:1px solid #eee; padding:.9rem 0;';
      div.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:.3rem;">
          <span style="font-size:.82rem; color:#888;">${fecha} · ${hora}</span>
          <span style="font-weight:bold; color:#8B1A2F;">$${(p.total||0).toLocaleString('es-CL')}${descuentoTag}</span>
        </div>
        <div style="font-size:.85rem; color:#555;">${items}</div>
      `;
      lista.appendChild(div);
    }
  } catch {
    lista.innerHTML = '<p style="color:#c0392b; font-size:.9rem; text-align:center;">No se pudo cargar el historial</p>';
  }
}
