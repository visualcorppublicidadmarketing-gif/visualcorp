import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowDownRight, ArrowRight, Check, CheckCircle2, ClipboardCheck, Copy, RotateCcw, Search, ShieldCheck, Sparkles, Target } from 'lucide-react';
import { fetchLearningResource } from './learning-api';
import type { LearningChecklist as LearningChecklistTemplate, LearningQuestion, PantoneColor } from './learning-types';
import { calculateArea, estimateVisibility, nextRovingTabIndex, normalizeSearch, progressPercent } from './learning-utils.js';
import './manual-learning.css';

const checklistStorageKey = 'visualcorp-learning-checklists-v1';

export function LearningPractice({ id, accessToken, checklists }: { id: string; accessToken?: string; checklists: LearningChecklistTemplate[] }) {
  if (id === 'calculadora') return <AreaCalculator/>;
  if (id === 'distancia') return <VisualDistance/>;
  if (id === 'pantone') return <ProtectedPantoneCatalog accessToken={accessToken}/>;
  if (id === 'colormatch') return <ProtectedColorMatch accessToken={accessToken}/>;
  if (id === 'quiz') return <ProtectedLearningQuiz accessToken={accessToken}/>;
  if (id === 'checklist') return <LearningChecklist templates={checklists}/>;
  return <div className="learning-tool-empty">Esta práctica no está disponible en este momento.</div>;
}

function useLearningData<T>(resource: 'pantone' | 'quiz', accessToken?: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    setData(null);
    setError('');
    fetchLearningResource<T>(resource, accessToken)
      .then((value) => { if (current) setData(value); })
      .catch((reason) => { if (current) setError(reason instanceof Error ? reason.message : 'No pudimos cargar la práctica.'); });
    return () => { current = false; };
  }, [resource, accessToken]);
  return { data, error };
}

function PrivatePracticeState({ error }: { error: string }) {
  return <div className="learning-practice-empty" role={error ? 'alert' : 'status'}><ShieldCheck size={18}/><span>{error || 'Verificando acceso y cargando el contenido…'}</span></div>;
}

function ProtectedPantoneCatalog({ accessToken }: { accessToken?: string }) {
  const { data, error } = useLearningData<PantoneColor[]>('pantone', accessToken);
  return data ? <PantoneCatalog colors={data}/> : <PrivatePracticeState error={error}/>;
}

function ProtectedColorMatch({ accessToken }: { accessToken?: string }) {
  const { data, error } = useLearningData<PantoneColor[]>('pantone', accessToken);
  return data ? <ColorMatch colors={data}/> : <PrivatePracticeState error={error}/>;
}

function ProtectedLearningQuiz({ accessToken }: { accessToken?: string }) {
  const { data, error } = useLearningData<LearningQuestion[]>('quiz', accessToken);
  return data ? <LearningQuiz questionBank={data}/> : <PrivatePracticeState error={error}/>;
}

function AreaCalculator() {
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [quantity, setQuantity] = useState('1');
  const result = calculateArea(width, height, quantity);
  return <div className="learning-tool-card">
    <div className="learning-tool-heading"><span className="learning-tool-symbol violet"><Activity size={19}/></span><div><span className="learning-mini-label">ÁREA Y CANTIDAD</span><h3>Calcula el metraje</h3><p>Ingresa medidas en metros para obtener el área por pieza y el total.</p></div></div>
    <div className="learning-input-grid">
      <label>Ancho (m)<input type="number" min="0" step="0.01" inputMode="decimal" value={width} onChange={(event) => setWidth(event.target.value)} placeholder="Ej. 1.20"/></label>
      <label>Alto (m)<input type="number" min="0" step="0.01" inputMode="decimal" value={height} onChange={(event) => setHeight(event.target.value)} placeholder="Ej. 0.80"/></label>
      <label>Cantidad<input type="number" min="1" step="1" inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="1"/></label>
    </div>
    <div className="learning-area-result" aria-live="polite"><div><span>Área por pieza</span><b>{result ? `${result.perPiece.toFixed(2)} m²` : '—'}</b></div><ArrowRight size={18}/><div><span>Área total</span><b>{result ? `${result.total.toFixed(2)} m²` : 'Completa las medidas'}</b></div></div>
    <div className="learning-note"><Sparkles size={16}/><span>Fórmula: ancho × alto × cantidad. El resultado es una referencia de área; no incluye desperdicio, instalación ni precio.</span></div>
  </div>;
}

