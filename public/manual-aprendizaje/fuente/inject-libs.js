const fs = require('fs');
const path = require('path');

const dir = 'G:/CODE/VisualCorp-Manual';
const allFiles = [
    'index.html', 'asesores.html', 'impresores.html',
    'corte-laser.html', 'disenadores.html', 'taller.html',
    'fundamentos.html', 'marketing.html', 'induccion.html', 'seguridad.html'
];

const librariesHTML = `
    <!-- Phase 3 Advanced Visuals CDNs -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/vanilla-tilt/1.8.1/vanilla-tilt.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/@tsparticles/engine@3.3.0/tsparticles.engine.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/@tsparticles/slim@3.3.0/tsparticles.slim.min.js"></script>
`;

allFiles.forEach(f => {
    const filePath = path.join(dir, f);
    if (!fs.existsSync(filePath)) return;

    let content = fs.readFileSync(filePath, 'utf8');

    // Inject libraries right before manual.js if they don't exist
    if (!content.includes('gsap.min.js')) {
        content = content.replace('<script src="js/manual.js"></script>', librariesHTML + '\n    <script src="js/manual.js"></script>');
    }

    // Inject tsparticles container only in index.html hero section
    if (f === 'index.html' && !content.includes('id="tsparticles"')) {
        content = content.replace('<section class="hero">', '<section class="hero" id="hero-section">\n    <div id="tsparticles" style="position:absolute;inset:0;z-index:1;pointer-events:none;"></div>');
    }

    fs.writeFileSync(filePath, content);
});
console.log('Libraries injected in all pages.');
