import React, { useEffect, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Color from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { AlignCenter, AlignLeft, AlignRight, Bold, Code2, Eraser, Expand, Heading1, Heading2, Highlighter, ImagePlus, Italic, Link2, List, ListOrdered, Minus, Quote, Redo2, Strikethrough, Underline as UnderlineIcon, Undo2, X } from 'lucide-react';

const toolbarGroups = [
  { id: 'history', buttons: ['undo', 'redo'] },
  { id: 'heading', buttons: ['h1', 'h2', 'paragraph'] },
  { id: 'style', buttons: ['bold', 'italic', 'underline', 'strike', 'highlight'] },
  { id: 'lists', buttons: ['bullet', 'ordered', 'quote', 'code'] },
  { id: 'align', buttons: ['left', 'center', 'right'] },
  { id: 'insert', buttons: ['link', 'image', 'clear'] },
];

const icons = { undo: Undo2, redo: Redo2, h1: Heading1, h2: Heading2, paragraph: Minus, bold: Bold, italic: Italic, underline: UnderlineIcon, strike: Strikethrough, highlight: Highlighter, bullet: List, ordered: ListOrdered, quote: Quote, code: Code2, left: AlignLeft, center: AlignCenter, right: AlignRight, link: Link2, image: ImagePlus, clear: Eraser };

export function RichTextEditor({ value = '<p>Escribe algo con intención…</p>', onChange, placeholder = 'Escribe algo con intención…', minHeight = 230, label = 'Contenido', fullscreen = true }) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const editor = useEditor({ extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] } }), Link.configure({ openOnClick: false }), Image, TextAlign.configure({ types: ['heading', 'paragraph'] }), Underline, Highlight, TextStyle, Color], content: value, onUpdate: ({ editor: instance }) => onChange?.(instance.getHTML()), editorProps: { attributes: { class: 'rich-editor-content', 'data-placeholder': placeholder } } });
  useEffect(() => { if (editor && value !== editor.getHTML() && !editor.isFocused) editor.commands.setContent(value, false); }, [value, editor]);
  if (!editor) return null;
  const run = (action) => {
    const chain = editor.chain().focus();
    if (action === 'undo') chain.undo().run(); else if (action === 'redo') chain.redo().run(); else if (action === 'h1') chain.toggleHeading({ level: 1 }).run(); else if (action === 'h2') chain.toggleHeading({ level: 2 }).run(); else if (action === 'paragraph') chain.setParagraph().run(); else if (action === 'bold') chain.toggleBold().run(); else if (action === 'italic') chain.toggleItalic().run(); else if (action === 'underline') chain.toggleUnderline().run(); else if (action === 'strike') chain.toggleStrike().run(); else if (action === 'highlight') chain.toggleHighlight().run(); else if (action === 'bullet') chain.toggleBulletList().run(); else if (action === 'ordered') chain.toggleOrderedList().run(); else if (action === 'quote') chain.toggleBlockquote().run(); else if (action === 'code') chain.toggleCodeBlock().run(); else if (action === 'left') chain.setTextAlign('left').run(); else if (action === 'center') chain.setTextAlign('center').run(); else if (action === 'right') chain.setTextAlign('right').run(); else if (action === 'clear') chain.clearNodes().unsetAllMarks().run(); else if (action === 'link') { const href = window.prompt('Pega el enlace'); if (href) chain.setLink({ href }).run(); } else if (action === 'image') { const src = window.prompt('URL de la imagen'); if (src) chain.setImage({ src }).run(); }
  };
  return <div className={`rich-editor-shell ${isFullscreen ? 'is-fullscreen' : ''}`} style={{ '--editor-min-height': `${minHeight}px` }}><div className="rich-editor-head"><span>{label}</span><div><button type="button" onClick={() => setIsFullscreen(true)} title="Abrir en pantalla completa"><Expand size={15} /> <small>Expandir</small></button></div></div><div className="rich-editor-toolbar">{toolbarGroups.map((group) => <div className="rich-toolbar-group" key={group.id}>{group.buttons.map((action) => { const Icon = icons[action]; const activeAction = action === 'h1' || action === 'h2' ? 'heading' : action === 'bullet' ? 'bulletList' : action === 'ordered' ? 'orderedList' : action === 'quote' ? 'blockquote' : action; return <button type="button" key={action} onClick={() => run(action)} className={editor.isActive(activeAction) ? 'is-active' : ''} title={action}><Icon size={15} /></button>; })}</div>)}</div>{!isFullscreen && <EditorContent editor={editor} />}{isFullscreen && <div className="editor-fullscreen-overlay"><div className="editor-fullscreen-inner"><div className="rich-editor-full-head"><div><span className="eyebrow orange">Editor enriquecido</span><h2>{label}</h2></div><button type="button" onClick={() => setIsFullscreen(false)}><X size={18} /> Cerrar</button></div><div className="rich-editor-toolbar">{toolbarGroups.map((group) => <div className="rich-toolbar-group" key={group.id}>{group.buttons.map((action) => { const Icon = icons[action]; return <button type="button" key={action} onClick={() => run(action)} title={action}><Icon size={16} /></button>; })}</div>)}</div><EditorContent editor={editor} /></div></div>}</div>;
}
