import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  AtSign,
  Download,
  Globe2,
  ImagePlus,
  MessageCircle,
  QrCode,
  ShieldCheck,
  Sparkles,
  Wifi,
  X,
} from 'lucide-react';
import { buildStyledQrSvg, type QrDotStyle } from './qrEncoder';

type QrPresetKind = 'url' | 'whatsapp' | 'instagram' | 'wifi';

const COLOR_PRESETS = [
  { id: 'print-black', label: 'Negro imprenta', fg: '#11121a', end: '#11121a', bg: '#ffffff' },
  { id: 'vc-gradient', label: 'Visual Corp', fg: '#0078c8', end: '#d41491', bg: '#ffffff' },
  { id: 'deep-violet', label: 'Violeta pro', fg: '#4b1e8a', end: '#b8137c', bg: '#ffffff' },
  { id: 'dark-plaque', label: 'Placa oscura', fg: '#ffffff', end: '#ffd06b', bg: '#111633' },
];

export function QrPrintStudio() {
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [preset, setPreset] = useState<QrPresetKind>('url');
  const [urlValue, setUrlValue] = useState('https://visualcorp-suite.vercel.app/tienda');
  const [waPhone, setWaPhone] = useState('0967872396');
  const [waMessage, setWaMessage] = useState('Hola, quiero cotizar un proyecto.');
  const [igHandle, setIgHandle] = useState('@visualcorpec');
  const [wifiSsid, setWifiSsid] = useState('MiLocal_WiFi');
  const [wifiPass, setWifiPass] = useState('');

  const [dotStyle, setDotStyle] = useState<QrDotStyle>('rounded');
  const [fgColor, setFgColor] = useState('#11121a');
  const [fgColorEnd, setFgColorEnd] = useState('#11121a');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<'print' | 'plaque'>('print');
  const [plaqueTitle, setPlaqueTitle] = useState('ESCANEA AQUÍ');

  const qrPayload = useMemo(() => {
    if (preset === 'whatsapp') {
      const digits = waPhone.replace(/\D/g, '');
      const intl = digits.startsWith('593') ? digits : `593${digits.replace(/^0/, '')}`;
      const msg = waMessage.trim() ? `?text=${encodeURIComponent(waMessage.trim())}` : '';
      return `https://wa.me/${intl || '593967872396'}${msg}`;
    }
    if (preset === 'instagram') {
      const handle = igHandle.replace(/^@/, '').trim() || 'visualcorpec';
      return `https://www.instagram.com/${handle}/`;
    }
    if (preset === 'wifi') {
      const esc = (s: string) => s.replace(/([\\;,:"])/g, '\\$1');
      return `WIFI:T:${wifiPass.trim() ? 'WPA' : 'nopass'};S:${esc(wifiSsid.trim() || 'RedLocal')};P:${esc(wifiPass.trim())};;`;
    }
    const clean = urlValue.trim();
    return clean || 'https://visualcorp-suite.vercel.app';
  }, [preset, urlValue, waPhone, waMessage, igHandle, wifiSsid, wifiPass]);

  const { svg, matrix } = useMemo(
    () =>
      buildStyledQrSvg({
        text: qrPayload,
        dotStyle,
        fgColor,
        fgColorEnd,
        bgColor,
        logoDataUrl,
      }),
    [qrPayload, dotStyle, fgColor, fgColorEnd, bgColor, logoDataUrl],
  );

  const svgDataUri = useMemo(
    () => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    [svg],
  );

  const handleLogoFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setLogoDataUrl(reader.result);
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const downloadSvg = () => {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `visualcorp-qr-${preset}.svg`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const downloadPng = () => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 1200;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, 1200, 1200);
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `visualcorp-qr-${preset}-1200px.png`;
      link.click();
    };
    img.src = svgDataUri;
  };

  return (
    <section id="generador-qr" className="vc-tool-card" aria-labelledby="vc-qr-title">
      <div className="vc-tool-card-head">
        <div>
          <span className="vc-tool-kicker">
            <QrCode size={14} aria-hidden="true" />
            GENERADOR QR VECTORIAL PARA IMPRENTA
          </span>
          <h2 id="vc-qr-title">Crea tu código QR listo para imprimir</h2>
          <p>
            Genera un QR limpio en formato <strong>SVG vectorial</strong> o <strong>PNG 1200 px</strong> para tarjetas, menús, stickers o placas acrílicas.
          </p>
        </div>
        <span className="vc-tool-privacy">
          <ShieldCheck size={14} aria-hidden="true" />
          Sin caducidad · 100% en tu navegador
        </span>
      </div>

      <div className="vc-tool-grid">
        {/* Controls Column */}
        <div className="vc-tool-controls">
          <div className="vc-tool-segment" role="group" aria-label="Tipo de código QR">
            <button type="button" className={preset === 'url' ? 'is-active' : ''} aria-pressed={preset === 'url'} onClick={() => setPreset('url')}>
              <Globe2 size={14} aria-hidden="true" /> Enlace web
            </button>
            <button type="button" className={preset === 'whatsapp' ? 'is-active' : ''} aria-pressed={preset === 'whatsapp'} onClick={() => setPreset('whatsapp')}>
              <MessageCircle size={14} aria-hidden="true" /> WhatsApp
            </button>
            <button type="button" className={preset === 'instagram' ? 'is-active' : ''} aria-pressed={preset === 'instagram'} onClick={() => setPreset('instagram')}>
              <AtSign size={14} aria-hidden="true" /> Instagram
            </button>
            <button type="button" className={preset === 'wifi' ? 'is-active' : ''} aria-pressed={preset === 'wifi'} onClick={() => setPreset('wifi')}>
              <Wifi size={14} aria-hidden="true" /> Wi-Fi local
            </button>
          </div>

          <div className="vc-tool-fields">
            {preset === 'url' && (
              <label>
                Enlace o destino del QR
                <input
                  type="url"
                  value={urlValue}
                  onChange={(event) => setUrlValue(event.target.value)}
                  placeholder="https://tu-negocio.com/menu"
                  maxLength={180}
                />
              </label>
            )}
            {preset === 'whatsapp' && (
              <>
                <label>
                  Número de WhatsApp (Ecuador)
                  <input
                    type="tel"
                    value={waPhone}
                    onChange={(event) => setWaPhone(event.target.value)}
                    placeholder="0999999999"
                    maxLength={20}
                  />
                </label>
                <label>
                  Mensaje inicial sugerido (opcional)
                  <input
                    type="text"
                    value={waMessage}
                    onChange={(event) => setWaMessage(event.target.value)}
                    placeholder="Hola, quisiera información…"
                    maxLength={100}
                  />
                </label>
              </>
            )}
            {preset === 'instagram' && (
              <label>
                Usuario de Instagram
                <input
                  type="text"
                  value={igHandle}
                  onChange={(event) => setIgHandle(event.target.value)}
                  placeholder="@tu_negocio"
                  maxLength={60}
                />
              </label>
            )}
            {preset === 'wifi' && (
              <div className="vc-tool-row-2">
                <label>
                  Nombre de la red (SSID)
                  <input
                    type="text"
                    value={wifiSsid}
                    onChange={(event) => setWifiSsid(event.target.value)}
                    placeholder="Cafeteria_Clientes"
                    maxLength={50}
                  />
                </label>
                <label>
                  Clave Wi-Fi (opcional)
                  <input
                    type="text"
                    value={wifiPass}
                    onChange={(event) => setWifiPass(event.target.value)}
                    placeholder="Sin clave si es abierta"
                    maxLength={50}
                  />
                </label>
              </div>
            )}
          </div>

          <div className="vc-tool-section">
            <span className="vc-tool-label">Estilo de módulos</span>
            <div className="vc-tool-pills" role="group" aria-label="Estilo de puntos del QR">
              {([
                ['square', 'Clásico'],
                ['rounded', 'Redondeado'],
                ['dots', 'Puntos'],
              ] as Array<[QrDotStyle, string]>).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={dotStyle === id ? 'is-active' : ''}
                  aria-pressed={dotStyle === id}
                  onClick={() => setDotStyle(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="vc-tool-section">
            <span className="vc-tool-label">Paleta de color</span>
            <div className="vc-tool-pills">
              {COLOR_PRESETS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={fgColor === item.fg && fgColorEnd === item.end && bgColor === item.bg ? 'is-active' : ''}
                  onClick={() => {
                    setFgColor(item.fg);
                    setFgColorEnd(item.end);
                    setBgColor(item.bg);
                  }}
                >
                  <i className="vc-color-swatch" style={{ background: `linear-gradient(135deg, ${item.fg}, ${item.end})` }} aria-hidden="true" />
                  {item.label}
                </button>
              ))}
            </div>
            <div className="vc-tool-color-pickers">
              <label>
                Color principal
                <input type="color" value={fgColor} onChange={(event) => setFgColor(event.target.value)} />
              </label>
              <label>
                Degradado
                <input type="color" value={fgColorEnd} onChange={(event) => setFgColorEnd(event.target.value)} />
              </label>
              <label>
                Fondo
                <input type="color" value={bgColor} onChange={(event) => setBgColor(event.target.value)} />
              </label>
            </div>
          </div>

          <div className="vc-tool-section">
            <span className="vc-tool-label">Logo central (opcional · activa corrección H 30%)</span>
            <div className="vc-tool-logo-row">
              <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={handleLogoFile} />
              <button type="button" className="vc-tool-outline-btn" onClick={() => logoInputRef.current?.click()}>
                <ImagePlus size={15} aria-hidden="true" /> {logoDataUrl ? 'Cambiar logo' : 'Subir mi logo'}
              </button>
              {logoDataUrl && (
                <button type="button" className="vc-tool-ghost-btn" onClick={() => setLogoDataUrl(null)}>
                  <X size={14} aria-hidden="true" /> Quitar logo
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Live Preview & Export Column */}
        <div className="vc-tool-preview-col">
          <div className="vc-tool-preview-toggle" role="group" aria-label="Modo de vista previa del QR">
            <button type="button" className={previewMode === 'print' ? 'is-active' : ''} aria-pressed={previewMode === 'print'} onClick={() => setPreviewMode('print')}>
              Archivo de impresión
            </button>
            <button type="button" className={previewMode === 'plaque' ? 'is-active' : ''} aria-pressed={previewMode === 'plaque'} onClick={() => setPreviewMode('plaque')}>
              <Sparkles size={13} aria-hidden="true" /> Ver en Placa Acrílica
            </button>
          </div>

          {previewMode === 'print' ? (
            <div className="vc-qr-stage">
              <img className="vc-qr-image" src={svgDataUri} alt={`Código QR generado para ${qrPayload}`} />
              <span className="vc-qr-meta">
                Versión {matrix.version} · Corrección {matrix.ecc} · {matrix.size}×{matrix.size} módulos
              </span>
            </div>
          ) : (
            <div className="vc-qr-plaque-stage">
              <div className="vc-qr-plaque-frame">
                <img className="vc-qr-plaque-base" src="/images/catalog-products/placa_qr_base.webp" alt="Vista referencial en placa acrílica QR" />
                <div className="vc-qr-plaque-overlay">
                  <img src={svgDataUri} alt="Código QR sobre placa acrílica" />
                  <span>{plaqueTitle || 'ESCANEA AQUÍ'}</span>
                </div>
              </div>
              <label className="vc-qr-plaque-caption-input">
                <span>Texto en la placa</span>
                <input
                  type="text"
                  value={plaqueTitle}
                  onChange={(event) => setPlaqueTitle(event.target.value)}
                  maxLength={24}
                  placeholder="ESCANEA AQUÍ"
                />
              </label>
            </div>
          )}

          <div className="vc-tool-downloads">
            <button type="button" className="site-primary-button" onClick={downloadSvg}>
              <Download size={16} aria-hidden="true" /> Descargar SVG vectorial
            </button>
            <button type="button" className="site-secondary-button" onClick={downloadPng}>
              <Download size={16} aria-hidden="true" /> Descargar PNG (1200 px)
            </button>
          </div>

          <div className="vc-tool-quote-cta">
            <p>¿Quieres imprimir este QR en una placa acrílica de mostrador, tarjetas o stickers?</p>
            <div className="vc-tool-cta-links">
              <Link to="/cotizador?servicio=Corte%2C%20grabado%20y%20se%C3%B1al%C3%A9tica&producto=Placa%20QR%20en%20acr%C3%ADlico">
                Cotizar Placa QR <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
              <Link to="/cotizador?servicio=Impresi%C3%B3n%20y%20papeler%C3%ADa&producto=Stickers%20personalizados%20con%20QR">
                Cotizar Stickers / Tarjetas <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
