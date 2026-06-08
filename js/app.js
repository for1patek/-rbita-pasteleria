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
import { obtenerSesion, cerrarSesion, registrar, login, estaLogueado,
         solicitarResetPin, verificarResetPin } from './auth.js';

// ── Estado global ─────────────────────────
let deviceId      = null;
let ubicacion     = null;
let conDelivery   = null; // null=sin elegir, false=retiro, true=delivery
let configApp     = null;
let descuentoPct  = 0;    // % leído desde config_pasteleria
let esPrimerPedido = false; // se verifica al abrir el modal

// ── Inicializar ───────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  deviceId = obtenerDeviceId();
  obtenerOCrearCliente(deviceId).catch(() => {});

  ubicacion = obtenerUbicacionGuardada();

  // Si el cliente está logueado, cargar su dirección favorita desde BD
  const sesionInicial = obtenerSesion();
  if (sesionInicial?.id) {
    try {
      const { obtenerDirecciones } = await import('./db.js');
      const dirs = await obtenerDirecciones(sesionInicial.id);
      if (dirs && dirs.length > 0) {
        // La primera es la favorita (order es_favorita.desc)
        const favorita = dirs[0];
        ubicacion = {
          ubicacion_texto: favorita.texto,
          ubicacion_lat:   favorita.lat  ?? null,
          ubicacion_lng:   favorita.lng  ?? null,
        };
        // Sincronizar localStorage
        localStorage.setItem(
          'o300_ubicacion',
          JSON.stringify(ubicacion)
        );
      }
    } catch {
      // Si falla, queda la del localStorage
    }
  }

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

    // Mostrar checkbox "guardar" solo si está logueado
    const chkRow = document.querySelector('.chk-row');
    if (chkRow) chkRow.style.display = sesionActual?.id ? 'flex' : 'none';

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
  btnDelivery?.addEventListener('click', async () => {
    const estado = deliveryDisponible(configApp || {});
    if (!estado.ok) return;
    conDelivery = true;
    btnDelivery.classList.add('activo');
    btnRetiro.classList.remove('activo');
    seccionUbicacion.style.display = 'block';
    document.getElementById('seccion-retiro').style.display = 'none';

    // Si no hay ubicación en memoria, intentar cargar favorita desde BD
    if (!ubicacion?.ubicacion_texto) {
      const sesionActual = obtenerSesion();
      if (sesionActual?.id) {
        try {
          const { obtenerDirecciones } = await import('./db.js');
          const dirs = await obtenerDirecciones(sesionActual.id);
          if (dirs && dirs.length > 0) {
            const fav = dirs.find(d => d.es_favorita) || dirs[0];
            ubicacion = { ubicacion_texto: fav.texto, ubicacion_lat: fav.lat ?? null, ubicacion_lng: fav.lng ?? null };
          }
        } catch { /* sin dirección */ }
      }
    }

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
    if (!chkGuardar.checked) return;
    const texto = inputDir?.value.trim();
    if (!texto) return;

    ubicacion = { ubicacion_texto: texto, ubicacion_lat: null, ubicacion_lng: null };

    const sesionActual = obtenerSesion();
    if (sesionActual?.id) {
      // Cliente logueado → guardar en direcciones_guardadas
      try {
        const { guardarDireccion } = await import('./db.js');
        await guardarDireccion(sesionActual.id, { texto });
      } catch { console.warn('No se pudo guardar dirección en BD'); }
    } else {
      // Sin sesión → solo localStorage (legacy)
      await guardarUbicacion(deviceId, ubicacion);
    }
  });

  // Cambiar ubicación guardada → mostrar selector si tiene dirs guardadas
  document.getElementById('btn-cambiar-ubicacion')?.addEventListener('click', async () => {
    const sesionActual = obtenerSesion();
    if (sesionActual?.id) {
      try {
        const { obtenerDirecciones } = await import('./db.js');
        const dirs = await obtenerDirecciones(sesionActual.id);
        if (dirs && dirs.length > 0) {
          // Mostrar selector
          const listaEl = document.getElementById('lista-dirs-selector');
          listaEl.innerHTML = dirs.map(d => `
            <div onclick="seleccionarDireccionGuardada('${d.texto.replace(/'/g,"&#39;")}', ${d.lat ?? null}, ${d.lng ?? null})"
              style="padding:.65rem .9rem; background:${d.es_favorita ? '#fdf6ec' : '#f9f5ef'}; border-radius:10px; margin-bottom:.4rem; cursor:pointer; font-size:.9rem; color:#333; border:1.5px solid ${d.es_favorita ? '#e8c88a' : '#eee'}; display:flex; align-items:center; gap:.5rem;">
              ${d.es_favorita ? '⭐' : '📍'} ${d.texto}
            </div>
          `).join('');
          document.getElementById('ubicacion-guardada').style.display = 'none';
          document.getElementById('ubicacion-selector').style.display  = 'block';
          document.getElementById('ubicacion-nueva').style.display     = 'none';
          return;
        }
      } catch { /* cae a nueva dirección */ }
    }
    // Sin direcciones guardadas → ir directo a campo de texto
    const textoAnterior = ubicacion?.ubicacion_texto || '';
    limpiarUbicacionGuardada();
    ubicacion = null;
    document.getElementById('ubicacion-guardada').style.display = 'none';
    document.getElementById('ubicacion-selector').style.display  = 'none';
    document.getElementById('ubicacion-nueva').style.display     = 'block';
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
    btnD.innerHTML = resumen.subtotal >= (parseInt(configApp?.delivery_gratis_desde) || DELIVERY.gratis_desde)
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
      if (obtenerSesion()) return; // ya está logueado, no abrir auth
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
  const msg           = document.getElementById('modal-msg');

  // Dirección obligatoria en delivery
  if (conDelivery && !ubicacion?.ubicacion_texto) {
    if (msg) { msg.textContent = 'Ingresa tu dirección de entrega para continuar.'; msg.style.display = 'block'; setTimeout(() => { msg.style.display = 'none'; }, 3500); }
    // Enfocar el campo
    const inputDir = document.getElementById('input-direccion');
    if (inputDir) { inputDir.focus(); inputDir.style.borderColor = '#c0392b'; setTimeout(() => inputDir.style.borderColor = '#ddd', 3000); }
    return;
  }

  // Nombre obligatorio siempre
  if (!nombreCliente) {
    if (msg) { msg.textContent = 'Ingresa tu nombre para que sepamos quién hace el pedido.'; msg.style.display = 'block'; setTimeout(() => { msg.style.display = 'none'; }, 3500); }
    const inputN = document.getElementById('input-nombre');
    if (inputN) { inputN.focus(); inputN.style.borderColor = '#c0392b'; setTimeout(() => inputN.style.borderColor = '#ddd', 3000); }
    return;
  }

  const resumen   = obtenerResumen();
  const btnEnviar = document.getElementById(canal === 'whatsapp' ? 'btn-enviar-wsp' : 'btn-enviar-ig');

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
      descuentoPct:   parseInt(configApp?.descuento_primer_pedido ?? '20') || 20,
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
    // Limpiar datos del cliente del estado local
    ubicacion = null;
    limpiarUbicacionGuardada();
    // Limpiar inputs del modal carrito si están visibles
    const inputNombre = document.getElementById('input-nombre');
    const inputDir    = document.getElementById('input-direccion');
    const chkRow      = document.querySelector('.chk-row');
    if (inputNombre) inputNombre.value = '';
    if (inputDir)    inputDir.value    = '';
    if (chkRow)      chkRow.style.display = 'none';
    // Resetear vista ubicación
    document.getElementById('ubicacion-guardada').style.display = 'none';
    document.getElementById('ubicacion-selector').style.display  = 'none';
    document.getElementById('ubicacion-nueva').style.display     = 'block';
    actualizarChipSesion();
    document.getElementById('menu-sesion').style.display = 'none';
  });

  document.getElementById('btn-ver-historial')?.addEventListener('click', () => {
    document.getElementById('menu-sesion').style.display = 'none';
    abrirHistorial();
  });

  // Perfil
  document.getElementById('btn-ver-perfil')?.addEventListener('click', () => {
    document.getElementById('menu-sesion').style.display = 'none';
    abrirPerfil();
  });

  document.getElementById('perfil-cerrar')?.addEventListener('click', () => {
    document.getElementById('modal-perfil').style.display = 'none';
  });

  document.getElementById('modal-perfil')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-perfil'))
      document.getElementById('modal-perfil').style.display = 'none';
  });

  // Guardar nombre desde perfil
  document.getElementById('btn-guardar-nombre')?.addEventListener('click', async () => {
    const btn    = document.getElementById('btn-guardar-nombre');
    const nombre = document.getElementById('perfil-nombre').value.trim();
    const errorEl = document.getElementById('perfil-error');
    const exitoEl = document.getElementById('perfil-exito');
    errorEl.textContent = '';
    exitoEl.textContent = '';

    if (!nombre) { errorEl.textContent = 'Ingresa un nombre'; return; }

    const sesion = obtenerSesion();
    if (!sesion) return;

    btn.disabled = true;
    btn.textContent = '...';

    try {
      const { SUPABASE_URL, SUPABASE_KEY } = await import('./config.js');
      const res = await fetch(`${SUPABASE_URL}/rest/v1/clientes?id=eq.${sesion.id}`, {
        method: 'PATCH',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, updated_at: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error();
      const { guardarSesion } = await import('./auth.js');
      guardarSesion({ ...sesion, nombre });
      actualizarChipSesion();
      exitoEl.textContent = 'Nombre actualizado ✓';
    } catch { errorEl.textContent = 'Error al guardar'; }

    btn.disabled = false;
    btn.textContent = 'Guardar';
  });

  // Guardar email desde perfil
  document.getElementById('btn-guardar-email-perfil')?.addEventListener('click', async () => {
    const btn    = document.getElementById('btn-guardar-email-perfil');
    const email  = document.getElementById('perfil-email').value.trim().toLowerCase();
    const errorEl = document.getElementById('perfil-error');
    const exitoEl = document.getElementById('perfil-exito');
    errorEl.textContent = '';
    exitoEl.textContent = '';

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errorEl.textContent = 'Email inválido'; return;
    }

    const sesion = obtenerSesion();
    if (!sesion) return;

    btn.disabled = true;
    btn.textContent = '...';

    try {
      const { SUPABASE_URL, SUPABASE_KEY } = await import('./config.js');

      // Verificar duplicado (solo si cambió)
      if (email !== sesion.email) {
        const chk = await fetch(`${SUPABASE_URL}/rest/v1/clientes?email=eq.${encodeURIComponent(email)}&select=id&limit=1`,
          { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
        const rows = chk.ok ? await chk.json() : [];
        if (rows.length > 0) {
          errorEl.textContent = 'Este email ya está en uso'; btn.disabled = false; btn.textContent = 'Guardar'; return;
        }
      }

      const res = await fetch(`${SUPABASE_URL}/rest/v1/clientes?id=eq.${sesion.id}`, {
        method: 'PATCH',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, updated_at: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error();
      const { guardarSesion } = await import('./auth.js');
      guardarSesion({ ...sesion, email });
      document.getElementById('btn-agregar-email').style.display = 'none';
      exitoEl.textContent = 'Email actualizado ✓';
    } catch { errorEl.textContent = 'Error al guardar'; }

    btn.disabled = false;
    btn.textContent = 'Guardar';
  });

  // Btn "ingresar otra dirección" desde el selector
  document.getElementById('btn-nueva-ubicacion')?.addEventListener('click', () => {
    const textoAnterior = ubicacion?.ubicacion_texto || '';
    ubicacion = null;
    document.getElementById('ubicacion-guardada').style.display = 'none';
    document.getElementById('ubicacion-selector').style.display  = 'none';
    document.getElementById('ubicacion-nueva').style.display     = 'block';
    const inputDir = document.getElementById('input-direccion');
    if (inputDir) inputDir.value = textoAnterior;
  });

  // Agregar nueva dirección desde perfil
  document.getElementById('btn-agregar-direccion')?.addEventListener('click', async () => {
    const btn    = document.getElementById('btn-agregar-direccion');
    const input  = document.getElementById('perfil-nueva-direccion');
    const texto  = input.value.trim();
    const errorEl = document.getElementById('perfil-error');
    const exitoEl = document.getElementById('perfil-exito');
    errorEl.textContent = '';
    exitoEl.textContent = '';

    if (!texto) { errorEl.textContent = 'Ingresa una dirección'; return; }

    const sesion = obtenerSesion();
    if (!sesion) return;

    btn.disabled    = true;
    btn.textContent = '...';

    try {
      const { guardarDireccion } = await import('./db.js');
      await guardarDireccion(sesion.id, { texto });
      input.value = '';
      await cargarDireccionesPerfil(sesion.id);
      exitoEl.textContent = 'Dirección agregada ✓';
    } catch { errorEl.textContent = 'Error al guardar la dirección'; }

    btn.disabled    = false;
    btn.textContent = '+ Agregar';
  });

  // Cambiar PIN desde perfil → abre flujo reset
  document.getElementById('btn-perfil-cambiar-pin')?.addEventListener('click', () => {
    document.getElementById('modal-perfil').style.display = 'none';
    // Abrir modal auth en vista reset-email
    const modalAuth = document.getElementById('modal-auth');
    modalAuth.style.display = 'flex';
    document.getElementById('auth-vista-principal').style.display   = 'none';
    document.getElementById('auth-vista-reset-email').style.display = 'block';
    document.getElementById('auth-vista-reset-codigo').style.display = 'none';
    // Pre-rellenar email si lo tiene
    const sesion = obtenerSesion();
    if (sesion?.email) document.getElementById('auth-email-reset').value = sesion.email;
  });

  // Agregar email
  document.getElementById('btn-agregar-email')?.addEventListener('click', () => {
    document.getElementById('menu-sesion').style.display = 'none';
    document.getElementById('input-email-nuevo').value = '';
    document.getElementById('email-error').textContent = '';
    document.getElementById('email-exito').textContent = '';
    document.getElementById('modal-agregar-email').style.display = 'flex';
  });

  document.getElementById('cerrar-modal-email')?.addEventListener('click', () => {
    document.getElementById('modal-agregar-email').style.display = 'none';
  });

  document.getElementById('modal-agregar-email')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-agregar-email')) {
      document.getElementById('modal-agregar-email').style.display = 'none';
    }
  });

  document.getElementById('btn-guardar-email')?.addEventListener('click', async () => {
    const btn    = document.getElementById('btn-guardar-email');
    const email  = document.getElementById('input-email-nuevo').value.trim().toLowerCase();
    const errorEl = document.getElementById('email-error');
    const exitoEl = document.getElementById('email-exito');

    errorEl.textContent = '';
    exitoEl.textContent = '';

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errorEl.textContent = 'Email inválido';
      return;
    }

    const sesion = obtenerSesion();
    if (!sesion) return;

    btn.disabled    = true;
    btn.textContent = 'Guardando...';

    try {
      const { SUPABASE_URL, SUPABASE_KEY } = await import('./config.js');

      // Verificar duplicado
      const checkRes = await fetch(
        `${SUPABASE_URL}/rest/v1/clientes?email=eq.${encodeURIComponent(email)}&select=id&limit=1`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      const rows = checkRes.ok ? await checkRes.json() : [];
      if (rows.length > 0) {
        errorEl.textContent = 'Este email ya está registrado en otra cuenta';
        btn.disabled    = false;
        btn.textContent = 'Guardar';
        return;
      }

      // Actualizar
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/clientes?id=eq.${sesion.id}`,
        {
          method:  'PATCH',
          headers: {
            apikey:          SUPABASE_KEY,
            Authorization:   `Bearer ${SUPABASE_KEY}`,
            'Content-Type':  'application/json',
            'Prefer':        'return=representation',
          },
          body: JSON.stringify({ email, updated_at: new Date().toISOString() }),
        }
      );

      if (!res.ok) throw new Error('Error al guardar');

      // Actualizar sesión local
      const { guardarSesion } = await import('./auth.js');
      guardarSesion({ ...sesion, email });

      exitoEl.textContent = '¡Email guardado! Ya puedes recuperar tu PIN si lo olvidas.';
      // Ocultar botón del menú
      document.getElementById('btn-agregar-email').style.display = 'none';
      setTimeout(() => {
        document.getElementById('modal-agregar-email').style.display = 'none';
      }, 2000);

    } catch {
      errorEl.textContent = 'Error al guardar el email. Intenta de nuevo.';
    }

    btn.disabled    = false;
    btn.textContent = 'Guardar';
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
  const btnEmail = document.getElementById('btn-agregar-email');
  const sesion = obtenerSesion();
  if (!chip) return;
  chip.style.display = 'block';
  if (sesion?.nombre) {
    nombre.textContent = sesion.nombre.split(' ')[0];
    chip.title = 'Mi cuenta';
  } else if (sesion) {
    nombre.textContent = 'Mi cuenta';
  } else {
    nombre.innerHTML = 'Registrarse <span style="background:#c8a97e;color:#1a1a1a;font-size:.7rem;padding:.1rem .4rem;border-radius:4px;margin-left:.3rem;font-weight:bold;">20% OFF</span>';
    chip.title = 'Regístrate y obtén 20% en tu primer pedido';
  }
  // Mostrar "Agregar email" solo si está logueado y no tiene email
  if (btnEmail) {
    btnEmail.style.display = (sesion && !sesion.email) ? 'block' : 'none';
  }
}

function iniciarModalAuth() {
  const modal    = document.getElementById('modal-auth');
  const cerrarBtn = document.getElementById('auth-cerrar');
  const tabs     = document.querySelectorAll('.auth-tab');
  const errorEl  = document.getElementById('auth-error');
  const exitoEl  = document.getElementById('auth-exito');

  // ── Helpers de vistas ─────────────────────
  function mostrarVista(id) {
    ['auth-vista-principal', 'auth-vista-reset-email', 'auth-vista-reset-codigo']
      .forEach(v => document.getElementById(v).style.display = v === id ? 'block' : 'none');
    errorEl.textContent = '';
    exitoEl.textContent = '';
  }

  function limpiarModal() {
    // Limpiar todos los inputs del modal
    ['auth-nombre','auth-email-reg','auth-telefono-reg','auth-pin-reg',
     'auth-telefono-login','auth-pin-login',
     'auth-email-reset','auth-codigo-otp','auth-pin-nuevo']
      .forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
    errorEl.textContent = '';
    exitoEl.textContent = '';
    mostrarVista('auth-vista-principal');
    // Resetear tabs a "registro" activo
    tabs.forEach(t => {
      const esRegistro = t.dataset.tab === 'registro';
      t.classList.toggle('activo', esRegistro);
      t.style.background = esRegistro ? '#8B1A2F' : '#f0ebe0';
      t.style.color      = esRegistro ? '#fff'    : '#555';
    });
    document.getElementById('tab-registro').style.display = 'block';
    document.getElementById('tab-login').style.display    = 'none';
  }

  // ── Cerrar modal ──────────────────────────
  cerrarBtn?.addEventListener('click', () => {
    modal.style.display = 'none';
    limpiarModal();
  });
  modal?.addEventListener('click', e => {
    if (e.target === modal) {
      modal.style.display = 'none';
      limpiarModal();
    }
  });

  // ── Tabs registro / login ─────────────────
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

  // ── Registro ──────────────────────────────
  document.getElementById('btn-registrar')?.addEventListener('click', async () => {
    const btn    = document.getElementById('btn-registrar');
    const nombre = document.getElementById('auth-nombre').value.trim();
    const email  = document.getElementById('auth-email-reg').value.trim();
    const tel    = document.getElementById('auth-telefono-reg').value.trim();
    const pin    = document.getElementById('auth-pin-reg').value.trim();

    errorEl.textContent = '';
    btn.disabled        = true;
    btn.textContent     = 'Creando cuenta...';

    const r = await registrar({ deviceId, telefono: tel, pin, nombre, email });

    btn.disabled    = false;
    btn.textContent = 'Crear cuenta';

    if (r.ok) {
      exitoEl.textContent = `¡Bienvenido/a ${r.cliente.nombre || ''}! Cuenta creada.`;
      actualizarChipSesion();
      setTimeout(() => { modal.style.display = 'none'; limpiarModal(); }, 1500);
    } else {
      errorEl.textContent = r.error;
    }
  });

  // ── Login ─────────────────────────────────
  document.getElementById('btn-login')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-login');
    const tel = document.getElementById('auth-telefono-login').value.trim();
    const pin = document.getElementById('auth-pin-login').value.trim();

    errorEl.textContent = '';
    btn.disabled        = true;
    btn.textContent     = 'Ingresando...';

    const r = await login({ telefono: tel, pin });

    btn.disabled    = false;
    btn.textContent = 'Ingresar';

    if (r.ok) {
      exitoEl.textContent = `¡Hola ${r.cliente.nombre || ''}!`;
      actualizarChipSesion();
      setTimeout(() => { modal.style.display = 'none'; limpiarModal(); }, 1200);
    } else {
      errorEl.textContent = r.error;
    }
  });

  // ── Reset PIN — navegación ────────────────
  document.getElementById('btn-olvide-pin')?.addEventListener('click', () => {
    mostrarVista('auth-vista-reset-email');
  });

  document.getElementById('btn-volver-desde-reset')?.addEventListener('click', () => {
    mostrarVista('auth-vista-principal');
  });

  document.getElementById('btn-volver-desde-codigo')?.addEventListener('click', () => {
    mostrarVista('auth-vista-reset-email');
  });

  // ── Reset PIN — paso 1: enviar código ─────
  let _resetEmail = '';

  document.getElementById('btn-enviar-codigo')?.addEventListener('click', async () => {
    const btn   = document.getElementById('btn-enviar-codigo');
    const email = document.getElementById('auth-email-reset').value.trim();

    errorEl.textContent = '';
    btn.disabled        = true;
    btn.textContent     = 'Enviando...';

    const r = await solicitarResetPin(email);

    btn.disabled    = false;
    btn.textContent = 'Enviar código';

    if (r.ok) {
      _resetEmail = email;
      exitoEl.textContent = 'Si ese email está registrado, recibirás el código en breve.';
      setTimeout(() => {
        exitoEl.textContent = '';
        mostrarVista('auth-vista-reset-codigo');
      }, 2000);
    } else {
      errorEl.textContent = r.error;
    }
  });

  // ── Reset PIN — paso 2: verificar y cambiar ─
  document.getElementById('btn-confirmar-reset')?.addEventListener('click', async () => {
    const btn      = document.getElementById('btn-confirmar-reset');
    const codigo   = document.getElementById('auth-codigo-otp').value.trim();
    const nuevoPin = document.getElementById('auth-pin-nuevo').value.trim();

    errorEl.textContent = '';
    btn.disabled        = true;
    btn.textContent     = 'Verificando...';

    const r = await verificarResetPin({ email: _resetEmail, codigo, nuevo_pin: nuevoPin });

    btn.disabled    = false;
    btn.textContent = 'Cambiar PIN';

    if (r.ok) {
      exitoEl.textContent = '¡PIN cambiado! Ya puedes ingresar con tu nuevo PIN.';
      setTimeout(() => { limpiarModal(); }, 2200);
    } else {
      errorEl.textContent = r.error;
    }
  });
}

// ── Prompt de registro post-pedido ────────

export function mostrarPromptRegistro() {
  const sesion = obtenerSesion();
  if (sesion?.telefono) return; // ya está registrado
  if (obtenerSesion()) return;  // sesión activa, no interrumpir

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

async function abrirPerfil() {
  const modal  = document.getElementById('modal-perfil');
  const sesion = obtenerSesion();
  if (!sesion) return;

  document.getElementById('perfil-nombre').value          = sesion.nombre   || '';
  document.getElementById('perfil-telefono').textContent  = sesion.telefono || '—';
  document.getElementById('perfil-email').value           = sesion.email    || '';
  document.getElementById('perfil-error').textContent     = '';
  document.getElementById('perfil-exito').textContent     = '';
  document.getElementById('perfil-nueva-direccion').value = '';

  await cargarDireccionesPerfil(sesion.id);
  modal.style.display = 'flex';
}

async function cargarDireccionesPerfil(clienteId) {
  const lista = document.getElementById('perfil-lista-direcciones');
  lista.innerHTML = '<p style="font-size:.82rem;color:#bbb;text-align:center;">Cargando...</p>';

  try {
    const { obtenerDirecciones } = await import('./db.js');
    const dirs = await obtenerDirecciones(clienteId);

    if (!dirs || dirs.length === 0) {
      lista.innerHTML = '<p style="font-size:.82rem;color:#bbb;text-align:center;">No tienes direcciones guardadas</p>';
      return;
    }

    lista.innerHTML = dirs.map(d => `
      <div data-id="${d.id}" style="display:flex;align-items:center;gap:.5rem;padding:.6rem .8rem;background:${d.es_favorita ? '#fdf6ec' : '#f9f5ef'};border-radius:10px;margin-bottom:.5rem;border:1.5px solid ${d.es_favorita ? '#e8c88a' : '#eee'};">
        <button onclick="toggleFavorita('${d.id}','${clienteId}','${d.es_favorita}')" title="${d.es_favorita ? 'Quitar favorita' : 'Marcar como favorita'}"
          style="background:none;border:none;cursor:pointer;font-size:1.1rem;padding:0;flex-shrink:0;">${d.es_favorita ? '⭐' : '☆'}</button>
        <span style="flex:1;font-size:.88rem;color:#444;">${d.texto}</span>
        <button onclick="pedirConfirmarEliminar('${d.id}','${clienteId}','${d.texto.replace(/'/g,"&#39;")}')"
          style="background:none;border:none;cursor:pointer;color:#c0392b;font-size:.8rem;padding:.2rem .4rem;flex-shrink:0;">✕</button>
      </div>
    `).join('');
  } catch {
    lista.innerHTML = '<p style="font-size:.82rem;color:#c0392b;text-align:center;">Error al cargar direcciones</p>';
  }
}

// Seleccionar dirección desde el selector del carrito
window.seleccionarDireccionGuardada = function(texto, lat, lng) {
  ubicacion = { ubicacion_texto: texto, ubicacion_lat: lat, ubicacion_lng: lng };
  localStorage.setItem('o300_ubicacion', JSON.stringify(ubicacion));
  document.getElementById('texto-ubicacion-guardada').textContent = texto;
  document.getElementById('ubicacion-guardada').style.display = 'block';
  document.getElementById('ubicacion-selector').style.display  = 'none';
  document.getElementById('ubicacion-nueva').style.display     = 'none';
};

window.toggleFavorita = async function(id, clienteId, yaEsFavorita) {
  try {
    const { marcarFavorita, obtenerDirecciones } = await import('./db.js');
    await marcarFavorita(id, clienteId, yaEsFavorita === 'true');
    await cargarDireccionesPerfil(clienteId);
    // Recargar ubicacion activa sin F5
    const dirs = await obtenerDirecciones(clienteId);
    if (dirs && dirs.length > 0) {
      const fav = dirs.find(d => d.es_favorita) || dirs[0];
      ubicacion = { ubicacion_texto: fav.texto, ubicacion_lat: fav.lat ?? null, ubicacion_lng: fav.lng ?? null };
      localStorage.setItem('o300_ubicacion', JSON.stringify(ubicacion));
    }
  } catch {
    document.getElementById('perfil-error').textContent = 'Error al actualizar favorita';
  }
};

window.pedirConfirmarEliminar = function(id, clienteId, texto) {
  const modal = document.getElementById('modal-confirmar');
  document.getElementById('confirmar-mensaje').textContent = '¿Eliminar esta dirección?';
  document.getElementById('confirmar-detalle').textContent  = texto;
  modal.style.display = 'flex';

  // Asignar acción al botón confirmar
  const btnOk = document.getElementById('confirmar-ok');
  const btnCancelar = document.getElementById('confirmar-cancelar');

  const handler = async () => {
    modal.style.display = 'none';
    btnOk.removeEventListener('click', handler);
    try {
      const { eliminarDireccion } = await import('./db.js');
      await eliminarDireccion(id);
      await cargarDireccionesPerfil(clienteId);
      document.getElementById('perfil-exito').textContent = 'Dirección eliminada ✓';
    } catch {
      document.getElementById('perfil-error').textContent = 'Error al eliminar';
    }
  };

  const cancelHandler = () => {
    modal.style.display = 'none';
    btnOk.removeEventListener('click', handler);
    btnCancelar.removeEventListener('click', cancelHandler);
  };

  btnOk.addEventListener('click', handler);
  btnCancelar.addEventListener('click', cancelHandler);
};

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
