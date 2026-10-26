const fs = require('fs');
const path = require('path');

const dir = 'G:/CODE/VisualCorp-Manual';
const allFiles = [
    'index.html', 'asesores.html', 'impresores.html',
    'corte-laser.html', 'disenadores.html', 'taller.html',
    'fundamentos.html', 'marketing.html'
];

const quizFiles = {
    'asesores.html': {
        q: 'En nuestro archivo de ventas en Excel, ¿qué celda NO debes tocar jamás bajo ninguna circunstancia?',
        opts: [
            { text: 'La celda del Nombre del Cliente', correct: false },
            { text: 'Las celdas grises con fórmulas automáticas', correct: true },
            { text: 'La celda de Fecha de Entrega', correct: false },
        ]
    },
    'impresores.html': {
        q: 'Si notas que los inyectores empiezan a fallar durante una impresión larga (banding), ¿qué debes hacer inmediantamente?',
        opts: [
            { text: 'Pausar y hacer un Test Print / Limpieza Normal', correct: true },
            { text: 'Dejar que termine y rogar que no se note', correct: false },
            { text: 'Subir la temperatura de los calentadores', correct: false },
        ]
    },
    'corte-laser.html': {
        q: '¿Cuál es la distancia focal exacta a la que debe calibrarse la boquilla del láser respecto al material?',
        opts: [
            { text: '3 milímetros', correct: false },
            { text: '7 milímetros (usando la pieza guía acrílica)', correct: true },
            { text: '12 milímetros', correct: false },
        ]
    },
    'disenadores.html': {
        q: 'En el sistema de colores de la máquina láser, ¿el color ROJO del contorno de una pieza significa...?',
        opts: [
            { text: 'Grabado Superficial (Engrave)', correct: false },
            { text: 'Corte Pasante (Cut)', correct: true },
            { text: 'Ignorar capa (Output No)', correct: false },
        ]
    },
    'taller.html': {
        q: 'Al instalar letreros con espaciadores metálicos a la pared, ¿qué herramienta es indispensable para trazar la plantilla de huecos exactos?',
        opts: [
            { text: 'Un nivel de burbuja', correct: true },
            { text: 'Una pistola de calor', correct: false },
            { text: 'Cinta doble faz', correct: false },
        ]
    }
};

const themeLi = `
                    <li><a href="induccion.html" class="nav__link">Inducción</a></li>
                    <li><a href="seguridad.html" class="nav__link">Seguridad</a></li>
                    <li style="display:flex;align-items:center;">
                        <button class="nav__theme-btn" title="Cambiar Tema">🌙</button>
                    </li>`;

const confettiScript = `
    <!-- Confetti JS -->
    <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js"></script>
`;

allFiles.forEach(f => {
    const filePath = path.join(dir, f);
    let content = fs.readFileSync(filePath, 'utf8');

    // Add Induccion, Seguridad, and Theme Button to Nav if not present
    if (!content.includes('nav__theme-btn')) {
        content = content.replace('<li><a href="marketing.html" class="nav__link">Marketing</a></li>',
            '<li><a href="marketing.html" class="nav__link">Marketing</a></li>' + themeLi);
    }

    // Add Quiz to Dept pages
    if (quizFiles[f] && !content.includes('quiz-container')) {
        const quiz = quizFiles[f];

        const quizHTML = `
                <!-- QUIZ DE PASE -->
                <section class="manual-section reveal reveal--slide-up" style="margin-top:var(--sp-8);">
                    <div class="quiz-container">
                        <div class="quiz-header">
                            <span class="quiz-icon">🧠</span>
                            <div class="quiz-title">Pase de Pruebas</div>
                        </div>
                        <div class="quiz-question">${quiz.q}</div>
                        <div class="quiz-options">
                            ${quiz.opts.map(o => `<div class="quiz-option" data-correct="${o.correct}">${o.text}</div>`).join('')}
                        </div>
                        <div class="quiz-nav">
                            <span class="quiz-progress">Pregunta interactiva - ¡Pon a prueba lo que leíste!</span>
                        </div>
                    </div>
                </section>
        `;

        // Insert quiz right before </main>
        content = content.replace('</main>', quizHTML + '\n            </main>');

        // Add Confetti JS right before <script src="js/manual.js">
        content = content.replace('<script src="js/manual.js"></script>', confettiScript + '    <script src="js/manual.js"></script>');
    }

    fs.writeFileSync(filePath, content);
});
console.log('Done modifying HTML files!');