function VisualDistance() {
  const [height, setHeight] = useState('10');
  const [distance, setDistance] = useState('20');
  const range = estimateVisibility(height);
  const meters = Number(distance) || 0;
  const isClear = Boolean(range && meters <= range.limit);
  const blur = range && meters > range.limit ? Math.min(4, (meters - range.limit) / 20) : 0;
  return <div className="learning-tool-card">
    <div className="learning-tool-heading"><span className="learning-tool-symbol cyan"><Target size={19}/></span><div><span className="learning-mini-label">LECTURA A DISTANCIA</span><h3>Prueba el tamaño de letra</h3><p>Ajusta la altura y la distancia para comparar una referencia visual.</p></div></div>
    <div className="learning-input-grid learning-input-grid-two">
      <label>Altura de letra (cm)<input type="number" min="1" step="1" value={height} onChange={(event) => setHeight(event.target.value)}/></label>
      <label>Distancia observada <strong className="learning-inline-value">{Math.round(meters)} m</strong><input type="range" min="1" max={Math.max(100, Math.round((range?.limit || 30) * 2))} value={distance} onChange={(event) => setDistance(event.target.value)}/></label>
    </div>
    <div className={`learning-sign-sim ${isClear ? 'is-clear' : 'is-soft'}`}><span className="learning-sign-grid" aria-hidden="true"/><b style={{ filter: `blur(${blur}px)`, opacity: Math.max(.28, 1 - blur / 5) }}>VISUAL CORP</b><small>{isClear ? 'REFERENCIA DE LECTURA' : 'AUMENTA EL TAMAÑO O ACÉRCATE'}</small></div>
    <div className="learning-distance-results"><div><span>Zona orientativa</span><b>{range ? `${Math.round(range.suggested)} m` : '—'}</b></div><div><span>Límite orientativo</span><b>{range ? `${Math.round(range.limit)} m` : '—'}</b></div><div><span>Distancia elegida</span><b>{Math.round(meters)} m</b></div></div>
    <div className="learning-note"><Activity size={16}/><span>Estimación heredada del manual: 3× y 4.5× la altura de letra. No sustituye una prueba en el lugar, el contraste real ni la revisión del diseño.</span></div>
  </div>;
}

function PantoneCatalog({ colors }: { colors: PantoneColor[] }) {
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(48);
  const [copied, setCopied] = useState('');
  const filtered = useMemo(() => {
    const term = normalizeSearch(query);
    if (!term) return colors;
    return colors.filter((color) => normalizeSearch(`${color.name} ${color.pantone} ${color.hex}`).includes(term));
  }, [query]);
  useEffect(() => setShown(48), [query]);
  const copyColor = async (color: PantoneColor) => {
    try {
      await navigator.clipboard.writeText(color.hex);
      setCopied(color.pantone);
      window.setTimeout(() => setCopied(''), 1600);
    } catch {
      setCopied('sin-portapapeles');
    }
  };
  return <div className="learning-tool-card learning-pantone">
    <div className="learning-tool-heading"><span className="learning-tool-symbol amber"><Sparkles size={19}/></span><div><span className="learning-mini-label">CONSULTA DE COLOR</span><h3>Busca una muestra</h3><p>{colors.length} referencias Solid Coated heredadas del catálogo original.</p></div></div>
    <label className="learning-tool-search"><Search size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre, número o HEX" aria-label="Buscar color por nombre, número o HEX"/><span>{filtered.length}</span></label>
    {filtered.length ? <div className="learning-color-grid">{filtered.slice(0, shown).map((color) => <button className="learning-color-card" key={`${color.pantone}-${color.hex}`} onClick={() => void copyColor(color)} aria-label={`Copiar ${color.hex}, ${color.name}`}><span className="learning-color-swatch" style={{ backgroundColor: color.hex }}/><b>{color.pantone}</b><span className="learning-color-bottom"><i>{color.hex}</i>{copied === color.pantone ? <Check size={13}/> : <Copy size={13}/>}</span></button>)}</div> : <div className="learning-practice-empty"><Search size={18}/><span>No encontramos esa referencia.</span></div>}
    {filtered.length > shown && <button className="learning-secondary-button learning-load-more" onClick={() => setShown((current) => current + 48)}>Mostrar más colores <ArrowDownRight size={15}/></button>}
    <div className="learning-note"><Sparkles size={16}/><span>{copied === 'sin-portapapeles' ? 'No se pudo acceder al portapapeles. Selecciona el valor visualmente.' : copied ? `${copied} copiado al portapapeles.` : 'Pulsa una muestra para copiar su HEX. El catálogo es referencia visual y no sustituye una guía física ni una prueba de impresión.'}</span></div>
  </div>;
}

