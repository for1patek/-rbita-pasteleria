// ─────────────────────────────────────────
// productos.js — carga y renderiza productos
// ─────────────────────────────────────────

import { obtenerProductos } from './db.js';
import { agregar } from './carrito.js';

// Cache local de productos (para validación de precios)
export let productosDB = [];

// ── Cargar desde BD ───────────────────────

export async function cargarProductos(pagina = 'pasteleria') {
  productosDB = await obtenerProductos(pagina);
  return productosDB;
}

// ── Renderizar menú pastelería ─────────────

export function renderizarMenu(productos) {
  const categorias = {
    trozo:   { label: 'Por unidad / trozo', nota: null },
    entero:  { label: 'Entero',             nota: 'Ideal para eventos y regalos 🎁' },
    galleta: { label: 'Galletas',           nota: 'Surtidas o de un solo sabor 🍪' },
  };

  const contenedor = document.getElementById('menu-productos');
  if (!contenedor) return;

  contenedor.innerHTML = '';

  // Agrupar por categoría manteniendo el orden definido
  for (const [cat, config] of Object.entries(categorias)) {
    const items = productos.filter(p => p.categoria === cat);
    if (items.length === 0) continue;

    // Título de categoría
    const label = document.createElement('div');
    label.className = 'cat-label';
    label.textContent = config.label;
    contenedor.appendChild(label);

    // Nota opcional
    if (config.nota) {
      const nota = document.createElement('div');
      nota.className = 'cat-note';
      nota.textContent = config.nota;
      contenedor.appendChild(nota);
    }

    // Galletas: agrupar por nombre, mostrar bolsa/kilo juntos
    if (cat === 'galleta') {
      renderizarGalletas(items, contenedor);
    } else {
      renderizarItems(items, contenedor);
    }
  }
}

// ── Items normales (trozo / entero) ────────

function renderizarItems(items, contenedor) {
  for (const producto of items) {
    const div = document.createElement('div');
    div.className = 'item item-clickable';
    div.dataset.id = producto.id;

    const izq = document.createElement('div');
    izq.className = 'item-left';

    const nombre = document.createElement('span');
    nombre.className = 'item-name';
    nombre.textContent = producto.nombre;

    // Cantidad referencial para enteros
    const notaCantidad = {
      'Brownie':          '(10 trozos)',
      'Pie de Limón':     '(8 trozos)',
      'Muffin Zanahoria': '(12 u)',
      'Muffin Chocolate': '(12 u)',
    };
    if (producto.categoria === 'entero' && notaCantidad[producto.nombre]) {
      const qty = document.createElement('span');
      qty.className = 'item-qty';
      qty.textContent = notaCantidad[producto.nombre];
      nombre.appendChild(qty);
    }

    izq.appendChild(nombre);

    const precio = document.createElement('span');
    precio.className = 'item-price';
    precio.textContent = `$${producto.precio.toLocaleString('es-CL')}`;

    // Control + / -
    const control = crearControl(producto);
    control.style.display = 'none';

    div.appendChild(izq);
    div.appendChild(precio);
    div.appendChild(control);

    // Al tocar el item → mostrar control
    div.addEventListener('click', () => {
      precio.style.display = 'none';
      control.style.display = 'flex';
      control.querySelector('.qty-num').textContent = '1';
      control._cantidad = 1;
    });

    contenedor.appendChild(div);
  }
}

// ── Galletas: agrupar por nombre ──────────

