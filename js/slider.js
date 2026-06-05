// ─────────────────────────────────────────
// slider.js — slider reutilizable
// Se inicializa pasándole los IDs del track y los dots
// ─────────────────────────────────────────

export function iniciarSlider({ trackId = 'track', dotsId = 'dots', intervalo = 4000 } = {}) {
  const track = document.getElementById(trackId);
  const dotsWrap = document.getElementById(dotsId);

  if (!track || !dotsWrap) return;

  const dots = dotsWrap.querySelectorAll('.dot');
  const total = track.children.length;
  let actual = 0;
  let timer = null;

  function irA(n) {
    actual = (n + total) % total;
    track.style.transform = `translateX(-${actual * 100}%)`;
    dots.forEach((d, i) => d.classList.toggle('active', i === actual));
  }

  function mover(dir) {
    clearInterval(timer);
    irA(actual + dir);
    timer = setInterval(() => mover(1), intervalo);
  }

  // Asignar clicks a los dots
  dots.forEach((dot, i) => {
    dot.onclick = () => {
      clearInterval(timer);
      irA(i);
      timer = setInterval(() => mover(1), intervalo);
    };
  });

  // Swipe táctil
  let startX = 0;
  track.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
  }, { passive: true });

  track.addEventListener('touchend', e => {
    const diff = startX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) mover(diff > 0 ? 1 : -1);
  }, { passive: true });

  // Arrancar
  timer = setInterval(() => mover(1), intervalo);

  // API pública por si se necesita controlar desde afuera
  return { irA, mover };
}
