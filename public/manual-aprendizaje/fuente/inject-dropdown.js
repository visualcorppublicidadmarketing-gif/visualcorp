const fs = require('fs');
const path = require('path');

const dir = 'G:/CODE/VisualCorp-Manual';
const allFiles = [
    'index.html', 'asesores.html', 'impresores.html',
    'corte-laser.html', 'disenadores.html', 'taller.html',
    'fundamentos.html', 'marketing.html', 'induccion.html', 'seguridad.html'
];

const oldNavLinks = `
          <li><a href="asesores.html" class="nav__link">Asesores</a></li>
          <li><a href="impresores.html" class="nav__link">Impresores</a></li>
          <li><a href="corte-laser.html" class="nav__link">Corte Láser</a></li>
          <li><a href="disenadores.html" class="nav__link">Diseñadores</a></li>
          <li><a href="taller.html" class="nav__link">Taller</a></li>
`;

const newDropdownLink = `
          <li class="nav__item-dropdown">
            <span class="nav__link">Departamentos <i class="fa-solid fa-chevron-down" style="font-size:0.8em;margin-left:4px;"></i></span>
            <ul class="nav__dropdown">
              <li><a href="asesores.html" class="nav__dropdown-link">🟡 Asesores</a></li>
              <li><a href="impresores.html" class="nav__dropdown-link">🖨️ Impresores</a></li>
              <li><a href="corte-laser.html" class="nav__dropdown-link">⚡ Corte Láser</a></li>
              <li><a href="disenadores.html" class="nav__dropdown-link">🎨 Diseñadores</a></li>
              <li><a href="taller.html" class="nav__dropdown-link">🔧 Taller</a></li>
            </ul>
          </li>
`;

allFiles.forEach(f => {
    const filePath = path.join(dir, f);
    if (!fs.existsSync(filePath)) return;

    let content = fs.readFileSync(filePath, 'utf8');

    // Check if the old structure exists by looking for a subset of it (spaces might vary)
    if (content.includes('<li><a href="asesores.html" class="nav__link">Asesores</a></li>')) {
        // Regex to match the block of 5 li items
        const regex = /<li><a href="asesores\.html" class="nav__link">Asesores<\/a><\/li>[\s\S]*?<li><a href="taller\.html" class="nav__link">Taller<\/a><\/li>/;
        content = content.replace(regex, newDropdownLink.trim());
        fs.writeFileSync(filePath, content);
    }
});
console.log('Dropdown injected in all pages.');
