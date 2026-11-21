import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { PanelsTopLeft, Printer, ScanLine, Scissors, Shirt, Store } from 'lucide-react';
import { useInView } from 'motion/react';
import type { PublicServiceId } from './content';
import './service-keycap.css';

const OriginkitSingleGlassKeyboard = lazy(() => import('@/components/originkit/ui/single-glass-keyboard'));

const serviceKeycapVisuals: Record<PublicServiceId, { Icon: typeof Printer; mark: string; color: string }> = {
  impresion: { Icon: Printer, mark: '/public-site/originkit/printer-mark.svg', color: '#FFFFFF' },
  'gran-formato': { Icon: PanelsTopLeft, mark: '/public-site/originkit/billboard-mark.svg', color: '#82DDF3' },
  rotulos: { Icon: Store, mark: '/public-site/originkit/storefront-mark.svg', color: '#F2A5D1' },
  textil: { Icon: Shirt, mark: '/public-site/originkit/shirt-mark.svg', color: '#F2A5D1' },
  corte: { Icon: Scissors, mark: '/public-site/originkit/scissors-mark.svg', color: '#D1A4F0' },
  eventos: { Icon: ScanLine, mark: '/public-site/originkit/events-mark.svg', color: '#82DDF3' },
};

export function getServiceKeycapColor(serviceId: PublicServiceId) {
  return serviceKeycapVisuals[serviceId].color;
}

export function ServiceKeycap({ serviceId, className = '' }: { serviceId: PublicServiceId; className?: string }) {
  const { Icon, mark, color } = serviceKeycapVisuals[serviceId];
  const stageRef = useRef<HTMLDivElement>(null);
  const nearViewport = useInView(stageRef, { margin: '100px' });
  const [stageBounds, setStageBounds] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      setStageBounds((current) => (
        current.width === width && current.height === height ? current : { width, height }
      ));
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const keySize = stageBounds.width && stageBounds.height
    ? Math.min(320, Math.max(145, Math.round(Math.min(stageBounds.width * 0.68, stageBounds.height * 0.68))))
    : 180;

  return (
    <div ref={stageRef} className={`service-keycap-stage ${className}`.trim()}>
      {nearViewport ? (
        <Suspense fallback={<Icon className="service-keycap-fallback" size={keySize} strokeWidth={1.1} aria-hidden="true" style={{ color, width: keySize, height: keySize }} />}>
          <OriginkitSingleGlassKeyboard
            background="transparent"
            legend=""
            mark={mark}
            legendColor={color}
            size={keySize}
            advanced={{ grain: 0, vignette: 0 }}
          />
        </Suspense>
      ) : (
        <Icon className="service-keycap-fallback" size={keySize} strokeWidth={1.1} style={{ color, width: keySize, height: keySize }} aria-hidden="true" />
      )}
    </div>
  );
}
