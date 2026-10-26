'use strict';

/* ============================================================
   VisualCorp Manual Interno — JS Avanzado (Fase 3)
   ============================================================ */

// ── Hamburger menu & Dynamic Navbar (Glassmorphism) ──────────
function initNav() {
    const header = document.querySelector('.site-header');
    const burger = document.querySelector('.nav__hamburger');
    const links = document.querySelector('.nav__links');

    // Burger toggle
    if (burger && links) {
        burger.addEventListener('click', () => {
            burger.classList.toggle('open');
            links.classList.toggle('open');
        });
    }

    // Dynamic Pill Header on Scroll
    if (header) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 50) {
                header.classList.add('site-header--scrolled');
            } else {
                header.classList.remove('site-header--scrolled');
            }
        });
    }
}

// ── Active nav link ──────────────────────────────────────────
function initActiveLink() {
    if (typeof window.updateNavActiveLink === 'function') {
        window.updateNavActiveLink();
    }
}

// ── Back-to-top ──────────────────────────────────────────────
function initBackTop() {
    const btn = document.querySelector('.back-top');
    if (!btn) return;
    window.addEventListener('scroll', () => {
        btn.classList.toggle('visible', window.scrollY > 400);
    });
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

// ── TOC active highlight (manual pages) ──────────────────────
function initToc() {
    const tocLinks = document.querySelectorAll('.toc-item a');
    const sections = document.querySelectorAll('.manual-section[id]');
    if (!tocLinks.length || !sections.length) return;

    const io = new IntersectionObserver((entries) => {
        entries.forEach(e => {
            if (!e.isIntersecting) return;
            tocLinks.forEach(l => l.classList.remove('active'));
            const active = document.querySelector(`.toc-item a[href="#${e.target.id}"]`);
            if (active) active.classList.add('active');
        });
    }, { rootMargin: '-20% 0px -70% 0px' });

    sections.forEach(s => io.observe(s));
}

// ── Progress bar (reading) ───────────────────────────────────
function initProgressBar() {
    const bar = document.querySelector('#readProgress');
    if (!bar) return;
    window.addEventListener('scroll', () => {
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
        bar.style.width = pct + '%';
    });
}

// ── Theme / Dark Mode Toggle ─────────────────────────────────
function initTheme() {
    const savedTheme = localStorage.getItem('vc-theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
    }

    function updateIcon(btn) {
        btn.textContent = document.body.classList.contains('light-mode') ? '🌙' : '☀️';
        btn.title = document.body.classList.contains('light-mode') ? 'Cambiar a Modo Oscuro' : 'Cambiar a Modo Claro';
    }

    const btns = document.querySelectorAll('.nav__theme-btn');
    btns.forEach(btn => {
        updateIcon(btn);
        btn.addEventListener('click', () => {
            document.body.classList.toggle('light-mode');
            const isLight = document.body.classList.contains('light-mode');
            localStorage.setItem('vc-theme', isLight ? 'light' : 'dark');
            btns.forEach(b => updateIcon(b));

            // Re-init particles if they exist to match theme
            if (window.tsParticles && document.getElementById('tsparticles')) {
                initParticles();
            }
        });
    });
}

// ── Global Search ────────────────────────────────────────────
const searchIndex = [
    { title: "Asesores - Matemáticas", desc: "Reglas de 3, promedios, áreas y márgenes.", url: "asesores.html#matematicas" },
    { title: "Asesores - Cotizaciones", desc: "Cómo usar el sistema Excel de ventas.", url: "asesores.html#cotizaciones" },
    { title: "Impresores - FlexiPRINT", desc: "Configuración, perfiles ICC y ripeo.", url: "impresores.html#flexiprint" },
    { title: "Impresores - Mantenimiento", desc: "Limpieza de cabezales y capping.", url: "impresores.html#mantenimiento" },
    { title: "Corte Láser - RDWorks", desc: "Software, sistema de colores de capas.", url: "corte-laser.html#software" },
    { title: "Corte Láser - Calibración", desc: "Foco a 7mm exactos y limpieza óptica.", url: "corte-laser.html#calibracion" },
    { title: "Diseñadores - Archivos", desc: "Nomenclatura y guardado seguro.", url: "disenadores.html#archivos" },
    { title: "Taller - Instalaciones", desc: "Cultura de trabajo en el sitio del cliente.", url: "taller.html#cultura" },
    { title: "Fundamentos - Color", desc: "Psicología del color, RGB vs CMYK.", url: "fundamentos.html#color" },
    { title: "Fundamentos - Sangría", desc: "Márgenes, bleeding y zona segura.", url: "fundamentos.html#sangria-detalle" },
    { title: "Marketing - Redes Sociales", desc: "Claves para Instagram, TikTok y Facebook.", url: "marketing.html#redes" },
    { title: "Marketing - Fotografía", desc: "Tips de iluminación, ángulos y contexto.", url: "marketing.html#fotografia" },
    { title: "Inducción - Primer Día", desc: "Bienvenida, cultura y pausas activas.", url: "induccion.html#cultura" },
    { title: "Seguridad - EPP", desc: "Uso de gafas y guantes de seguridad.", url: "seguridad.html#epp" }
];

function initSearch() {
    const backdrop = document.getElementById('cmdBackdrop');
    const input = document.getElementById('cmdInput');
    const resultsBox = document.getElementById('cmdResults');
    const escBtn = document.querySelector('.cmd-esc');
    if (!backdrop || !input || !resultsBox) return;

    let selectedIndex = -1;
    let currentHits = [];

    // Open/Close logic
    function toggleCmd() {
        const isActive = backdrop.classList.toggle('active');
        if (isActive) {
            input.focus();
            input.value = '';
            resultsBox.innerHTML = '<div class="cmd-empty">Escribe para buscar...</div>';
            selectedIndex = -1;
        } else {
            input.blur();
        }
    }

    // Ctrl+K Listener globally
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            toggleCmd();
        }
        if (e.key === 'Escape' && backdrop.classList.contains('active')) {
            toggleCmd();
        }
    });

    // Close on backdrop click or ESC button
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) toggleCmd();
    });
    if (escBtn) escBtn.addEventListener('click', toggleCmd);

    // Render results
    function renderResults(hits) {
        resultsBox.innerHTML = '';
        currentHits = hits;
        selectedIndex = -1;

        if (hits.length === 0) {
            resultsBox.innerHTML = `<div class="cmd-empty">No se encontró nada para "\${input.value}"</div>`;
            return;
        }

        hits.forEach((item, idx) => {
            const a = document.createElement('a');
            a.href = item.url;
            a.className = 'cmd-result-item';
            a.innerHTML = `<div class="cmd-result-title">\${item.title}</div><div class="cmd-result-desc">\${item.desc}</div>`;

            a.addEventListener('click', () => {
                backdrop.classList.remove('active');
            });
            resultsBox.appendChild(a);
        });
    }

    // Input changes (Search query)
    input.addEventListener('input', () => {
        const q = input.value.trim().toLowerCase();
        if (!q) {
            resultsBox.innerHTML = '<div class="cmd-empty">Escribe para buscar...</div>';
            currentHits = [];
            return;
        }

        const hits = searchIndex.filter(item =>
            item.title.toLowerCase().includes(q) || item.desc.toLowerCase().includes(q)
        );
        renderResults(hits);
    });

    // Keyboard navigation (Up/Down/Enter)
    input.addEventListener('keydown', (e) => {
        const items = resultsBox.querySelectorAll('.cmd-result-item');
        if (items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = (selectedIndex + 1) % items.length;
            updateSelection(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = (selectedIndex - 1 + items.length) % items.length;
            updateSelection(items);
        } else if (e.key === 'Enter' && selectedIndex >= 0) {
            e.preventDefault();
            items[selectedIndex].click();
        }
    });

    function updateSelection(items) {
        items.forEach(item => item.classList.remove('selected'));
        if (selectedIndex >= 0) {
            const selected = items[selectedIndex];
            selected.classList.add('selected');
            selected.scrollIntoView({ block: 'nearest' });
        }
    }
}