function renderizarGalletas(items, contenedor) {
  // Agrupar: { Chocolate: { bolsa: producto, kilo: producto }, ... }
  const grupos = {};
  for (const p of items) {
    if (!grupos[p.nombre]) grupos[p.nombre] = {};
    grupos[p.nombre][p.variante] = p;
  }

  for (const [nombre, variantes] of Object.entries(grupos)) {
    const div = document.createElement('div');
    div.className = 'item item-galleta';

    const izq = document.createElement('div');
    izq.className = 'item-left';
    const span = document.createElement('span');
    span.className = 'item-name';
    span.textContent = nombre;
    izq.appendChild(span);

    // Botones bolsa / kilo
    const opciones = document.createElement('div');
    opciones.className = 'galleta-opciones';

    for (const variante of ['bolsa', 'kilo']) {
      const prod = variantes[variante];
      if (!prod) continue;

      const btn = document.createElement('button');
      btn.className = 'galleta-btn';
      btn.dataset.id      = prod.id;
      btn.dataset.nombre  = nombre;
      btn.dataset.precio  = prod.precio;
      btn.dataset.variante = variante;

      const labelSpan = document.createElement('span');
      labelSpan.className = 'galleta-btn-label';
      labelSpan.textContent = variante.charAt(0).toUpperCase() + variante.slice(1);

      const precioSpan = document.createElement('span');
      precioSpan.className = 'galleta-btn-precio';
      precioSpan.textContent = `$${prod.precio.toLocaleString('es-CL')}`;

      btn.appendChild(labelSpan);
      btn.appendChild(precioSpan);

      // Control + / - por variante
      const control = crearControl(prod);
      control.style.display = 'none';
      control.classList.add('galleta-control');

      btn.addEventListener('click', e => {
        e.stopPropagation();
        // Ocultar otros controles del mismo grupo
        opciones.querySelectorAll('.galleta-control').forEach(c => c.style.display = 'none');
        opciones.querySelectorAll('.galleta-btn').forEach(b => b.classList.remove('activo'));
        btn.classList.add('activo');
        control.style.display = 'flex';
        control.querySelector('.qty-num').textContent = '1';
        control._cantidad = 1;
      });

      const wrap = document.createElement('div');
      wrap.className = 'galleta-variante-wrap';
      wrap.appendChild(btn);
      wrap.appendChild(control);
      opciones.appendChild(wrap);
    }

    div.appendChild(izq);
    div.appendChild(opciones);
    contenedor.appendChild(div);
  }
}

// ── Control + / - ─────────────────────────

function crearControl(producto) {
  const wrap = document.createElement('div');
  wrap.className = 'qty-control';
  wrap._cantidad = 1;

  const menos = document.createElement('button');
  menos.className = 'qty-btn qty-menos';
  menos.textContent = '−';

  const num = document.createElement('span');
  num.className = 'qty-num';
  num.textContent = '1';

  const mas = document.createElement('button');
  mas.className = 'qty-btn qty-mas';
  mas.textContent = '+';

  const agrBtn = document.createElement('button');
  agrBtn.className = 'qty-agregar';
  agrBtn.textContent = 'Agregar';

  menos.addEventListener('click', e => {
    e.stopPropagation();
    if (wrap._cantidad > 1) {
      wrap._cantidad--;
      num.textContent = wrap._cantidad;
    }
  });

  mas.addEventListener('click', e => {
    e.stopPropagation();
    if (wrap._cantidad < 99) {
      wrap._cantidad++;
      num.textContent = wrap._cantidad;
    }
  });

  agrBtn.addEventListener('click', e => {
    e.stopPropagation();
    agregar({
      id:       producto.id,
      nombre:   producto.nombre,
      precio:   producto.precio,
      variante: producto.variante ?? null,
      cantidad: wrap._cantidad,
    });

    // Feedback visual
    agrBtn.textContent = '✓ Agregado';
    agrBtn.classList.add('agregado');
    setTimeout(() => {
      agrBtn.textContent = 'Agregar';
      agrBtn.classList.remove('agregado');
      wrap.style.display = 'none';
      // Restaurar precio si existe en el padre
      const precio = wrap.closest('.item')?.querySelector('.item-price');
      if (precio) precio.style.display = '';
    }, 1200);
  });

  wrap.appendChild(menos);
  wrap.appendChild(num);
  wrap.appendChild(mas);
  wrap.appendChild(agrBtn);

  return wrap;
}
