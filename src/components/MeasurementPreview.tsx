import React from 'react';
import './measurement-preview.css';

const measure = new Intl.NumberFormat('es-EC', { maximumFractionDigits: 2 });

export function MeasurementPreview({ widthCm, heightCm, pieces = 1 }: { widthCm: number; heightCm: number; pieces?: number }) {
  const width = Number(widthCm);
  const height = Number(heightCm);
  const quantity = Math.max(1, Number(pieces) || 1);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const ratio = Math.min(4, Math.max(0.25, width / height));
  const shapeWidth = Math.min(250, 110 * ratio);
  const area = width * height / 10_000;
  const totalArea = area * quantity;
  const perimeter = (2 * (width + height)) / 100;

  return <section className="measurement-preview" aria-label={`Vista proporcional de ${measure.format(width)} por ${measure.format(height)} centímetros`}>
    <div className="measurement-preview-heading"><span>Formato y proporción</span><b>{measure.format(width / height)} : 1</b></div>
    <div className="measurement-preview-canvas"><div className="measurement-preview-shape" style={{ width: `${shapeWidth}px`, aspectRatio: String(ratio) }}><span>{measure.format(width)} × {measure.format(height)} cm</span><b>{measure.format(area)} m²</b></div></div>
    <div className="measurement-preview-footer"><span>Área total: <b>{measure.format(totalArea)} m²</b></span><span>Perímetro por pieza: <b>{measure.format(perimeter)} m</b></span></div>
  </section>;
}
