import React, { useEffect } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { createRichTextExtensions } from '../studio/richTextExtensions';
import { sanitizeRichTextHtml } from '../studio/richTextHtml';
import './rich-text-content.css';

export function RichTextContent({ html = '' }: { html?: string }) {
  const editor = useEditor({
    editable: false,
    immediatelyRender: false,
    extensions: createRichTextExtensions({ readOnly: true }),
    content: sanitizeRichTextHtml(html),
    editorProps: { attributes: { class: 'commercial-rich-content' } },
  });
  useEffect(() => {
    const safeHtml = sanitizeRichTextHtml(html);
    if (editor && editor.getHTML() !== safeHtml) editor.commands.setContent(safeHtml, { emitUpdate: false });
  }, [editor, html]);
  if (!editor) return null;
  return <EditorContent editor={editor}/>;
}
