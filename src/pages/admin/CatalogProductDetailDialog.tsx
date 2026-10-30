import React, { useEffect, useMemo, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { Barcode, Check, Copy, Download, Image as ImageIcon, PackageSearch, Printer } from 'lucide-react';
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

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] || character);
}

function barcodeSvgMarkup(svg: SVGSVGElement) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  return new XMLSerializer().serializeToString(clone);
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('No se pudo crear la imagen.')), 'image/png'));
}

function BarcodeLabel({ sku, productName }: { sku: string; productName: string }) {
  const barcodeRef = useRef<SVGSVGElement>(null);
  const [barcodeError, setBarcodeError] = useState('');
  const [labelSize, setLabelSize] = useState<'50x25' | '60x30'>('50x25');
  const [copies, setCopies] = useState(1);
  const safeSku = sku.trim();
  const canGenerate = Boolean(safeSku && safeSku !== 'Pendiente');

  useEffect(() => {
    if (!barcodeRef.current || !canGenerate) return;
    try {
      JsBarcode(barcodeRef.current, safeSku, {
        format: 'CODE128',
        width: 1.65,
        height: 44,
        displayValue: true,
        font: 'Arial',
        fontOptions: 'bold',
        fontSize: 12,
        textMargin: 2,
        margin: 6,
        marginLeft: 18,
        marginRight: 18,
        marginTop: 5,
        marginBottom: 5,
        lineColor: '#15131a',
        background: '#ffffff',
      });
      setBarcodeError('');
    } catch {
      setBarcodeError('El SKU contiene caracteres que no admite Code 128.');
    }
  }, [canGenerate, safeSku]);

  const downloadLabel = async () => {
    const svg = barcodeRef.current;
    if (!svg || !canGenerate) return;
    try {
      const imageUrl = URL.createObjectURL(new Blob([barcodeSvgMarkup(svg)], { type: 'image/svg+xml;charset=utf-8' }));
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('No se pudo preparar el código.'));
        image.src = imageUrl;
      });
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 600;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('No se pudo preparar la etiqueta.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#17141c';
      context.font = '600 34px Arial, sans-serif';
      context.textAlign = 'center';
      const title = productName.length > 48 ? `${productName.slice(0, 45)}…` : productName;
      context.fillText(title, 600, 66, 1080);
      const nativeWidth = Number(svg.getAttribute('width')) || image.naturalWidth;
      const nativeHeight = Number(svg.getAttribute('height')) || image.naturalHeight;
      const scale = Math.min(1080 / nativeWidth, 370 / nativeHeight);
      const drawnWidth = nativeWidth * scale;
      const drawnHeight = nativeHeight * scale;
      context.drawImage(image, (1200 - drawnWidth) / 2, 98 + (370 - drawnHeight) / 2, drawnWidth, drawnHeight);
      context.fillStyle = '#65596b';
      context.font = '600 22px Arial, sans-serif';
      context.fillText('VISUAL CORP · CODE 128', 600, 558);
      const blob = await canvasBlob(canvas);
      const link = document.createElement('a');
      const downloadUrl = URL.createObjectURL(blob);
      link.href = downloadUrl;
      link.download = `${safeSku.replace(/[^A-Za-z0-9_-]/g, '-')}-etiqueta.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      URL.revokeObjectURL(imageUrl);
    } catch {
      setBarcodeError('No se pudo generar el PNG. Intenta de nuevo.');
    }
  };

  const printLabels = () => {
    const svg = barcodeRef.current;
    if (!svg || !canGenerate) return;
    const popup = window.open('', '_blank');
    if (!popup) {
      setBarcodeError('El navegador bloqueó la ventana de impresión. Permite ventanas emergentes e inténtalo de nuevo.');
      return;
    }
    const [width, height] = labelSize.split('x').map(Number);
    const columns = width === 50 ? 4 : 3;
    const rowsPerPage = Math.floor(285 / height);
    const total = Math.max(1, Math.min(100, Number(copies) || 1));
    const markup = barcodeSvgMarkup(svg);
    const escapedName = escapeHtml(productName);
    const escapedSku = escapeHtml(safeSku);
    const perPage = columns * rowsPerPage;
    const pages = Array.from({ length: Math.ceil(total / perPage) }, (_, pageIndex) => {
      const pageLabels = Array.from({ length: Math.min(perPage, total - pageIndex * perPage) }, () => `<article class="label"><div class="name">${escapedName}</div>${markup}<div class="sku">${escapedSku}</div></article>`).join('');
      return `<main class="sheet${pageIndex === Math.ceil(total / perPage) - 1 ? ' last' : ''}">${pageLabels}</main>`;
    }).join('');
    popup.document.open();
    popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Etiquetas ${escapedSku}</title><style>
      @page{size:A4 portrait;margin:6mm}*{box-sizing:border-box}html,body{margin:0;padding:0;color:#17141c;font-family:Arial,sans-serif}.sheet{display:grid;grid-template-columns:repeat(${columns},${width}mm);grid-auto-rows:${height}mm;justify-content:center;align-content:start;gap:0;break-after:page}.sheet.last{break-after:auto}.label{width:${width}mm;height:${height}mm;padding:1.4mm 1.8mm;border:.15mm solid #ded9e1;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden}.name{max-width:100%;max-height:3.5mm;overflow:hidden;margin-bottom:.4mm;font-size:6pt;line-height:1.1;text-align:center;white-space:nowrap;text-overflow:ellipsis}.label svg{display:block;width:100%;height:${height - 8}mm;min-height:0}.sku{margin-top:-.2mm;font-size:6.5pt;font-weight:700;letter-spacing:.04em;text-align:center}@media screen{body{padding:10mm;background:#eee}.sheet{margin:0 auto 8mm;width:max-content;background:#fff;box-shadow:0 2mm 8mm #0002}}
      </style></head><body>${pages}<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));</script></body></html>`);
    popup.document.close();
  };

  return <section className="catalog-barcode-section" aria-label="Etiqueta de identificación">
    <header><span className="catalog-barcode-icon"><Barcode size={15}/></span><div><b>Etiqueta del producto</b><small>Code 128 · compatible con lectores de códigos</small></div></header>
    <div className="catalog-barcode-preview">
      <strong>{productName}</strong>
      {canGenerate ? <svg ref={barcodeRef} role="img" aria-label={`Código de barras Code 128 para ${safeSku}`}/> : <span>Asigna un SKU para generar el código.</span>}
      {barcodeError && <small className="catalog-barcode-error" role="alert">{barcodeError}</small>}
    </div>
    <div className="catalog-barcode-controls">
      <label>Tamaño de etiqueta<select value={labelSize} onChange={(event) => setLabelSize(event.target.value as '50x25' | '60x30')}><option value="50x25">50 × 25 mm</option><option value="60x30">60 × 30 mm</option></select></label>
      <label>Copias<input type="number" min={1} max={100} value={copies} onChange={(event) => setCopies(Math.max(1, Math.min(100, Number(event.target.value) || 1)))}/></label>
    </div>
    <div className="catalog-barcode-actions">
      <button type="button" onClick={() => void downloadLabel()} disabled={!canGenerate || Boolean(barcodeError)}><Download size={14}/> Descargar PNG</button>
      <button type="button" onClick={printLabels} disabled={!canGenerate || Boolean(barcodeError)}><Printer size={14}/> Imprimir etiquetas</button>
    </div>
    <small className="catalog-barcode-note">SKU interno en Code 128. Para la lectura con escáner, conserva el SKU como código oficial del catálogo.</small>
  </section>;
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
        <BarcodeLabel sku={sku} productName={String(product.name || 'Producto')}/>
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

