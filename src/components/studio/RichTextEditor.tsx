import React, { useEffect, useId, useRef, useState } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  ChevronDown,
  Columns3,
  Code2,
  Eraser,
  FileText,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  LoaderCircle,
  Maximize2,
  MoreHorizontal,
  Quote,
  Redo2,
  Rows3,
  SlidersHorizontal,
  Strikethrough,
  Table2,
  Trash2,
  Underline as UnderlineIcon,
  Undo2,
  X,
} from 'lucide-react';
import { clearSpotlight, SpotlightLayer, updateSpotlight } from '../ui/MagicComponents';
import { optimizeCommercialImage } from '../../lib/commercialAssets';
import { createRichTextExtensions } from './richTextExtensions';
import { sanitizeRichTextHtml } from './richTextHtml';
import './rich-text-editor.css';

type RichTextEditorProps = {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  minHeight?: number;
  label?: string;
  fullscreen?: boolean;
  onImageUpload?: (file: File) => Promise<string>;
};

type InsertMode = 'link' | 'image' | null;
type SavedSelection = { from: number; to: number };
type TableContext = { tablePos: number; cellPos: number; rowIndex: number; colIndex: number };
type EditorInstance = NonNullable<ReturnType<typeof useEditor>>;

function getCellAt(editor: EditorInstance, tablePos: number, rowIndex: number, colIndex: number): TableContext | null {
  const table = editor.state.doc.nodeAt(tablePos);
  if (table?.type.name !== 'table' || !table.childCount) return null;
  const targetRowIndex = Math.min(Math.max(rowIndex, 0), table.childCount - 1);
  let result: TableContext | null = null;
  table.forEach((row, rowOffset, currentRowIndex) => {
    if (currentRowIndex !== targetRowIndex || !row.childCount) return;
    const targetColIndex = Math.min(Math.max(colIndex, 0), row.childCount - 1);
    row.forEach((_cell, cellOffset, currentColIndex) => {
      if (currentColIndex === targetColIndex) {
        result = {
          tablePos,
          cellPos: tablePos + 2 + rowOffset + cellOffset,
          rowIndex: targetRowIndex,
          colIndex: targetColIndex,
        };
      }
    });
  });
  return result;
}

function getTableContext(editor: EditorInstance): TableContext | null {
  const { $from } = editor.state.selection;
  let cellDepth = -1;
  let tableDepth = -1;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const name = $from.node(depth).type.name;
    if (cellDepth < 0 && (name === 'tableCell' || name === 'tableHeader')) cellDepth = depth;
    if (name === 'table') {
      tableDepth = depth;
      break;
    }
  }
  if (cellDepth < 0 || tableDepth < 0) return null;
  const tablePos = $from.before(tableDepth);
  const cellPos = $from.before(cellDepth);
  const table = editor.state.doc.nodeAt(tablePos);
  if (table?.type.name !== 'table') return null;
  let rowIndex = -1;
  let colIndex = -1;
  table.forEach((row, rowOffset, currentRowIndex) => {
    row.forEach((_cell, cellOffset, currentColIndex) => {
      if (tablePos + 2 + rowOffset + cellOffset === cellPos) {
        rowIndex = currentRowIndex;
        colIndex = currentColIndex;
      }
    });
  });
  return rowIndex < 0 || colIndex < 0 ? null : { tablePos, cellPos, rowIndex, colIndex };
}

function findTableCell(editor: EditorInstance, nearPosition: number, rowIndex = 0, colIndex = 0): TableContext | null {
  let closest: { distance: number; tablePos: number } | null = null;
  editor.state.doc.descendants((node, position) => {
    if (node.type.name !== 'table') return true;
    const distance = Math.abs(position - nearPosition);
    if (closest && closest.distance <= distance) return false;
    closest = { distance, tablePos: position };
    return false;
  });
  return closest ? getCellAt(editor, closest.tablePos, rowIndex, colIndex) : null;
}

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
  return url.replace(/^http:\/\//i, 'https://');
}

