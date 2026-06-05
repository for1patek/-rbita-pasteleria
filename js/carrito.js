// ─────────────────────────────────────────
// carrito.js — estado del carrito en memoria
// No persiste entre recargas (intencional)
// ─────────────────────────────────────────

import { DELIVERY } from './config.js';

// Estado interno — nunca se expone directamente
let _items = [];
let _onChange = null; // callback para notificar cambios a la UI

// ── Suscribir cambios ─────────────────────

export function alCambiar(fn) {
  _onChange = fn;
}

function _notificar() {
  if (_onChange) _onChange(obtenerResumen());
}

// ── Operaciones ───────────────────────────

export function agregar(producto) {
  // producto: { id, nombre, precio, cantidad, variante (opcional) }
  const clave = _clave(producto);
  const existente = _items.find(i => _clave(i) === clave);

  if (existente) {
    existente.cantidad += producto.cantidad;
  } else {
    _items.push({ ...producto });
  }

  _notificar();
}

export function cambiarCantidad(clave, delta) {
  const item = _items.find(i => _clave(i) === clave);
  if (!item) return;

  item.cantidad += delta;

  if (item.cantidad <= 0) {
    _items = _items.filter(i => _clave(i) !== clave);
  }

  _notificar();
}

export function quitar(clave) {
  _items = _items.filter(i => _clave(i) !== clave);
  _notificar();
}

export function vaciar() {
  _items = [];
  _notificar();
}

// ── Cálculos ──────────────────────────────

export function obtenerSubtotal() {
  return _items.reduce((sum, i) => sum + i.precio * i.cantidad, 0);
}

export function calcularDelivery(conDelivery) {
  if (!conDelivery) return 0;
  const subtotal = obtenerSubtotal();
  return subtotal >= DELIVERY.gratis_desde ? 0 : DELIVERY.costo;
}

export function obtenerTotal(conDelivery = false) {
  return obtenerSubtotal() + calcularDelivery(conDelivery);
}

export function deliveryEsGratis() {
  return obtenerSubtotal() >= DELIVERY.gratis_desde;
}

// ── Resumen completo ──────────────────────

export function obtenerResumen() {
  return {
    items:     _items.map(i => ({ ...i, clave: _clave(i) })),
    cantidad:  _items.reduce((sum, i) => sum + i.cantidad, 0),
    subtotal:  obtenerSubtotal(),
    deliveryGratis: deliveryEsGratis(),
  };
}

export function estaVacio() {
  return _items.length === 0;
}

// ── Clave única por item ──────────────────
// Combina id + variante para distinguir
// ej: mismo producto en bolsa vs kilo = dos items distintos

function _clave(item) {
  return `${item.id}_${item.variante ?? ''}`;
}
