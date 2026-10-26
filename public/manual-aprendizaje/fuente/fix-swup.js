const fs = require('fs');
const path = require('path');

const dir = 'G:/CODE/VisualCorp-Manual';
const pages = [
    'asesores.html', 'impresores.html', 'corte-laser.html',
    'disenadores.html', 'taller.html', 'fundamentos.html',
    'marketing.html', 'induccion.html', 'seguridad.html'
];

pages.forEach(f => {
    const filePath = path.join(dir, f);
    if (!fs.existsSync(filePath)) return;

    let content = fs.readFileSync(filePath, 'utf8');

    // 1. Quitar <main id="swup" ...> y poner <div class="manual-content">
    content = content.replace(/<main id="swup"[^>]*class="transition-fade manual-content"[^>]*>/g, '<div class="manual-content">');

    // 2. Cambiar </main> por </div> antes del footer
    const footerIndex = content.indexOf('<footer class="site-footer">');
    if (footerIndex !== -1) {
        const substr = content.substring(0, footerIndex);
        const lastMainIdx = substr.lastIndexOf('</main>');
        if (lastMainIdx !== -1) {
            content = content.substring(0, lastMainIdx) + '</div>' + content.substring(lastMainIdx + 7);
        }
    }

    // 3. Agregar el nuevo main id="swup"
    const navScript = '<script src="js/nav.js"></script>';
    if (content.includes(navScript) && !content.includes('<main id="swup"')) {
        content = content.replace(navScript, navScript + '\n\n  <main id="swup" class="transition-fade">');
        content = content.replace('<footer class="site-footer">', '  </main>\n\n    <footer class="site-footer">');
    }

    fs.writeFileSync(filePath, content);
    console.log('Fixed swup layout in ' + f);
});
