const fs = require('fs');
const path = require('path');

const dir = 'G:/CODE/VisualCorp-Manual';
const allFiles = [
    'index.html', 'asesores.html', 'impresores.html',
    'corte-laser.html', 'disenadores.html', 'taller.html',
    'fundamentos.html', 'marketing.html', 'induccion.html', 'seguridad.html'
];

const cmdPaletteHTML = `
  <!-- SPOTLIGHT SEARCH (Phase 4) -->
  <div class="cmd-palette-backdrop" id="cmdBackdrop">
    <div class="cmd-palette">
      <div class="cmd-header">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input type="text" id="cmdInput" placeholder="Buscar en el manual... (ej: corte, cmky)" autocomplete="off">
        <span class="cmd-esc">ESC</span>
      </div>
      <div class="cmd-results" id="cmdResults">
        <div class="cmd-empty">Escribe para buscar...</div>
      </div>
      <div class="cmd-footer">
        <span><kbd>↑</kbd><kbd>↓</kbd> Navegar</span>
        <span><kbd>Enter</kbd> Abrir</span>
      </div>
    </div>
  </div>
`;

allFiles.forEach(f => {
    const filePath = path.join(dir, f);
    if (!fs.existsSync(filePath)) return;

    let content = fs.readFileSync(filePath, 'utf8');

    // Inject cmd palette right before </body> if not present
    if (!content.includes('cmd-palette-backdrop')) {
        content = content.replace('</body>', cmdPaletteHTML + '\n</body>');
    }

    // Attempt to remove old search bar from index.html Hero if present
    if (f === 'index.html') {
        const srchBlockRegex = /<div class="search-wrap[^>]*>[\s\S]*?<\/div>\s*<\/div>/;
        content = content.replace(srchBlockRegex, '<div style="margin-top:2rem;color:var(--color-text-muted);font-size:0.9rem;">Presiona <kbd style="background:var(--color-surface);border:1px solid var(--color-border);padding:4px 8px;border-radius:4px;color:var(--color-heading);font-weight:bold;">Ctrl</kbd> + <kbd style="background:var(--color-surface);border:1px solid var(--color-border);padding:4px 8px;border-radius:4px;color:var(--color-heading);font-weight:bold;">K</kbd> para buscar rápidamente en todo el manual.</div>');
    }

    fs.writeFileSync(filePath, content);
});
console.log('Spotlight Search Modal injected in all pages.');
