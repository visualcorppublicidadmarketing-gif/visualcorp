import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';

type CreativeToolLinkProps = {
  base?: string;
  returnTo: string;
  label?: string;
};

export function CreativeToolLink({ base, returnTo, label = 'Probar tu logo' }: CreativeToolLinkProps) {
  const params = new URLSearchParams({ returnTo });
  if (base) params.set('base', base);

  return (
    <Link className="site-secondary-button" to={`/herramientas?${params.toString()}`}>
      <Sparkles size={15} aria-hidden="true" />
      {label}
    </Link>
  );
}
