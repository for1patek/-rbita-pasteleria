// ─────────────────────────────────────────
// db.js — comunicación con Supabase
// Toda query a la BD pasa por aquí, sin excepción
// ─────────────────────────────────────────

import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

// ── Helper base ───────────────────────────

async function query(endpoint, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Error ${res.status}`);
  }

  // 204 No Content no tiene body
  if (res.status === 204) return null;
  return res.json();
}

// ── Productos ─────────────────────────────

export async function obtenerProductos(pagina) {
  return query(`productos?pagina=eq.${pagina}&activo=eq.true&order=categoria.asc,orden.asc`);
}

// ── Clientes ──────────────────────────────

export async function obtenerCliente(deviceId) {
  const rows = await query(`clientes?device_id=eq.${deviceId}&limit=1`);
  return rows?.[0] ?? null;
}

export async function crearCliente(deviceId) {
  const rows = await query('clientes', {
    method: 'POST',
    body: JSON.stringify({ device_id: deviceId }),
  });
  return rows?.[0] ?? null;
}

export async function actualizarCliente(deviceId, datos) {
  // datos puede incluir: nombre, ubicacion_texto, ubicacion_lat, ubicacion_lng
  return query(`clientes?device_id=eq.${deviceId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      ...datos,
      updated_at: new Date().toISOString(),
    }),
  });
}

export async function obtenerOCrearCliente(deviceId) {
  const existente = await obtenerCliente(deviceId);
  if (existente) return existente;
  return crearCliente(deviceId);
}

// ── Pedidos ───────────────────────────────

export async function crearPedido(pedido) {
  // pedido: { device_id, items, subtotal, delivery, costo_delivery,
  //           total, ubicacion_texto, ubicacion_lat, ubicacion_lng,
  //           canal, nombre_cliente }
  const rows = await query('pedidos', {
    method: 'POST',
    body: JSON.stringify(pedido),
  });
  return rows?.[0] ?? null;
}

// ── Direcciones guardadas ─────────────────

export async function obtenerDirecciones(clienteId) {
  return query(`direcciones_guardadas?cliente_id=eq.${clienteId}&order=es_favorita.desc,created_at.asc`);
}

export async function guardarDireccion(clienteId, { texto, lat, lng }) {
  return query('direcciones_guardadas', {
    method: 'POST',
    body: JSON.stringify({
      cliente_id:  clienteId,
      texto:       texto.trim(),
      lat:         lat  ?? null,
      lng:         lng  ?? null,
      es_favorita: false,
    }),
  });
}

export async function eliminarDireccion(id) {
  const url = `${SUPABASE_URL}/rest/v1/direcciones_guardadas?id=eq.${id}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer':        'return=minimal',
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Error ${res.status}`);
  }
  return true;
}

export async function marcarFavorita(id, clienteId, yaEsFavorita) {
  // Quitar favorita a todas del cliente
  await query(`direcciones_guardadas?cliente_id=eq.${clienteId}`, {
    method: 'PATCH',
    body: JSON.stringify({ es_favorita: false }),
  });
  // Si no era favorita, marcarla; si ya lo era, queda desmarcada (toggle)
  if (!yaEsFavorita) {
    return query(`direcciones_guardadas?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ es_favorita: true }),
    });
  }
}
