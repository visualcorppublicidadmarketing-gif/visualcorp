const fs = require('fs');
const path = require('path');

const dir = 'G:/CODE/VisualCorp-Manual';
const allFiles = [
    'index.html', 'asesores.html', 'impresores.html',
    'corte-laser.html', 'disenadores.html', 'taller.html',
    'fundamentos.html', 'marketing.html', 'induccion.html', 'seguridad.html'
];

allFiles.forEach(f => {
    const filePath = path.join(dir, f);
    if (!fs.existsSync(filePath)) return;

    let content = fs.readFileSync(filePath, 'utf8');

    // Remover header viejo y poner script js/nav.js
    // Tambien puede haber htmls que aun no tienen js/nav.js

    // Regex que atrapa desde <header class="site-header"> hasta </header>
    const headerRegex = /<header class="site-header">[\s\S]*?<\/header>/g;

    if (headerRegex.test(content)) {
        content = content.replace(headerRegex, '<script src="js/nav.js"></script>');
    }

    // Asegurarse de quitar scripts duplicados si se corre varias veces
    content = content.replace(/(<script src="js\/nav\.js"><\/script>\s*)+/g, '<script src="js/nav.js"></script>\n');

    fs.writeFileSync(filePath, content);
    console.log('Replaced header in ' + f);
});
