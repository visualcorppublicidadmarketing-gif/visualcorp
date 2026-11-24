import { useEffect, useMemo, useRef, useState } from 'react';
import Konva from 'konva';
import {
  Circle,
  Ellipse,
  Group,
  Image as CanvasImage,
  Layer as CanvasLayer,
  Line,
  Rect,
  RegularPolygon,
  Stage,
  Star,
  Text,
  Transformer,
} from 'react-konva';
import {
  blendModeToCompositeOp,
  buildProcessedProductCanvas,
  drawSceneBackground,
} from './canvas-utils';
import type {
  DesignLayer,
  PrintArea,
  ProductAppearance,
  ProductBase,
  SceneBackground,
} from './types';

type CanvasSize = { width: number; height: number };

function useImageElement(src?: string) {
  const [loadedImage, setLoadedImage] = useState<{ src: string; image: HTMLImageElement | null } | null>(null);

  useEffect(() => {
    if (!src) {
      setLoadedImage(null);
      return undefined;
    }

    const nextImage = new window.Image();
    nextImage.crossOrigin = 'anonymous';
    nextImage.onload = () => setLoadedImage({ src, image: nextImage });
    nextImage.onerror = () => setLoadedImage({ src, image: null });
    nextImage.src = src;
    return () => {
      nextImage.onload = null;
      nextImage.onerror = null;
    };
  }, [src]);

  // A previous product image can remain in state while the next URL loads.
  // Never let that stale image be processed or cached under the new product's key.
  return loadedImage && loadedImage.src === src ? loadedImage.image : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function useCurvedTextCanvas(
  text: string,
  width: number,
  fontSize: number,
  fontFamily: string,
  fontWeight: 'normal' | 'bold',
  color: string,
  strokeColor: string,
  strokeWidth: number,
  letterSpacing: number,
  textShadow: boolean,
  curve: number,
) {
  return useMemo(() => {
    if (Math.abs(curve) < 4 || !text || text.includes('\n')) return null;
    const pad = Math.max(24, Math.round(fontSize * 1.35));
    const measureCanvas = document.createElement('canvas');
    const measureCtx = measureCanvas.getContext('2d');
    const fontDecl = `${fontWeight === 'normal' ? '500' : '800'} ${fontSize}px "${fontFamily || 'DM Sans'}", Arial, sans-serif`;
    let measuredTotalW = width;
    if (measureCtx) {
      measureCtx.font = fontDecl;
      measuredTotalW = [...text].reduce((sum, ch) => sum + measureCtx.measureText(ch).width + letterSpacing, 0);
    }
    const cw = Math.max(64, Math.round(Math.max(width, measuredTotalW * 1.08) + pad * 2));
    const ch = Math.max(64, Math.round(Math.max(width * 0.56, fontSize * 3.2) + pad * 2));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.translate(cw / 2, ch / 2);
    ctx.fillStyle = color;
    ctx.font = fontDecl;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (textShadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.48)';
      ctx.shadowBlur = Math.max(4, fontSize * 0.24);
      ctx.shadowOffsetY = Math.max(1, fontSize * 0.07);
    }

    const chars = [...text];
    const isRainbow = curve >= 0;
    const radius = Math.max(width * 0.35, width * (110 / Math.max(12, Math.abs(curve))) * 0.42);
    const widths = chars.map((ch) => ctx.measureText(ch).width + letterSpacing);
    const totalW = widths.reduce((sum, item) => sum + item, 0);
    const totalAngle = totalW / radius;

    if (isRainbow) {
      ctx.translate(0, radius);
      let cursor = -totalAngle / 2;
      chars.forEach((ch, idx) => {
        const charW = widths[idx];
        const angle = cursor + (charW / 2) / radius;
        ctx.save();
        ctx.rotate(angle);
        ctx.translate(0, -radius);
        if (strokeWidth > 0) {
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = strokeWidth;
          ctx.lineJoin = 'round';
          ctx.strokeText(ch, 0, 0);
        }
        ctx.fillText(ch, 0, 0);
        ctx.restore();
        cursor += charW / radius;
      });
    } else {
      ctx.translate(0, -radius);
      let cursor = totalAngle / 2;
      chars.forEach((ch, idx) => {
        const charW = widths[idx];
        const angle = cursor - (charW / 2) / radius;
        ctx.save();
        ctx.rotate(angle);
        ctx.translate(0, radius);
        if (strokeWidth > 0) {
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = strokeWidth;
          ctx.lineJoin = 'round';
          ctx.strokeText(ch, 0, 0);
        }
        ctx.fillText(ch, 0, 0);
        ctx.restore();
        cursor -= charW / radius;
      });
    }

    return canvas;
  }, [text, width, fontSize, fontFamily, fontWeight, color, strokeColor, strokeWidth, letterSpacing, textShadow, curve]);
}