// ── Interactive Quizzes ──────────────────────────────────────
function initQuizzes() {
    const quizzes = document.querySelectorAll('.quiz-container');
    if (!quizzes.length) return;

    quizzes.forEach((quiz) => {
        const options = quiz.querySelectorAll('.quiz-option');
        if (!options.length) return;

        let answered = false;

        options.forEach(opt => {
            opt.addEventListener('click', () => {
                if (answered) return;
                answered = true;

                options.forEach(o => o.classList.add('locked'));
                const isCorrect = opt.dataset.correct === 'true';

                if (isCorrect) {
                    opt.classList.add('correct');
                    const res = document.createElement('div');
                    res.className = 'quiz-result';
                    res.innerHTML = '<h3 style="color:var(--color-success);font-size:1.5rem;margin-bottom:0.5rem;">¡Correcto! 🎉</h3><p style="color:var(--color-text-muted);">Has demostrado que entiendes esta parte fundamental.</p>';
                    quiz.appendChild(res);

                    if (typeof confetti === 'function') {
                        confetti({
                            particleCount: 150,
                            spread: 80,
                            origin: { y: 0.6 },
                            colors: ['#f2b705', '#06b6d4', '#ec4899', '#22c55e']
                        });
                    }
                } else {
                    opt.classList.add('incorrect');
                    options.forEach(o => {
                        if (o.dataset.correct === 'true') o.classList.add('correct');
                    });
                    const res = document.createElement('div');
                    res.className = 'quiz-result';
                    res.innerHTML = '<h3 style="color:var(--color-danger);font-size:1.5rem;margin-bottom:0.5rem;">Incorrecto 👀</h3><p style="color:var(--color-text-muted);">Repasa la sección correspondiente y vuelve a intentarlo.</p>';
                    quiz.appendChild(res);
                }
            });
        });
    });
}

