// ─────────────────────────────────────────
// config.js — constantes globales
// Un solo lugar para cambiar URLs, keys y reglas de negocio
// ─────────────────────────────────────────

export const SUPABASE_URL = 'https://ycflfqayxjfbgzzlqofy.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_3K-t_LugyQv_SaDbxBMaFA_0d27D_ug';

// Reglas de delivery
export const DELIVERY = {
  costo: 2000,          // CLP
  gratis_desde: 6000,   // CLP — si subtotal >= esto, delivery gratis
};

// Contacto
export const CONTACTO = {
  whatsapp: '56971019691',
  instagram: 'orbita300frutillar',
};

// Rate limiting — máximo de pedidos por sesión por hora
export const RATE_LIMIT = {
  max_pedidos_por_hora: 5,
};

// Clave para localStorage
export const STORAGE_KEYS = {
  device_id:         'o300_device_id',
  ubicacion:         'o300_ubicacion',
  rate_limit:        'o300_rate_limit',
};