function LayerObject({
  layer,
  size,
  printArea,
  selected,
  onSelect,
  onCommit,
  onSnapChange,
}: {
  layer: DesignLayer;
  size: CanvasSize;
  printArea: PrintArea;
  selected: boolean;
  onSelect: (id: string) => void;
  onCommit: (id: string, changes: Partial<DesignLayer>) => void;
  onSnapChange: (guides: { x: boolean; y: boolean }) => void;
}) {
  const image = useImageElement(layer.kind === 'image' ? layer.src : undefined);
  const width = (layer.size / 100) * size.width;
  const aspectScaleY = layer.scaleY ?? 1;
  const defaultAspect =
    layer.kind === 'circle' || layer.kind === 'star'
      ? 1
      : layer.kind === 'triangle'
        ? 0.86
        : layer.kind === 'line'
          ? 0.08
          : 0.56;
  const height = layer.kind === 'image' && image
    ? width * (image.naturalHeight / Math.max(1, image.naturalWidth)) * aspectScaleY
    : Math.max(6, width * defaultAspect * aspectScaleY);

  const x = (layer.x / 100) * size.width;
  const y = (layer.y / 100) * size.height;
  const fontSize = Math.max(13, width * 0.25);
  const strokeWidthPx = (layer.strokeWidth ?? 0) * (size.width / 640);
  const strokeColor = layer.strokeColor || '#000000';
  const spacingPx = (layer.letterSpacing ?? 0) * (size.width / 640);
  const compositeOp = blendModeToCompositeOp(layer.blendMode);

  const curvedTextCanvas = useCurvedTextCanvas(
    layer.kind === 'text' ? layer.text || '' : '',
    width,
    fontSize,
    layer.fontFamily || 'DM Sans',
    layer.fontWeight || 'bold',
    layer.color,
    strokeColor,
    strokeWidthPx,
    spacingPx,
    Boolean(layer.textShadow),
    layer.kind === 'text' ? layer.textCurve ?? 0 : 0,
  );

  const centerPrintX = ((printArea.x + printArea.width / 2) / 100) * size.width;
  const centerPrintY = ((printArea.y + printArea.height / 2) / 100) * size.height;

  const clipFunc = useMemo(() => {
    const shape = layer.clipShape;
    if (!shape || shape === 'none') return undefined;
    return (ctx: Konva.Context) => {
      if (shape === 'circle') {
        ctx.arc(0, 0, Math.min(width, height) / 2, 0, Math.PI * 2, false);
      } else {
        const r = shape === 'pill' ? Math.min(width, height) / 2 : Math.min(width, height) * 0.16;
        const left = -width / 2;
        const top = -height / 2;
        ctx.beginPath();
        ctx.moveTo(left + r, top);
        ctx.lineTo(left + width - r, top);
        ctx.quadraticCurveTo(left + width, top, left + width, top + r);
        ctx.lineTo(left + width, top + height - r);
        ctx.quadraticCurveTo(left + width, top + height, left + width - r, top + height);
        ctx.lineTo(left + r, top + height);
        ctx.quadraticCurveTo(left, top + height, left, top + height - r);
        ctx.lineTo(left, top + r);
        ctx.quadraticCurveTo(left, top, left + r, top);
        ctx.closePath();
      }
    };
  }, [layer.clipShape, width, height]);

  return (
    <Group
      id={`design-${layer.id}`}
      x={x}
      y={y}
      rotation={layer.rotation}
      scaleX={layer.flipX ? -1 : 1}
      scaleY={layer.flipY ? -1 : 1}
      opacity={clamp(layer.opacity, 0, 100) / 100}
      draggable={!layer.locked}
      onClick={() => onSelect(layer.id)}
      onTap={() => onSelect(layer.id)}
      onDragStart={() => onSelect(layer.id)}
      dragBoundFunc={(position) => {
        const minX = (printArea.x / 100) * size.width;
        const maxX = ((printArea.x + printArea.width) / 100) * size.width;
        const minY = (printArea.y / 100) * size.height;
        const maxY = ((printArea.y + printArea.height) / 100) * size.height;
        let nextX = clamp(position.x, minX, maxX);
        let nextY = clamp(position.y, minY, maxY);
        const snapThreshold = Math.max(5, size.width * 0.014);
        const snapX = Math.abs(nextX - centerPrintX) <= snapThreshold;
        const snapY = Math.abs(nextY - centerPrintY) <= snapThreshold;
        if (snapX) nextX = centerPrintX;
        if (snapY) nextY = centerPrintY;
        onSnapChange({ x: snapX, y: snapY });
        return { x: nextX, y: nextY };
      }}
      onDragEnd={(event) => {
        onSnapChange({ x: false, y: false });
        onCommit(layer.id, {
          x: clamp((event.target.x() / size.width) * 100, printArea.x, printArea.x + printArea.width),
          y: clamp((event.target.y() / size.height) * 100, printArea.y, printArea.y + printArea.height),
        });
      }}
      onTransformEnd={(event) => {
        const node = event.target;
        const rawScaleX = Math.abs(node.scaleX());
        const rawScaleY = Math.abs(node.scaleY());
        const uniformScale = Math.max(0.12, Math.min(rawScaleX, rawScaleY));
        node.scaleX(layer.flipX ? -1 : 1);
        node.scaleY(layer.flipY ? -1 : 1);
        onCommit(layer.id, {
          x: clamp((node.x() / size.width) * 100, printArea.x, printArea.x + printArea.width),
          y: clamp((node.y() / size.height) * 100, printArea.y, printArea.y + printArea.height),
          size: clamp(layer.size * uniformScale, 4, 85),
          rotation: Math.round(node.rotation()),
        });
      }}
      visible={layer.visible}
      listening
      name="design-object"
    >
      {layer.kind === 'image' && image && (
        <Group clipFunc={clipFunc}>
          <CanvasImage
            image={image}
            x={-width / 2}
            y={-height / 2}
            width={width}
            height={height}
            globalCompositeOperation={compositeOp}
          />
        </Group>
      )}
      {layer.kind === 'text' && curvedTextCanvas && (
        <CanvasImage
          image={curvedTextCanvas}
          x={-curvedTextCanvas.width / 2}
          y={-curvedTextCanvas.height / 2}
          width={curvedTextCanvas.width}
          height={curvedTextCanvas.height}
          globalCompositeOperation={compositeOp}
        />
      )}
      {layer.kind === 'text' && !curvedTextCanvas && (
        <Text
          x={-width / 2}
          y={-height / 2}
          width={width}
          height={height}
          text={layer.text || ''}
          fontFamily={layer.fontFamily || 'DM Sans'}
          fontSize={fontSize}
          fontStyle={layer.fontWeight === 'normal' ? 'normal' : 'bold'}
          letterSpacing={spacingPx}
          align="center"
          verticalAlign="middle"
          lineHeight={1.14}
          wrap="word"
          fill={layer.color}
          stroke={strokeWidthPx > 0 ? strokeColor : undefined}
          strokeWidth={strokeWidthPx > 0 ? strokeWidthPx : undefined}
          shadowColor={layer.textShadow ? 'rgba(0,0,0,0.5)' : undefined}
          shadowBlur={layer.textShadow ? Math.max(4, fontSize * 0.24) : 0}
          shadowOffsetY={layer.textShadow ? Math.max(1, fontSize * 0.08) : 0}
          globalCompositeOperation={compositeOp}
        />
      )}
      {layer.kind === 'rectangle' && (
        <Rect
          x={-width / 2}
          y={-height / 2}
          width={width}
          height={height}
          fill={layer.color}
          stroke={strokeWidthPx > 0 ? strokeColor : undefined}
          strokeWidth={strokeWidthPx > 0 ? strokeWidthPx : undefined}
          cornerRadius={clamp((layer.cornerRadius ?? 10) * (size.width / 640), 0, Math.min(width, height) / 2)}
          globalCompositeOperation={compositeOp}
        />
      )}
      {layer.kind === 'badge' && (
        <Rect
          x={-width / 2}
          y={-height / 2}
          width={width}
          height={height}
          fill={layer.color}
          stroke={strokeWidthPx > 0 ? strokeColor : undefined}
          strokeWidth={strokeWidthPx > 0 ? strokeWidthPx : undefined}
          cornerRadius={height / 2}
          globalCompositeOperation={compositeOp}
        />
      )}
      {layer.kind === 'line' && (
        <Rect
          x={-width / 2}
          y={-height / 2}
          width={width}
          height={height}
          fill={layer.color}
          cornerRadius={height / 2}
          globalCompositeOperation={compositeOp}
        />
      )}
      {layer.kind === 'circle' && (
        aspectScaleY === 1 ? (
          <Circle
            radius={width / 2}
            fill={layer.color}
            stroke={strokeWidthPx > 0 ? strokeColor : undefined}
            strokeWidth={strokeWidthPx > 0 ? strokeWidthPx : undefined}
            globalCompositeOperation={compositeOp}
          />
        ) : (
          <Ellipse
            radiusX={width / 2}
            radiusY={height / 2}
            fill={layer.color}
            stroke={strokeWidthPx > 0 ? strokeColor : undefined}
            strokeWidth={strokeWidthPx > 0 ? strokeWidthPx : undefined}
            globalCompositeOperation={compositeOp}
          />
        )
      )}
      {layer.kind === 'triangle' && (
        <RegularPolygon
          sides={3}
          radius={width / 2}
          fill={layer.color}
          stroke={strokeWidthPx > 0 ? strokeColor : undefined}
          strokeWidth={strokeWidthPx > 0 ? strokeWidthPx : undefined}
          globalCompositeOperation={compositeOp}
        />
      )}
      {layer.kind === 'star' && (
        <Star
          numPoints={5}
          innerRadius={width * 0.22}
          outerRadius={width / 2}
          fill={layer.color}
          stroke={strokeWidthPx > 0 ? strokeColor : undefined}
          strokeWidth={strokeWidthPx > 0 ? strokeWidthPx : undefined}
          globalCompositeOperation={compositeOp}
        />
      )}
      {selected && (
        <Rect
          x={-width / 2}
          y={-height / 2}
          width={width}
          height={height}
          stroke="#f00085"
          strokeWidth={1.5}
          dash={[5, 4]}
          listening={false}
        />
      )}
    </Group>
  );
}

