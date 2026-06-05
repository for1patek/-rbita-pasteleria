/* ─────────────────────────────────────────
   carrito.css — botón flotante y modal de pedido
   ───────────────────────────────────────── */

/* ── Botón flotante ── */
#carrito-flotante {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%) translateY(100px);
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: var(--radius-full);
  padding: 14px 24px;
  font-family: var(--font-body);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 24px rgba(139, 26, 26, 0.35);
  transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s;
  opacity: 0;
  z-index: 100;
  white-space: nowrap;
}

#carrito-flotante.visible {
  transform: translateX(-50%) translateY(0);
  opacity: 1;
}

#carrito-flotante:active { opacity: 0.85; }

.carrito-icon { font-size: 1.1rem; }
.carrito-sep { opacity: 0.4; }

/* ── Modal overlay ── */
#modal-pedido {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  z-index: 200;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s ease;
}

#modal-pedido.visible {
  opacity: 1;
  pointer-events: all;
}

/* ── Modal panel ── */
.modal-panel {
  background: var(--bg);
  width: 100%;
  max-width: 480px;
  border-radius: 20px 20px 0 0;
  padding: 24px 24px 40px;
  max-height: 90vh;
  overflow-y: auto;
  transform: translateY(100%);
  transition: transform 0.3s cubic-bezier(0.34, 1.2, 0.64, 1);
}

#modal-pedido.visible .modal-panel {
  transform: translateY(0);
}

/* ── Modal header ── */
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.modal-titulo {
  font-family: var(--font-caps);
  font-size: 1.2rem;
  letter-spacing: 3px;
  color: var(--primary);
}

#modal-cerrar {
  width: 32px; height: 32px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--muted);
  font-size: 1rem;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: border-color var(--transition);
}
#modal-cerrar:hover { border-color: var(--primary); color: var(--primary); }

/* ── Lista de items ── */
#modal-lista-items {
  margin-bottom: 16px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 16px;
}

.modal-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 0.5px solid var(--border);
  gap: 8px;
}

.modal-item:last-child { border-bottom: none; }

.modal-item-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.modal-item-nombre {
  font-weight: 600;
  font-size: 0.9rem;
}

.modal-variante {
  font-size: 0.75rem;
  color: var(--muted);
  font-weight: 400;
}

.modal-item-qty {
  display: flex;
  align-items: center;
  gap: 8px;
}

.modal-item-precio {
  font-weight: 600;
  color: var(--primary);
  white-space: nowrap;
  font-size: 0.9rem;
}

/* ── Totales ── */
.modal-totales {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 20px;
  font-size: 0.88rem;
}

.modal-fila {
  display: flex;
  justify-content: space-between;
  color: var(--muted);
}

.modal-fila.total {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text);
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}

.modal-delivery-gratis { color: #2D6A4F; font-weight: 600; }

/* ── Sección retiro/delivery ── */
.modal-seccion-label {
  font-size: 0.7rem;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 10px;
}

.modal-dos-btns {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}

.modal-opcion-btn {
  flex: 1;
  padding: 12px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--card);
  color: var(--muted);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: border-color var(--transition), color var(--transition);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.modal-opcion-btn.activo {
  border-color: var(--primary);
  color: var(--primary);
  background: #fff5ee;
}

.delivery-tag {
  font-size: 0.72rem;
  font-weight: 400;
  color: var(--muted);
}

.delivery-tag.gratis { color: #2D6A4F; }

/* Delivery no disponible */
.modal-opcion-btn.no-disponible {
  opacity: 0.45;
  cursor: not-allowed;
  pointer-events: none;
  filter: grayscale(1);
}
#delivery-mensaje {
  font-size: .82rem;
  color: #c0392b;
  text-align: center;
  padding: .3rem 0 .1rem;
  min-height: 1.2em;
}

/* ── Sección ubicación ── */
#seccion-ubicacion {
  margin-bottom: 16px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 14px;
  display: none;
}

#ubicacion-guardada { display: none; }

.ubicacion-guardada-texto {
  font-size: 0.82rem;
  color: var(--text);
  margin-bottom: 8px;
}

.btn-link {
  font-size: 0.78rem;
  color: var(--primary);
  background: none;
  border: none;
  cursor: pointer;
  text-decoration: underline;
}

#btn-gps {
  width: 100%;
  padding: 10px;
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
  background: none;
  color: var(--muted);
  font-size: 0.85rem;
  cursor: pointer;
  margin-bottom: 8px;
  transition: border-color var(--transition);
}
#btn-gps:hover { border-color: var(--primary); color: var(--primary); }

#input-direccion {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: white;
  font-family: var(--font-body);
  font-size: 0.85rem;
  color: var(--text);
  outline: none;
  margin-bottom: 8px;
}
#input-direccion:focus { border-color: var(--primary); }

.chk-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
  color: var(--muted);
  cursor: pointer;
}

/* ── Nombre opcional ── */
.modal-nombre-wrap {
  margin-bottom: 20px;
}

#input-nombre {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: white;
  font-family: var(--font-body);
  font-size: 0.85rem;
  color: var(--text);
  outline: none;
}
#input-nombre:focus { border-color: var(--primary); }

/* ── Botones enviar ── */
.modal-canal-label {
  font-size: 0.7rem;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 10px;
}

.modal-enviar-btns {
  display: flex;
  gap: 10px;
}

.btn-enviar {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px;
  border-radius: var(--radius-md);
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: opacity var(--transition);
}

.btn-enviar:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-enviar:active { opacity: 0.8; }

#btn-enviar-wsp {
  background: #25D366;
  color: white;
}

#btn-enviar-ig {
  background: white;
  border-color: var(--border);
  color: var(--text);
}

/* Bloquear scroll del body cuando modal está abierto */
body.modal-open { overflow: hidden; }
