// js/nav.js
(function () {
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  const depts = ['asesores.html', 'impresores.html', 'corte-laser.html', 'disenadores.html', 'taller.html'];
  const isDeptActive = depts.includes(currentPath);
  const apps = ['app-checklist.html', 'app-calculadora.html', 'app-quiz.html', 'app-distancia.html', 'app-colormatch.html', 'app-pantone.html'];
  const isAppActive = apps.includes(currentPath);

  const navHTML = `
    <header class="site-header">
      <div class="container">
        <nav class="nav">
          <a href="index.html" class="nav__logo">
            <img class="nav__logo-img"
              src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRmSKnD00M-kkEpOeoGxEL9UP7_Zfgf8Ug33Q&s"
              alt="VisualCorp Logo">
            <span class="nav__logo-text">Visual<span>Corp</span></span>
            <span class="nav__badge">Manual Interno</span>
          </a>
          <ul class="nav__links" id="navLinks">
            <li><a href="index.html" class="nav__link ${currentPath === 'index.html' ? 'active' : ''}">Inicio</a></li>
            <li class="nav__item-dropdown">
              <span class="nav__link ${isDeptActive ? 'active' : ''}">Departamentos <i class="fa-solid fa-chevron-down" style="font-size:0.8em;margin-left:4px;"></i></span>
              <ul class="nav__dropdown">
                <li><a href="disenadores.html" class="nav__dropdown-link ${currentPath === 'disenadores.html' ? 'active' : ''}"><i class="fa-solid fa-pen-nib" style="width:20px;"></i> Diseño</a></li>
                <li><a href="marketing.html" class="nav__dropdown-link ${currentPath === 'marketing.html' ? 'active' : ''}"><i class="fa-solid fa-bullseye" style="width:20px;"></i> Marketing</a></li>
                <li><a href="corte-laser.html" class="nav__dropdown-link ${currentPath === 'corte-laser.html' ? 'active' : ''}"><i class="fa-solid fa-fire" style="width:20px;"></i> Corte Láser</a></li>
                <li><a href="impresores.html" class="nav__dropdown-link ${currentPath === 'impresores.html' ? 'active' : ''}"><i class="fa-solid fa-print" style="width:20px;"></i> Impresión</a></li>
                <li><a href="taller.html" class="nav__dropdown-link ${currentPath === 'taller.html' ? 'active' : ''}"><i class="fa-solid fa-hammer" style="width:20px;"></i> Taller / Acabados</a></li>
              </ul>
            </li>
            <li class="nav__item-dropdown">
              <span class="nav__link ${isAppActive ? 'active' : ''}" id="miniAppsLink">Mini Apps <i class="fa-solid fa-chevron-down" style="font-size:0.8em; margin-left:4px;"></i></span>
              <ul class="nav__dropdown">
                <li><a href="app-pantone.html" class="nav__dropdown-link ${currentPath === 'app-pantone.html' ? 'active' : ''}"><i class="fa-solid fa-swatchbook" style="width:20px; color:var(--color-accent);"></i> Catálogo Pantone</a></li>
                <li><a href="app-checklist.html" class="nav__dropdown-link ${currentPath === 'app-checklist.html' ? 'active' : ''}"><i class="fa-solid fa-check-double" style="width:20px;"></i> Checklist V2</a></li>
                <li><a href="app-calculadora.html" class="nav__dropdown-link ${currentPath === 'app-calculadora.html' ? 'active' : ''}"><i class="fa-solid fa-calculator" style="width:20px;"></i> Calculadora M²</a></li>
                <li><a href="app-quiz.html" class="nav__dropdown-link ${currentPath === 'app-quiz.html' ? 'active' : ''}"><i class="fa-solid fa-gamepad" style="width:20px;"></i> Quiz / Trivia</a></li>
                <li><a href="app-distancia.html" class="nav__dropdown-link ${currentPath === 'app-distancia.html' ? 'active' : ''}"><i class="fa-solid fa-ruler-combined" style="width:20px;"></i> Distancia Visual</a></li>
                <li><a href="app-colormatch.html" class="nav__dropdown-link ${currentPath === 'app-colormatch.html' ? 'active' : ''}"><i class="fa-solid fa-palette" style="width:20px;"></i> Color Match</a></li>
              </ul>
            </li>
            <li><a href="fundamentos.html" class="nav__link ${currentPath === 'fundamentos.html' ? 'active' : ''}">Fundamentos</a></li>
            <li><a href="induccion.html" class="nav__link ${currentPath === 'induccion.html' ? 'active' : ''}">Inducción</a></li>
            <li><a href="seguridad.html" class="nav__link ${currentPath === 'seguridad.html' ? 'active' : ''}">Seguridad</a></li>
            <li style="display:flex;align-items:center;">
              <button class="nav__theme-btn" title="Cambiar Tema">🌙</button>
            </li>
          </ul>
          <button class="nav__hamburger" id="burger" aria-label="Menú">
            <span></span><span></span><span></span>
          </button>
        </nav>
      </div>
    </header>
    `;

  // Inyectar de forma síncrona
  document.write(navHTML);
})();

// Función global para actualizar el estado "active" (usada por Swup)
window.updateNavActiveLink = function () {
  const links = document.querySelectorAll('.nav__link, .nav__dropdown-link');
  let currentPath = window.location.pathname.split('/').pop() || 'index.html';

  // Remove hash or query params
  currentPath = currentPath.split('#')[0].split('?')[0];

  links.forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPath) {
      link.classList.add('active');

      // If it's a dropdown item, also highlight the parent
      const dropdownParent = link.closest('.nav__item-dropdown');
      if (dropdownParent) {
        const parentLink = dropdownParent.querySelector('.nav__link');
        if (parentLink) parentLink.classList.add('active');
      }
    } else {
      link.classList.remove('active');
    }
  });
};

// Touch Support for Dropdown
document.addEventListener('DOMContentLoaded', () => {
  const dropdownItem = document.querySelector('.nav__item-dropdown'); // This targets the first dropdown
  const miniAppsDropdownItem = document.querySelector('li:has(#miniAppsLink)'); // Target the specific li for Mini Apps
  const miniAppsLinkParent = document.getElementById('miniAppsLink');

  if (miniAppsDropdownItem && miniAppsLinkParent) {
    miniAppsLinkParent.addEventListener('click', (e) => {
      // Only prevent default and toggle if it's a touch device or small screen
      if (window.innerWidth <= 900 || ('ontouchstart' in window) || navigator.maxTouchPoints > 0) {
        e.preventDefault();
        miniAppsDropdownItem.classList.toggle('touch-open');
      }
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (!miniAppsDropdownItem.contains(e.target) && !miniAppsLinkParent.contains(e.target)) {
        miniAppsDropdownItem.classList.remove('touch-open');
      }
    });
  }

  // Call it immediately after injection
  window.updateNavActiveLink();
});
