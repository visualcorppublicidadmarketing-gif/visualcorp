import React, { useEffect } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import { OrderedList } from '@tiptap/extension-list';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Color from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';

export function RichTextContent({ html = '' }: { html?: string }) {
  const editor = useEditor({
    editable: false,
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, orderedList: false }),
      OrderedList.extend({
        addAttributes() {
          return { listStyleType: {
            default: 'decimal',
            parseHTML: (element) => element.style.listStyleType || 'decimal',
            renderHTML: (attributes) => ({ style: `list-style-type:${attributes.listStyleType || 'decimal'}` }),
          } };
        },
      }),
      Link.configure({ openOnClick: true, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Underline,
      Highlight.configure({ multicolor: true }),
      TextStyle.extend({
        addAttributes() {
          return {
            fontFamily: { default: null, parseHTML: (element) => element.style.fontFamily?.replaceAll('"', '') || null, renderHTML: (attributes) => attributes.fontFamily ? { style: `font-family:${attributes.fontFamily}` } : {} },
            fontSize: { default: null, parseHTML: (element) => element.style.fontSize || null, renderHTML: (attributes) => attributes.fontSize ? { style: `font-size:${attributes.fontSize}` } : {} },
          };
        },
      }),
      Color,
    ],
    content: html || '<p></p>',
    editorProps: { attributes: { class: 'commercial-rich-content' } },
  });
  useEffect(() => { if (editor && editor.getHTML() !== (html || '<p></p>')) editor.commands.setContent(html || '<p></p>', { emitUpdate: false }); }, [editor, html]);
  if (!editor) return null;
  return <EditorContent editor={editor}/>;
}
