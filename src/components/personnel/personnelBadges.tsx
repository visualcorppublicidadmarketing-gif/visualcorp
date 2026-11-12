import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Laptop,
  MapPin,
  MinusCircle,
  OctagonAlert,
  PauseCircle,
  Send,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { ATTENDANCE_META, DEDUCTION_STATUS_META } from './personnelDomain';
import type { AttendanceStatus, DeductionStatus, PersonnelStatus, ReadinessTier } from './personnelTypes';

export function PersonnelStatusBadge({ status }: { status: PersonnelStatus }) {
  const isActive = status === 'active';
  return (
    <span className={`vc-semiotic-badge ${isActive ? 'is-positive is-pill' : 'is-neutral is-pill'}`}>
      {isActive ? <CheckCircle2 size={13} aria-hidden="true" /> : <PauseCircle size={13} aria-hidden="true" />}
      <span>{isActive ? 'Activo' : 'Inactivo'}</span>
    </span>
  );
}

export function AttendanceStatusBadge({
  status,
  compact = false,
}: {
  status: AttendanceStatus | 'sin_marcar' | 'descanso';
  compact?: boolean;
}) {
  if (status === 'sin_marcar') {
    return (
      <span className="vc-semiotic-badge is-neutral is-dashed is-pill">
        <MinusCircle size={12} aria-hidden="true" />
        <span>Sin marcación</span>
      </span>
    );
  }
  if (status === 'descanso') {
    return (
      <span className="vc-semiotic-badge is-neutral is-rounded">
        <CalendarClock size={12} aria-hidden="true" />
        <span>Descanso / cerrado</span>
      </span>
    );
  }

  const meta = ATTENDANCE_META[status];
  const label = compact ? meta.shortLabel : meta.label;

  if (status === 'presente') {
    return (
      <span className="vc-semiotic-badge is-positive is-pill">
        <CheckCircle2 size={12} aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  }
  if (status === 'en_campo') {
    return (
      <span className="vc-semiotic-badge is-sky is-rounded">
        <MapPin size={12} aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  }
  if (status === 'remoto') {
    return (
      <span className="vc-semiotic-badge is-indigo is-rounded">
        <Laptop size={12} aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  }
  if (status === 'tardanza') {
    return (
      <span className="vc-semiotic-badge is-warning is-dashed is-pill">
        <Clock size={12} aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  }
  if (status === 'permiso' || status === 'vacaciones') {
    return (
      <span className="vc-semiotic-badge is-sky is-dashed is-rounded">
        <CalendarClock size={12} aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  }
  return (
    <span className="vc-semiotic-badge is-danger is-square">
      <OctagonAlert size={12} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function DeductionStatusBadge({ status }: { status: DeductionStatus }) {
  const meta = DEDUCTION_STATUS_META[status];
  if (status === 'pending_authorization') {
    return (
      <span className="vc-semiotic-badge is-warning is-dashed is-pill" title={meta.description}>
        <Clock size={12} aria-hidden="true" />
        <span>{meta.label}</span>
      </span>
    );
  }
  if (status === 'authorized') {
    return (
      <span className="vc-semiotic-badge is-sky is-pill" title={meta.description}>
        <ShieldCheck size={12} aria-hidden="true" />
        <span>{meta.label}</span>
      </span>
    );
  }
  if (status === 'sent_to_payroll') {
    return (
      <span className="vc-semiotic-badge is-indigo is-rounded" title={meta.description}>
        <Send size={12} aria-hidden="true" />
        <span>{meta.label}</span>
      </span>
    );
  }
  if (status === 'applied_externally') {
    return (
      <span className="vc-semiotic-badge is-positive is-pill" title={meta.description}>
        <CheckCircle2 size={12} aria-hidden="true" />
        <span>{meta.label}</span>
      </span>
    );
  }
  return (
    <span className="vc-semiotic-badge is-neutral is-square" title={meta.description}>
      <XCircle size={12} aria-hidden="true" />
      <span>{meta.label}</span>
    </span>
  );
}

export function ReadinessBadge({ tier, score, maxScore }: { tier: ReadinessTier; score: number; maxScore: number }) {
  if (tier === 'complete') {
    return (
      <span className="vc-semiotic-badge is-positive is-pill">
        <CheckCircle2 size={12} aria-hidden="true" />
        <span>Ficha {score}/{maxScore}</span>
      </span>
    );
  }
  if (tier === 'attention') {
    return (
      <span className="vc-semiotic-badge is-warning is-dashed is-pill">
        <AlertTriangle size={12} aria-hidden="true" />
        <span>Acceso pendiente · {score}/{maxScore}</span>
      </span>
    );
  }
  return (
    <span className="vc-semiotic-badge is-danger is-square">
      <OctagonAlert size={12} aria-hidden="true" />
      <span>Incompleta · {score}/{maxScore}</span>
    </span>
  );
}