// ── tsParticles (Hero Interactive Background) ────────────────
function initParticles() {
    const container = document.getElementById('tsparticles');
    if (!container || !window.tsParticles) return;

    const isLight = document.body.classList.contains('light-mode');
    const particleColor = isLight ? "#f2b705" : "#06b6d4";
    const lineColor = isLight ? "#0f172a" : "#f2b705";

    tsParticles.load("tsparticles", {
        fpsLimit: 60,
        interactivity: {
            events: {
                onHover: { enable: true, mode: "grab" },
                resize: true,
            },
            modes: {
                grab: { distance: 140, links: { opacity: 0.5 } }
            },
        },
        particles: {
            color: { value: particleColor },
            links: {
                color: lineColor,
                distance: 150,
                enable: true,
                opacity: 0.2,
                width: 1,
            },
            move: {
                direction: "none",
                enable: true,
                outModes: { default: "bounce" },
                random: false,
                speed: 1,
                straight: false,
            },
            number: { density: { enable: true, area: 800 }, value: 60 },
            opacity: { value: 0.4 },
            shape: { type: "circle" },
            size: { value: { min: 1, max: 3 } },
        },
        detectRetina: true,
    });
}

// ── GSAP Advanced Animations ─────────────────────────────────
function initGSAP() {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
        // Fallback to basic reveal if GSAP fails to load
        initBasicRevealFallback();
        return;
    }

    gsap.registerPlugin(ScrollTrigger);

    // Hero Animations
    const heroTl = gsap.timeline();
    heroTl.from(".hero__eyebrow", { y: 20, opacity: 0, duration: 0.8, ease: "back.out(1.7)" })
        .from(".hero__title", { y: 30, opacity: 0, duration: 0.8, ease: "power3.out" }, "-=0.6")
        .from(".hero__sub", { y: 20, opacity: 0, duration: 0.8, ease: "power3.out" }, "-=0.6")
        .from(".hero .search-wrap", { scale: 0.9, opacity: 0, duration: 0.6, ease: "back.out(1.5)" }, "-=0.4")
        .from(".hero .btn", { scale: 0.9, opacity: 0, duration: 0.5, stagger: 0.1, ease: "back.out(2)" }, "-=0.4");

    // Dept Cards Stagger (Index)
    if (document.querySelector('.dept-grid')) {
        gsap.from(".dept-card", {
            scrollTrigger: {
                trigger: ".dept-grid",
                start: "top 80%"
            },
            y: 50,
            opacity: 0,
            duration: 0.8,
            stagger: 0.15,
            ease: "back.out(1.2)"
        });
    }

    // Manual Sections Re-reveal
    const sections = document.querySelectorAll('.manual-section');
    sections.forEach(sec => {
        gsap.fromTo(sec,
            { y: 40, opacity: 0 },
            {
                scrollTrigger: {
                    trigger: sec,
                    start: "top 85%",
                    toggleActions: "play none none reverse"
                },
                y: 0,
                opacity: 1,
                duration: 0.8,
                ease: "power2.out"
            }
        );
    });

    // Remove old base reveal classes to prevent conflicts
    document.querySelectorAll('.reveal').forEach(el => {
        el.style.opacity = 1;
        el.style.transform = 'none';
        el.classList.remove('reveal', 'reveal--fade', 'reveal--slide-up');
    });
}

