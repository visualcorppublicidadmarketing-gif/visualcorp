import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Image as ImageIcon, PackageSearch } from 'lucide-react';
import { formatMoney } from '../../app/workspace';
import { Dialog } from '../../components/ui/OperationalKit';
import './catalog-product-detail.css';

type CatalogProduct = Record<string, any>;

function getImages(product: CatalogProduct) {
  const values = [
    ...(Array.isArray(product.images) ? product.images : []),
    product.image,
    product.image_url,
  ];
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && Boolean(value.trim())))].slice(0, 10);
}

function getFeatures(product: CatalogProduct) {
  const existing = Array.isArray(product.features)
    ? product.features.filter((value: unknown): value is string => typeof value === 'string' && Boolean(value.trim()))
    : [];
  const details = product.custom_options?.standard_details || {};
  const detailRows = [
    details.materials && `Materiales: ${details.materials}`,
    details.colors && `Colores: ${details.colors}`,
    details.dimensions && `Medidas: ${details.dimensions}`,
    details.personalization && `Personalización: ${details.personalization}`,
  ].filter((value): value is string => Boolean(value));
  return [...new Set([...existing, ...detailRows])];
}

function getPriceTiers(product: CatalogProduct) {
  const source = product.tiers || product.priceScales || product.price_scales || [];
  if (!Array.isArray(source)) return [];
  return source.filter((tier: CatalogProduct) => tier && tier.qty != null).map((tier: CatalogProduct) => ({
    qty: Number(tier.qty),
    normal: tier.unit_price ?? tier.pvp ?? tier.price,
    installation: tier.install_unit_price ?? tier.price_inst,
    corporate: tier.corporate_unit_price ?? tier.price_corp,
  })).filter((tier: CatalogProduct) => Number.isFinite(tier.qty));
}

export function CatalogProductCode({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return <span className="catalog-product-code">
    <span>SKU</span><code>{value}</code>
    <button type="button" onClick={() => void copy()} aria-label={`Copiar SKU ${value}`} title="Copiar SKU">
      {copied ? <Check size={13}/> : <Copy size={13}/>}
    </button>
    <span className="sr-only" aria-live="polite">{copied ? 'SKU copiado' : ''}</span>
  </span>;
}

export function CatalogProductDetailDialog({ product, onClose }: { product: CatalogProduct | null; onClose: () => void }) {
  const images = useMemo(() => product ? getImages(product) : [], [product]);
  const [activeImage, setActiveImage] = useState(0);
  const selectedProduct = product?.id || product?.sku || '';
  useEffect(() => setActiveImage(0), [selectedProduct]);
  if (!product) return null;

  const sku = String(product.sku || product.id || 'Pendiente');
  const category = product.family || product.category || product.subcategory || product.category_id || 'Sin categoría';
  const unit = product.mode === 'area' || product.calc_type === 'm2' ? 'm²' : product.unit || 'unidad';
  const features = getFeatures(product);
  const tiers = getPriceTiers(product);
  const customProduct = product.product_kind === 'standard_custom' || product.custom_options?.standard_custom === true;
  const published = product.published ?? product.is_published;
  const description = product.description || product.custom_options?.configuration || '';
  const priceRows = [
    ['Normal', product.price],
    ['Con instalación', product.installPrice ?? product.price_inst],
    ['Corporativo', product.corporatePrice ?? product.price_corp],
  ].filter(([, value]) => value != null && value !== '');

  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }} title={product.name || 'Producto'} description={`${category} · SKU ${sku}`} footer={<button className="button button-outline" type="button" onClick={onClose}>Cerrar ficha</button>}>
    <div className="catalog-detail-layout">
      <section className="catalog-detail-gallery" aria-label={`Galería de ${product.name}`}>
        {images.length ? <>
          <div className="catalog-detail-image-frame"><img src={images[Math.min(activeImage, images.length - 1)]} alt={`${product.name} · imagen de referencia ${activeImage + 1}`} /></div>
          {images.length > 1 && <div className="catalog-detail-thumbnails" role="group" aria-label="Imágenes de referencia">
            {images.map((image, index) => <button key={`${image}-${index}`} type="button" className={activeImage === index ? 'active' : ''} aria-label={`Ver imagen ${index + 1} de ${product.name}`} aria-pressed={activeImage === index} onClick={() => setActiveImage(index)}>
              <img src={image} alt="" loading="lazy" />
            </button>)}
          </div>}
          <small className="catalog-detail-image-caption"><ImageIcon size={13}/> Imágenes y ejemplos vinculados a este producto</small>
        </> : <div className="catalog-detail-no-image"><ImageIcon size={25}/><b>Sin imágenes registradas</b><span>Agrega referencias desde la ficha del producto estándar.</span></div>}
      </section>

      <div className="catalog-detail-information">
        <div className="catalog-detail-code-row"><CatalogProductCode value={sku}/><span className={`catalog-detail-status${published ? ' is-published' : ''}`}>{published ? 'Publicado' : 'Borrador'}</span></div>
        {product.id && product.id !== sku && <p className="catalog-detail-internal-id">ID del registro: <code>{product.id}</code></p>}
        <section className="catalog-detail-section">
          <h3><PackageSearch size={15}/> Descripción</h3>
          <p>{description || 'Todavía no se ha agregado una descripción detallada.'}</p>
        </section>
        <dl className="catalog-detail-facts">
          <div><dt>Categoría</dt><dd>{category}</dd></div>
          <div><dt>Unidad de venta</dt><dd>{unit}</dd></div>
          <div><dt>Tipo de producto</dt><dd>{customProduct ? 'Estándar personalizable' : 'Catálogo'}</dd></div>
          {product.workflowRoute && <div><dt>Ruta de producción</dt><dd>{product.workflowRoute}</dd></div>}
        </dl>
        <section className="catalog-detail-section">
          <h3>Precios {customProduct ? 'del modelo' : 'del catálogo'}</h3>
          {priceRows.length ? <div className="catalog-detail-prices">{priceRows.map(([label, value]) => <div key={String(label)}><span>{label}</span><b>{formatMoney(Number(value))} <small>/ {unit}</small></b></div>)}</div> : <p>Tarifa pendiente de configurar.</p>}
          {tiers.length > 0 && <div className="catalog-detail-tiers"><b>Precios por cantidad o medida</b>{tiers.map((tier: CatalogProduct, index: number) => <p key={`${tier.qty}-${index}`}><span>Desde {tier.qty} {unit}</span><strong>{tier.normal == null ? 'Tarifa base' : formatMoney(Number(tier.normal))}{tier.installation != null ? ` · instalación ${formatMoney(Number(tier.installation))}` : ''}{tier.corporate != null ? ` · corporativo ${formatMoney(Number(tier.corporate))}` : ''}</strong></p>)}</div>}
        </section>
        <section className="catalog-detail-section">
          <h3>Características y especificaciones</h3>
          {features.length ? <ul>{features.map((feature: string, index: number) => <li key={`${feature}-${index}`}>{feature}</li>)}</ul> : <p>Aún no hay características detalladas en este registro.</p>}
        </section>
      </div>
    </div>
  </Dialog>;
}

