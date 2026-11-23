import { useEffect, useRef, useState } from 'react';
import Konva from 'konva';
import {
  Circle,
  Group,
  Image as CanvasImage,
  Layer as CanvasLayer,
  Rect,
  RegularPolygon,
  Stage,
  Text,
  Transformer,
} from 'react-konva';
import type { DesignLayer, PrintArea, ProductBase } from './types';

type CanvasSize = { width: number; height: number };

function useImageElement(src?: string) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!src) {
      setImage(null);
      return undefined;
    }

    const nextImage = new window.Image();
    nextImage.onload = () => setImage(nextImage);
    nextImage.onerror = () => setImage(null);
    nextImage.src = src;
    return () => {
      nextImage.onload = null;
      nextImage.onerror = null;
    };
  }, [src]);

  return image;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function LayerObject({
  layer,
  size,
  printArea,
  selected,
  onSelect,
  onCommit,
}: {
  layer: DesignLayer;
  size: CanvasSize;
  printArea: PrintArea;
  selected: boolean;
  onSelect: (id: string) => void;
  onCommit: (id: string, changes: Partial<DesignLayer>) => void;
}) {
  const image = useImageElement(layer.kind === 'image' ? layer.src : undefined);
  const width = (layer.size / 100) * size.width;
  const height = layer.kind === 'image' && image
    ? width * image.naturalHeight / Math.max(1, image.naturalWidth)
    : width * (layer.kind === 'circle' ? 1 : layer.kind === 'triangle' ? 0.86 : 0.56);
  const x = (layer.x / 100) * size.width;
  const y = (layer.y / 100) * size.height;

  return (
    <Group
      id={`design-${layer.id}`}
      x={x}
      y={y}
      rotation={layer.rotation}
      opacity={layer.opacity / 100}
      draggable={!layer.locked}
      onClick={() => onSelect(layer.id)}
      onTap={() => onSelect(layer.id)}
      onDragStart={() => onSelect(layer.id)}
      onDragEnd={(event) => onCommit(layer.id, {
        x: clamp(event.target.x() / size.width * 100, printArea.x, printArea.x + printArea.width),
        y: clamp(event.target.y() / size.height * 100, printArea.y, printArea.y + printArea.height),
      })}
      dragBoundFunc={(position) => ({
        x: clamp(position.x, (printArea.x / 100) * size.width, ((printArea.x + printArea.width) / 100) * size.width),
        y: clamp(position.y, (printArea.y / 100) * size.height, ((printArea.y + printArea.height) / 100) * size.height),
      })}
      onTransformEnd={(event) => {
        const node = event.target;
        const scale = Math.max(0.12, Math.min(node.scaleX(), node.scaleY()));
        node.scaleX(1);
        node.scaleY(1);
        onCommit(layer.id, {
          x: clamp(node.x() / size.width * 100, printArea.x, printArea.x + printArea.width),
          y: clamp(node.y() / size.height * 100, printArea.y, printArea.y + printArea.height),
          size: Math.max(5, Math.min(65, layer.size * scale)),
          rotation: Math.round(node.rotation()),
        });
      }}
      visible={layer.visible}
      listening
      name="design-object"
    >
      {layer.kind === 'image' && image && (
        <CanvasImage image={image} x={-width / 2} y={-height / 2} width={width} height={height} />
      )}
      {layer.kind === 'text' && (
        <Text
          x={-width / 2}
          y={-height / 2}
          width={width}
          height={height}
          text={layer.text || ''}
          fontFamily={layer.fontFamily || 'DM Sans'}
          fontSize={Math.max(14, width * 0.28)}
          fontStyle="bold"
          align="center"
          verticalAlign="middle"
          lineHeight={1.1}
          wrap="word"
          fill={layer.color}
        />
      )}
      {layer.kind === 'rectangle' && (
        <Rect x={-width / 2} y={-height / 2} width={width} height={height} fill={layer.color} cornerRadius={Math.min(12, height * 0.1)} />
      )}
      {layer.kind === 'circle' && <Circle radius={width / 2} fill={layer.color} />}
      {layer.kind === 'triangle' && <RegularPolygon sides={3} radius={width / 2} fill={layer.color} />}
      {selected && <Rect x={-width / 2} y={-height / 2} width={width} height={height} stroke="#f00085" strokeWidth={1.5} dash={[5, 4]} listening={false} />}
    </Group>
  );
}

export function ProductDesignCanvas({
  product,
  layers,
  selectedLayerId,
  printArea,
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
  width: number;
  height: number;
  onSelectLayer: (id: string) => void;
  onCommitLayer: (id: string, changes: Partial<DesignLayer>) => void;
  onClearSelection: () => void;
}) {
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const productImage = useImageElement(product.image);
  const size = { width, height };

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

  if (width < 1 || height < 1) return <div className="vc-product-canvas-loading" role="status">Preparando lienzo…</div>;

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
        {productImage && <CanvasImage image={productImage} x={0} y={0} width={width} height={height} listening={false} />}
        <Rect x={0} y={0} width={width} height={height} fill="#ffffff" opacity={0.01} listening={false} />
        <Group
          clipX={(printArea.x / 100) * width}
          clipY={(printArea.y / 100) * height}
          clipWidth={(printArea.width / 100) * width}
          clipHeight={(printArea.height / 100) * height}
        >
          {layers.map((layer) => (
            <LayerObject
              key={layer.id}
              layer={layer}
              size={size}
              printArea={printArea}
              selected={layer.id === selectedLayerId}
              onSelect={onSelectLayer}
              onCommit={onCommitLayer}
            />
          ))}
        </Group>
        <Rect
          x={(printArea.x / 100) * width}
          y={(printArea.y / 100) * height}
          width={(printArea.width / 100) * width}
          height={(printArea.height / 100) * height}
          stroke="#4de1ff"
          strokeWidth={1.5}
          dash={[6, 5]}
          listening={false}
        />
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
          boundBoxFunc={(oldBox, nextBox) => (nextBox.width < 18 || nextBox.height < 18 ? oldBox : nextBox)}
        />
      </CanvasLayer>
    </Stage>
  );
}
