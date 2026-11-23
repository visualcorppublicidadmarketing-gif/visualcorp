export type ProductModelKind =
  | 'apparel'
  | 'mug'
  | 'cap'
  | 'tote'
  | 'sign'
  | 'rollup'
  | 'banner-x'
  | 'banner-a'
  | 'custom';

export type PrintArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ProductBase = {
  id: string;
  name: string;
  family: string;
  image: string;
  quoteProduct: string;
  ratio: number;
  model: ProductModelKind;
  printArea: PrintArea;
  defaultX: number;
  defaultY: number;
  defaultSize: number;
  hint: string;
  isCustom?: boolean;
};

export type DesignLayer = {
  id: string;
  kind: 'image' | 'text' | 'rectangle' | 'circle' | 'triangle';
  name: string;
  src?: string;
  text?: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
  opacity: number;
  color: string;
  fontFamily: string;
  visible: boolean;
  locked: boolean;
};
