import type { ComponentType, CSSProperties } from 'react';

type OriginkitSingleGlassKeyboardProps = {
  background?: string;
  legend?: string;
  mark?: string;
  legendColor?: string;
  size?: number;
  advanced?: { grain?: number; vignette?: number };
  style?: CSSProperties;
};

declare const OriginkitSingleGlassKeyboard: ComponentType<OriginkitSingleGlassKeyboardProps>;

export default OriginkitSingleGlassKeyboard;
