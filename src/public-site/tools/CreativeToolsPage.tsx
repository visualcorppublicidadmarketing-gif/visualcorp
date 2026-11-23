import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, FileCheck2, QrCode, Sparkles } from 'lucide-react';
import { AmbientVideoLayer } from '../AmbientVideoLayer';
import { LogoMockupStudio } from './LogoMockupStudio';
import { QrPrintStudio } from './QrPrintStudio';
import { ArtworkPreflightDropzone } from '../quote/ArtworkPreflightDropzone';

export function CreativeToolsPage() {
  const [searchParams] = useSearchParams();
  const initialBaseId = searchParams.get('base') || undefined;
  const returnTo = searchParams.get('returnTo');
  useEffect(() => {
    const prev = document.title;
    document.title = 'Herramientas creativas gratis · Visual Corp';
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <div className="vc-tools-page">
      <header className="site-page-hero has-ambient-video vc-tools-hero">
        <AmbientVideoLayer clip="aurora" variant="page-hero" parallax playbackRate={0.78} />
        <div className="site-page-hero-inner">
          <span className="site-eyebrow light">
            <i />
            <Sparkles size={14} aria-hidden="true" />
            ESTUDIO GRATIS · VISUAL CORP
          </span>
          <h1>
            Herramientas para
            <br />
            preparar tu marca.
          </h1>
          {returnTo?.startsWith('/') && !returnTo.startsWith('//') && (
            <Link className="site-secondary-button vc-tools-return" to={returnTo}>
              {returnTo === '/tienda' ? 'Volver a la tienda' : 'Volver al servicio'}
            </Link>
          )}
          <p>
              Compón una propuesta con imágenes, textos y formas sobre productos, crea un QR vectorial y comprueba la resolución de tu archivo antes de cotizar. Todo funciona gratis y en tu navegador.
          </p>
          <nav className="vc-tools-jump-nav" aria-label="Saltar a una herramienta">
            <a href="#probador-logo">
              <Sparkles size={15} aria-hidden="true" /> Editor de diseño
            </a>
            <a href="#generador-qr">
              <QrCode size={15} aria-hidden="true" /> Generador QR
            </a>
            <a href="#verificador-arte">
              <FileCheck2 size={15} aria-hidden="true" /> Verificador DPI
            </a>
          </nav>
        </div>
      </header>

      <div className="vc-tools-workspace">
        <LogoMockupStudio initialBaseId={initialBaseId} />
        <QrPrintStudio />

        <section id="verificador-arte" className="vc-tool-preflight-wrap" aria-label="Verificador de archivos para imprenta">
          <ArtworkPreflightDropzone initialWidthCm={9} initialHeightCm={5} />
        </section>

        <section className="vc-tools-footer-band" aria-labelledby="vc-tools-cta-title">
          <div>
            <span className="site-eyebrow light">
              <i /> ¿LISTO PARA PRODUCIR?
            </span>
            <h2 id="vc-tools-cta-title">
              Lleva tu diseño de la pantalla
              <br />a <em>lo tangible.</em>
            </h2>
            <p>
              Si ya tienes tu vista previa, QR o archivo verificado, compártelo con nuestro equipo en Milagro y te ayudamos a definir materiales, cantidades y acabados.
            </p>
          </div>
          <div className="vc-tools-footer-actions">
            <Link className="site-primary-button" to="/cotizador">
              Ir al cotizador <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
            <Link className="site-secondary-button" to="/tienda">
              Explorar tienda <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