function ColorMatch({ colors }: { colors: PantoneColor[] }) {
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [answer, setAnswer] = useState<string | null>(null);
  const [colorsForRound, setColorsForRound] = useState<PantoneColor[]>([]);
  const totalRounds = 10;
  const startRound = () => {
    const pool = [...colors].sort(() => Math.random() - .5).slice(0, 4);
    setColorsForRound(pool);
    setAnswer(null);
  };
  useEffect(() => { startRound(); }, []);
  if (round >= totalRounds) return <div className="learning-tool-card learning-color-finish"><span className="learning-tool-symbol pink"><Sparkles size={21}/></span><span className="learning-mini-label">FIN DE LA RONDA</span><h3>{score} de {totalRounds} aciertos</h3><p>{score >= 8 ? 'Muy buen ojo. Sigue comparando colores en soportes reales.' : 'Una nueva ronda ayuda a familiarizarte con nombres y referencias.'}</p><button className="learning-primary-button" onClick={() => { setRound(0); setScore(0); startRound(); }}>Jugar otra vez <RotateCcw size={16}/></button></div>;
  const target = colorsForRound[0];
  const choose = (pantone: string) => {
    if (answer) return;
    setAnswer(pantone);
    if (pantone === target.pantone) setScore((current) => current + 1);
  };
  return <div className="learning-tool-card">
    <div className="learning-tool-heading"><span className="learning-tool-symbol pink"><Target size={19}/></span><div><span className="learning-mini-label">ENTRENA EL OJO · RONDA {round + 1} / {totalRounds}</span><h3>¿Qué referencia es?</h3><p>Observa la muestra y elige el nombre que coincide.</p></div></div>
    <div className="learning-match-board"><span className="learning-match-swatch" style={{ backgroundColor: target?.hex || '#eeeeee' }}/><span>Encuentra esta muestra</span><b>{target?.hex || 'Cargando…'}</b></div>
    <div className="learning-match-options">{colorsForRound.map((color) => <button key={color.pantone} className={answer ? color.pantone === target.pantone ? 'is-correct' : answer === color.pantone ? 'is-wrong' : '' : ''} onClick={() => choose(color.pantone)} disabled={Boolean(answer)}>{color.pantone}</button>)}</div>
    {answer && <div className={`learning-match-feedback ${answer === target.pantone ? 'correct' : 'incorrect'}`} role="status">{answer === target.pantone ? '¡Coincide!' : `Era ${target.pantone}.`} <button onClick={() => { setRound((current) => current + 1); if (round + 1 < totalRounds) startRound(); }}>Siguiente <ArrowRight size={14}/></button></div>}
    <div className="learning-note"><Sparkles size={16}/><span>Aciertos: {score}. El ejercicio usa valores digitales de referencia; la apariencia depende de cada pantalla.</span></div>
  </div>;
}

function LearningQuiz({ questionBank }: { questionBank: LearningQuestion[] }) {
  const [questions, setQuestions] = useState(() => [...questionBank].sort(() => Math.random() - .5).slice(0, 5));
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [answer, setAnswer] = useState<number | null>(null);
  const finished = index >= questions.length;
  const question = questions[index];
  const restart = () => { setQuestions([...questionBank].sort(() => Math.random() - .5).slice(0, 5)); setIndex(0); setScore(0); setAnswer(null); };
  if (finished) return <div className="learning-tool-card learning-color-finish"><span className="learning-tool-symbol violet"><ClipboardCheck size={21}/></span><span className="learning-mini-label">REPASO COMPLETADO</span><h3>{score} de {questions.length} respuestas correctas</h3><p>{score >= 4 ? 'Buen repaso. Lleva estos criterios a la siguiente tarea.' : 'Revisa las guías recomendadas y vuelve a intentarlo cuando quieras.'}</p><button className="learning-primary-button" onClick={restart}>Repetir práctica <RotateCcw size={16}/></button></div>;
  return <div className="learning-tool-card learning-quiz">
    <div className="learning-quiz-progress"><span style={{ width: `${progressPercent(index, questions.length)}%` }}/></div>
    <div className="learning-tool-heading"><span className="learning-tool-symbol violet"><ClipboardCheck size={19}/></span><div><span className="learning-mini-label">PREGUNTA {index + 1} / {questions.length} · {question.category.toUpperCase()}</span><h3>{question.question}</h3></div></div>
    <div className="learning-quiz-options">{question.options.map((option, optionIndex) => <button key={option} onClick={() => { if (answer !== null) return; setAnswer(optionIndex); if (optionIndex === question.correct) setScore((current) => current + 1); }} className={answer === null ? '' : optionIndex === question.correct ? 'is-correct' : answer === optionIndex ? 'is-wrong' : ''} disabled={answer !== null}><span>{String.fromCharCode(65 + optionIndex)}</span>{option}{answer !== null && optionIndex === question.correct && <CheckCircle2 size={17}/>}</button>)}</div>
    {answer !== null && <div className={`learning-quiz-feedback ${answer === question.correct ? 'correct' : 'incorrect'}`} role="status"><b>{answer === question.correct ? 'Correcto' : 'Repasa este punto'}</b><span>{question.explanation}</span><button onClick={() => { setIndex((current) => current + 1); setAnswer(null); }}>{index + 1 === questions.length ? 'Ver resultado' : 'Siguiente pregunta'} <ArrowRight size={15}/></button></div>}
    <div className="learning-note"><CheckCircle2 size={16}/><span>Respuestas basadas en el contenido educativo de esta biblioteca.</span></div>
  </div>;
}

