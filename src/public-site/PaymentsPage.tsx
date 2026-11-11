import { useEffect, useState } from 'react';
import { ArrowDown, ArrowRight, BadgeCheck, Building2, Check, ClipboardCheck, Copy, Mail, MapPin, QrCode, ShieldCheck, WalletCards } from 'lucide-react';
import { Link } from 'react-router-dom';
import { publicPaymentDetails as details } from '../lib/publicPaymentDetails';
import './payments-page.css';

async function copyText(value: string) {
  if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
  await navigator.clipboard.writeText(value);
}

export function PaymentsPage() {
  const [copied, setCopied] = useState('');
  const [copyError, setCopyError] = useState(false);

  useEffect(() => { document.title = 'Medios de pago · Visual Corp'; }, []);

  const copy = async (label: string, value: string) => {
    setCopyError(false);
    try {
      await copyText(value);
      setCopied(label);
      window.setTimeout(() => setCopied((current) => current === label ? '' : current), 2200);
    } catch {
      setCopyError(true);
      setCopied('');
    }
  };

  const transferCopy = [
    `Banco: ${details.bank}`,
    `Tipo de cuenta: ${details.accountType}`,
    `Número de cuenta: ${details.accountNumber}`,
    `Titular: ${details.beneficiary}`,
    `RUC: ${details.taxId}`,
  ].join('\n');

  const receiptMail = `mailto:${details.receiptEmail}?subject=${encodeURIComponent('Comprobante de pago | Visual Corp')}&body=${encodeURIComponent('Hola, adjunto el comprobante de pago.\n\nNúmero de proforma o pedido: \nNombre del cliente: \nMétodo de pago: ')}`;

  return <div className="vc-payments-page">
    <section className="vc-payments-hero" aria-labelledby="payments-title">
      <div className="vc-payments-hero-glow" aria-hidden="true" />
      <div className="vc-payments-hero-content">
        <img className="vc-payments-wordmark" src="/brand/visualcorp-wordmark-white-original.png" alt="Visual Corp" />
        <span className="vc-payments-eyebrow"><span /> MEDIOS DE PAGO</span>
        <h1 id="payments-title">Tu próximo proyecto,<br/><em>más cerca.</em></h1>
        <p>Elige cómo pagar tu proforma aprobada. Tienes transferencia bancaria y Deuna a la mano.</p>
        <a className="vc-payments-scroll" href="#opciones-de-pago">Ver opciones <ArrowDown size={15} aria-hidden="true"/></a>
      </div>
      <div className="vc-payments-hero-art" aria-hidden="true">
        <div className="vc-payments-orbit vc-payments-orbit-one" />
        <div className="vc-payments-orbit vc-payments-orbit-two" />
        <div className="vc-payments-hero-card"><WalletCards size={32}/><span>PAGO<br/>FÁCIL</span><small>VISUAL CORP · ECUADOR</small></div>
        <b className="vc-payments-hero-word">PAGA</b>
      </div>
    </section>

    <div className="vc-payments-main" id="opciones-de-pago">
      <div className="vc-payments-intro">
        <div><span className="vc-payments-kicker">ELIGE TU MÉTODO</span><h2>Dos formas, un mismo destino.</h2></div>
        <p>Usa el valor exacto indicado en tu proforma y conserva el comprobante para verificar tu pago.</p>
      </div>

      <div className="vc-payments-methods">
        <article className="vc-payment-card vc-payment-bank">
          <header className="vc-payment-card-header">
            <span className="vc-payment-card-icon"><Building2 size={21} aria-hidden="true"/></span>
            <span className="vc-payment-card-tag">TRANSFERENCIA</span>
            <h3>Desde tu banco</h3>
            <p>Transfiere a esta cuenta y usa el número de tu proforma como referencia.</p>
          </header>
          <div className="vc-payment-bank-brand"><span className="vc-payment-bank-mark">P</span><div><b>Produbanco</b><small>Grupo Promerica</small></div><span className="vc-payment-account-type">Ahorros</span></div>
          <div className="vc-payment-account-number"><span>NÚMERO DE CUENTA</span><strong>{details.accountNumber}</strong><button type="button" onClick={() => void copy('cuenta', details.accountNumber)} aria-label="Copiar número de cuenta">{copied === 'cuenta' ? <Check size={16}/> : <Copy size={16}/>}<span>{copied === 'cuenta' ? 'Copiado' : 'Copiar'}</span></button></div>
          <dl className="vc-payment-details">
            <div><dt>Titular</dt><dd>{details.beneficiary}</dd></div>
            <div><dt>RUC</dt><dd>{details.taxId}</dd></div>
            <div><dt>Tipo de cuenta</dt><dd>{details.accountType}</dd></div>
          </dl>
          <div className="vc-payment-fee-note"><ShieldCheck size={16} aria-hidden="true"/><span>{details.bankFeeNote}</span></div>
          <button className="vc-payment-copy-all" type="button" onClick={() => void copy('datos', transferCopy)}>{copied === 'datos' ? <Check size={16}/> : <ClipboardCheck size={16}/>} {copied === 'datos' ? 'Datos copiados' : 'Copiar todos los datos'}</button>
        </article>

        <article className="vc-payment-card vc-payment-deuna">
          <header className="vc-payment-card-header">
            <span className="vc-payment-card-icon vc-payment-deuna-icon"><QrCode size={21} aria-hidden="true"/></span>
            <span className="vc-payment-card-tag vc-payment-deuna-tag">PAGO CON DEUNA</span>
            <h3>Escanea y paga</h3>
            <p>Abre Deuna, escanea el código o ingresa el número para pagar.</p>
          </header>
          <div className="vc-payment-qr-layout">
            <div className="vc-payment-qr-frame" aria-label="Código QR de cobro Deuna">
              <img src={details.deunaQr} alt="Código QR para realizar un pago con Deuna" />
              <span className="vc-payment-qr-corner vc-payment-qr-tl" aria-hidden="true"/><span className="vc-payment-qr-corner vc-payment-qr-tr" aria-hidden="true"/><span className="vc-payment-qr-corner vc-payment-qr-bl" aria-hidden="true"/><span className="vc-payment-qr-corner vc-payment-qr-br" aria-hidden="true"/>
            </div>
            <div className="vc-payment-deuna-instructions"><span className="vc-payment-live-mark">QR DE PAGO DEUNA</span><h4>¿No puedes usar el QR?</h4><p>Ingresa este número en Deuna:</p><div className="vc-payment-deuna-number"><strong>{details.deunaNumber}</strong><button type="button" onClick={() => void copy('deuna', details.deunaNumber)} aria-label="Copiar número de cobro Deuna">{copied === 'deuna' ? <Check size={16}/> : <Copy size={16}/>}</button></div><small>Antes de confirmar, verifica el nombre del beneficiario y el valor en la app.</small></div>
          </div>
          <div className="vc-payment-deuna-note"><BadgeCheck size={17} aria-hidden="true"/><span>Al finalizar, guarda el comprobante y compártelo con el número de tu proforma o pedido.</span></div>
        </article>
      </div>

      <section className="vc-payment-next" aria-labelledby="payment-next-title">
        <div className="vc-payment-next-heading"><span className="vc-payment-next-icon"><ClipboardCheck size={20}/></span><div><span className="vc-payments-kicker">FÁCIL Y CLARO</span><h2 id="payment-next-title">¿Ya pagaste?</h2></div></div>
        <div className="vc-payment-steps">
          <div><span>01</span><p>Ten a mano tu número de proforma o pedido.</p></div>
          <div><span>02</span><p>Envía el comprobante por correo con tu nombre.</p></div>
          <div><span>03</span><p>El equipo revisará el pago y lo asociará a tu proyecto.</p></div>
        </div>
        <a className="vc-payment-send-receipt" href={receiptMail}><Mail size={17} aria-hidden="true"/> Enviar comprobante <ArrowRight size={16} aria-hidden="true"/></a>
        <p className="vc-payment-receipt-email">El correo abrirá un mensaje dirigido a <b>{details.receiptEmail}</b>.</p>
        {copyError && <p className="vc-payment-copy-error" role="status">No se pudo copiar automáticamente. Mantén pulsado o selecciona el dato para copiarlo.</p>}
        <p className="vc-payment-copy-status" role="status" aria-live="polite">{copied ? `Se copió ${copied === 'cuenta' ? 'el número de cuenta' : copied === 'deuna' ? 'el número de cobro' : 'la información de transferencia'}.` : ''}</p>
      </section>

      <aside className="vc-payment-help">
        <div className="vc-payment-help-icon"><MapPin size={19} aria-hidden="true"/></div><div><span>¿Prefieres atención presencial?</span><p>{details.serviceAddress}</p></div><Link to="/contacto" aria-label="Contactar a Visual Corp">Contactar <ArrowRight size={15} aria-hidden="true"/></Link>
      </aside>
    </div>
  </div>;
}

export default PaymentsPage;
