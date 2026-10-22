import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, Play, X } from 'lucide-react';
import { assetPath } from '../../data/media';

export function MediaGallery({ items = [], layout = 'grid', columns = 3, caption = true }) {
  const [active, setActive] = useState(null);
  const [slide, setSlide] = useState(0);
  const media = items.map((item) => {
    if (typeof item === 'string') return { src: assetPath(item), alt: '' };
    return { ...item, src: assetPath(item?.src) };
  });

  useEffect(() => {
    if (active !== null) {
      const close = (event) => event.key === 'Escape' && setActive(null);
      window.addEventListener('keydown', close);
      return () => window.removeEventListener('keydown', close);
    }
  }, [active]);

  if (!media.length) return <div className="studio-gallery-empty">Añade imágenes para visualizar la galería.</div>;
  const visible = layout === 'carousel' ? [media[slide]] : media;

  return (
    <>
      <div className={`studio-gallery studio-gallery-${layout}`} style={{ '--gallery-columns': columns }}>
        {visible.map((item, index) => (
          <button
            type="button"
            className="studio-gallery-item"
            key={`${item.src}-${index}`}
            onClick={() => setActive(layout === 'carousel' ? slide : index)}
          >
            <img src={assetPath(item.src)} alt={item.alt || ''} />
            <span className="studio-gallery-overlay">
              {item.caption && caption && <small>{item.caption}</small>}
              <Maximize2 size={17} />
            </span>
          </button>
        ))}
        {layout === 'carousel' && media.length > 1 && (
          <div className="studio-gallery-controls">
            <button type="button" onClick={() => setSlide((slide - 1 + media.length) % media.length)}>
              <ChevronLeft size={17} />
            </button>
            <span>
              {slide + 1} / {media.length}
            </span>
            <button type="button" onClick={() => setSlide((slide + 1) % media.length)}>
              <ChevronRight size={17} />
            </button>
          </div>
        )}
      </div>
      {active !== null && (
        <div className="studio-lightbox" role="dialog" aria-modal="true" onClick={() => setActive(null)}>
          <button type="button" onClick={() => setActive(null)} aria-label="Cerrar">
            <X />
          </button>
          <img src={assetPath(media[active].src)} alt={media[active].alt || ''} onClick={(event) => event.stopPropagation()} />
          {media[active].caption && <p>{media[active].caption}</p>}
          {media.length > 1 && (
            <>
              <button
                className="lightbox-prev"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setActive((active - 1 + media.length) % media.length);
                }}
              >
                <ChevronLeft />
              </button>
              <button
                className="lightbox-next"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setActive((active + 1) % media.length);
                }}
              >
                <ChevronRight />
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}

export function VideoEmbed({ url, title = 'Video Gigaprint', poster }) {
  return (
    <div className="studio-video">
      <div className="studio-video-cover">
        {poster ? <img src={assetPath(poster)} alt="" /> : <div className="studio-video-placeholder"><Play size={26} /></div>}
        <a href={url} target="_blank" rel="noreferrer" aria-label={`Reproducir ${title}`}>
          <Play size={21} fill="currentColor" />
        </a>
      </div>
      <small>{title}</small>
    </div>
  );
}
