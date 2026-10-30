import React, { useEffect, useId, useRef, useState } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import { OrderedList } from '@tiptap/extension-list';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Color from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  ChevronDown,
  Code2,
  Eraser,
  FileText,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Maximize2,
  Quote,
  Redo2,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
  X,
} from 'lucide-react';
import { clearSpotlight, SpotlightLayer, updateSpotlight } from '../ui/MagicComponents';
import './rich-text-editor.css';

type RichTextEditorProps = {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  minHeight?: number;
  label?: string;
  fullscreen?: boolean;
};

type InsertMode = 'link' | 'image' | null;
type SavedSelection = { from: number; to: number };

const orderedListExtension = OrderedList.extend({
  addAttributes() {
    return {
      listStyleType: {
        default: 'decimal',
        parseHTML: (element) => element.style.listStyleType || 'decimal',
        renderHTML: (attributes) => ({ style: `list-style-type:${attributes.listStyleType || 'decimal'}` }),
      },
    };
  },
});

function safeColor(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  const rgb = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!rgb) return fallback;
  return `#${rgb.slice(1, 4).map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`;
}

function normalizeWebUrl(value: string) {
  const input = value.trim().replace(/^<|>$/g, '');
  if (!input) throw new Error('Escribe una dirección web.');
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)) return `mailto:${input}`;
  if (/^\+?\d[\d\s().-]{6,}$/.test(input)) return `tel:${input.replace(/[^+\d]/g, '')}`;
  if (input.startsWith('//')) return new URL(`https:${input}`).href;
  if (input.startsWith('#') || input.startsWith('/')) return input;
  const hasHostPort = /^[^/?#\s]+:\d+(?:[/?#]|$)/.test(input);
  const candidate = /^(https?:|mailto:|tel:)/i.test(input)
    ? input
    : /^[a-z][a-z\d+.-]*:/i.test(input) && !hasHostPort
      ? input
      : `https://${input}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('Ese enlace no parece válido. Prueba con un dominio como ejemplo.com.');
  }
  if (!['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol)) {
    throw new Error('Usa una dirección web, un correo o un número de teléfono.');
  }
  if (['http:', 'https:'].includes(url.protocol) && !url.hostname) throw new Error('Revisa el dominio del enlace.');
  if (url.protocol === 'mailto:' && !url.pathname.includes('@')) throw new Error('Revisa el correo del enlace.');
  if (url.protocol === 'tel:' && url.pathname.replace(/[+\d\s().-]/g, '')) throw new Error('Revisa el número del enlace.');
  return url.href;
}

function normalizeImageUrl(value: string) {
  const url = normalizeWebUrl(value);
  if (!/^https?:\/\//i.test(url)) throw new Error('Para imágenes usa una dirección web pública.');
  return url;
}

export function RichTextEditor({
  value = '<p>Escribe algo con intención…</p>',
  onChange,
  placeholder = 'Escribe algo con intención…',
  minHeight = 230,
  label = 'Contenido',
  fullscreen = true,
}: RichTextEditorProps) {
  const id = useId();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [insertMode, setInsertMode] = useState<InsertMode>(null);
  const [insertUrl, setInsertUrl] = useState('');
  const [insertError, setInsertError] = useState('');
  const savedSelection = useRef<SavedSelection | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, orderedList: false }),
      orderedListExtension,
      Link.configure({ openOnClick: false }),
      Image,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Underline,
      Highlight.configure({ multicolor: true }),
      TextStyle.extend({
        addAttributes() {
          return {
            fontFamily: {
              default: null,
              parseHTML: (element) => element.style.fontFamily?.replaceAll('"', '') || null,
              renderHTML: (attributes) => attributes.fontFamily ? { style: `font-family:${attributes.fontFamily}` } : {},
            },
            fontSize: {
              default: null,
              parseHTML: (element) => element.style.fontSize || null,
              renderHTML: (attributes) => attributes.fontSize ? { style: `font-size:${attributes.fontSize}` } : {},
            },
          };
        },
      }),
      Color,
    ],
    content: value,
    onUpdate: ({ editor: instance }) => onChange?.(instance.getHTML()),
    editorProps: {
      attributes: {
        class: 'rich-editor-content',
        'data-placeholder': placeholder,
        'aria-label': label,
      },
    },
  });

  const toolbarState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      if (!currentEditor) return null;
      const paragraphAttributes = currentEditor.getAttributes('paragraph');
      const headingAttributes = currentEditor.getAttributes('heading');
      const listAttributes = currentEditor.getAttributes('orderedList');
      const textAttributes = currentEditor.getAttributes('textStyle');
      const heading = currentEditor.isActive('heading', { level: 1 })
        ? 'h1'
        : currentEditor.isActive('heading', { level: 2 })
          ? 'h2'
          : currentEditor.isActive('heading', { level: 3 })
            ? 'h3'
            : 'paragraph';
      return {
        heading,
        bold: currentEditor.isActive('bold'),
        italic: currentEditor.isActive('italic'),
        underline: currentEditor.isActive('underline'),
        strike: currentEditor.isActive('strike'),
        highlight: currentEditor.isActive('highlight'),
        bullet: currentEditor.isActive('bulletList'),
        ordered: currentEditor.isActive('orderedList'),
        quote: currentEditor.isActive('blockquote'),
        code: currentEditor.isActive('codeBlock'),
        link: currentEditor.isActive('link'),
        left: (paragraphAttributes.textAlign || headingAttributes.textAlign || 'left') === 'left',
        center: (paragraphAttributes.textAlign || headingAttributes.textAlign) === 'center',
        right: (paragraphAttributes.textAlign || headingAttributes.textAlign) === 'right',
        justify: (paragraphAttributes.textAlign || headingAttributes.textAlign) === 'justify',
        fontFamily: textAttributes.fontFamily || '',
        fontSize: textAttributes.fontSize || '',
        textColor: safeColor(textAttributes.color, '#282532'),
        highlightColor: safeColor(currentEditor.getAttributes('highlight').color, '#fff176'),
        listStyleType: listAttributes.listStyleType || 'decimal',
        canUndo: currentEditor.can().undo(),
        canRedo: currentEditor.can().redo(),
        wordCount: currentEditor.getText().trim().split(/\s+/).filter(Boolean).length,
        characterCount: currentEditor.getText().length,
      };
    },
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML() && !editor.isFocused) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [value, editor]);

  useEffect(() => {
    if (!isFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isFullscreen]);

  useEffect(() => {
    if (!isFullscreen && !insertMode) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (insertMode) {
        setInsertMode(null);
        setInsertError('');
      } else {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [insertMode, isFullscreen]);

  if (!editor || !toolbarState) return null;

  const run = (action: string) => {
    const chain = editor.chain().focus();
    if (action === 'undo') chain.undo().run();
    else if (action === 'redo') chain.redo().run();
    else if (action === 'bold') chain.toggleBold().run();
    else if (action === 'italic') chain.toggleItalic().run();
    else if (action === 'underline') chain.toggleUnderline().run();
    else if (action === 'strike') chain.toggleStrike().run();
    else if (action === 'highlight') chain.toggleHighlight({ color: toolbarState.highlightColor }).run();
    else if (action === 'bullet') chain.toggleBulletList().run();
    else if (action === 'ordered') chain.toggleOrderedList().run();
    else if (action === 'quote') chain.toggleBlockquote().run();
    else if (action === 'code') chain.toggleCodeBlock().run();
    else if (action === 'left') chain.setTextAlign('left').run();
    else if (action === 'center') chain.setTextAlign('center').run();
    else if (action === 'right') chain.setTextAlign('right').run();
    else if (action === 'justify') chain.setTextAlign('justify').run();
    else if (action === 'clear') chain.clearNodes().unsetAllMarks().run();
    else if (action === 'paragraph') chain.setParagraph().run();
    else if (action === 'h1') chain.setHeading({ level: 1 }).run();
    else if (action === 'h2') chain.setHeading({ level: 2 }).run();
    else if (action === 'h3') chain.setHeading({ level: 3 }).run();
    else if (action === 'link' || action === 'image') {
      savedSelection.current = { from: editor.state.selection.from, to: editor.state.selection.to };
      setInsertMode(action);
      setInsertUrl('');
      setInsertError('');
    }
  };

  const renderButton = (
    action: string,
    labelText: string,
    Icon: React.ComponentType<{ size?: number; 'aria-hidden'?: boolean }>,
    active = false,
    disabled = false,
    tone: 'default' | 'danger' = 'default',
    toggle = true,
  ) => (
    <button
      type="button"
      key={action}
      className={`rich-editor-tool-button${active ? ' is-active' : ''}${tone === 'danger' ? ' is-danger' : ''}`}
      aria-label={labelText}
      aria-pressed={toggle ? active : undefined}
      data-tooltip={labelText}
      title={labelText}
      disabled={disabled}
      onClick={() => run(action)}
    >
      <Icon size={16} aria-hidden />
    </button>
  );

  const renderGroup = (name: string, ariaLabel: string, children: React.ReactNode) => (
    <div className="rich-editor-tool-group" role="group" aria-label={ariaLabel} key={name}>
      <span className="rich-editor-group-label" aria-hidden="true">{name}</span>
      <div className="rich-editor-tool-buttons">{children}</div>
    </div>
  );

  const toolbar = (
    <div className="rich-editor-toolbar" aria-label="Herramientas de edición">
      {renderGroup('Historia', 'Deshacer y rehacer', <>
        {renderButton('undo', 'Deshacer', Undo2, false, !toolbarState.canUndo, 'default', false)}
        {renderButton('redo', 'Rehacer', Redo2, false, !toolbarState.canRedo, 'default', false)}
      </>)}
      {renderGroup('Bloque', 'Estilo de párrafo', <div className="rich-editor-select-wrap">
        <select
          aria-label="Estilo del bloque"
          value={toolbarState.heading}
          onChange={(event) => run(event.target.value)}
        >
          <option value="paragraph">Párrafo</option>
          <option value="h1">Encabezado 1</option>
          <option value="h2">Encabezado 2</option>
          <option value="h3">Encabezado 3</option>
        </select>
        <ChevronDown size={13} aria-hidden />
      </div>)}
      {renderGroup('Texto', 'Formato de texto', <>
        {renderButton('bold', 'Negrita', Bold, toolbarState.bold)}
        {renderButton('italic', 'Cursiva', Italic, toolbarState.italic)}
        {renderButton('underline', 'Subrayado', UnderlineIcon, toolbarState.underline)}
        {renderButton('strike', 'Tachado', Strikethrough, toolbarState.strike)}
        {renderButton('highlight', 'Resaltar texto', Highlighter, toolbarState.highlight)}
      </>)}
      {renderGroup('Listas', 'Listas y bloques', <>
        {renderButton('bullet', 'Lista con viñetas', List, toolbarState.bullet)}
        {renderButton('ordered', 'Lista numerada', ListOrdered, toolbarState.ordered)}
        {renderButton('quote', 'Cita', Quote, toolbarState.quote)}
        {renderButton('code', 'Bloque de código', Code2, toolbarState.code)}
      </>)}
      {renderGroup('Alinear', 'Alineación del texto', <>
        {renderButton('left', 'Alinear a la izquierda', AlignLeft, toolbarState.left)}
        {renderButton('center', 'Centrar', AlignCenter, toolbarState.center)}
        {renderButton('right', 'Alinear a la derecha', AlignRight, toolbarState.right)}
        {renderButton('justify', 'Justificar', AlignJustify, toolbarState.justify)}
      </>)}
      {renderGroup('Insertar', 'Insertar contenido o limpiar formato', <>
        {renderButton('link', toolbarState.link ? 'Enlace en la selección' : 'Insertar enlace', Link2, insertMode === 'link' || toolbarState.link)}
        {renderButton('image', 'Insertar imagen desde enlace', ImagePlus, insertMode === 'image', false, 'default', false)}
        {renderButton('clear', 'Quitar formato', Eraser, false, false, 'danger', false)}
      </>)}
    </div>
  );

  const settings = (
    <div className="rich-editor-settings" role="group" aria-label="Opciones de texto">
      <div className="rich-editor-setting">
        <label htmlFor={`${id}-font`}>Tipografía</label>
        <div className="rich-editor-select-wrap">
          <select
            id={`${id}-font`}
            value={toolbarState.fontFamily}
            onChange={(event) => editor.chain().focus().setMark('textStyle', { fontFamily: event.target.value || null }).run()}
          >
            <option value="">Predeterminada</option>
            <option value="Arial">Arial</option>
            <option value="Georgia">Georgia</option>
            <option value="Verdana">Verdana</option>
            <option value="'DM Sans', sans-serif">DM Sans</option>
          </select>
          <ChevronDown size={13} aria-hidden />
        </div>
      </div>
      <div className="rich-editor-setting rich-editor-setting-size">
        <label htmlFor={`${id}-size`}>Tamaño</label>
        <div className="rich-editor-select-wrap">
          <select
            id={`${id}-size`}
            value={toolbarState.fontSize}
            onChange={(event) => editor.chain().focus().setMark('textStyle', { fontSize: event.target.value || null }).run()}
          >
            <option value="">Normal</option>
            {['12px', '14px', '16px', '18px', '24px', '32px'].map((size) => <option value={size} key={size}>{size}</option>)}
          </select>
          <ChevronDown size={13} aria-hidden />
        </div>
      </div>
      <div className="rich-editor-setting rich-editor-setting-color">
        <label htmlFor={`${id}-text-color`}>Color de texto</label>
        <input
          id={`${id}-text-color`}
          type="color"
          value={toolbarState.textColor}
          aria-label="Color de texto"
          onChange={(event) => editor.chain().focus().setColor(event.target.value).run()}
        />
      </div>
      <div className="rich-editor-setting rich-editor-setting-color">
        <label htmlFor={`${id}-highlight-color`}>Resaltado</label>
        <input
          id={`${id}-highlight-color`}
          type="color"
          value={toolbarState.highlightColor}
          aria-label="Color de resaltado"
          onChange={(event) => editor.chain().focus().toggleHighlight({ color: event.target.value }).run()}
        />
      </div>
      <div className="rich-editor-setting rich-editor-setting-list">
        <label htmlFor={`${id}-list-style`}>Numeración</label>
        <div className="rich-editor-select-wrap">
          <select
            id={`${id}-list-style`}
            value={toolbarState.listStyleType}
            onChange={(event) => {
              if (!editor.isActive('orderedList')) editor.chain().focus().toggleOrderedList().run();
              editor.chain().focus().updateAttributes('orderedList', { listStyleType: event.target.value }).run();
            }}
          >
            <option value="decimal">1, 2, 3</option>
            <option value="lower-alpha">a, b, c</option>
            <option value="upper-alpha">A, B, C</option>
            <option value="lower-roman">i, ii, iii</option>
            <option value="upper-roman">I, II, III</option>
            <option value="lower-greek">α, β, γ</option>
          </select>
          <ChevronDown size={13} aria-hidden />
        </div>
      </div>
    </div>
  );

  const insertPanel = insertMode && (
    <form
      className="rich-editor-insert-panel"
      aria-label={insertMode === 'link' ? 'Agregar enlace' : 'Agregar imagen'}
      onSubmit={(event) => {
        event.preventDefault();
        try {
          const url = insertMode === 'image' ? normalizeImageUrl(insertUrl) : normalizeWebUrl(insertUrl);
          const selection = savedSelection.current || { from: editor.state.selection.from, to: editor.state.selection.to };
          const chain = editor.chain().focus().setTextSelection(selection);
          if (insertMode === 'link') {
            if (selection.from === selection.to) chain.setLink({ href: url }).insertContent(url).run();
            else chain.setLink({ href: url }).run();
          } else {
            chain.setImage({ src: url, alt: 'Imagen insertada' }).run();
          }
          setInsertMode(null);
          setInsertUrl('');
          setInsertError('');
          savedSelection.current = null;
        } catch (error) {
          setInsertError(error instanceof Error ? error.message : 'No se pudo validar la dirección.');
        }
      }}
    >
      <div className="rich-editor-insert-icon" aria-hidden="true">{insertMode === 'link' ? <Link2 size={17} /> : <ImagePlus size={17} />}</div>
      <div className="rich-editor-insert-copy">
        <strong>{insertMode === 'link' ? 'Añadir enlace' : 'Añadir imagen desde una dirección web'}</strong>
        <span>{insertMode === 'link' ? 'Admite dominios directos, www, rutas, correo y teléfono.' : 'Pega la dirección pública de la imagen; el dominio puede ir sin https://.'}</span>
      </div>
      <label className="rich-editor-url-field" htmlFor={`${id}-insert-url`}>
        <span>{insertMode === 'link' ? 'Dirección del enlace' : 'Dirección de la imagen'}</span>
        <input
          id={`${id}-insert-url`}
          type="text"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          autoFocus
          value={insertUrl}
          aria-invalid={Boolean(insertError)}
          aria-describedby={insertError ? `${id}-insert-error` : undefined}
          onChange={(event) => { setInsertUrl(event.target.value); setInsertError(''); }}
          placeholder={insertMode === 'link' ? 'www.ejemplo.com o drive.google.com/…' : 'ejemplo.com/imagen.png'}
        />
        {insertError && <small id={`${id}-insert-error`} role="alert">{insertError}</small>}
      </label>
      <div className="rich-editor-insert-actions">
        <button className="rich-editor-cancel" type="button" onClick={() => { setInsertMode(null); setInsertError(''); }}>Cancelar</button>
        <button className="rich-editor-confirm" type="submit"><Check size={14} /> Insertar</button>
      </div>
    </form>
  );

  const editorHeader = (
    <div className="rich-editor-head vc-magic-card" onPointerMove={updateSpotlight} onPointerLeave={clearSpotlight}>
      <SpotlightLayer />
      <div className="rich-editor-title">
        <span className="rich-editor-title-mark" aria-hidden="true"><span /></span>
        <div>
          <span className="rich-editor-eyebrow">CONTENIDO</span>
          <strong>{label}</strong>
        </div>
      </div>
      {fullscreen && (
        <button
          className="rich-editor-expand"
          type="button"
          aria-label="Abrir editor a pantalla completa"
          title="Ampliar espacio de escritura"
          onClick={() => setIsFullscreen(true)}
        >
          <Maximize2 size={15} /> <span>Pantalla completa</span>
        </button>
      )}
    </div>
  );

  const writingSurface = (
    <div className="rich-editor-writing-surface">
      <div className="rich-editor-writing-hint"><span /> Área de escritura {isFullscreen && <kbd>Esc</kbd>}</div>
      <EditorContent editor={editor} />
      <footer className="rich-editor-status" aria-label="Recuento del contenido">
        <span><FileText size={13} aria-hidden /> {toolbarState.wordCount} {toolbarState.wordCount === 1 ? 'palabra' : 'palabras'}</span>
        <span>{toolbarState.characterCount} {toolbarState.characterCount === 1 ? 'carácter' : 'caracteres'}</span>
        <span className="rich-editor-status-note">El contenido se refleja en el formulario</span>
      </footer>
    </div>
  );

  return (
    <div className={`rich-editor-shell${isFullscreen ? ' is-fullscreen' : ''}`} style={{ '--editor-min-height': `${minHeight}px` } as React.CSSProperties}>
      {!isFullscreen ? <>
        {editorHeader}
        {toolbar}
        {settings}
        {insertPanel}
        {writingSurface}
      </> : (
        <div className="editor-fullscreen-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsFullscreen(false); }}>
          <section className="editor-fullscreen-inner" role="dialog" aria-modal="true" aria-label={`${label}, pantalla completa`}>
            <header className="rich-editor-full-head">
              <div className="rich-editor-full-heading">
                <span className="rich-editor-title-mark" aria-hidden="true"><span /></span>
                <div><span className="rich-editor-eyebrow">EDITOR DE TEXTO</span><h2>{label}</h2><p>Organiza las ideas y da formato al contenido.</p></div>
              </div>
              <button type="button" onClick={() => setIsFullscreen(false)}><X size={17} /> <span>Cerrar</span></button>
            </header>
            {toolbar}
            {settings}
            {insertPanel}
            {writingSurface}
          </section>
        </div>
      )}
    </div>
  );
}