function initBasicRevealFallback() {
    const els = document.querySelectorAll('.reveal');
    if (!els.length) return;
    const io = new IntersectionObserver((entries) => {
        entries.forEach(e => {
            if (!e.isIntersecting) return;
            const delay = parseInt(e.target.dataset.delay || 0);
            setTimeout(() => e.target.classList.add('is-visible'), delay);
            io.unobserve(e.target);
        });
    }, { threshold: 0.12 });
    els.forEach(el => io.observe(el));
}

// ── Vanilla Tilt (3D Cards) ──────────────────────────────────
function initTilt() {
    if (typeof VanillaTilt !== 'undefined') {
        VanillaTilt.init(document.querySelectorAll(".dept-card, .skill-card, .step-card"), {
            max: 5,
            speed: 400,
            glare: true,
            "max-glare": 0.15,
        });
    }
}

// ── Copy to Clipboard Sub-routine ────────────────────────────
function initCopyButtons() {
    // Add copy button to any element with class .copyable
    const copyables = document.querySelectorAll('.copyable');
    copyables.forEach(el => {
        el.style.position = 'relative';
        el.style.paddingRight = '40px';

        const btn = document.createElement('button');
        btn.className = 'copy-btn';
        btn.innerHTML = '<i class="fa-regular fa-copy"></i> Copiar';
        btn.title = "Copiar al portapapeles";

        btn.addEventListener('click', () => {
            // Get text, ignoring the button's own text
            const clone = el.cloneNode(true);
            const childBtn = clone.querySelector('.copy-btn');
            if (childBtn) clone.removeChild(childBtn);

            navigator.clipboard.writeText(clone.innerText.trim()).then(() => {
                btn.classList.add('copied');
                btn.innerHTML = '<i class="fa-solid fa-check"></i> Listo';
                setTimeout(() => {
                    btn.classList.remove('copied');
                    btn.innerHTML = '<i class="fa-regular fa-copy"></i> Copiar';
                }, 2000);
            });
        });

        el.appendChild(btn);
    });
}

// ── Custom Magnetic Cursor (Phase 4) ─────────────────────────
function initCursor() {
    if (!window.matchMedia('(pointer: fine)').matches) return;

    let dot = document.querySelector('.cursor-dot');
    let ring = document.querySelector('.cursor-ring');

    if (!dot) {
        dot = document.createElement('div');
        dot.className = 'cursor-dot';
        document.body.appendChild(dot);

        ring = document.createElement('div');
        ring.className = 'cursor-ring';
        document.body.appendChild(ring);
    }

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let ringX = mouseX;
    let ringY = mouseY;

    // Usamos left/top para posicionar — así CSS puede manejar `transform`
    // libremente (scale en hover no es sobreescrito por JS)
    window.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        dot.style.left = mouseX + 'px';
        dot.style.top = mouseY + 'px';
    });

    function renderRing() {
        ringX += (mouseX - ringX) * 0.15;
        ringY += (mouseY - ringY) * 0.15;
        ring.style.left = ringX + 'px';
        ring.style.top = ringY + 'px';
        requestAnimationFrame(renderRing);
    }
    requestAnimationFrame(renderRing);

    window.bindCursorHover = function () {
        const interactables = document.querySelectorAll('a, button, input, .dept-card, .skill-card, .cmd-result-item');
        interactables.forEach(el => {
            el.addEventListener('mouseenter', () => ring.classList.add('hover'), { passive: true });
            el.addEventListener('mouseleave', () => ring.classList.remove('hover'), { passive: true });
        });
    };
    window.bindCursorHover();
}

// ── UI Sounds (Web Audio API - Phase 4) ──────────────────────
let audioCtx;

function initAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playTick() {
    initAudioContext();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.05);
    gainNode.gain.setValueAtTime(0.015, audioCtx.currentTime); // very subtle volume
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.05);
}

function playPop() {
    initAudioContext();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(0.04, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
}

// ── Modo Lectura ──────────────────────────────────────────────
function initReadingMode() {
    let btn = document.getElementById('readingModeBtn');
    if (!btn) {
        btn = document.createElement('button');
        btn.id = 'readingModeBtn';
        btn.className = 'reading-toggle-btn';
        btn.innerHTML = '<i class="fa-solid fa-book-open"></i> <span>Modo Lectura</span>';
        document.body.appendChild(btn);

        btn.addEventListener('click', () => {
            const isReading = document.body.classList.toggle('reading-mode');
            btn.classList.toggle('active', isReading);
            localStorage.setItem('visualcorp-reading-mode', isReading ? 'true' : 'false');

            if (isReading) {
                btn.innerHTML = '<i class="fa-solid fa-xmark"></i> <span>Salir</span>';
                document.body.style.fontSize = '1.1rem';
            } else {
                btn.innerHTML = '<i class="fa-solid fa-book-open"></i> <span>Modo Lectura</span>';
                document.body.style.fontSize = '';
            }
            if (window.playPop) window.playPop(); // Opcional sonido
        });

        // Cargar preferencia guardada
        if (localStorage.getItem('visualcorp-reading-mode') === 'true') {
            document.body.classList.add('reading-mode');
            btn.classList.add('active');
            btn.innerHTML = '<i class="fa-solid fa-xmark"></i> <span>Salir</span>';
            document.body.style.fontSize = '1.1rem';
        }
    }
}

window.bindUISounds = function () {
    const interactables = document.querySelectorAll('a, button, .dept-card, .skill-card, .cmd-result-item');
    interactables.forEach(el => {
        el.addEventListener('mouseenter', playTick, { passive: true });
        el.addEventListener('click', playPop, { passive: true });
    });

    // Unlock Audio Context on first click anywhere
    document.body.addEventListener('click', initAudioContext, { once: true });
};

// ── Init all ─────────────────────────────────────────────────
function initGlobalFeatures() {
    initTheme();
    initNav();
    initSearch(); // Command Palette
    initCursor(); // Setup dot, ring, and global mouse move listener
    initReadingMode();
    if (window.bindUISounds) window.bindUISounds();
}

function initPageContent() {
    initActiveLink();
    initBackTop();
    initToc();
    initProgressBar();
    if (typeof initQuizzes !== 'undefined') initQuizzes(); // Legacy quizzes
    // Reinicializar miniapps (Si usan apps.js global)
    if (typeof window.VisualApps !== 'undefined') {
        if (document.getElementById('baseInput')) window.VisualApps.initCalculadora();
        if (document.getElementById('distanceSlider')) window.VisualApps.initDistancia();
        if (document.getElementById('quizContainer')) window.VisualApps.initQuiz();
        if (document.getElementById('checkListContainer')) window.VisualApps.initChecklist();
        if (document.getElementById('colorMatchArea')) window.VisualApps.initColorMatch();
        if (document.getElementById('pantoneGrid')) window.VisualApps.initPantone();
    }

    // Phase 3 & 4 Features
    if (typeof initParticles !== 'undefined') initParticles();
    if (typeof initGSAP !== 'undefined') initGSAP();
    if (typeof initTilt !== 'undefined') initTilt();
    if (typeof initCopyButtons !== 'undefined') initCopyButtons();
    if (window.bindCursorHover) window.bindCursorHover(); // Re-bind hover states to new DOM
    if (window.bindUISounds) window.bindUISounds(); // Re-bind sound triggers to new DOM
}

document.addEventListener('DOMContentLoaded', () => {
    initGlobalFeatures();
    initPageContent();

    // Swup Page Transitions — solo si se sirve desde un servidor HTTP
    // En file:// no funciona porque fetch() está bloqueado por CORS
    const isFileProtocol = window.location.protocol === 'file:';
    if (!isFileProtocol && typeof window.Swup !== 'undefined') {
        const swup = new window.Swup();

        swup.hooks.on('page:view', () => {
            window.scrollTo(0, 0);
            initPageContent();
        });
    }
});