export function ProductDesignCanvas({
  product,
  layers,
  selectedLayerId,
  printArea,
  appearance,
  background,
  showPrintGuides = true,
  width,
  height,
  onSelectLayer,
  onCommitLayer,
  onClearSelection,
}: {
  product: ProductBase;
  layers: DesignLayer[];
  selectedLayerId: string;
  printArea: PrintArea;
  appearance: ProductAppearance;
  background: SceneBackground;
  showPrintGuides?: boolean;
  width: number;
  height: number;
  onSelectLayer: (id: string) => void;
  onCommitLayer: (id: string, changes: Partial<DesignLayer>) => void;
  onClearSelection: () => void;
}) {
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const productImage = useImageElement(product.isCustom3D ? undefined : product.image);
  const bgImage = useImageElement(background.kind === 'image' ? background.imageSrc : undefined);
  const [snapGuides, setSnapGuides] = useState({ x: false, y: false });
  const size = { width, height };

  const backgroundCanvas = useMemo(() => {
    if (width < 1 || height < 1) return null;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    drawSceneBackground(ctx, canvas.width, canvas.height, background, bgImage, true);
    return canvas;
  }, [width, height, background, bgImage]);

  const processedProductCanvas = useMemo(() => {
    if (!productImage || product.isCustom3D) return null;
    const extractBackdrop = background.kind !== 'solid' || background.color.toLowerCase() !== '#ffffff';
    return buildProcessedProductCanvas(productImage, product.image, appearance, extractBackdrop, 960);
  }, [productImage, product.image, product.isCustom3D, appearance.mode, appearance.color, background.kind, background.color]);

  useEffect(() => {
    const transformer = transformerRef.current;
    const stage = stageRef.current;
    if (!transformer || !stage) return;
    const selected = selectedLayerId ? stage.findOne(`#design-${selectedLayerId}`) : undefined;
    transformer.nodes(selected ? [selected] : []);
    transformer.getLayer()?.batchDraw();
  }, [layers, selectedLayerId, width, height]);

  const handleStagePointer = (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (event.target === event.target.getStage()) onClearSelection();
  };

  if (width < 1 || height < 1) {
    return <div className="vc-product-canvas-loading" role="status">Preparando lienzo…</div>;
  }

  const areaX = (printArea.x / 100) * width;
  const areaY = (printArea.y / 100) * height;
  const areaW = (printArea.width / 100) * width;
  const areaH = (printArea.height / 100) * height;
  const centerPrintX = areaX + areaW / 2;
  const centerPrintY = areaY + areaH / 2;

  return (
    <Stage
      ref={stageRef}
      width={width}
      height={height}
      className="vc-product-konva-stage"
      onMouseDown={handleStagePointer}
      onTouchStart={handleStagePointer}
      style={{ touchAction: 'none', display: 'block', maxWidth: '100%' }}
      aria-label={`Lienzo editable de ${product.name}`}
    >
      <CanvasLayer>
        {backgroundCanvas && <CanvasImage image={backgroundCanvas} x={0} y={0} width={width} height={height} listening={false} />}
        {processedProductCanvas && (
          <CanvasImage image={processedProductCanvas} x={0} y={0} width={width} height={height} listening={false} />
        )}
        {product.isCustom3D && (
          <Rect
            x={areaX}
            y={areaY}
            width={areaW}
            height={areaH}
            fill="rgba(255, 255, 255, 0.08)"
            cornerRadius={12}
            listening={false}
          />
        )}
        <Rect x={0} y={0} width={width} height={height} fill="#ffffff" opacity={0.005} listening={false} />

        <Group clipX={areaX} clipY={areaY} clipWidth={areaW} clipHeight={areaH}>
          {layers.map((layer) => (
            <LayerObject
              key={layer.id}
              layer={layer}
              size={size}
              printArea={printArea}
              selected={layer.id === selectedLayerId}
              onSelect={onSelectLayer}
              onCommit={onCommitLayer}
              onSnapChange={setSnapGuides}
            />
          ))}
        </Group>

        {showPrintGuides && (
          <>
            <Rect
              x={areaX}
              y={areaY}
              width={areaW}
              height={areaH}
              stroke="#4de1ff"
              strokeWidth={1.5}
              dash={[6, 5]}
              listening={false}
            />
            {appearance.warpMode !== 'flat' && appearance.warpStrength > 5 && (
              <>
                <Line
                  points={[areaX + areaW * 0.25, areaY, areaX + areaW * 0.25, areaY + areaH]}
                  stroke="rgba(77, 225, 255, 0.28)"
                  strokeWidth={1}
                  dash={[3, 4]}
                  listening={false}
                />
                <Line
                  points={[areaX + areaW * 0.75, areaY, areaX + areaW * 0.75, areaY + areaH]}
                  stroke="rgba(77, 225, 255, 0.28)"
                  strokeWidth={1}
                  dash={[3, 4]}
                  listening={false}
                />
              </>
            )}
          </>
        )}

        {snapGuides.x && (
          <Line
            points={[centerPrintX, areaY, centerPrintX, areaY + areaH]}
            stroke="#f00085"
            strokeWidth={1.25}
            dash={[4, 3]}
            listening={false}
          />
        )}
        {snapGuides.y && (
          <Line
            points={[areaX, centerPrintY, areaX + areaW, centerPrintY]}
            stroke="#f00085"
            strokeWidth={1.25}
            dash={[4, 3]}
            listening={false}
          />
        )}

        <Transformer
          ref={transformerRef}
          rotateEnabled
          keepRatio
          flipEnabled={false}
          padding={7}
          rotateAnchorOffset={26}
          anchorSize={9}
          anchorCornerRadius={5}
          borderStroke="#f00085"
          anchorStroke="#f00085"
          anchorFill="#ffffff"
          boundBoxFunc={(oldBox, nextBox) => (nextBox.width < 16 || nextBox.height < 16 ? oldBox : nextBox)}
        />
      </CanvasLayer>
    </Stage>
  );
}