export function RichTextEditor({
  value = '',
  onChange,
  placeholder = 'Escribe algo con intención…',
  minHeight = 230,
  label = 'Contenido',
  fullscreen = true,
  onImageUpload,
}: RichTextEditorProps) {
  const id = useId();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showMoreFormatting, setShowMoreFormatting] = useState(false);
  const [insertMode, setInsertMode] = useState<InsertMode>(null);
  const [insertUrl, setInsertUrl] = useState('');
  const [insertError, setInsertError] = useState('');
  const [imageAlt, setImageAlt] = useState('');
  const [imageIsDecorative, setImageIsDecorative] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [tableToolbarPinned, setTableToolbarPinned] = useState(false);
  const savedSelection = useRef<SavedSelection | null>(null);
  const tableContext = useRef<TableContext | null>(null);
  const imageUploadToken = useRef(0);
  const preserveTableToolbar = useRef(false);
  const imageFileRef = useRef<HTMLInputElement>(null);
  const toolbarTabStop = useRef('bold');
  const fullscreenDialogRef = useRef<HTMLDialogElement>(null);
  const fullscreenTriggerRef = useRef<HTMLButtonElement>(null);
  const openedFullscreen = useRef(false);

  const editor = useEditor({
    extensions: createRichTextExtensions(),
    content: sanitizeRichTextHtml(value),
    onUpdate: ({ editor: instance }) => onChange?.(instance.getHTML()),
    onTransaction: ({ transaction }) => {
      if (!tableContext.current || !transaction.docChanged) return;
      tableContext.current = {
        tablePos: transaction.mapping.map(tableContext.current.tablePos, -1),
        cellPos: transaction.mapping.map(tableContext.current.cellPos, -1),
        rowIndex: tableContext.current.rowIndex,
        colIndex: tableContext.current.colIndex,
      };
    },
    onSelectionUpdate: ({ editor: instance }) => {
      const context = getTableContext(instance);
      if (context) {
        tableContext.current = context;
        setTableToolbarPinned(true);
      } else if (!preserveTableToolbar.current) {
        tableContext.current = null;
        setTableToolbarPinned(false);
      }
    },
    editorProps: {
      attributes: {
        class: 'rich-editor-content',
        role: 'textbox',
        'aria-multiline': 'true',
        'data-placeholder': placeholder,
        'aria-label': label,
      },
      transformPastedHTML: (html) => sanitizeRichTextHtml(html),
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
      const darkTheme = typeof document !== 'undefined' && [document.documentElement, document.body]
        .some((element) => element.matches('[data-theme="dark"], [data-vc-theme="dark"], .theme-dark'))
        || Boolean(currentEditor.view.dom.closest('.theme-dark, [data-theme="dark"], [data-vc-theme="dark"]'));
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
        textColor: safeColor(textAttributes.color, darkTheme ? '#f1eff7' : '#211d2a'),
        highlightColor: safeColor(currentEditor.getAttributes('highlight').color, '#fff176'),
        listStyleType: listAttributes.listStyleType || 'decimal',
        canUndo: currentEditor.can().undo(),
        canRedo: currentEditor.can().redo(),
        inTable: currentEditor.isActive('table') || currentEditor.isActive('tableCell') || currentEditor.isActive('tableHeader') || tableToolbarPinned,
        wordCount: currentEditor.getText().trim().split(/\s+/).filter(Boolean).length,
        characterCount: currentEditor.getText().length,
      };
    },
  });

  useEffect(() => {
    const safeValue = sanitizeRichTextHtml(value);
    if (editor && safeValue !== editor.getHTML() && !editor.isFocused) {
      editor.commands.setContent(safeValue, { emitUpdate: false });
    }
  }, [value, editor]);

  useEffect(() => {
    if (!isFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isFullscreen]);

  useEffect(() => {
    const dialog = fullscreenDialogRef.current;
    if (!dialog) return;

    if (isFullscreen && !dialog.open) {
      dialog.showModal();
      openedFullscreen.current = true;
      requestAnimationFrame(() => {
        if (insertMode) document.getElementById(`${id}-insert-url`)?.focus();
        else editor?.commands.focus();
      });
      return;
    }

    if (!isFullscreen && dialog.open) dialog.close();
    if (!isFullscreen && openedFullscreen.current) {
      openedFullscreen.current = false;
      requestAnimationFrame(() => fullscreenTriggerRef.current?.focus());
    }
  }, [id, insertMode, isFullscreen, editor]);

  useEffect(() => {
    if (!insertMode) return;
    const frame = requestAnimationFrame(() => document.getElementById(`${id}-insert-url`)?.focus());
    return () => cancelAnimationFrame(frame);
  }, [id, insertMode]);

  useEffect(() => {
    if (!isFullscreen && !insertMode) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (imageUploading) return;
      if (insertMode) {
        event.preventDefault();
        event.stopPropagation();
        setInsertMode(null);
        setInsertError('');
      } else if (isFullscreen) {
        event.preventDefault();
        event.stopPropagation();
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [imageUploading, insertMode, isFullscreen]);

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
    else if (['table', 'add-row', 'add-column', 'delete-row', 'delete-column', 'delete-table'].includes(action)) {
      preserveTableToolbar.current = true;
      const previousPosition = editor.state.selection.from;
      let context = getTableContext(editor) || tableContext.current;
      if (action === 'table') {
        editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
        context = getTableContext(editor) || findTableCell(editor, previousPosition);
      } else if (context) {
        // Toolbar buttons take DOM focus. Restore the last selected cell before running
        // the table command so consecutive row/column edits target the same table.
        editor.commands.setTextSelection(context.cellPos + 2);
        const tableChain = editor.chain().focus();
        if (action === 'add-row') tableChain.addRowAfter().run();
        else if (action === 'add-column') tableChain.addColumnAfter().run();
        else if (action === 'delete-row') tableChain.deleteRow().run();
        else if (action === 'delete-column') tableChain.deleteColumn().run();
        else tableChain.deleteTable().run();
        if (action !== 'delete-table') {
          const mappedTablePosition = tableContext.current?.tablePos ?? context.tablePos;
          context = findTableCell(editor, mappedTablePosition, context.rowIndex, context.colIndex);
          if (context) {
            editor.commands.setTextSelection(context.cellPos + 2);
            context = getTableContext(editor) || context;
          }
        }
      }
      if (action === 'delete-table' || !context) {
        tableContext.current = null;
        setTableToolbarPinned(false);
      } else {
        tableContext.current = context;
        setTableToolbarPinned(true);
      }
      requestAnimationFrame(() => { preserveTableToolbar.current = false; });
    }
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
      setImageAlt('');
      setImageIsDecorative(false);
      setInsertError('');
    }
  };

  const syncToolbarRovingTabStop = (event: React.FocusEvent<HTMLDivElement>) => {
    const target = event.target.closest<HTMLElement>('[data-editor-toolbar-item]');
    const toolbarElement = event.currentTarget;
    if (!target) return;
    toolbarTabStop.current = target.dataset.editorToolbarItem || toolbarTabStop.current;
    toolbarElement.querySelectorAll<HTMLElement>('[data-editor-toolbar-item]').forEach((item) => {
      item.tabIndex = item === target ? 0 : -1;
    });
  };

  const navigateToolbar = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLInputElement) return;
    if (event.target instanceof HTMLSelectElement && !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[data-editor-toolbar-item]:not(:disabled)'));
    if (!items.length) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    if (currentIndex < 0) return;
    event.preventDefault();
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
    items[nextIndex].focus();
  };

  const focusEditorToolbar = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!event.altKey || event.key !== 'F10') return;
    const toolbarElement = event.currentTarget.querySelector<HTMLElement>('.rich-editor-toolbar');
    const activeItem = toolbarElement?.querySelector<HTMLElement>('[data-editor-toolbar-item][tabindex="0"]:not(:disabled)')
      || toolbarElement?.querySelector<HTMLElement>('button[data-editor-toolbar-item]:not(:disabled)')
      || toolbarElement?.querySelector<HTMLElement>('select[data-editor-toolbar-item]:not(:disabled)');
    if (!activeItem) return;
    event.preventDefault();
    activeItem.focus();
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

  const renderToolbarButton = (
    action: string,
    labelText: string,
    Icon: React.ComponentType<{ size?: number; 'aria-hidden'?: boolean }>,
    active = false,
    disabled = false,
    tone: 'default' | 'danger' = 'default',
    toggle = true,
  ) => React.cloneElement(renderButton(action, labelText, Icon, active, disabled, tone, toggle), {
    'data-editor-toolbar-item': action,
    tabIndex: toolbarTabStop.current === action ? 0 : -1,
  });

  const renderGroup = (name: string, ariaLabel: string, children: React.ReactNode) => (
    <div className="rich-editor-tool-group" role="group" aria-label={ariaLabel} key={name}>
      <span className="rich-editor-group-label" aria-hidden="true">{name}</span>
      <div className="rich-editor-tool-buttons">{children}</div>
    </div>
  );

  const uploadAndInsertImage = async (file: File) => {
    if (!onImageUpload) return;
    if (!imageIsDecorative && !imageAlt.trim()) {
      setInsertError('Añade una descripción o marca la imagen como decorativa.');
      return;
    }
    const uploadToken = imageUploadToken.current + 1;
    imageUploadToken.current = uploadToken;
    setImageUploading(true);
    setInsertError('');
    try {
      const optimized = await optimizeCommercialImage(file);
      const src = normalizeImageUrl(await onImageUpload(optimized));
      if (uploadToken !== imageUploadToken.current) return;
      const selection = savedSelection.current || { from: editor.state.selection.from, to: editor.state.selection.to };
      editor.chain().focus().setTextSelection(selection).setImage({ src, alt: imageAlt.trim() }).run();
      setInsertMode(null);
      setInsertUrl('');
      setImageAlt('');
      savedSelection.current = null;
    } catch (error) {
      setInsertError(error instanceof Error ? error.message : 'No se pudo subir la imagen.');
    } finally {
      if (uploadToken === imageUploadToken.current) setImageUploading(false);
      if (imageFileRef.current) imageFileRef.current.value = '';
    }
  };

  const toolbar = (
    <div
      className="rich-editor-toolbar"
      role="toolbar"
      aria-label="Herramientas de edición"
      aria-orientation="horizontal"
      onFocusCapture={syncToolbarRovingTabStop}
      onKeyDown={navigateToolbar}
    >
      {renderGroup('Historia', 'Deshacer y rehacer', <>
        {renderToolbarButton('undo', 'Deshacer', Undo2, false, !toolbarState.canUndo, 'default', false)}
        {renderToolbarButton('redo', 'Rehacer', Redo2, false, !toolbarState.canRedo, 'default', false)}
      </>)}
      {renderGroup('Texto', 'Formato de texto', <>
        {renderToolbarButton('bold', 'Negrita', Bold, toolbarState.bold)}
        {renderToolbarButton('italic', 'Cursiva', Italic, toolbarState.italic)}
        {renderToolbarButton('underline', 'Subrayado', UnderlineIcon, toolbarState.underline)}
        {renderToolbarButton('strike', 'Tachado', Strikethrough, toolbarState.strike)}
      </>)}
      {renderGroup('Listas', 'Listas y bloques', <>
        {renderToolbarButton('bullet', 'Lista con viñetas', List, toolbarState.bullet)}
        {renderToolbarButton('ordered', 'Lista numerada', ListOrdered, toolbarState.ordered)}
      </>)}
      {renderGroup('Insertar', 'Insertar contenido', <>
        {renderToolbarButton('link', toolbarState.link ? 'Enlace en la selección' : 'Insertar enlace', Link2, insertMode === 'link' || toolbarState.link)}
        {renderToolbarButton('image', 'Insertar imagen desde enlace', ImagePlus, insertMode === 'image', false, 'default', false)}
      </>)}
      <button
        type="button"
        className={`rich-editor-more-button${showMoreFormatting ? ' is-open' : ''}`}
        aria-expanded={showMoreFormatting}
        aria-controls={`${id}-advanced-formatting`}
        data-editor-toolbar-item="more"
        tabIndex={toolbarTabStop.current === 'more' ? 0 : -1}
        onFocus={(event) => {
          toolbarTabStop.current = 'more';
          const toolbarElement = event.currentTarget.closest('.rich-editor-toolbar');
          toolbarElement?.querySelectorAll<HTMLElement>('[data-editor-toolbar-item]').forEach((item) => {
            item.tabIndex = item === event.currentTarget ? 0 : -1;
          });
        }}
        onClick={() => setShowMoreFormatting((open) => !open)}
      >
        <SlidersHorizontal size={15} aria-hidden />
        <span>Más formato</span>
        <MoreHorizontal size={15} aria-hidden />
      </button>
      {renderGroup('Bloque', 'Estilo de párrafo', <div className="rich-editor-select-wrap">
        <select
          aria-label="Estilo del bloque"
          data-editor-toolbar-item="paragraph"
          tabIndex={toolbarTabStop.current === 'paragraph' ? 0 : -1}
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
    </div>
  );

  const settings = (
    <div
      className="rich-editor-advanced"
      id={`${id}-advanced-formatting`}
      hidden={!showMoreFormatting}
      aria-label="Formato avanzado"
    >
      <div className="rich-editor-advanced-tools" role="group" aria-label="Más opciones de formato">
        {renderGroup('Alinear', 'Alineación del texto', <>
          {renderButton('left', 'Alinear a la izquierda', AlignLeft, toolbarState.left)}
          {renderButton('center', 'Centrar', AlignCenter, toolbarState.center)}
          {renderButton('right', 'Alinear a la derecha', AlignRight, toolbarState.right)}
          {renderButton('justify', 'Justificar', AlignJustify, toolbarState.justify)}
        </>)}
        {renderGroup('Otros', 'Resaltado, cita, código y limpieza', <>
          {renderButton('highlight', 'Resaltar texto', Highlighter, toolbarState.highlight)}
          {renderButton('quote', 'Cita', Quote, toolbarState.quote)}
          {renderButton('code', 'Bloque de código', Code2, toolbarState.code)}
          {renderButton('clear', 'Quitar formato', Eraser, false, false, 'danger', false)}
          {renderButton('table', 'Insertar tabla', Table2, false, false, 'default', false)}
        </>)}
      </div>
      {toolbarState.inTable && <div className="rich-editor-advanced-tools" role="group" aria-label="Editar tabla">
        {renderGroup('Tabla', 'Filas y columnas', <>
          {renderButton('add-row', 'Añadir fila debajo', Rows3, false, false, 'default', false)}
          {renderButton('add-column', 'Añadir columna a la derecha', Columns3, false, false, 'default', false)}
          {renderButton('delete-row', 'Eliminar fila', Rows3, false, false, 'danger', false)}
          {renderButton('delete-column', 'Eliminar columna', Columns3, false, false, 'danger', false)}
          {renderButton('delete-table', 'Eliminar tabla', Trash2, false, false, 'danger', false)}
        </>)}
      </div>}
      <div className="rich-editor-settings" role="group" aria-label="Tipografía y color">
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
      {toolbarState.ordered && <div className="rich-editor-setting rich-editor-setting-list">
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
      </div>}
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
          if (insertMode === 'image' && !imageIsDecorative && !imageAlt.trim()) {
            throw new Error('Añade una descripción o marca la imagen como decorativa.');
          }
          const url = insertMode === 'image' ? normalizeImageUrl(insertUrl) : normalizeWebUrl(insertUrl);
          const selection = savedSelection.current || { from: editor.state.selection.from, to: editor.state.selection.to };
          const chain = editor.chain().focus().setTextSelection(selection);
          if (insertMode === 'link') {
            if (selection.from === selection.to) chain.setLink({ href: url }).insertContent(url).run();
            else chain.setLink({ href: url }).run();
          } else {
            chain.setImage({ src: url, alt: imageAlt.trim() }).run();
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
      <div className="rich-editor-url-field">
        <label htmlFor={`${id}-insert-url`}>{insertMode === 'link' ? 'Dirección del enlace' : 'Dirección de la imagen'}</label>
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
        {insertMode === 'image' && (
          <label className="rich-editor-alt-field" htmlFor={`${id}-image-alt`}>
            <span>Texto alternativo</span>
            <input
              id={`${id}-image-alt`}
              type="text"
              value={imageAlt}
              maxLength={240}
              required={!imageIsDecorative}
              disabled={imageIsDecorative}
              onChange={(event) => setImageAlt(event.target.value)}
              placeholder="Describe brevemente la imagen"
            />
            <small>Describe su propósito; déjalo vacío si la imagen es decorativa.</small>
          </label>
        )}
        {insertMode === 'image' && <label className="rich-editor-decorative-toggle">
          <input
            type="checkbox"
            checked={imageIsDecorative}
            onChange={(event) => {
              setImageIsDecorative(event.target.checked);
              if (event.target.checked) setImageAlt('');
            }}
          />
          <span>La imagen es decorativa</span>
        </label>}
        {insertError && <small id={`${id}-insert-error`} role="alert">{insertError}</small>}
      </div>
      <div className="rich-editor-insert-actions">
        {insertMode === 'image' && onImageUpload && <>
          <input
            ref={imageFileRef}
            className="rich-editor-file-input"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            aria-label="Seleccionar archivo de imagen"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void uploadAndInsertImage(file);
            }}
          />
          <button className="rich-editor-upload-button" type="button" disabled={imageUploading || (!imageIsDecorative && !imageAlt.trim())} onClick={() => imageFileRef.current?.click()}>
            {imageUploading ? <LoaderCircle className="rich-editor-spinner" size={14} /> : <ImagePlus size={14} />}
            {imageUploading ? 'Subiendo…' : 'Subir imagen'}
          </button>
        </>}
        <button className="rich-editor-cancel" type="button" disabled={imageUploading} onClick={() => { imageUploadToken.current += 1; setInsertMode(null); setInsertError(''); }}>Cancelar</button>
        <button className="rich-editor-confirm" type="submit" disabled={imageUploading}><Check size={14} /> Insertar</button>
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
          ref={fullscreenTriggerRef}
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
      <BubbleMenu
        editor={editor}
        className="rich-editor-bubble-menu"
        updateDelay={100}
        shouldShow={({ editor: currentEditor, from, to }) => from !== to && !currentEditor.isActive('codeBlock')}
        aria-label="Formato de la selección"
        role="group"
      >
        {renderButton('bold', 'Negrita', Bold, toolbarState.bold)}
        {renderButton('italic', 'Cursiva', Italic, toolbarState.italic)}
        {renderButton('underline', 'Subrayado', UnderlineIcon, toolbarState.underline)}
        {renderButton('link', 'Enlace en la selección', Link2, toolbarState.link, false, 'default', false)}
      </BubbleMenu>
      <footer className="rich-editor-status" aria-label="Recuento del contenido">
        <span><FileText size={13} aria-hidden /> {toolbarState.wordCount} {toolbarState.wordCount === 1 ? 'palabra' : 'palabras'}</span>
        <span>{toolbarState.characterCount} {toolbarState.characterCount === 1 ? 'carácter' : 'caracteres'}</span>
        <span className="rich-editor-status-note">El contenido se refleja en el formulario</span>
      </footer>
    </div>
  );

  return (
    <div className={`rich-editor-shell${isFullscreen ? ' is-fullscreen' : ''}`} style={{ '--editor-min-height': `${minHeight}px` } as React.CSSProperties} onKeyDownCapture={focusEditorToolbar}>
      {!isFullscreen ? <>
        {editorHeader}
        {toolbar}
        {settings}
        {insertPanel}
        {writingSurface}
      </> : null}
      <dialog
        ref={fullscreenDialogRef}
        className="editor-fullscreen-dialog"
        aria-label={`${label}, pantalla completa`}
        onCancel={(event) => {
          event.preventDefault();
          if (insertMode) {
            setInsertMode(null);
            setInsertError('');
          } else {
            setIsFullscreen(false);
          }
        }}
        onClose={() => setIsFullscreen(false)}
      >
        {isFullscreen && <>
            <header className="rich-editor-full-head">
              <div className="rich-editor-full-heading">
                <span className="rich-editor-title-mark" aria-hidden="true"><span /></span>
                <div><span className="rich-editor-eyebrow">EDITOR DE TEXTO</span><h2>{label}</h2><p>Organiza las ideas y da formato al contenido.</p></div>
              </div>
              <button type="button" aria-label="Cerrar pantalla completa" onClick={() => setIsFullscreen(false)}><X size={17} /> <span>Cerrar</span></button>
            </header>
            {toolbar}
            {settings}
            {insertPanel}
            {writingSurface}
        </>}
      </dialog>
    </div>
  );
}
