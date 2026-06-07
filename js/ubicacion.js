// ─────────────────────────────────────────
// ubicacion.js — GPS y ubicación del cliente
// Nunca accede al GPS sin permiso explícito del usuario
// ─────────────────────────────────────────

import { STORAGE_KEYS } from './config.js';
import { actualizarCliente } from './db.js';
import { sanitizar } from './seguridad.js';

// ── Reverse geocoding (Nominatim / OpenStreetMap) ─
// Convierte coords en dirección legible: "Av. Hola 222, Frutillar"
// Gratuito, sin API key, sin registro

export async function coordsADireccion(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'es', 'User-Agent': 'Orbita300Pasteleria/1.0' }
    });
    if (!res.ok) throw new Error('nominatim_error');
    const data = await res.json();
    const a = data.address || {};

    // Armar dirección en formato chileno: "Calle Número, Ciudad"
    const calle  = a.road || a.pedestrian || a.footway || '';
    const numero = a.house_number || '';
    const ciudad = a.city || a.town || a.village || a.municipality || '';

    let direccion = calle;
    if (numero) direccion += ` ${numero}`;
    if (ciudad) direccion += `, ${ciudad}`;

    return direccion.trim() || data.display_name?.split(',').slice(0, 2).join(',').trim() || '';
  } catch {
    return '';
  }
}

// ── Guardar ubicación en localStorage y BD ─

export async function guardarUbicacion(deviceId, datos) {
  // datos: { texto, lat, lng } o { ubicacion_texto, ubicacion_lat, ubicacion_lng }
  const texto = sanitizar(datos.texto || datos.ubicacion_texto || '');
  const lat   = datos.lat ?? datos.ubicacion_lat  ?? null;
  const lng   = datos.lng ?? datos.ubicacion_lng  ?? null;

  const limpio = { ubicacion_texto: texto, ubicacion_lat: lat, ubicacion_lng: lng };

  localStorage.setItem(STORAGE_KEYS.ubicacion, JSON.stringify(limpio));

  if (deviceId) {
    // Mantener campo legacy en clientes para compatibilidad con pedidos
    await actualizarCliente(deviceId, limpio).catch(() => {
      console.warn('No se pudo guardar ubicación en BD');
    });
  }

  return limpio;
}

// ── Guardar en tabla direcciones_guardadas ─
// Llama desde app.js cuando el cliente marca "guardar dirección"

export async function guardarDireccionPermanente(clienteId, datos) {
  const { guardarDireccion } = await import('./db.js');
  const texto = sanitizar(datos.texto || datos.ubicacion_texto || '');
  if (!texto) return null;
  try {
    const rows = await guardarDireccion(clienteId, {
      texto,
      lat: datos.lat ?? datos.ubicacion_lat ?? null,
      lng: datos.lng ?? datos.ubicacion_lng ?? null,
    });
    return rows?.[0] ?? null;
  } catch (e) {
    console.warn('No se pudo guardar dirección permanente:', e);
    return null;
  }
}

// ── Recuperar ubicación guardada ──────────

export function obtenerUbicacionGuardada() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ubicacion);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function limpiarUbicacionGuardada() {
  localStorage.removeItem(STORAGE_KEYS.ubicacion);
}

// ── Pedir GPS al navegador ─────────────────

export function pedirGPS() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Tu dispositivo no soporta GPS'));
      return;
    }

    // Primero intentamos alta precisión, si falla usamos baja precisión
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {
        // Fallback: baja precisión
        navigator.geolocation.getCurrentPosition(
          pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          err => {
            const mensajes = {
              [err.PERMISSION_DENIED]:    'Permiso de ubicación denegado',
              [err.POSITION_UNAVAILABLE]: 'Ubicación no disponible',
              [err.TIMEOUT]:              'Tiempo de espera agotado',
            };
            reject(new Error(mensajes[err.code] || 'Error al obtener ubicación'));
          },
          { timeout: 8000, maximumAge: 60000, enableHighAccuracy: false }
        );
      },
      { timeout: 8000, maximumAge: 30000, enableHighAccuracy: true }
    );
  });
}

// ── Convertir coordenadas a link de Google Maps ─

export function coordsALink(lat, lng) {
  return `https://maps.google.com/?q=${lat},${lng}`;
}
