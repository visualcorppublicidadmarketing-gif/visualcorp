const fs = require('fs');
const path = require('path');

const dir = 'G:/CODE/VisualCorp-Manual';
const pages = [
    'asesores.html', 'impresores.html', 'corte-laser.html',
    'disenadores.html', 'taller.html', 'fundamentos.html',
    'marketing.html', 'induccion.html', 'seguridad.html'
];
const indx = 'index.html';

const swupScript = '<script src="https://unpkg.com/swup@4"></script>\n';

// 1. For internal pages
pages.forEach(f => {
    const filePath = path.join(dir, f);
    if (!fs.existsSync(filePath)) return;

    let content = fs.readFileSync(filePath, 'utf8');

    // Inject script
    if (!content.includes('unpkg.com/swup')) {
        content = content.replace('</body>', swupScript + '</body>');
    }

    // Wrap main
    if (!content.includes('id="swup"')) {
        content = content.replace('<main class="manual-content">', '<main id="swup" class="transition-fade manual-content">');
    }

    fs.writeFileSync(filePath, content);
});

// 2. For index.html
const idxPath = path.join(dir, indx);
if (fs.existsSync(idxPath)) {
    let html = fs.readFileSync(idxPath, 'utf8');

    // Inject script
    if (!html.includes('unpkg.com/swup')) {
        html = html.replace('</body>', swupScript + '</body>');
    }

    // Wrap main if not wrapped
    if (!html.includes('id="swup"')) {
        // Insert opening <main> after </header>
        html = html.replace('</header>', '</header>\n  <main id="swup" class="transition-fade">');
        // Insert closing </main> before <footer class="site-footer">
        html = html.replace('<footer class="site-footer">', '</main>\n  <footer class="site-footer">');
    }

    fs.writeFileSync(idxPath, html);
}

console.log('Swup script and container injected correctly into all pages.');
