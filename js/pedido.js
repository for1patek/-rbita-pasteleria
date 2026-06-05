// ─────────────────────────────────────────
// pedido.js — armar y enviar pedido
// ─────────────────────────────────────────

import { CONTACTO, DELIVERY } from './config.js';
import { crearPedido } from './db.js';
import { sanitizar, validarItems, verificarRateLimit, registrarPedidoEnRateLimit } from './seguridad.js';
import { coordsALink } from './ubicacion.js';
import { obtenerTotal, calcularDelivery } from './carrito.js';

// ── Armar texto del mensaje ───────────────

export function armarMensaje({ items, subtotal, conDelivery, costoDelivery, total, ubicacion, nombreCliente }) {
  const lineas = [];

  lineas.push('Hola! Quiero hacer un pedido 🛒');
  lineas.push('');

  for (const item of items) {
    const variante = item.variante ? ` (${item.variante})` : '';
    const itemTotal = item.precio * item.cantidad;
    lineas.push(`• ${item.nombre}${variante} x${item.cantidad} → $${itemTotal.toLocaleString('es-CL')}`);
  }

  lineas.push('');
  lineas.push(`Subtotal: $${subtotal.toLocaleString('es-CL')}`);

  if (conDelivery) {
    if (costoDelivery === 0) {
      lineas.push('Delivery: Gratis 🎉');
    } else {
      lineas.push(`Delivery: $${costoDelivery.toLocaleString('es-CL')}`);
    }
    lineas.push(`Total: $${total.toLocaleString('es-CL')}`);
  } else {
    lineas.push('Retiro en local');
    lineas.push(`Total: $${subtotal.toLocaleString('es-CL')}`);
  }

  if (nombreCliente) {
    lineas.push('');
    lineas.push(`Nombre: ${sanitizar(nombreCliente)}`);
  }

  if (ubicacion) {
    lineas.push('');
    if (ubicacion.lat && ubicacion.lng) {
      lineas.push(`📍 Ubicación: ${coordsALink(ubicacion.lat, ubicacion.lng)}`);
    } else if (ubicacion.texto) {
      lineas.push(`📍 Dirección: ${sanitizar(ubicacion.texto)}`);
    }
  }

  return lineas.join('\n');
}

// ── Enviar pedido completo ─────────────────

export async function enviarPedido({ deviceId, items, productosDB, conDelivery, ubicacion, nombreCliente, canal }) {
  // 1. Rate limit
  const rl = verificarRateLimit();
  if (!rl.permitido) throw new Error(rl.error);

  // 2. Validar items contra precios reales de BD
  const validacion = validarItems(items, productosDB);
  if (!validacion.valido) throw new Error(validacion.error);

  // 3. Calcular totales desde BD (no confiar en frontend)
  const subtotal  = items.reduce((s, i) => s + i.precio * i.cantidad, 0);
  const costoDelivery = conDelivery
    ? (subtotal >= DELIVERY.gratis_desde ? 0 : DELIVERY.costo)
    : 0;
  const total = subtotal + costoDelivery;

  // 4. Guardar en BD
  const pedidoDB = {
    device_id:       deviceId,
    items:           items.map(i => ({
                       id: i.id,
                       nombre: i.nombre,
                       variante: i.variante ?? null,
                       precio: i.precio,
                       cantidad: i.cantidad,
                     })),
    subtotal,
    delivery:        conDelivery,
    costo_delivery:  costoDelivery,
    total,
    ubicacion_texto: sanitizar(ubicacion?.texto || ''),
    ubicacion_lat:   ubicacion?.lat ?? null,
    ubicacion_lng:   ubicacion?.lng ?? null,
    canal,
    nombre_cliente:  sanitizar(nombreCliente || ''),
  };

  await crearPedido(pedidoDB);

  // 5. Registrar en rate limit
  registrarPedidoEnRateLimit();

  // 6. Armar mensaje y abrir app
  const mensaje = armarMensaje({ items, subtotal, conDelivery, costoDelivery, total, ubicacion, nombreCliente });
  const encoded = encodeURIComponent(mensaje);

  if (canal === 'whatsapp') {
    window.open(`https://wa.me/${CONTACTO.whatsapp}?text=${encoded}`, '_blank');
  } else if (canal === 'instagram') {
    // Instagram no soporta mensajes pre-armados vía URL,
    // copiamos el mensaje al portapapeles y abrimos el perfil
    await navigator.clipboard.writeText(mensaje).catch(() => {});
    window.open(`https://instagram.com/${CONTACTO.instagram}`, '_blank');
  }
}
