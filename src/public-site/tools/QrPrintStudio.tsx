import { useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, AtSign, CheckCircle2, Download, Globe2, ImagePlus, Mail, MessageCircle, QrCode, ShieldCheck, Wifi, X } from 'lucide-react';
import { buildStyledQrSvg, contrastRatio, type QrDotStyle } from './qrEncoder';
import './qr-print-studio.css';

type Kind = 'url' | 'whatsapp' | 'instagram' | 'wifi' | 'sms' | 'email' | 'text' | 'contact';
type Fields = Record<string, string | boolean>;
const TYPES: Array<{ id: Kind; label: string; icon: ReactNode }> = [
  { id: 'url', label: 'Página web', icon: <Globe2 size={15}/> }, { id: 'whatsapp', label: 'WhatsApp', icon: <MessageCircle size={15}/> },
  { id: 'instagram', label: 'Instagram', icon: <AtSign size={15}/> }, { id: 'wifi', label: 'Wi-Fi', icon: <Wifi size={15}/> },
  { id: 'sms', label: 'SMS', icon: <MessageCircle size={15}/> }, { id: 'email', label: 'Correo', icon: <Mail size={15}/> },
  { id: 'text', label: 'Texto', icon: <QrCode size={15}/> }, { id: 'contact', label: 'Contacto', icon: <AtSign size={15}/> },
];
const initialFields: Fields = { url: '', phone: '', message: '', instagram: '', ssid: '', password: '', encryption: 'WPA', hidden: false, recipient: '', subject: '', body: '', text: '', name: '', company: '', email: '', website: '' };
const presets = [
  { label: 'Negro imprenta', colors: ['#11121a'], bg: '#ffffff' }, { label: 'Visual Corp', colors: ['#0078c8', '#d41491'], bg: '#ffffff' },
  { label: 'Violeta pro', colors: ['#4b1e8a', '#b8137c'], bg: '#ffffff' }, { label: 'Placa oscura', colors: ['#15121c', '#402338'], bg: '#fffdfb' },
];
const get = (fields: Fields, key: string) => String(fields[key] ?? '');
const encodeWifi = (value: string) => value.replace(/([\\;,:\"])/g, '\\$1');
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const escapeVCard = (value: string) => value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');

function serialize(kind: Kind, fields: Fields) {
  const urlValue = get(fields, 'url').trim();
  const normalizedUrl = urlValue && !/^https?:\/\//i.test(urlValue) ? `https://${urlValue}` : urlValue;
  if (kind === 'url') {
    try { const url = new URL(normalizedUrl); return ['http:', 'https:'].includes(url.protocol) && url.hostname.includes('.') ? { value: url.href, error: '' } : { value: '', error: 'Ingresa un dominio válido.' }; }
    catch { return { value: '', error: 'Ingresa un enlace válido.' }; }
  }
  if (kind === 'whatsapp') { const original = get(fields, 'phone').trim(); const digits = original.replace(/\D/g, ''); const number = original.startsWith('+') ? digits : digits.startsWith('593') ? digits : digits.startsWith('0') ? `593${digits.slice(1)}` : `593${digits}`; return digits.length >= 8 && digits.length <= 15 ? { value: `https://wa.me/${number}${get(fields, 'message').trim() ? `?text=${encodeURIComponent(get(fields, 'message').trim())}` : ''}`, error: '' } : { value: '', error: 'Revisa el número de teléfono.' }; }
  if (kind === 'instagram') { const user = get(fields, 'instagram').trim().replace(/^@/, ''); const match = user.match(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9._]+)\/?$/i); const handle = match?.[1] ?? user; return /^[A-Za-z0-9._]{1,30}$/.test(handle) ? { value: `https://www.instagram.com/${handle}/`, error: '' } : { value: '', error: 'Escribe un usuario o enlace de Instagram válido.' }; }
  if (kind === 'wifi') { const ssid = get(fields, 'ssid'); const password = get(fields, 'password'); const encryption = get(fields, 'encryption'); if (!ssid.trim()) return { value: '', error: 'Escribe el nombre de la red.' }; if (encryption !== 'nopass' && !password) return { value: '', error: 'Escribe la clave de la red.' }; if (encryption !== 'nopass' && password.length < 8) return { value: '', error: 'La clave debe tener al menos 8 caracteres.' }; return { value: `WIFI:T:${encryption};S:${encodeWifi(ssid)};P:${encodeWifi(password)};${fields.hidden ? 'H:true;' : ''};`, error: '' }; }
  if (kind === 'sms') { const phone = get(fields, 'phone').trim(); const digits = phone.replace(/\D/g, ''); return digits.length >= 8 && digits.length <= 15 ? { value: `SMSTO:${phone}:${get(fields, 'message')}`, error: '' } : { value: '', error: 'Revisa el número de teléfono.' }; }
  if (kind === 'email') { const recipient = get(fields, 'recipient').trim(); if (!validEmail(recipient)) return { value: '', error: 'Ingresa un correo válido.' }; const params = new URLSearchParams(); if (get(fields, 'subject')) params.set('subject', get(fields, 'subject')); if (get(fields, 'body')) params.set('body', get(fields, 'body')); return { value: `mailto:${recipient}${params.size ? `?${params}` : ''}`, error: '' }; }
  if (kind === 'text') return get(fields, 'text').trim() ? { value: get(fields, 'text'), error: '' } : { value: '', error: 'Escribe el texto que quieres compartir.' };
  const name = get(fields, 'name').trim(); if (!name) return { value: '', error: 'Escribe el nombre del contacto.' }; const [first, ...last] = name.split(/\s+/); const contactEmail = get(fields, 'email').trim(); if (contactEmail && !validEmail(contactEmail)) return { value: '', error: 'Revisa el correo del contacto.' }; const site = get(fields, 'website').trim(); let contactUrl = ''; if (site) { try { const parsed = new URL(/^https?:\/\//i.test(site) ? site : `https://${site}`); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(); contactUrl = parsed.href; } catch { return { value: '', error: 'Revisa el sitio web del contacto.' }; } } const phone = get(fields, 'phone').trim(); const escapedName = escapeVCard(name); return { value: `BEGIN:VCARD\nVERSION:3.0\nN:${escapeVCard(last.join(';'))};${escapeVCard(first)};;;\nFN:${escapedName}\n${get(fields, 'company') ? `ORG:${escapeVCard(get(fields, 'company'))}\n` : ''}${phone ? `TEL;TYPE=CELL:${escapeVCard(phone)}\n` : ''}${contactEmail ? `EMAIL:${escapeVCard(contactEmail)}\n` : ''}${contactUrl ? `URL:${escapeVCard(contactUrl)}\n` : ''}END:VCARD`, error: '' };
}

export function QrPrintStudio() {
  const logoRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<Kind>('url');
  const [fields, setFields] = useState<Fields>(initialFields);
  const [style, setStyle] = useState<QrDotStyle>('square');
  const [colors, setColors] = useState<string[]>(['#11121a']);
  const [background, setBackground] = useState('#ffffff');
  const [angle, setAngle] = useState(135);
  const [logo, setLogo] = useState<string | null>(null);
  const [logoPercent, setLogoPercent] = useState(14);
  const [widthMm, setWidthMm] = useState('30');
  const [dpi, setDpi] = useState('300');
  const [advanced, setAdvanced] = useState(false);
  const [preview, setPreview] = useState<'print' | 'plaque'>('print');
  const [plaqueTitle, setPlaqueTitle] = useState('ESCANEA AQUÍ');
  const [showPassword, setShowPassword] = useState(false);
  const [verification, setVerification] = useState<'idle' | 'checking' | 'verified' | 'failed'>('idle');
  const [verifiedSvg, setVerifiedSvg] = useState('');
  const [verifiedPng, setVerifiedPng] = useState('');
  const result = useMemo(() => serialize(kind, fields), [kind, fields]);
  const rawWhatsAppPhone = get(fields, 'phone').trim();
  const whatsappDigits = rawWhatsAppPhone.replace(/\D/g, '');
  const normalizedWhatsApp = rawWhatsAppPhone.startsWith('+') ? whatsappDigits : whatsappDigits.startsWith('593') ? whatsappDigits : whatsappDigits.startsWith('0') ? `593${whatsappDigits.slice(1)}` : `593${whatsappDigits}`;
  const qr = useMemo(() => { try { return result.value ? buildStyledQrSvg({ text: result.value, dotStyle: style, colors, angle, bgColor: background, logoDataUrl: logo, logoPercent, widthMm: Number(widthMm) || undefined }) : null; } catch { return null; } }, [result.value, style, colors, angle, background, logo, logoPercent, widthMm]);
  const capacityError = result.value && !qr ? 'El contenido supera la capacidad del QR. Reduce el texto o usa un enlace más corto.' : '';
  const svgUri = useMemo(() => qr ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr.svg)}` : '', [qr]);
  const contrastOk = colors.every(color => contrastRatio(color, background) >= 4.5);
  const moduleMm = qr && Number(widthMm) > 0 ? Number(widthMm) / (qr.matrix.size + 8) : 0;
  const printDpi = Number(dpi);
  const ppm = moduleMm && printDpi ? moduleMm * printDpi / 25.4 : 0;
  const verified = verification === 'verified' && verifiedSvg === qr?.svg && Boolean(verifiedPng);
  const changeField = (key: string, value: string | boolean) => setFields(current => ({ ...current, [key]: value }));
  const verify = async () => {
    if (!qr || !result.value || !contrastOk || (logo && Number(logoPercent) > 18)) return;
    setVerification('checking');
    setVerifiedSvg(''); setVerifiedPng('');
    try {
      const decoder = await import('jsqr');
      const decode = (image: ImageData) => decoder.default(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' });
      const toPngBlob = async () => new Promise<Blob>((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 1200;
          const context = canvas.getContext('2d');
          if (!context) return reject(new Error('Canvas no disponible'));
          context.fillStyle = background;
          context.fillRect(0, 0, 1200, 1200);
          context.imageSmoothingEnabled = false;
          context.drawImage(image, 0, 0, 1200, 1200);
          canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo generar el PNG')), 'image/png');
        };
        image.onerror = () => reject(new Error('No se pudo preparar el PNG'));
        image.src = svgUri;
      });
      const loadForReading = async (source: string) => new Promise<ImageData>((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          const canvas = document.createElement('canvas');
          const readingSize = Math.max(240, Math.min(600, (qr.matrix.size + 8) * 5));
          canvas.width = canvas.height = readingSize;
          const context = canvas.getContext('2d');
          if (!context) return reject(new Error('Canvas no disponible'));
          context.fillStyle = background;
          context.fillRect(0, 0, readingSize, readingSize);
          context.imageSmoothingEnabled = true;
          context.drawImage(image, 0, 0, readingSize, readingSize);
          resolve(context.getImageData(0, 0, readingSize, readingSize));
        };
        image.onerror = () => reject(new Error('No se pudo leer el QR'));
        image.src = source;
      });
      const pngBlob = await toPngBlob();
      const pngUrl = URL.createObjectURL(pngBlob);
      const pngImage = await loadForReading(pngUrl);
      URL.revokeObjectURL(pngUrl);
      const svgImage = await loadForReading(svgUri);
      const [pngCode, svgCode] = await Promise.all([Promise.resolve(decode(pngImage)), Promise.resolve(decode(svgImage))]);
      if (pngCode?.data === result.value && svgCode?.data === result.value) { setVerifiedSvg(qr.svg); setVerifiedPng(`${qr.svg}:${pngBlob.size}`); setVerification('verified'); }
      else setVerification('failed');
    } catch { setVerification('failed'); }
  };
  const download = (format: 'svg' | 'png') => {
    if (!verified || !qr) return;
    if (format === 'svg') { const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(new Blob([qr.svg], { type: 'image/svg+xml;charset=utf-8' })); anchor.download = `visualcorp-qr-${kind}.svg`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(anchor.href), 1000); return; }
    const image = new Image(); image.onload = () => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1200; const context = canvas.getContext('2d'); if (!context) return; context.imageSmoothingEnabled = false; context.fillStyle = background; context.fillRect(0, 0, 1200, 1200); context.drawImage(image, 0, 0, 1200, 1200); canvas.toBlob(blob => { if (!blob) return; const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(blob); anchor.download = `visualcorp-qr-${kind}-1200px.png`; anchor.click(); URL.revokeObjectURL(anchor.href); }, 'image/png'); }; image.src = svgUri;
  };
  const readLogo = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; if (file.size > 5 * 1024 * 1024) { setVerification('failed'); return; } const reader = new FileReader(); reader.onload = () => { const image = new Image(); image.onload = () => { const canvas = document.createElement('canvas'); const factor = Math.min(1, 512 / Math.max(image.width, image.height)); canvas.width = Math.max(1, Math.round(image.width * factor)); canvas.height = Math.max(1, Math.round(image.height * factor)); const context = canvas.getContext('2d'); if (!context) return; context.drawImage(image, 0, 0, canvas.width, canvas.height); setLogo(canvas.toDataURL('image/png')); }; image.src = String(reader.result); }; reader.readAsDataURL(file); };
  const setColor = (index: number, value: string) => setColors(current => current.map((color, i) => i === index ? value : color));
  const moveColor = (index: number, direction: -1 | 1) => setColors(current => { const destination = index + direction; if (destination < 0 || destination >= current.length) return current; const updated = [...current]; [updated[index], updated[destination]] = [updated[destination], updated[index]]; return updated; });
  const resetStyle = () => { setStyle('square'); setColors(['#11121a']); setBackground('#ffffff'); setAngle(135); setLogo(null); setLogoPercent(14); };

  return <section id="generador-qr" className="vc-tool-card vc-qr-studio" aria-labelledby="vc-qr-title">
    <div className="vc-tool-card-head"><div><span className="vc-tool-kicker"><QrCode size={14}/> GENERADOR QR PARA IMPRENTA</span><h2 id="vc-qr-title">Crea un QR y comprueba que se lea</h2><p>Prepara el archivo, verifica el destino y descarga el arte en SVG o PNG.</p></div><span className="vc-tool-privacy"><ShieldCheck size={14}/> Datos locales · sin caducidad</span></div>
    <div className="vc-qr-layout"><div className="vc-qr-controls">
      <fieldset className="vc-qr-fieldset"><legend>¿Qué quieres compartir?</legend><div className="vc-qr-type-grid">{TYPES.map(item => <button key={item.id} type="button" className={kind === item.id ? 'is-active' : ''} aria-pressed={kind === item.id} onClick={() => setKind(item.id)}>{item.icon}{item.label}</button>)}</div></fieldset>
      <div className="vc-qr-form" key={kind}>
        {kind === 'url' && <label>Enlace o página web<input type="url" value={get(fields,'url')} onChange={event => changeField('url',event.target.value)} placeholder="mitienda.com/menu" maxLength={2048}/></label>}
        {kind === 'whatsapp' && <><label>Número de WhatsApp<input type="tel" value={get(fields,'phone')} onChange={event => changeField('phone',event.target.value)} placeholder="099 999 9999 o +593 99 999 9999"/></label>{whatsappDigits&&<p className="vc-qr-hint">El enlace llevará el número +{normalizedWhatsApp}.</p>}<label>Mensaje inicial (opcional)<textarea value={get(fields,'message')} onChange={event => changeField('message',event.target.value)} placeholder="Hola, quisiera más información" rows={2}/></label></>}
        {kind === 'instagram' && <label>Usuario o enlace de perfil<input value={get(fields,'instagram')} onChange={event => changeField('instagram',event.target.value)} placeholder="@tu_negocio"/></label>}
        {kind === 'wifi' && <><label>Nombre de la red (SSID)<input value={get(fields,'ssid')} onChange={event => changeField('ssid',event.target.value)} placeholder="Mi red Wi-Fi" maxLength={32}/></label><label>Seguridad de la red<select value={get(fields,'encryption')} onChange={event => changeField('encryption',event.target.value)}><option value="WPA">WPA / WPA2</option><option value="nopass">Red abierta</option></select></label>{get(fields,'encryption') !== 'nopass' && <label>Clave Wi-Fi<span className="vc-qr-password"><input type={showPassword?'text':'password'} value={get(fields,'password')} onChange={event => changeField('password',event.target.value)} autoComplete="new-password" placeholder="Al menos 8 caracteres"/><button type="button" onClick={() => setShowPassword(value => !value)}>{showPassword?'Ocultar':'Mostrar'}</button></span></label>}<label className="vc-qr-check"><input type="checkbox" checked={Boolean(fields.hidden)} onChange={event => changeField('hidden',event.target.checked)}/> Red oculta</label></>}
        {kind === 'sms' && <><label>Número de destino<input type="tel" value={get(fields,'phone')} onChange={event => changeField('phone',event.target.value)} placeholder="099 999 9999"/></label><label>Mensaje (opcional)<textarea value={get(fields,'message')} onChange={event => changeField('message',event.target.value)} placeholder="Escribe el mensaje" rows={2}/></label></>}
        {kind === 'email' && <><label>Correo de destino<input type="email" value={get(fields,'recipient')} onChange={event => changeField('recipient',event.target.value)} placeholder="hola@negocio.com"/></label><label>Asunto (opcional)<input value={get(fields,'subject')} onChange={event => changeField('subject',event.target.value)} maxLength={120}/></label><label>Mensaje (opcional)<textarea value={get(fields,'body')} onChange={event => changeField('body',event.target.value)} rows={2}/></label></>}
        {kind === 'text' && <label>Texto para compartir<textarea value={get(fields,'text')} onChange={event => changeField('text',event.target.value)} placeholder="Escribe aquí" rows={3} maxLength={2800}/></label>}
        {kind === 'contact' && <><label>Nombre y apellido<input value={get(fields,'name')} onChange={event => changeField('name',event.target.value)} placeholder="Nombre Apellido"/></label><label>Empresa (opcional)<input value={get(fields,'company')} onChange={event => changeField('company',event.target.value)}/></label><label>Teléfono (opcional)<input value={get(fields,'phone')} onChange={event => changeField('phone',event.target.value)}/></label><label>Correo (opcional)<input type="email" value={get(fields,'email')} onChange={event => changeField('email',event.target.value)}/></label><label>Sitio web (opcional)<input value={get(fields,'website')} onChange={event => changeField('website',event.target.value)}/></label></>}
      </div>
      <button type="button" className="vc-qr-advanced-toggle" aria-expanded={advanced} onClick={() => setAdvanced(value => !value)}>{advanced?'Ocultar personalización':'Personalizar color, módulos y logo'}</button>
      {advanced && <div className="vc-qr-advanced"><fieldset className="vc-qr-fieldset"><legend>Forma de los módulos</legend><div className="vc-qr-style-options">{([['square','Clásico'],['soft','Suave'],['rounded','Redondeado'],['dots','Puntos']] as Array<[QrDotStyle,string]>).map(([id,label])=><button type="button" key={id} aria-pressed={style===id} className={style===id?'is-active':''} onClick={()=>setStyle(id)}>{label}</button>)}</div></fieldset>
        <fieldset className="vc-qr-fieldset"><legend>Paleta</legend><div className="vc-qr-preset-list">{presets.map(item=><button type="button" key={item.label} onClick={()=>{setColors(item.colors);setBackground(item.bg);}}><i style={{background:`linear-gradient(120deg,${item.colors.join(',')})`}}/>{item.label}</button>)}</div></fieldset>
        <div className="vc-qr-color-list"><span>Colores del QR (2 a 5)</span>{colors.map((color,index)=><label key={index}>Color {index+1}<input type="color" value={color} onChange={event=>setColor(index,event.target.value)}/><span className="vc-qr-color-order"><button type="button" onClick={()=>moveColor(index,-1)} disabled={index===0} aria-label={`Mover color ${index+1} hacia arriba`}>↑</button><button type="button" onClick={()=>moveColor(index,1)} disabled={index===colors.length-1} aria-label={`Mover color ${index+1} hacia abajo`}>↓</button>{colors.length>1&&<button type="button" onClick={()=>setColors(current=>current.filter((_,i)=>i!==index))} aria-label={`Quitar color ${index+1}`}>×</button>}</span></label>)}{colors.length<5&&<button type="button" onClick={()=>setColors(current=>[...current,'#d41491'])}>Añadir color</button>}<label>Fondo<input type="color" value={background} onChange={event=>setBackground(event.target.value)}/></label>{!contrastOk&&<p role="alert">Aumenta el contraste entre el QR y el fondo para comprobar su lectura.</p>}</div>
        {colors.length>1&&<label>Dirección del degradado · {angle}°<input type="range" min="0" max="359" value={angle} onChange={event=>setAngle(Number(event.target.value))}/></label>}
        <label>Ancho del logo · {logoPercent}% de la matriz<input type="range" min="6" max="18" value={logoPercent} onChange={event=>setLogoPercent(Number(event.target.value))}/></label>
        <div className="vc-qr-logo-row"><input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={readLogo}/><button type="button" onClick={()=>logoRef.current?.click()}><ImagePlus size={15}/>{logo?'Cambiar logo':'Subir logo'}</button>{logo&&<button type="button" onClick={()=>setLogo(null)}><X size={14}/>Quitar</button>}</div>
        <button className="vc-qr-reset" type="button" onClick={resetStyle}>Restaurar estilo de imprenta</button>
      </div>}
    </div>
    <aside className="vc-qr-result"><div className="vc-qr-preview-tabs"><button type="button" className={preview==='print'?'is-active':''} aria-pressed={preview==='print'} onClick={()=>setPreview('print')}>Archivo de impresión</button><button type="button" className={preview==='plaque'?'is-active':''} aria-pressed={preview==='plaque'} onClick={()=>setPreview('plaque')}>Vista en placa</button></div>
      <div className={`vc-qr-preview ${preview==='plaque'?'is-plaque':''}`}>{preview==='plaque'?<div className="vc-qr-plaque-frame"><img className="vc-qr-plaque-base" src="/images/catalog-products/placa_qr_base.webp" alt=""/><div className="vc-qr-plaque-overlay">{qr&&<img src={svgUri} alt="Vista previa del QR en placa"/>}<span>{plaqueTitle}</span></div></div>:qr&&<img className="vc-qr-image" src={svgUri} alt="Vista previa del código QR"/>}{qr&&<span>Versión {qr.matrix.version} · Corrección {qr.matrix.ecc} · {qr.matrix.size}×{qr.matrix.size} módulos</span>}</div>
      {preview==='plaque'&&<label>Texto de la placa<input value={plaqueTitle} onChange={event=>setPlaqueTitle(event.target.value)} maxLength={24}/></label>}
      <div className="vc-qr-print-size"><label>Ancho impreso (mm)<input type="number" min="1" max="5000" value={widthMm} onChange={event=>setWidthMm(event.target.value)}/></label><label>Resolución (DPI)<input type="number" min="1" max="9600" value={dpi} onChange={event=>setDpi(event.target.value)}/></label><p>{moduleMm?`Módulo ${moduleMm.toFixed(2)} mm · ${ppm.toFixed(1)} puntos por módulo`: 'Ingresa un ancho para calcular el tamaño del módulo.'}{ppm>0&&ppm<4?' · Considera aumentar el tamaño impreso.':''}</p></div>
      {(result.error||capacityError)&&<p className="vc-qr-error" role="alert">{result.error||capacityError}</p>}{result.value&&<p className="vc-qr-privacy-note"><ShieldCheck size={14}/> El contenido y la clave Wi-Fi se procesan localmente.</p>}
      <div className="vc-qr-verify"><button type="button" className="site-primary-button" onClick={verify} disabled={!result.value||!qr||!contrastOk||verification==='checking'}>{verification==='checking'?'Comprobando lectura':'Comprobar lectura'}</button>{verification==='verified'&&verified&&<p className="vc-qr-success" role="status"><CheckCircle2 size={16}/> Lectura digital verificada · comprueba una muestra a tamaño real.</p>}{verification==='failed'&&<p className="vc-qr-error" role="alert">No pudimos confirmar el destino. Prueba el estilo clásico, reduce el logo y vuelve a comprobar.</p>}</div>
      <div className="vc-qr-downloads"><button type="button" onClick={()=>download('svg')} disabled={!verified||!contrastOk}><Download size={16}/> Descargar SVG</button><button type="button" onClick={()=>download('png')} disabled={!verified||!contrastOk}><Download size={16}/> Descargar PNG · 1200 px</button></div>
      <div className="vc-tool-quote-cta"><p>¿Necesitas imprimir este QR?</p><div className="vc-tool-cta-links"><Link to="/cotizador?servicio=Corte%2C%20grabado%20y%20se%C3%B1al%C3%A9tica&producto=Placa%20QR%20en%20acr%C3%ADlico">Cotizar placa QR <ArrowUpRight size={14}/></Link><Link to="/cotizador?servicio=Impresi%C3%B3n%20y%20papeler%C3%ADa&producto=Stickers%20personalizados%20con%20QR">Cotizar stickers o tarjetas <ArrowUpRight size={14}/></Link></div></div>
    </aside></div>
  </section>;
}
