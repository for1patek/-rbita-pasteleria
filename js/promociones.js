// ─────────────────────────────────────────
// promociones.js — leer y aplicar promociones
// Solo se muestran a clientes con sesión activa
// ─────────────────────────────────────────

import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

function headers() {
  return {
    'apikey':        SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
  };
}

// ── Cargar promociones activas desde Supabase ─

export async function cargarPromociones() {
  try {
    const ahora = new Date().toISOString();
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/promociones?activa=eq.true&or=(fecha_fin.is.null,fecha_fin.gt.${ahora})&select=*`,
      { headers: headers() }
    );
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

// ── Obtener promoción aplicable a un producto ─
// Retorna la promo de mejor valor o null

export function promoParaProducto(productoId, promociones) {
  const activas = promociones.filter(p =>
    p.productos_ids?.includes(productoId) &&
    p.cantidad === 1 &&
    p.productos_ids?.length === 1 // solo descuentos de 1 producto, no bundles
  );
  if (activas.length === 0) return null;
  // Priorizar la de mayor descuento
  return activas.sort((a, b) => {
    const aVal = a.tipo === 'descuento_pct' ? a.valor : 0;
    const bVal = b.tipo === 'descuento_pct' ? b.valor : 0;
    return bVal - aVal;
  })[0];
}

// ── Calcular precio con promo ─────────────

export function precioConPromo(precioOriginal, promo) {
  if (!promo) return { precio: precioOriginal, descuento: 0 };
  if (promo.tipo === 'descuento_pct') {
    const descuento = Math.round(precioOriginal * promo.valor / 100);
    return { precio: precioOriginal - descuento, descuento };
  }
  if (promo.tipo === 'precio_fijo') {
    return {
      precio:    promo.valor,
      descuento: (promo.precio_original ?? precioOriginal) - promo.valor,
    };
  }
  return { precio: precioOriginal, descuento: 0 };
}

// ── Obtener bundles/cantidades (promos con cantidad>1 o múltiples productos) ─

export function obtenerBundles(promociones) {
  return promociones.filter(p =>
    p.seleccionable || p.cantidad > 1 || p.productos_ids?.length > 1
  );
}

// ── Formatear precio en CLP ───────────────

export function fmtCLP(n) {
  return `$${Number(n).toLocaleString('es-CL')}`;
}
