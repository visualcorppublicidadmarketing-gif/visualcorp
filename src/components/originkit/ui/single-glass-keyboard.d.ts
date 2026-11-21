import type { ComponentType, CSSProperties } from 'react';

type OriginkitSingleGlassKeyboardProps = {
  background?: string;
  legend?: string;
  mark?: string;
  legendColor?: string;
  advanced?: { grain?: number; vignette?: number };
  style?: CSSProperties;
};

declare const OriginkitSingleGlassKeyboard: ComponentType<OriginkitSingleGlassKeyboardProps>;

export default OriginkitSingleGlassKeyboard;
