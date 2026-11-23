import {
  addTransitionType,
  startTransition,
  ViewTransition,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { Link, useNavigate, type LinkProps } from 'react-router-dom';

export type NavTransitionType = 'nav-forward' | 'nav-back';

/**
 * Semantic React Router Link that triggers native React 19.3 View Transitions
 * with directional types while preserving modifier-key opens (Ctrl/Cmd/middle click).
 */
export function ViewTransitionLink({
  to,
  transitionType = 'nav-forward',
  onClick,
  ...rest
}: LinkProps & { transitionType?: NavTransitionType }) {
  const navigate = useNavigate();

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      rest.target === '_blank'
    ) {
      return;
    }

    event.preventDefault();
    startTransition(() => {
      addTransitionType(transitionType);
      navigate(to);
    });
  };

  return <Link to={to} onClick={handleClick} {...rest} />;
}

/**
 * Wraps hierarchical page views so forward/back transitions slide cleanly
 * while lateral navigation remains silent (default="none").
 */
export function DirectionalViewTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition
      default="none"
      enter={{
        'nav-forward': 'vc-vt-forward',
        'nav-back': 'vc-vt-back',
        default: 'none',
      }}
      exit={{
        'nav-forward': 'vc-vt-forward',
        'nav-back': 'vc-vt-back',
        default: 'none',
      }}
    >
      {children}
    </ViewTransition>
  );
}