function LearningChecklist({ templates }: { templates: LearningChecklistTemplate[] }) {
  const [selectedId, setSelectedId] = useState(templates[0]?.id || '');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [checkedByTemplate, setCheckedByTemplate] = useState<Record<string, Record<string, boolean>>>(() => {
    try { return JSON.parse(window.localStorage.getItem(checklistStorageKey) || '{}'); } catch { return {}; }
  });
  useEffect(() => {
    if (templates.length && !templates.some((template) => template.id === selectedId)) setSelectedId(templates[0].id);
  }, [templates, selectedId]);
  const selected = templates.find((template) => template.id === selectedId) || templates[0] || { id: '', label: '', tasks: [] };
  const checked = checkedByTemplate[selected.id] || {};
  const done = Object.values(checked).filter(Boolean).length;
  const percentage = progressPercent(done, selected.tasks.length);
  useEffect(() => { window.localStorage.setItem(checklistStorageKey, JSON.stringify(checkedByTemplate)); }, [checkedByTemplate]);
  const toggle = (task: string) => setCheckedByTemplate((current) => ({ ...current, [selected.id]: { ...(current[selected.id] || {}), [task]: !current[selected.id]?.[task] } }));
  if (!selected.id) return <div className="learning-practice-empty" role="status">No hay listas de apoyo disponibles.</div>;
  return <div className="learning-tool-card">
    <div className="learning-tool-heading"><span className="learning-tool-symbol mint"><ClipboardCheck size={19}/></span><div><span className="learning-mini-label">LISTA DE APOYO</span><h3>Elige un momento del trabajo</h3><p>Marca tareas mientras revisas. El avance se guarda en este navegador.</p></div></div>
    <div className="learning-checklist-tabs" role="tablist" aria-label="Elegir plantilla de checklist" aria-orientation="horizontal">{templates.map((template, index) => <button ref={(element) => { tabRefs.current[index] = element; }} type="button" role="tab" aria-selected={selected.id === template.id} aria-controls="learning-checklist-panel" id={`learning-checklist-tab-${template.id}`} tabIndex={selected.id === template.id ? 0 : -1} className={selected.id === template.id ? 'is-active' : ''} key={template.id} onFocus={() => setSelectedId(template.id)} onClick={() => setSelectedId(template.id)} onKeyDown={(event) => { const nextIndex = nextRovingTabIndex(index, event.key, templates.length); if (nextIndex === null) return; event.preventDefault(); const nextTemplate = templates[nextIndex]; setSelectedId(nextTemplate.id); tabRefs.current[nextIndex]?.focus(); }}>{template.label}</button>)}</div>
    <section id="learning-checklist-panel" role="tabpanel" aria-labelledby={`learning-checklist-tab-${selected.id}`} tabIndex={0}>
    <div className="learning-checklist-progress"><span><b>{done} de {selected.tasks.length}</b> tareas revisadas</span><span className="learning-progress-track"><i style={{ width: `${percentage}%` }}/></span></div>
    <div className="learning-checklist-items">{selected.tasks.map((task) => <label className={checked[task] ? 'is-checked' : ''} key={task}><input type="checkbox" checked={Boolean(checked[task])} onChange={() => toggle(task)}/><span className="learning-checkmark"><Check size={13}/></span><span>{task}</span></label>)}</div>
    <button className="learning-secondary-button learning-reset-button" onClick={() => setCheckedByTemplate((current) => ({ ...current, [selected.id]: {} }))}><RotateCcw size={15}/> Reiniciar esta lista</button>
    </section>
    <div className="learning-note"><ClipboardCheck size={16}/><span>Es una ayuda personal de aprendizaje. No reemplaza la orden, el control de calidad ni los registros oficiales del trabajo.</span></div>
  </div>;
}
