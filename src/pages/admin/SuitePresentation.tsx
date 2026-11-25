import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, NotebookPen, RotateCcw } from 'lucide-react';
import services from './presentation-media/servicios.webp';
import tools from './presentation-media/herramientas.webp';
import panel from './presentation-media/panel.webp';
import './suite-presentation.css';

const slides = [
  {
    chapter: 'Visual Corp Suite', title: 'Del primer vistazo al taller.',
    body: 'Un negocio de Milagro quiere un rótulo para su fachada. Sigamos su idea desde la primera visita a la web hasta la mesa de trabajo del equipo.',
    image: '/public-site/home-film/apertura.webp', alt: '', cover: true,
    note: 'Abre con una pregunta para gerencia. Si mañana alguien quiere renovar su fachada, ¿qué necesita ver para dar el primer paso?',
  },
  {
    chapter: 'La web pública', title: 'Antes de pedir un rótulo, hay que imaginarlo.',
    body: 'El cliente explora los servicios, contrasta opciones en el portafolio y puede abrir el cotizador cuando ya tiene una idea de lo que busca.',
    image: services, alt: 'Vista de la sección de servicios de la web pública', link: '/servicios', action: 'Explorar los servicios',
    note: 'Entra a Servicios y elige una categoría. Explica qué pregunta responde el portafolio para alguien que todavía está eligiendo materiales o acabados.',
  },
  {
    chapter: 'Herramientas de diseño', title: '¿Alcanzará la resolución para esa fachada?',
    body: 'La revisión de archivos de impresión permite indicar las medidas finales y comprobar la resolución. El generador QR y el editor de diseño sobre productos cubren otras tareas de preparación.',
    image: tools, alt: 'Vista de las herramientas creativas disponibles en la Suite', link: '/herramientas', action: 'Ver las herramientas',
    note: 'Usa la misma imagen para explicar por qué una pieza que se ve bien en el teléfono puede necesitar más resolución al ampliarla.',
  },
  {
    chapter: 'El panel interno', title: 'Qué necesita atención hoy.',
    body: 'El inicio reúne solicitudes abiertas, cotizaciones del mes, ventas del día y artículos activos según los permisos del perfil. Desde sus accesos directos, cada persona entra al área que le corresponde.',
    image: panel, alt: 'Inicio del panel con una cuenta y datos de demostración', caption: 'Panel de administración · sesión de demostración',
    note: 'Señala las solicitudes abiertas. Para dirección, el dato sirve como punto de partida para preguntar qué cliente espera respuesta y quién lo está atendiendo.',
  },
  {
    chapter: 'El trabajo del equipo', title: '¿Quién tiene el siguiente paso?',
    body: 'En el ejemplo del rótulo, cada área resuelve una pregunta distinta. El panel ofrece un lugar para registrar las decisiones y consultar el avance.',
    rows: [['Asesoría', 'En el CRM se da seguimiento a la solicitud. El cotizador permite preparar una propuesta con el catálogo.'], ['Coordinación', 'El equipo organiza responsables y fechas, y consulta las etapas de trabajo del producto.'], ['Taller e inventario', 'El taller revisa tareas y el equipo de bodega consulta existencias y movimientos de material.']],
    note: 'Recorre las tres áreas en voz alta. Distingue el paso que realiza cada persona de la información que después puede consultar el resto del equipo.',
  },
  {
    chapter: 'Cómo se construyó', title: 'Una herramienta, varias puertas de entrada.',
    body: 'El editor de productos se abre tanto desde la web como desde operaciones. Ambos usan el mismo componente y cada uno lleva a su propio cotizador. Una mejora del editor llega a las dos pantallas.',
    rows: [['Interfaz · React + TypeScript', 'Las pantallas combinan componentes reutilizables. React Router dirige cada enlace a su vista pública o protegida.'], ['Datos · Supabase', 'La sesión identifica al usuario. Los permisos por organización delimitan los datos y módulos que puede consultar.'], ['Entrega · Vite + Vercel', 'Vite compila la aplicación. El equipo comprueba tipos y prueba recorridos en el navegador con Playwright antes de publicar versiones.']],
    note: 'Menciona un ejemplo concreto. Si se mejora la colocación de un logotipo sobre un producto, clientes y asesores reciben esa mejora en el mismo editor.',
  },
  {
    chapter: 'Cierre', title: 'Volvamos al rótulo.',
    body: 'El cliente puede explorar acabados y preparar su consulta. Asesoría puede cotizar, coordinación asignar el trabajo y el taller revisar sus tareas. ¿Qué parte del recorrido queremos demostrar en vivo?',
    image: '/public-site/home-film/visualito.webp', alt: '', cover: true, link: '/', action: 'Abrir la web pública',
    note: 'Invita a elegir entre la experiencia del cliente y el trabajo interno. Para la segunda opción, usa «Volver al panel».',
  },
];

export default function SuitePresentation() {
  const [index, setIndex] = useState(0);
  const [notes, setNotes] = useState(false);
  const slide = slides[index];
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        setIndex(value => Math.max(0, Math.min(slides.length - 1, value + (event.key === 'ArrowRight' ? 1 : -1))));
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [index]);

  return <main className="suite-deck" aria-label="Presentación de Visual Corp Suite">
    <header className="suite-deck-bar">
      <img src="/brand/visualcorp-wordmark-white-original.png" alt="Visual Corp" width="145"/>
      <Link to="/panel"><ArrowLeft size={16}/> Volver al panel</Link>
    </header>
    <section key={index} className={'suite-deck-stage' + (slide.cover ? ' is-cover' : '')} aria-labelledby="deck-title">
      {slide.cover && <img className="suite-deck-backdrop" src={slide.image} alt=""/>}
      <div className="suite-deck-copy">
        <p className="suite-deck-chapter">{slide.chapter}</p>
        <h1 id="deck-title">{slide.title}</h1>
        <p className="suite-deck-lead">{slide.body}</p>
        {slide.link && <a href={slide.link} target="_blank" rel="noreferrer">{slide.action} ↗ <span className="suite-deck-sr">(nueva pestaña)</span></a>}
      </div>
      {slide.image && !slide.cover && <figure><img src={slide.image} alt={slide.alt}/>{slide.caption && <figcaption>{slide.caption}</figcaption>}</figure>}
      {slide.rows && <dl>{slide.rows.map(([title, detail]) => <div key={title}><dt>{title}</dt><dd>{detail}</dd></div>)}</dl>}
    </section>
    <footer className="suite-deck-controls">
      <span role="status" aria-live="polite">{index + 1} / {slides.length}<span className="suite-deck-sr"> · {slide.title}</span></span>
      <button type="button" aria-expanded={notes} aria-controls="deck-notes" onClick={() => setNotes(!notes)}><NotebookPen size={17}/> Notas</button>
      <nav aria-label="Diapositivas">
        <button type="button" aria-label="Anterior" disabled={!index} onClick={() => setIndex(index - 1)}><ArrowLeft size={18}/></button>
        {index < slides.length - 1 ? <button className="suite-deck-next" onClick={() => setIndex(index + 1)}>Siguiente <ArrowRight size={18}/></button> : <button className="suite-deck-next" onClick={() => setIndex(0)}>Reiniciar <RotateCcw size={17}/></button>}
      </nav>
    </footer>
    <aside id="deck-notes" hidden={!notes}><strong>Notas para exponer</strong><p>{slide.note}</p></aside>
  </main>;
}
