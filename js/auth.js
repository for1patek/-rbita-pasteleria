// ─────────────────────────────────────────
// auth.js — registro, login, sesión y reset de PIN
// Identificación: teléfono + PIN (4 dígitos)
// Reset: email + código OTP 6 dígitos (vía Edge Function)
// Salt del hash = teléfono normalizado
// ─────────────────────────────────────────

import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { sanitizar, obtenerDeviceId }  from './seguridad.js';

// ── Normalizar teléfono ───────────────────
// Acepta: 912345678 / +56912345678 / 56912345678
// Devuelve siempre: +56912345678

export function normalizarTelefono(raw) {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 9)                              return `+56${digits}`;
  if (digits.length === 11 && digits.startsWith('56')) return `+${digits}`;
  if (digits.length === 12 && digits.startsWith('056'))return `+${digits.slice(1)}`;
  return `+${digits}`;
}

export function telefonoValido(raw) {
  return /^\+569\d{8}$/.test(normalizarTelefono(raw));
}

export function pinValido(pin) {
  return /^\d{4}$/.test(String(pin));
}

export function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
}

// ── Hash PIN ──────────────────────────────
// SHA-256(telefono_normalizado + ":" + pin)

async function hashPin(telefono, pin) {
  const encoder = new TextEncoder();
  const buf     = await crypto.subtle.digest('SHA-256', encoder.encode(`${telefono}:${pin}`));
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
  return rows[0] ?? null;
}

// ── Buscar cliente por device_id ──────────

export async function buscarPorDevice(deviceId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/clientes?device_id=eq.${encodeURIComponent(deviceId)}&select=*&limit=1`,
    { headers: headers() }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] ?? null;
}

// ── Registrar cliente nuevo ───────────────
// Campos requeridos: nombre, telefono, pin, email

export async function registrar({ deviceId, telefono, pin, nombre, email }) {
  const tel = normalizarTelefono(telefono);

  if (!telefonoValido(telefono)) return { ok: false, error: 'Teléfono inválido. Ej: 9 1234 5678' };
  if (!pinValido(pin))           return { ok: false, error: 'El PIN debe ser de 4 dígitos' };
  if (!email || !emailValido(email)) return { ok: false, error: 'Email inválido. Lo necesitas para recuperar tu PIN' };

  const nombreLimpio = sanitizar(nombre || '').slice(0, 60);
  const emailLimpio  = String(email).trim().toLowerCase();
  const hash         = await hashPin(tel, pin);

  // Verificar duplicado por teléfono
  const existeTel = await buscarPorTelefono(tel);
  if (existeTel) return { ok: false, error: 'Este teléfono ya tiene una cuenta' };

  // Verificar duplicado por email
  const resEmail = await fetch(
    `${SUPABASE_URL}/rest/v1/clientes?email=eq.${encodeURIComponent(emailLimpio)}&select=id&limit=1`,
    { headers: headers() }
  );
  const rowsEmail = resEmail.ok ? await resEmail.json() : [];
  if (rowsEmail.length > 0) return { ok: false, error: 'Este email ya está registrado' };

  // Ver si el device tiene registro anónimo (sin teléfono)
  const anonimo = await buscarPorDevice(deviceId);

  let res;
  if (anonimo && !anonimo.telefono) {
    res = await fetch(
      `${SUPABASE_URL}/rest/v1/clientes?device_id=eq.${encodeURIComponent(deviceId)}`,
      {
        method:  'PATCH',
        headers: headers({ 'Prefer': 'return=representation' }),
        body:    JSON.stringify({
          telefono:   tel,
          pin_hash:   hash,
          nombre:     nombreLimpio,
          email:      emailLimpio,
          updated_at: new Date().toISOString(),
        }),
      }
    );
  } else {
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
          email:      emailLimpio,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      }
    );
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (err.code === '23505') {
      if (err.message?.includes('email')) return { ok: false, error: 'Este email ya está registrado' };
      return { ok: false, error: 'Este teléfono ya tiene una cuenta' };
    }
    return { ok: false, error: 'Error al crear la cuenta' };
  }

  const rows    = await res.json();
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

  // Actualizar device_id si cambió
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

// ── Reset PIN — paso 1: solicitar código ──
// Llama a la Edge Function, que envía el email con OTP

export async function solicitarResetPin(email) {
  if (!emailValido(email)) return { ok: false, error: 'Email inválido' };

  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/enviar-codigo-reset`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
      body:    JSON.stringify({ email: email.trim().toLowerCase() }),
    }
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    return { ok: false, error: data.error || 'Error al enviar el código' };
  }
  // Siempre OK en el front (anti-enumeración: no revelar si el email existe)
  return { ok: true };
}

// ── Reset PIN — paso 2: verificar OTP y nuevo PIN ──

export async function verificarResetPin({ email, codigo, nuevo_pin }) {
  if (!emailValido(email))       return { ok: false, error: 'Email inválido' };
  if (!/^\d{6}$/.test(codigo))  return { ok: false, error: 'Código de 6 dígitos requerido' };
  if (!pinValido(nuevo_pin))     return { ok: false, error: 'El nuevo PIN debe ser de 4 dígitos' };

  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/verificar-codigo-reset`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
      body:    JSON.stringify({
        email:     email.trim().toLowerCase(),
        codigo:    codigo.trim(),
        nuevo_pin: nuevo_pin.trim(),
      }),
    }
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    return { ok: false, error: data.error || 'Código incorrecto o expirado' };
  }
  return { ok: true };
}

// ── Sesión en localStorage ────────────────

export function guardarSesion(cliente) {
  localStorage.setItem('o300_sesion', JSON.stringify({
    id:        cliente.id,
    nombre:    cliente.nombre,
    telefono:  cliente.telefono,
    email:     cliente.email   ?? null,
    device_id: cliente.device_id,
  }));
}

export function obtenerSesion() {
  try {
    const raw = localStorage.getItem('o300_sesion');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function cerrarSesion() {
  localStorage.removeItem('o300_sesion');
}

export function estaLogueado() {
  return obtenerSesion() !== null;
}
