import { useEffect, useState, type ReactNode } from 'react';
import './avatar.css';

export type AvatarSize = 'sm' | 'md' | 'lg';
type AvatarProps = {
  name?: string | null;
  src?: string | null;
  size?: AvatarSize;
  className?: string;
  badge?: ReactNode;
  title?: string;
};

export function Avatar({ name = '', src, size = 'md', className = '', badge, title }: AvatarProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const safeSrc = safeImageUrl(src);
  const initials = getInitials(name);
  useEffect(() => setFailedSource(null), [safeSrc]);
  const showImage = Boolean(safeSrc && safeSrc !== failedSource);
  const accessibleName = name?.trim() || 'Usuario';

  return <span className={`vc-avatar size-${size} ${className}`.trim()} role="img" aria-label={title || accessibleName}>
    {showImage
      ? <img className="vc-avatar-image" src={safeSrc} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => safeSrc && setFailedSource(safeSrc)} />
      : <span className="vc-avatar-fallback" aria-hidden="true">{initials}</span>}
    {badge != null && <AvatarBadge>{badge}</AvatarBadge>}
  </span>;
}

export function AvatarBadge({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <span className={`vc-avatar-badge ${className}`.trim()} aria-hidden="true">{children}</span>;
}

export function getGoogleAvatarUrl(user: any): string | undefined {
  if (!user) return undefined;
  const identities = Array.isArray(user.identities) ? user.identities : [];
  const googleIdentity = identities.find((identity: any) => identity?.provider === 'google');
  const isGoogleAccount = user.app_metadata?.provider === 'google' || identities.some((identity: any) => identity?.provider === 'google');
  if (!isGoogleAccount) return undefined;
  const sources = [googleIdentity?.identity_data?.picture, googleIdentity?.identity_data?.avatar_url, user.user_metadata?.picture, user.user_metadata?.avatar_url];
  return sources.map(safeImageUrl).find(Boolean);
}

export function getInitials(name?: string | null) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts.slice(0, 2).map((part) => Array.from(part)[0]).join('').toLocaleUpperCase('es') : 'VC';
}

function safeImageUrl(value?: string | null): string | undefined {
  const candidate = String(value || '').trim();
  if (!candidate || candidate.length > 2048) return undefined;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}
