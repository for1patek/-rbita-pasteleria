// ─────────────────────────────────────────
// config-panel.js — lee y escribe config_pasteleria en Supabase
// Usado por pasteleria.html (solo lectura) y admin.html (lectura + escritura)
// ─────────────────────────────────────────

import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const TABLA = 'config_pasteleria';
const CLAVES_VALIDAS = [
  'delivery_activo',
  'delivery_cerrado_hoy',
  'delivery_costo',
  'delivery_hora_inicio',
  'delivery_hora_fin',
  'admin_password_hash',
  'descuento_primer_pedido',
];

// Defaults si Supabase no responde
const DEFAULTS = {
  delivery_activo:         'true',
  delivery_cerrado_hoy:    'false',
  delivery_costo:          '2000',
  delivery_hora_inicio:    '720',
  delivery_hora_fin:       '1260',
  descuento_primer_pedido: '0',
};

function headers(extra = {}) {
  return {
    'apikey':        SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type':  'application/json',
    ...extra,
  };
}

// ── Leer toda la config ───────────────────

export async function leerConfig() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLA}?select=clave,valor`, {
      headers: headers(),
    });
    if (!res.ok) throw new Error(`http_${res.status}`);
    const rows = await res.json();
    const out  = { ...DEFAULTS };
    for (const row of rows) {
      if (CLAVES_VALIDAS.includes(row.clave)) {
        out[row.clave] = row.valor;
      }
    }
    return out;
  } catch {
    return { ...DEFAULTS };
  }
}

// ── Escribir una clave ────────────────────

export async function escribirConfig(clave, valor) {
  if (!CLAVES_VALIDAS.includes(clave)) {
    return { ok: false, error: 'Clave inválida' };
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLA}`, {
      method:  'POST',
      headers: headers({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
      body:    JSON.stringify({ clave, valor, updated_at: new Date().toISOString() }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { ok: false, error: err.message || `Error ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── Verificar si delivery está disponible ahora ─

export function deliveryDisponible(config) {
  if (config.delivery_activo      !== 'true') return { ok: false, motivo: 'desactivado' };
  if (config.delivery_cerrado_hoy === 'true') return { ok: false, motivo: 'cerrado_hoy' };

  const ini = parseInt(config.delivery_hora_inicio);
  const fin = parseInt(config.delivery_hora_fin);
  const now = new Date();
  const min = now.getHours() * 60 + now.getMinutes();

  if (ini >= fin)           return { ok: false, motivo: 'horario_invalido' };
  if (min < ini || min >= fin) return { ok: false, motivo: 'fuera_horario', ini, fin };

  return { ok: true };
}

// ── Formatear minutos → HH:MM ─────────────

export function minAHora(min) {
  const h  = Math.floor(min / 60);
  const mm = min % 60;
  return `${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
}

// ── Parsear HH:MM → minutos ───────────────

export function horaAMin(str) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(str.trim());
  if (!m) return null;
  return Math.max(0, Math.min(23, +m[1])) * 60 + Math.max(0, Math.min(59, +m[2]));
}

// ── Verificar contraseña admin ────────────

export async function verificarPassword(input, hashGuardado) {
  const encoder = new TextEncoder();
  const buf     = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  const hash    = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  return hash === hashGuardado;
}
