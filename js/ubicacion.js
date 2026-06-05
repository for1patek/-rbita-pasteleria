// ─────────────────────────────────────────
// ubicacion.js — GPS y ubicación del cliente
// Nunca accede al GPS sin permiso explícito del usuario
// ─────────────────────────────────────────

import { STORAGE_KEYS } from './config.js';
import { actualizarCliente } from './db.js';
import { sanitizar } from './seguridad.js';

// ── Guardar ubicación en localStorage y BD ─

export async function guardarUbicacion(deviceId, datos) {
  // datos: { texto, lat, lng }
  const limpio = {
    ubicacion_texto: sanitizar(datos.texto || ''),
    ubicacion_lat:   datos.lat   ?? null,
    ubicacion_lng:   datos.lng   ?? null,
  };

  // Guardar local (para próximas visitas sin consultar BD)
  localStorage.setItem(STORAGE_KEYS.ubicacion, JSON.stringify(limpio));

  // Guardar en BD si hay deviceId
  if (deviceId) {
    await actualizarCliente(deviceId, limpio).catch(() => {
      // Si falla la BD, igual queda guardado en local
      console.warn('No se pudo guardar ubicación en BD');
    });
  }

  return limpio;
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

    navigator.geolocation.getCurrentPosition(
      pos => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      err => {
        switch (err.code) {
          case err.PERMISSION_DENIED:
            reject(new Error('Permiso de ubicación denegado'));
            break;
          case err.POSITION_UNAVAILABLE:
            reject(new Error('Ubicación no disponible'));
            break;
          case err.TIMEOUT:
            reject(new Error('Tiempo de espera agotado'));
            break;
          default:
            reject(new Error('Error al obtener ubicación'));
        }
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  });
}

// ── Convertir coordenadas a link de Google Maps ─

export function coordsALink(lat, lng) {
  return `https://maps.google.com/?q=${lat},${lng}`;
}
