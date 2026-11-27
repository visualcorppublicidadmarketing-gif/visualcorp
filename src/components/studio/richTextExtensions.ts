import type { Extensions } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import { OrderedList } from '@tiptap/extension-list';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Color from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { TableKit } from '@tiptap/extension-table';

const OrderedListWithStyle = OrderedList.extend({
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

const StyledText = TextStyle.extend({
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
});

export function createRichTextExtensions({ readOnly = false }: { readOnly?: boolean } = {}): Extensions {
  return [
    StarterKit.configure({ heading: { levels: [1, 2, 3] }, orderedList: false, link: false, underline: false }),
    OrderedListWithStyle,
    Link.configure({
      openOnClick: readOnly,
      HTMLAttributes: readOnly ? { rel: 'noopener noreferrer', target: '_blank' } : {},
    }),
    Image.configure({ allowBase64: false }),
    TableKit.configure({ table: { HTMLAttributes: { class: 'rich-text-table' } } }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Underline,
    Highlight.configure({ multicolor: true }),
    StyledText,
    Color,
  ];
}
