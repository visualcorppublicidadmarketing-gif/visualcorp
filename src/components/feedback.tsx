import React from 'react';
import type { LucideIcon } from 'lucide-react';

export interface StageBadgeProps { stage?: string | null }
export interface EmptyStateProps { icon: LucideIcon; title: string; text: string; action?: React.ReactNode }

export function StageBadge({ stage }: StageBadgeProps) {
  const cls = String(stage||'Nuevo').toLowerCase().replaceAll(' ','-');
  return <span className={`stage-badge stage-${cls}`}>{stage||'Nuevo'}</span>;
}

export function EmptyState({ icon: Icon, title, text, action }: EmptyStateProps) {
  return <div className="empty-state"><span><Icon size={22}/></span><b>{title}</b><p>{text}</p>{action}</div>;
}
