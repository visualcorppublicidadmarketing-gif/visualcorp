import { Star } from 'lucide-react';
import './advisor-product-favorite-button.css';

export function AdvisorProductFavoriteButton({ favorite, onToggle, disabled = false, className = '' }: {
  favorite: boolean;
  onToggle: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return <button
    className={`advisor-product-favorite${favorite ? ' is-active' : ''}${className ? ` ${className}` : ''}`}
    type="button"
    aria-label={favorite ? 'Quitar producto de mis favoritos' : 'Marcar producto como favorito'}
    aria-pressed={favorite}
    title={favorite ? 'Quitar de mis productos favoritos' : 'Marcar como mi producto favorito'}
    disabled={disabled}
    onClick={onToggle}
  ><Star size={16} fill={favorite ? 'currentColor' : 'none'} aria-hidden="true"/></button>;
}
