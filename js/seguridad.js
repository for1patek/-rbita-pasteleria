// ─────────────────────────────────────────
// seguridad.js — validaciones, rate limit, sanitización
// No confiar nunca en datos que vienen del cliente
// ─────────────────────────────────────────

import { STORAGE_KEYS, RATE_LIMIT } from './config.js';

// ── Device ID ─────────────────────────────
// Identificador anónimo persistente por dispositivo
// Se genera una vez y se guarda en localStorage

export function obtenerDeviceId() {
  let id = localStorage.getItem(STORAGE_KEYS.device_id);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEYS.device_id, id);
  }
  return id;
}

// ── Sanitización ──────────────────────────
// Elimina HTML y caracteres peligrosos de cualquier texto libre

export function sanitizar(texto) {
  if (typeof texto !== 'string') return '';
  return texto
    .trim()
    .replace(/[<>\"'`]/g, '')   // elimina caracteres HTML/JS peligrosos
    .slice(0, 200);             // máximo 200 caracteres
}

// ── Validar items del carrito ─────────────
// Verifica que los items tengan la estructura esperada
// y que los precios coincidan con los productos reales de BD

export function validarItems(items, productosDB) {
  if (!Array.isArray(items) || items.length === 0) {
    return { valido: false, error: 'El carrito está vacío' };
  }

  for (const item of items) {
    // Estructura mínima requerida
    if (!item.id || !item.nombre || !item.precio || !item.cantidad) {
      return { valido: false, error: 'Item con estructura inválida' };
    }

    // Cantidad debe ser número positivo entero
    if (!Number.isInteger(item.cantidad) || item.cantidad < 1 || item.cantidad > 99) {
      return { valido: false, error: `Cantidad inválida para ${item.nombre}` };
    }

    // El precio del item debe coincidir con el precio real en BD
    const productoReal = productosDB.find(p => p.id === item.id);
    if (!productoReal) {
      return { valido: false, error: `Producto no encontrado: ${item.nombre}` };
    }
    if (productoReal.precio !== item.precio) {
      return { valido: false, error: `Precio incorrecto para ${item.nombre}` };
    }
  }

  return { valido: true, error: null };
}

// ── Rate limiting ─────────────────────────
// Limita la cantidad de pedidos por dispositivo por hora
// Se guarda en localStorage como historial de timestamps

export function verificarRateLimit() {
  const ahora = Date.now();
  const unaHora = 60 * 60 * 1000;

  let historial = [];
  try {
    historial = JSON.parse(localStorage.getItem(STORAGE_KEYS.rate_limit) || '[]');
  } catch {
    historial = [];
  }

  // Filtrar solo los del último hora
  historial = historial.filter(ts => ahora - ts < unaHora);

  if (historial.length >= RATE_LIMIT.max_pedidos_por_hora) {
    return {
      permitido: false,
      error: `Máximo ${RATE_LIMIT.max_pedidos_por_hora} pedidos por hora. Intenta más tarde.`,
    };
  }

  return { permitido: true, error: null };
}

export function registrarPedidoEnRateLimit() {
  const ahora = Date.now();
  const unaHora = 60 * 60 * 1000;

  let historial = [];
  try {
    historial = JSON.parse(localStorage.getItem(STORAGE_KEYS.rate_limit) || '[]');
  } catch {
    historial = [];
  }

  historial = historial.filter(ts => ahora - ts < unaHora);
  historial.push(ahora);
  localStorage.setItem(STORAGE_KEYS.rate_limit, JSON.stringify(historial));
}
