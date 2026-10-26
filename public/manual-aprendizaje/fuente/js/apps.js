/* ============================================================
   VisualCorp — Mini Aplicaciones Controller (Fase 5)
   Centralizamos la lógica de las MiniApps para poder inicializarlas
   correctamente después de cada transición de página (Swup).
   ============================================================ */

const VisualApps = {

    // --- APP CALCULADORA ---
    initCalculadora: function () {
        const baseInput = document.getElementById('baseInput');
        const heightInput = document.getElementById('heightInput');
        const qtyInput = document.getElementById('qtyInput');
        const materialSelect = document.getElementById('materialSelect');
        const resultArea = document.getElementById('resultArea');
        const priceContainer = document.getElementById('priceContainer');
        const resultPrice = document.getElementById('resultPrice');

        if (!baseInput || !heightInput) return; // No estamos en esa app

        const calc = () => {
            const base = parseFloat(baseInput.value) || 0;
            const height = parseFloat(heightInput.value) || 0;
            const qty = parseInt(qtyInput.value) || 1;
            const pricePerSqm = parseFloat(materialSelect.value) || 0;

            const areaSqm = base * height;
            const totalArea = areaSqm * qty;

            resultArea.innerText = totalArea.toFixed(2) + ' m²';

            if (pricePerSqm > 0 && totalArea > 0) {
                const totalPrice = totalArea * pricePerSqm;
                resultPrice.innerText = '$' + totalPrice.toFixed(2);
                priceContainer.style.display = 'block';
            } else {
                priceContainer.style.display = 'none';
            }
        };

        // Bind events
        baseInput.addEventListener('input', calc);
        heightInput.addEventListener('input', calc);
        qtyInput.addEventListener('input', calc);
        materialSelect.addEventListener('change', calc);

        calc(); // Trigger inicial
    },

    // --- APP DISTANCIA VISUAL ---
    initDistancia: function () {
        const heightInput = document.getElementById('heightInput');
        const slider = document.getElementById('distanceSlider');
        if (!heightInput || !slider) return; // No estamos en esa app

        const optVal = document.getElementById('optVal');
        const maxVal = document.getElementById('maxVal');
        const txt = document.getElementById('previewText');
        const sliderMeters = document.getElementById('sliderMeters');

        const updateData = () => {
            let cm = parseFloat(heightInput.value) || 0;
            const optMeters = cm * 3;
            const maxMeters = cm * 4.5;

            optVal.innerHTML = `${Math.round(optMeters)}<span style="font-size:1rem;">m</span>`;
            maxVal.innerHTML = `${Math.round(maxMeters)}<span style="font-size:1rem;">m</span>`;

            slider.max = Math.max(10, maxMeters * 1.5);
            updateVisual();
        };

        const updateVisual = () => {
            const meter = parseFloat(slider.value) || 1;
            const cm = parseFloat(heightInput.value) || 10;
            sliderMeters.innerText = `${Math.round(meter)}m`;

            const maxMeters = cm * 4.5;
            let scale = (1 / meter) * cm;

            if (meter > maxMeters) {
                txt.style.filter = `blur(${(meter - maxMeters) / 10}px)`;
                txt.style.opacity = Math.max(0.1, 1 - ((meter - maxMeters) / 50));
                txt.innerHTML = "BORROSO";
            } else {
                txt.style.filter = 'none';
                txt.style.opacity = 1;
                txt.innerHTML = "IMPACTO";
            }
            const finalScale = Math.min(Math.max(scale, 0.1), 15);
            txt.style.transform = `scale(${finalScale})`;
        };

        heightInput.addEventListener('input', updateData);
        slider.addEventListener('input', updateVisual);

        updateData();
    },

    // --- APP QUIZ (MODO DIOS) ---
    initQuiz: function () {
        const quizContainer = document.getElementById('quizContainer');
        if (!quizContainer) return; // Not on URL

        let db = [];
        let currentQuestions = [];
        let currentIndex = 0;
        let score = 0;
        let answered = false;

        const loader = document.getElementById('loader');
        const endScreen = document.getElementById('endScreen');
        const qCurrentEl = document.getElementById('qCurrent');
        const qTotalEl = document.getElementById('qTotal');
        const scoreDisplayEl = document.getElementById('scoreDisplay');
        const progressBarEl = document.getElementById('progressBar');
        const qCategoryEl = document.getElementById('qCategory');
        const qTextEl = document.getElementById('qText');
        const optionsGridEl = document.getElementById('optionsGrid');
        const feedbackBox = document.getElementById('feedbackBox');
        const fbTitle = document.getElementById('fbTitle');
        const fbText = document.getElementById('fbText');
        const nextBtn = document.getElementById('nextBtn');

        function shuffleArray(array) {
            for (let i = array.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [array[i], array[j]] = [array[j], array[i]];
            }
            return array;
        }

        const startQuiz = () => {
            currentQuestions = shuffleArray([...db]).slice(0, 5);
            currentIndex = 0;
            score = 0;
            loader.style.display = 'none';
            endScreen.style.display = 'none';
            quizContainer.style.display = 'block';
            qTotalEl.innerText = currentQuestions.length;
            scoreDisplayEl.innerText = '0';
            loadQuestion();
        };

        const loadQuestion = () => {
            answered = false;
            feedbackBox.style.display = 'none';
            feedbackBox.className = 'feedback-box';
            nextBtn.style.display = 'none';

            const q = currentQuestions[currentIndex];
            qCurrentEl.innerText = currentIndex + 1;
            progressBarEl.style.width = `${((currentIndex) / currentQuestions.length) * 100}%`;
            qCategoryEl.innerText = q.category;
            qTextEl.innerText = q.question;
            optionsGridEl.innerHTML = '';

            const letters = ['A', 'B', 'C', 'D'];
            q.options.forEach((optText, index) => {
                const btn = document.createElement('button');
                btn.className = 'option-btn';
                btn.innerHTML = `<span class="option-letter">${letters[index]}</span> <span>${optText}</span>`;
                btn.onclick = () => selectOption(index);
                optionsGridEl.appendChild(btn);
            });
        };

        const selectOption = (selectedIndex) => {
            if (answered) return;
            answered = true;
            const q = currentQuestions[currentIndex];
            const isCorrect = selectedIndex === q.correct;

            Array.from(optionsGridEl.children).forEach((btn, i) => {
                btn.disabled = true;
                if (i === q.correct) btn.classList.add('correct');
                else if (i === selectedIndex && !isCorrect) btn.classList.add('wrong');
            });

            feedbackBox.style.display = 'block';
            if (isCorrect) {
                score++;
                scoreDisplayEl.innerText = score * 10;
                feedbackBox.classList.add('correct');
                fbTitle.innerHTML = '<i class="fa-solid fa-circle-check"></i> ¡Excelente!';
            } else {
                feedbackBox.classList.add('wrong');
                fbTitle.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Incorrecto';
            }
            fbText.innerText = q.explanation;
            nextBtn.style.display = 'block';

            if (window.playPop && isCorrect) window.playPop();
        };

        const nextQuestion = () => {
            currentIndex++;
            if (currentIndex < currentQuestions.length) {
                progressBarEl.style.width = `${((currentIndex) / currentQuestions.length) * 100}%`;
                loadQuestion();
            } else {
                showEndScreen();
            }
        };

        const showEndScreen = () => {
            progressBarEl.style.width = '100%';
            quizContainer.style.display = 'none';
            endScreen.style.display = 'block';

            const percentage = score / currentQuestions.length;
            document.getElementById('endScoreDisplay').innerText = `${score}/${currentQuestions.length}`;

            let emoji = '😐', msg = 'Hay que repasar.';
            if (percentage === 1) {
                emoji = '🏆'; msg = '¡Nivel Maestro Oficial!';
                if (typeof confetti === 'function') confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
            } else if (percentage >= 0.8) { emoji = '🔥'; msg = '¡Excelente trabajo!'; }
            else if (percentage >= 0.5) { emoji = '👍'; msg = 'Sigue repasando.'; }

            document.getElementById('endEmoji').innerText = emoji;
            document.getElementById('endMsg').innerText = msg;
        };

        // Attach buttons globally to override inline bindings
        nextBtn.onclick = nextQuestion;
        const resetBtn = document.querySelector('.reset-quiz-btn');
        if (resetBtn) resetBtn.onclick = startQuiz;

        // Data loading
        if (typeof window.VisualCorpQuizDB !== 'undefined') {
            db = window.VisualCorpQuizDB;
            startQuiz();
        } else {
            console.error("No se encontró la base de datos de preguntas (VisualCorpQuizDB)");
            if (loader) loader.innerHTML = '<p style="color:#ef4444;">Error cargando DB. Verifica db_preguntas.js</p>';
        }
    },

    // --- APP CHECKLIST (PLANTILLAS DINAMICAS Y EDITABLES) ---
    initChecklist: function () {
        const checkListContainer = document.getElementById('checkListContainer');
        const checklistTabs = document.getElementById('checklistTabs');
        if (!checkListContainer || !checklistTabs) return;

        // Elementos UI
        const checklistTitle = document.getElementById('checklistTitle');
        const progressText = document.getElementById('progressText');
        const progressBar = document.getElementById('progressBar');
        const successMessage = document.getElementById('successMessage');
        const newChecklistBtn = document.getElementById('newChecklistBtn');
        const editChecklistBtn = document.getElementById('editChecklistBtn');
        const deleteChecklistBtn = document.getElementById('deleteChecklistBtn');

        // Modal
        const modalOverlay = document.getElementById('itemModalOverlay');
        const inputTitle = document.getElementById('itemInputTitle');
        const inputDesc = document.getElementById('itemInputDesc');
        const modalSaveBtn = document.getElementById('itemModalSave');
        const modalCancelBtn = document.getElementById('itemModalCancel');

        // Estado Global
        let isEditMode = false;
        let currentListId = null;
        let dbChecklists = {};

        // Base de datos por defecto (Fábrica)
        const defaultTemplates = {
            asesor: {
                id: "asesor", title: "Plantilla Asesor", items: [
                    { id: "1", title: "Cotización Aprobada", desc: "El cliente confirmó el pago.", state: false },
                    { id: "2", title: "Art en Servidor", desc: "Arte compartido.", state: false }
                ]
            },
            disenador: {
                id: "disenador", title: "Plantilla Diseñador", items: [
                    { id: "3", title: "Modo de Color a CMYK", desc: "Documento en modo impresión.", state: false },
                    { id: "4", title: "Letras a Curvas", desc: "Ctrl+Shift+O en Illustrator.", state: false }
                ]
            }
        };

        // Inicializar persistencia
        const loadDB = () => {
            const stored = localStorage.getItem('visualcorp_checklists');
            if (stored) {
                try {
                    dbChecklists = JSON.parse(stored);
                } catch (e) { dbChecklists = { ...defaultTemplates }; }
            } else {
                dbChecklists = { ...defaultTemplates };
                saveDB();
            }
            if (Object.keys(dbChecklists).length === 0) {
                // Si borran todas, restauramos al menos una vacia
                dbChecklists = { "lista_1": { id: "lista_1", title: "Mi Lista", items: [] } };
            }
        };

        const saveDB = () => {
            localStorage.setItem('visualcorp_checklists', JSON.stringify(dbChecklists));
        };

        const generateId = () => Math.random().toString(36).substr(2, 9);

        // --- RENDERIZADO PRINCIPAL ---
        const renderTabs = () => {
            // Limpiamos (manteniendo el boton "Nueva" si existiera, o lo reinsertamos al final)
            checklistTabs.innerHTML = '';

            Object.values(dbChecklists).forEach(list => {
                const btn = document.createElement('button');
                btn.className = 'template-btn';
                btn.innerText = list.title.replace('Plantilla ', '');
                if (list.id === currentListId) btn.classList.add('active');

                btn.onclick = () => {
                    if (isEditMode) toggleEditMode(); // exit edit 
                    currentListId = list.id;
                    renderTabs(); // refresh state
                    renderList();
                };
                checklistTabs.appendChild(btn);
            });

            // Botón nuevo
            const newBtn = document.createElement('button');
            newBtn.className = 'action-btn';
            newBtn.style.marginLeft = 'auto';
            newBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Nueva';
            newBtn.onclick = createNewList;
            checklistTabs.appendChild(newBtn);
        };

        const renderList = () => {
            if (!currentListId || !dbChecklists[currentListId]) {
                currentListId = Object.keys(dbChecklists)[0];
            }
            const currentList = dbChecklists[currentListId];
            checklistTitle.innerText = currentList.title;
            // Update mode styling
            checkListContainer.parentElement.classList.toggle('edit-mode', isEditMode);
            deleteChecklistBtn.style.display = isEditMode ? 'flex' : 'none';
            checklistTitle.contentEditable = isEditMode;
            editChecklistBtn.innerHTML = isEditMode ? '<i class="fa-solid fa-check"></i> Listo' : '<i class="fa-solid fa-pen"></i> Editar';

            checkListContainer.innerHTML = '';

            // Render Items
            currentList.items.forEach(item => {
                const idHTML = 'chk_' + item.id;
                const wrapper = document.createElement('div');
                wrapper.className = `check-item ${item.state ? 'completed' : ''}`;

                wrapper.innerHTML = `
                    <input type="checkbox" id="${idHTML}" ${item.state ? 'checked' : ''} ${isEditMode ? 'disabled' : ''}>
                    <div style="flex-grow:1;">
                        <label for="${idHTML}" style="display:block;cursor:pointer;margin-bottom:0;">
                            <div class="check-text">${item.title}</div>
                            <div class="check-desc">${item.desc}</div>
                        </label>
                    </div>
                    <div class="item-actions">
                        <button class="btn-icon danger" data-del="${item.id}" title="Eliminar Tarea"><i class="fa-solid fa-trash"></i></button>
                    </div>
                `;

                // Handle Check Logic (Only not edit mode)
                const cb = wrapper.querySelector(`input`);
                cb.onchange = (e) => {
                    if (isEditMode) return;
                    item.state = e.target.checked;
                    saveDB();
                    updateProgress();
                };

                // Remove logic
                const delBtn = wrapper.querySelector('.danger');
                if (delBtn) delBtn.onclick = () => {
                    currentList.items = currentList.items.filter(i => i.id !== item.id);
                    saveDB();
                    renderList();
                };

                checkListContainer.appendChild(wrapper);
            });

            // "Add new Item" Button at the bottom
            const addBtn = document.createElement('div');
            addBtn.className = 'add-item-btn';
            addBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Añadir Nueva Tarea';
            addBtn.onclick = () => openModal();
            checkListContainer.appendChild(addBtn);

            updateProgress();
        };

        const updateProgress = () => {
            const list = dbChecklists[currentListId];
            if (!list) return;

            const total = list.items.length;
            const checked = list.items.filter(i => i.state).length;

            const percent = total > 0 ? (checked / total) * 100 : 0;
            progressBar.style.width = percent + '%';
            progressText.innerText = `${checked}/${total}`;

            if (checked === total && total > 0) {
                successMessage.style.display = 'block';
                if (!isEditMode && typeof window.playPop === 'function') window.playPop();
            } else {
                successMessage.style.display = 'none';
            }

            // Re-eval checks style just in case
            checkListContainer.querySelectorAll('.check-item').forEach(el => {
                const cb = el.querySelector('input[type="checkbox"]');
                if (cb && cb.checked) el.classList.add('completed');
                else el.classList.remove('completed');
            });
        };

        // --- ACCIONES CORE ---
        const toggleEditMode = () => {
            isEditMode = !isEditMode;
            if (!isEditMode) {
                // Guarda el titulo modificado
                const newTitle = checklistTitle.innerText.trim();
                dbChecklists[currentListId].title = newTitle || 'Lista sin nombre';
                saveDB();
                renderTabs(); // Refresca titulo en botones
            }
            renderList();
        };

        const createNewList = () => {
            const newId = 'list_' + generateId();
            dbChecklists[newId] = {
                id: newId,
                title: "Nueva Lista",
                items: []
            };
            currentListId = newId;
            isEditMode = true; // start editable
            saveDB();
            renderTabs();
            renderList();
            checklistTitle.focus();
        };

        const deleteCurrentList = () => {
            if (Object.keys(dbChecklists).length <= 1) {
                alert("No puedes borrar la última lista.");
                return;
            }
            if (confirm("¿Eliminar esta Checklist para siempre?")) {
                delete dbChecklists[currentListId];
                currentListId = Object.keys(dbChecklists)[0]; // Fallback to first
                isEditMode = false;
                saveDB();
                renderTabs();
                renderList();
            }
        };

        // --- MODAL TAREAS ---
        const openModal = () => {
            inputTitle.value = '';
            inputDesc.value = '';
            modalOverlay.style.display = 'flex';
            inputTitle.focus();
        };

        const closeModal = () => modalOverlay.style.display = 'none';

        const saveNewItem = () => {
            const t = inputTitle.value.trim();
            const d = inputDesc.value.trim();
            if (!t) return alert("El título es obligatorio");

            dbChecklists[currentListId].items.push({
                id: generateId(),
                title: t,
                desc: d,
                state: false
            });
            saveDB();
            closeModal();
            renderList();
        };

        // Eventos
        editChecklistBtn.onclick = toggleEditMode;
        deleteChecklistBtn.onclick = deleteCurrentList;
        modalCancelBtn.onclick = closeModal;
        modalSaveBtn.onclick = saveNewItem;
        document.getElementById('resetChecklistBtn').onclick = () => {
            if (isEditMode) return;
            dbChecklists[currentListId].items.forEach(i => i.state = false);
            saveDB();
            renderList();
        };

        // Escuchar Enter en el titulo editable para que no haga saltos de linea
        checklistTitle.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                checklistTitle.blur();
                toggleEditMode(); // Guardar
            }
        });

        // Initialize execution
        loadDB();
        renderTabs();
        renderList();
    },

    // --- APP COLOR MATCH (JUEGO HEX) ---
    initColorMatch: function () {
        const gameArea = document.getElementById('cmGameArea');
        const endScreen = document.getElementById('cmEndScreen');
        const restartBtn = document.getElementById('cmRestartBtn');
        if (!gameArea || !endScreen) return; // Not in app

        const colorBox = document.getElementById('cmColorBox');
        const optionsContainer = document.getElementById('cmOptions');
        const roundEl = document.getElementById('cmRound');
        const scoreEl = document.getElementById('cmScore');
        const finalScoreEl = document.getElementById('cmFinalScore');

        const MAX_ROUNDS = 10;
        let currentRound = 1;
        let score = 0;
        let targetColor = '';
        let answering = false;

        const getRandomHex = () => {
            return '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0').toUpperCase();
        };

        const generateSimilarHex = (baseHex) => {
            // Very simple approach: tweak the RGB values slightly to create a plausible trap
            let r = parseInt(baseHex.substring(1, 3), 16);
            let g = parseInt(baseHex.substring(3, 5), 16);
            let b = parseInt(baseHex.substring(5, 7), 16);

            const shift = () => Math.floor(Math.random() * 60) - 30; // -30 to +30 deviation
            r = Math.min(255, Math.max(0, r + shift()));
            g = Math.min(255, Math.max(0, g + shift()));
            b = Math.min(255, Math.max(0, b + shift()));

            return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
        };

        const shuffle = (array) => {
            for (let i = array.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [array[i], array[j]] = [array[j], array[i]];
            }
            return array;
        };

        const startRound = () => {
            answering = false;
            if (currentRound > MAX_ROUNDS) {
                endGame();
                return;
            }

            roundEl.innerText = `${currentRound}/${MAX_ROUNDS}`;
            scoreEl.innerText = score;

            targetColor = getRandomHex();
            colorBox.style.backgroundColor = targetColor;

            // Generate 3 traps
            let options = [targetColor];
            for (let i = 0; i < 3; i++) {
                options.push(generateSimilarHex(targetColor));
            }

            options = shuffle(options);
            optionsContainer.innerHTML = '';

            options.forEach(opt => {
                const btn = document.createElement('button');
                btn.className = 'cm-btn';
                btn.innerText = opt;
                btn.onclick = () => handleGuess(opt, btn);
                optionsContainer.appendChild(btn);
            });
        };

        const handleGuess = (guessedHex, btnElement) => {
            if (answering) return;
            answering = true;

            const buttons = optionsContainer.querySelectorAll('.cm-btn');

            buttons.forEach(b => {
                b.disabled = true;
                if (b.innerText === targetColor) {
                    b.classList.add('correct');
                } else if (b === btnElement) {
                    b.classList.add('wrong');
                }
            });

            if (guessedHex === targetColor) {
                score++;
                if (window.playPop) window.playPop();
            }

            setTimeout(() => {
                currentRound++;
                startRound();
            }, 1000); // 1 second delay to see the result
        };

        const endGame = () => {
            gameArea.style.display = 'none';
            endScreen.style.display = 'block';
            finalScoreEl.innerText = `${score}/${MAX_ROUNDS}`;

            if (score >= 8) {
                if (typeof confetti === 'function') {
                    confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
                }
            }
        };

        const initGame = () => {
            currentRound = 1;
            score = 0;
            gameArea.style.display = 'block';
            endScreen.style.display = 'none';
            startRound();
        };

        if (restartBtn) restartBtn.onclick = initGame;

        // Start automatically on module load
        initGame();
    },

    // --- APP PANTONE CATALOG ---
    initPantone: function () {
        const pantoneGrid = document.getElementById('pantoneGrid');
        const searchInput = document.getElementById('pantoneSearch');
        const countDisplay = document.getElementById('searchResultCount');

        // Verificamos si estamos en la página del catálogo de pinguinos (sic)
        if (!pantoneGrid || !searchInput) return;

        // Comprobar que la base de datos se haya cargado
        if (typeof pantoneCatalog === 'undefined') {
            pantoneGrid.innerHTML = '<p style="color:var(--color-danger);grid-column:1/-1;text-align:center;">Error: No se pudo cargar pantone-data.js</p>';
            return;
        }

        const rgbToCmyk = (r, g, b) => {
            let c = 1 - (r / 255);
            let m = 1 - (g / 255);
            let y = 1 - (b / 255);
            let k = Math.min(c, m, y);
            if (k === 1) return '0, 0, 0, 100';
            c = Math.round(((c - k) / (1 - k)) * 100);
            m = Math.round(((m - k) / (1 - k)) * 100);
            y = Math.round(((y - k) / (1 - k)) * 100);
            k = Math.round(k * 100);
            return `${c}, ${m}, ${y}, ${k}`;
        };

        const rgbToHsb = (r, g, b) => {
            r /= 255; g /= 255; b /= 255;
            let v = Math.max(r, g, b), n = v - Math.min(r, g, b);
            let h = n === 0 ? 0 : n && v === r ? (g - b) / n : v === g ? 2 + (b - r) / n : 4 + (r - g) / n;
            return `${Math.round(60 * (h < 0 ? h + 6 : h))}°, ${Math.round(v ? (n / v) * 100 : 0)}%, ${Math.round(v * 100)}%`;
        };

        const renderCards = (colors) => {
            pantoneGrid.innerHTML = ''; // Limpiar grilla

            if (colors.length === 0) {
                pantoneGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:var(--sp-8);color:var(--color-text-muted);"><i class="fa-solid fa-ghost" style="font-size:3rem;margin-bottom:var(--sp-4);opacity:0.3;"></i><p>No se encontraron colores con esa búsqueda.</p></div>';
                countDisplay.innerText = "0 resultados";
                return;
            }

            colors.forEach(color => {
                const card = document.createElement('div');
                card.className = 'pantone-card reveal reveal--slide-up';
                card.style.animationDelay = `${Math.min(pantoneGrid.children.length * 20, 300)}ms`;

                const displayName = color.name || `Pantone ${color.pantone}`;

                // Conversiones al vuelo si no están en base de datos
                let rgbStr = color.rgb || '0, 0, 0';
                let rgbArr = rgbStr.split(',').map(Number);
                if (rgbArr.length !== 3) rgbArr = [0, 0, 0];
                let cmykStr = color.cmyk || rgbToCmyk(rgbArr[0], rgbArr[1], rgbArr[2]);
                let hsbStr = color.hsb || rgbToHsb(rgbArr[0], rgbArr[1], rgbArr[2]);

                card.innerHTML = `
                    <div class="pantone-card__color" style="background-color: ${color.hex}; position:relative;">
                        <button class="pantone-copy-hex" title="Copiar HEX" data-hex="${color.hex}"><i class="fa-solid fa-copy"></i> Copiar HEX</button>
                    </div>
                    <div class="pantone-card__info" style="padding-bottom:var(--sp-3);">
                        <div class="pantone-card__title" style="margin-bottom:var(--sp-2); border-bottom:1px solid #eee; padding-bottom:var(--sp-2);">${displayName}</div>
                        
                        <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; margin-bottom:4px; font-family:monospace;">
                            <span style="color:#888; font-weight:700;">HEX</span>
                            <span style="color:#333; font-weight:800;">${color.hex}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; margin-bottom:4px; font-family:monospace;">
                            <span style="color:#888; font-weight:700;">RGB</span>
                            <span style="color:#555;">${rgbStr}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; margin-bottom:4px; font-family:monospace;">
                            <span style="color:#888; font-weight:700;">CMYK</span>
                            <span style="color:#555;">${cmykStr}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; font-family:monospace;">
                            <span style="color:#888; font-weight:700;">HSB</span>
                            <span style="color:#555;">${hsbStr}</span>
                        </div>
                    </div>
                `;

                // Evento para botón de copia exclusivo (evita copiar clickeando todo el bloque si el user prefiere)
                const copyBtn = card.querySelector('.pantone-copy-hex');
                copyBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(color.hex).then(() => {
                        copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copiado';
                        const toast = document.getElementById('toastNotification');
                        if (toast) {
                            toast.innerText = `HEX ${color.hex} copiado al portapapeles`;
                            toast.classList.add('show');
                            setTimeout(() => { toast.classList.remove('show'); copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i> Copiar HEX'; }, 2000);
                        }
                    });
                });

                pantoneGrid.appendChild(card);
            });

            countDisplay.innerText = `${colors.length} color${colors.length !== 1 ? 'es' : ''}`;
        };

        // Render inicial (Todos los colores)
        renderCards(pantoneCatalog);

        // Lógica de búsqueda conectada al input text
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase().trim();

            if (term === '') {
                renderCards(pantoneCatalog);
                return;
            }

            const filtered = pantoneCatalog.filter(c => {
                return (c.pantone && c.pantone.toLowerCase().includes(term)) ||
                    (c.name && c.name.toLowerCase().includes(term)) ||
                    (c.hex && c.hex.toLowerCase().includes(term));
            });

            renderCards(filtered);
        });
    }
};

// Global Exposure
window.VisualApps = VisualApps;
