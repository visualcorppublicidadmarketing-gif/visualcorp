import { useEffect } from 'react';

export const PUBLIC_SITE_ORIGIN = 'https://visualcorp-suite.vercel.app';
export const DEFAULT_OG_IMAGE = `${PUBLIC_SITE_ORIGIN}/public-site/home-film/apertura.webp`;

export type PageMetadataOptions = {
  title: string;
  description: string;
  path: string;
  ogType?: 'website' | 'article';
  image?: string;
  robots?: string;
};

function upsertMetaTag(attr: 'name' | 'property', key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attr, key);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

function upsertLinkTag(rel: string, href: string) {
  let element = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!element) {
    element = document.createElement('link');
    element.setAttribute('rel', rel);
    document.head.appendChild(element);
  }
  element.setAttribute('href', href);
}

export function buildCanonicalUrl(path: string) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${PUBLIC_SITE_ORIGIN}${normalized === '/' ? '/' : normalized.replace(/\/+$/, '')}`;
}

export function usePageMetadata({
  title,
  description,
  path,
  ogType = 'website',
  image = DEFAULT_OG_IMAGE,
  robots = 'index, follow',
}: PageMetadataOptions) {
  useEffect(() => {
    const fullTitle = title.includes('Visual Corp') ? title : `${title} · Visual Corp`;
    const canonicalUrl = buildCanonicalUrl(path);
    const resolvedImage = /^https?:\/\//i.test(image)
      ? image
      : `${PUBLIC_SITE_ORIGIN}${image.startsWith('/') ? image : `/${image}`}`;

    document.title = fullTitle;
    upsertMetaTag('name', 'description', description);
    upsertMetaTag('name', 'robots', robots);
    upsertLinkTag('canonical', canonicalUrl);

    upsertMetaTag('property', 'og:type', ogType);
    upsertMetaTag('property', 'og:site_name', 'Visual Corp');
    upsertMetaTag('property', 'og:locale', 'es_EC');
    upsertMetaTag('property', 'og:title', fullTitle);
    upsertMetaTag('property', 'og:description', description);
    upsertMetaTag('property', 'og:url', canonicalUrl);
    upsertMetaTag('property', 'og:image', resolvedImage);

    upsertMetaTag('name', 'twitter:card', 'summary_large_image');
    upsertMetaTag('name', 'twitter:title', fullTitle);
    upsertMetaTag('name', 'twitter:description', description);
    upsertMetaTag('name', 'twitter:image', resolvedImage);
  }, [description, image, ogType, path, robots, title]);
}

export function PageMeta(props: PageMetadataOptions) {
  usePageMetadata(props);
  return null;
}
