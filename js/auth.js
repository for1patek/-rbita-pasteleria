// ─────────────────────────────────────────
// auth.js — registro, login y sesión de clientes
// Identificación por teléfono + PIN (4 dígitos)
// Salt = teléfono normalizado (seguro sin columna extra)
// ─────────────────────────────────────────

import { SUPABASE_URL, SUPABASE_KEY, STORAGE_KEYS } from './config.js';
import { sanitizar, obtenerDeviceId } from './seguridad.js';

// ── Normalizar teléfono ───────────────────
// Acepta: 912345678 / +56912345678 / 56912345678
// Devuelve siempre: +56912345678

export function normalizarTelefono(raw) {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 9)  return `+56${digits}`;
  if (digits.length === 11 && digits.startsWith('56')) return `+${digits}`;
  if (digits.length === 12 && digits.startsWith('056')) return `+${digits.slice(1)}`;
  return `+${digits}`;
}

export function telefonoValido(raw) {
  const norm = normalizarTelefono(raw);
  return /^\+569\d{8}$/.test(norm);
}

export function pinValido(pin) {
  return /^\d{4}$/.test(pin);
}

// ── Hash PIN ──────────────────────────────
// SHA-256(telefono_normalizado + ":" + pin)

async function hashPin(telefono, pin) {
  const input   = `${telefono}:${pin}`;
  const encoder = new TextEncoder();
  const buf     = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Headers Supabase ──────────────────────

function headers(extra = {}) {
  return {
    'apikey':        SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type':  'application/json',
    ...extra,
  };
}

// ── Buscar cliente por teléfono ───────────

async function buscarPorTelefono(telefono) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/clientes?telefono=eq.${encodeURIComponent(telefono)}&select=*&limit=1`,
    { headers: headers() }
  );
  if (!res.ok) throw new Error('Error al buscar cliente');
  const rows = await res.json();
  return rows[0] || null;
}

// ── Buscar cliente por device_id ──────────

export async function buscarPorDevice(deviceId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/clientes?device_id=eq.${encodeURIComponent(deviceId)}&select=*&limit=1`,
    { headers: headers() }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

// ── Registrar cliente nuevo ───────────────

export async function registrar({ deviceId, telefono, pin, nombre }) {
  const tel = normalizarTelefono(telefono);

  if (!telefonoValido(telefono)) return { ok: false, error: 'Teléfono inválido. Ej: 9 1234 5678' };
  if (!pinValido(pin))           return { ok: false, error: 'El PIN debe ser de 4 dígitos' };

  const nombreLimpio = sanitizar(nombre || '').slice(0, 60);
  const hash         = await hashPin(tel, pin);

  // Verificar que el teléfono no esté registrado
  const existe = await buscarPorTelefono(tel);
  if (existe) return { ok: false, error: 'Este teléfono ya tiene una cuenta' };

  // Verificar si el device ya tiene un cliente anónimo → actualizar
  const anonimo = await buscarPorDevice(deviceId);

  let res;
  if (anonimo && !anonimo.telefono) {
    // Actualizar el registro anónimo existente
    res = await fetch(
      `${SUPABASE_URL}/rest/v1/clientes?device_id=eq.${encodeURIComponent(deviceId)}`,
      {
        method:  'PATCH',
        headers: headers({ 'Prefer': 'return=representation' }),
        body:    JSON.stringify({
          telefono:   tel,
          pin_hash:   hash,
          nombre:     nombreLimpio,
          updated_at: new Date().toISOString(),
        }),
      }
    );
  } else {
    // Crear registro nuevo
    res = await fetch(
      `${SUPABASE_URL}/rest/v1/clientes`,
      {
        method:  'POST',
        headers: headers({ 'Prefer': 'return=representation' }),
        body:    JSON.stringify({
          device_id:  deviceId,
          telefono:   tel,
          pin_hash:   hash,
          nombre:     nombreLimpio,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      }
    );
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (err.code === '23505') return { ok: false, error: 'Este teléfono ya tiene una cuenta' };
    return { ok: false, error: 'Error al crear la cuenta' };
  }

  const rows   = await res.json();
  const cliente = Array.isArray(rows) ? rows[0] : rows;
  guardarSesion(cliente);
  return { ok: true, cliente };
}

// ── Login ─────────────────────────────────

export async function login({ telefono, pin }) {
  const tel = normalizarTelefono(telefono);

  if (!telefonoValido(telefono)) return { ok: false, error: 'Teléfono inválido' };
  if (!pinValido(pin))           return { ok: false, error: 'PIN inválido' };

  const cliente = await buscarPorTelefono(tel);
  if (!cliente) return { ok: false, error: 'No encontramos esa cuenta' };

  const hash = await hashPin(tel, pin);
  if (hash !== cliente.pin_hash) return { ok: false, error: 'PIN incorrecto' };

  // Vincular device_id actual al cliente
  const deviceId = obtenerDeviceId();
  if (cliente.device_id !== deviceId) {
    await fetch(
      `${SUPABASE_URL}/rest/v1/clientes?id=eq.${cliente.id}`,
      {
        method:  'PATCH',
        headers: headers(),
        body:    JSON.stringify({ device_id: deviceId, updated_at: new Date().toISOString() }),
      }
    ).catch(() => {});
  }

  guardarSesion(cliente);
  return { ok: true, cliente };
}

// ── Sesión en localStorage ────────────────

export function guardarSesion(cliente) {
  localStorage.setItem(STORAGE_KEYS.sesion, JSON.stringify({
    id:       cliente.id,
    nombre:   cliente.nombre,
    telefono: cliente.telefono,
    device_id: cliente.device_id,
  }));
}

export function obtenerSesion() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.sesion);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function cerrarSesion() {
  localStorage.removeItem(STORAGE_KEYS.sesion);
}

export function estaLogueado() {
  return obtenerSesion() !== null;
}
