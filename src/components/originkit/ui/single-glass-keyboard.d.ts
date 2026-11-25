import type { ComponentType, CSSProperties } from 'react';

type OriginkitSingleGlassKeyboardProps = {
  background?: string;
  legend?: string;
  mark?: string;
  legendColor?: string;
  size?: number;
  advanced?: { grain?: number; vignette?: number; hover?: number };
  followPointerOutside?: boolean;
  style?: CSSProperties;
};

declare const OriginkitSingleGlassKeyboard: ComponentType<OriginkitSingleGlassKeyboardProps>;

export default OriginkitSingleGlassKeyboard;
