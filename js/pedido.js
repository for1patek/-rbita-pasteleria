// ─────────────────────────────────────────
// pedido.js — armar y enviar pedido
// ─────────────────────────────────────────

import { CONTACTO, DELIVERY } from './config.js';
import { crearPedido } from './db.js';
import { sanitizar, validarItems, verificarRateLimit, registrarPedidoEnRateLimit } from './seguridad.js';
import { coordsALink } from './ubicacion.js';
import { obtenerTotal, calcularDelivery } from './carrito.js';

// ── Armar texto del mensaje ───────────────

export function armarMensaje({ items, subtotal, descuentoMonto, conDelivery, costoDelivery, total, ubicacion, nombreCliente }) {
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

  if (descuentoMonto > 0) {
    lineas.push(`Descuento primer pedido 🎉: -$${descuentoMonto.toLocaleString('es-CL')}`);
  }

  if (conDelivery) {
    if (costoDelivery === 0) {
      lineas.push('Delivery: Gratis 🎉');
    } else {
      lineas.push(`Delivery: $${costoDelivery.toLocaleString('es-CL')}`);
    }
    lineas.push(`Total: $${total.toLocaleString('es-CL')}`);
  } else {
    lineas.push('Retiro en local');
    lineas.push(`Total: $${total.toLocaleString('es-CL')}`);
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

export async function enviarPedido({ deviceId, items, productosDB, conDelivery, ubicacion, nombreCliente, canal, descuentoPct = 0, esPrimerPedido = false }) {
  // 1. Rate limit
  const rl = verificarRateLimit();
  if (!rl.permitido) throw new Error(rl.error);

  // 2. Validar items contra precios reales de BD
  const validacion = validarItems(items, productosDB);
  if (!validacion.valido) throw new Error(validacion.error);

  // 3. Calcular totales
  const subtotal = items.reduce((s, i) => s + i.precio * i.cantidad, 0);

  // Verificar en BD que realmente no tiene descuento previo (evitar manipulación frontend)
  let descuentoMonto = 0;
  if (esPrimerPedido && descuentoPct > 0) {
    const { SUPABASE_URL, SUPABASE_KEY } = await import('./config.js');
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/pedidos?device_id=eq.${encodeURIComponent(deviceId)}&descuento_aplicado=eq.true&select=id&limit=1`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const prev = await res.json().catch(() => []);
    if (prev.length === 0) {
      descuentoMonto = Math.round(subtotal * descuentoPct / 100);
    }
  }

  // Delivery se evalúa sobre subtotal ORIGINAL (antes del descuento)
  const costoDelivery = conDelivery
    ? (subtotal >= DELIVERY.gratis_desde ? 0 : DELIVERY.costo)
    : 0;

  const total = subtotal - descuentoMonto + costoDelivery;

  // 4. Guardar en BD
  const pedidoDB = {
    device_id:          deviceId,
    items:              items.map(i => ({
                          id: i.id,
                          nombre: i.nombre,
                          variante: i.variante ?? null,
                          precio: i.precio,
                          cantidad: i.cantidad,
                        })),
    subtotal_original:  subtotal,
    descuento_monto:    descuentoMonto,
    descuento_aplicado: descuentoMonto > 0,
    subtotal,
    delivery:           conDelivery,
    costo_delivery:     costoDelivery,
    total,
    ubicacion_texto:    sanitizar(ubicacion?.texto || ''),
    ubicacion_lat:      ubicacion?.lat ?? null,
    ubicacion_lng:      ubicacion?.lng ?? null,
    canal,
    nombre_cliente:     sanitizar(nombreCliente || ''),
  };

  await crearPedido(pedidoDB);

  // 5. Registrar en rate limit
  registrarPedidoEnRateLimit();

  // 6. Armar mensaje y abrir WhatsApp
  const mensaje = armarMensaje({ items, subtotal, descuentoMonto, conDelivery, costoDelivery, total, ubicacion, nombreCliente });
  const encoded = encodeURIComponent(mensaje);
  window.open(`https://wa.me/${CONTACTO.whatsapp}?text=${encoded}`, '_blank');
}
