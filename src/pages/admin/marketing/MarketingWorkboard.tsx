import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  UserRound,
  X,
} from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import {
  DELIVERABLES,
  approvalLabel,
  checklistProgress,
  isPublication,
  matchesQueue,
  productionOverdue,
  publicationUnconfirmed,
  publicationWarnings,
  proposePublicationDate,
  type Assignee,
  type MarketingReview,
  type NonproductionDay,
  type RecordFilter,
  type WorkQueue,
  type WorkflowPost,
} from "./marketingWorkflow";
import "./marketing-workflow.css";

function ReviewMaterial({ asset }: { asset: any }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setUrl("");
    setError("");
    if (
      !supabase ||
      !asset.rel_path.startsWith("storage://marketing-assets/")
    ) {
      setError("Referencia sin acceso al almacenamiento central.");
      return;
    }
    supabase.storage
      .from("marketing-assets")
      .createSignedUrl(
        asset.rel_path.slice("storage://marketing-assets/".length),
        300,
      )
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setError(error.message);
        else setUrl(data.signedUrl);
      })
      .catch(() => {
        if (alive)
          setError("No se pudo preparar la vista previa. Revisa tu conexión.");
      });
    return () => {
      alive = false;
    };
  }, [asset.rel_path, attempt]);
  const extension = (asset.extension || asset.filename.split(".").pop() || "")
    .replace(/^\./, "")
    .toLowerCase();
  if (error)
    return (
      <div role="alert">
        <p>{error}</p>
        <button type="button" onClick={() => setAttempt((n) => n + 1)}>
          Reintentar vista previa
        </button>
      </div>
    );
  if (!url) return <p role="status">Preparando acceso privado al material…</p>;
  if (["png", "jpg", "jpeg", "webp", "gif", "avif", "svg"].includes(extension))
    return (
      <img
        src={url}
        alt={asset.filename}
        onError={() =>
          setError("No se pudo cargar el archivo. Vuelve a intentarlo.")
        }
      />
    );
  if (["mp4", "webm", "mov"].includes(extension))
    return (
      <video src={url} controls playsInline style={{ maxWidth: "100%" }} />
    );
  return (
    <a href={url} target="_blank" rel="noreferrer">
      Abrir archivo para revisión
    </a>
  );
}

export function WorkflowDialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => {
      ref.current?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      className={`mk-dialog${wide ? " mk-review-panel" : ""}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2 id={id}>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Cerrar panel"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}

export function WorkflowToolbar({
  posts,
  today,
  userId,
  queue,
  onQueue,
  recordFilter,
  onRecordFilter,
  reviews,
}: {
  posts: WorkflowPost[];
  today: string;
  userId?: string;
  queue: WorkQueue;
  onQueue: (q: WorkQueue) => void;
  recordFilter: RecordFilter;
  onRecordFilter: (f: RecordFilter) => void;
  reviews: MarketingReview[];
}) {
  const entries: [WorkQueue, string][] = [
    ["all", "Todas"],
    ["today", "Hoy"],
    ["week", "Esta semana"],
    ["overdue", "Vencidas"],
    ["unassigned", "Sin responsable"],
    ["review", "En revisión"],
    ["mine", "Mis publicaciones"],
    ["undated", "Sin fecha"],
  ];
  const publications = posts.filter(isPublication);
  return (
    <section className="mk-work-toolbar" aria-label="Bandeja de pendientes">
      <div className="mk-work-title">
        <div>
          <span className="eyebrow">TU BANDEJA DE TRABAJO</span>
          <h2>Qué sigue y qué falta</h2>
        </div>
        <label>
          Tipo de registro
          <select
            value={recordFilter}
            onChange={(e) => {
              onRecordFilter(e.target.value as RecordFilter);
              onQueue("all");
            }}
          >
            <option value="publications">Publicaciones</option>
            <option value="monthly_plans">Planes mensuales</option>
            <option value="ideas">Espacios sin título</option>
          </select>
        </label>
      </div>
      {recordFilter === "publications" && (
        <div className="mk-work-queues">
          {entries.map(([key, label]) => (
            <button
              type="button"
              key={key}
              aria-pressed={queue === key}
              onClick={() => onQueue(key)}
            >
              {label}
              <b>
                {
                  publications.filter((p) =>
                    matchesQueue(p, key, today, userId, reviews),
                  ).length
                }
              </b>
            </button>
          ))}
        </div>
      )}
      {recordFilter === "monthly_plans" && (
        <p>
          Fichas de planificación. No cuentan como publicaciones ni se envían a
          aprobación como piezas.
        </p>
      )}
      {recordFilter === "ideas" && (
        <p>
          Espacios del calendario que necesitan un título y un tema concreto.
          Abre una ficha para completar la idea.
        </p>
      )}
    </section>
  );
}

export function WorkDetails({
  post,
  today,
  reviews,
  materials,
  onReview,
  onReschedule,
  canEdit,
}: {
  post: WorkflowPost;
  today: string;
  reviews: MarketingReview[];
  materials: any[];
  onReview: () => void;
  onReschedule: () => void;
  canEdit: boolean;
}) {
  const progress = checklistProgress(post);
  const publication = isPublication(post);
  const warnings = publication
    ? publicationWarnings(post, reviews, materials)
    : [];
  return (
    <section
      className="mk-work-details"
      aria-label={`Pendientes de ${post.title || "idea por definir"}`}
    >
      <div>
        <span>
          <UserRound size={14} />
          {post.owner_user_id
            ? post.owner
            : post.owner
              ? `${post.owner} · sin cuenta vinculada`
              : "Sin responsable"}
        </span>
        <span>
          <CalendarDays size={14} />
          Producción: {post.due_date || "sin fecha"}
        </span>
        <span>
          Publicación: {post.scheduled_date || "sin fecha"}{" "}
          {post.scheduled_time || "· sin hora"}
        </span>
      </div>
      {productionOverdue(post, today) && (
        <strong className="mk-danger">Producción vencida</strong>
      )}
      {publicationUnconfirmed(post, today) && (
        <strong className="mk-danger">
          Publicación pendiente de confirmar
        </strong>
      )}
      <p>{post.next_action || "Define el siguiente paso de esta pieza."}</p>
      {publication && (
        <>
          <div
            className="mk-progress"
            role="progressbar"
            aria-label="Entregables confirmados"
            aria-valuemin={0}
            aria-valuemax={Math.max(progress.total, 1)}
            aria-valuenow={progress.done}
            aria-valuetext={
              progress.total
                ? `${progress.done} de ${progress.total} entregables confirmados`
                : "Sin entregables aplicables"
            }
          >
            <i
              style={{
                width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
              }}
            />
          </div>
          <small>
            {progress.total
              ? `${progress.done} de ${progress.total} entregables confirmados`
              : "Sin entregables aplicables"}
          </small>
          <small>{approvalLabel(post, reviews)}</small>
        </>
      )}
      {warnings.length > 0 && (
        <details>
          <summary>
            <AlertCircle size={14} />
            {warnings.length} datos por resolver
          </summary>
          <ul>
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </details>
      )}
      {post.blocked_reason && (
        <p className="mk-danger">Bloqueo: {post.blocked_reason}</p>
      )}
      <div className="mk-work-actions">
        {publication && (
          <button type="button" onClick={onReview}>
            <ClipboardCheck size={15} />
            Revisar pieza
          </button>
        )}
        {canEdit && (
          <button type="button" onClick={onReschedule}>
            Proponer nueva fecha
          </button>
        )}
      </div>
    </section>
  );
}

export function ReviewPanel({
  post,
  materials,
  reviews,
  events,
  canEdit,
  canApprove,
  onDecision,
  onEdit,
  onReload,
  onClose,
}: {
  post: WorkflowPost;
  materials: any[];
  reviews: MarketingReview[];
  events: any[];
  canEdit: boolean;
  canApprove: boolean;
  onDecision: (
    decision: "approved" | "changes_requested",
    feedback: string,
  ) => Promise<void>;
  onEdit: () => void;
  onReload: () => void;
  onClose: () => void;
}) {
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const relevant = reviews
    .filter((r) => r.post_id === post.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const close = () => {
    if (
      !busy &&
      (!feedback.trim() ||
        window.confirm("¿Cerrar sin guardar el comentario de revisión?"))
    )
      onClose();
  };
  const decide = async (decision: "approved" | "changes_requested") => {
    if (decision === "changes_requested" && !feedback.trim()) {
      setError("Explica los cambios que necesita la pieza.");
      return;
    }
    const missing = publicationWarnings(post, reviews, materials).filter(
      (w) => !w.includes("aprobación vigente"),
    );
    if (
      decision === "approved" &&
      missing.length &&
      !window.confirm(
        `La pieza tiene estos pendientes:\n${missing.join("\n")}\n¿Confirmas que revisaste la versión ${post.content_revision} y deseas aprobarla?`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await onDecision(decision, feedback);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <WorkflowDialog
      title={`Revisión · ${post.title || "Sin título"}`}
      onClose={close}
      wide
    >
      <div className="mk-panel-body">
        <p>
          Versión de contenido {post.content_revision} ·{" "}
          {approvalLabel(post, reviews)}
        </p>
        <section
          aria-label="Material de la pieza"
          className="mk-review-materials"
        >
          {materials.length ? (
            materials.map((asset) => (
              <article key={asset.id}>
                {asset.storage_status === "supabase_storage" ? (
                  <ReviewMaterial asset={asset} />
                ) : (
                  <div className="mk-local-reference">
                    <AlertCircle size={22} />
                    <b>Archivo local · sin vista previa en la Suite</b>
                    <code>{asset.rel_path}</code>
                  </div>
                )}
                <strong>{asset.filename}</strong>
              </article>
            ))
          ) : (
            <p>Sin material asociado. Abre la ficha para vincularlo.</p>
          )}
        </section>
        <h3>Mensaje</h3>
        <p className="mk-preserve-text">
          {post.caption || "Caption pendiente"}
        </p>
        <p>
          <b>CTA:</b> {post.cta || "Por definir"} ·{" "}
          {post.cta_destination || "Destino pendiente"}
        </p>
        <h3>Preparación</h3>
        <ul>
          {DELIVERABLES.map(([key, label]) => (
            <li key={key}>
              {label}: {post[key] || "Por confirmar"}
            </li>
          ))}
        </ul>
        <p>
          <b>Siguiente acción:</b> {post.next_action || "Pendiente"}
        </p>
        <h3>Decisiones registradas</h3>
        {relevant.length ? (
          relevant.map((r) => (
            <article className="mk-review-event" key={r.id}>
              <b>
                {r.decision === "approved" ? "Aprobada" : "Cambios solicitados"}{" "}
                · versión {r.content_revision}
              </b>
              <small>
                {r.actor_name} ·{" "}
                {new Date(r.created_at).toLocaleString("es-EC", {
                  timeZone: "America/Guayaquil",
                })}
              </small>
              <p className="mk-preserve-text">{r.feedback}</p>
            </article>
          ))
        ) : (
          <p>Sin aprobación de versión registrada.</p>
        )}
        <details>
          <summary>Historial de la ficha</summary>
          {events.length ? (
            events.map((e) => (
              <p key={e.id}>
                {e.field_name}: {e.previous_value || "vacío"} → {e.new_value} ·{" "}
                {new Date(e.created_at).toLocaleString("es-EC", {
                  timeZone: "America/Guayaquil",
                })}
              </p>
            ))
          ) : (
            <p>Sin cambios registrados.</p>
          )}
        </details>
        {canApprove && (
          <label className="mk-field">
            Comentario de revisión
            <textarea
              value={feedback}
              disabled={busy}
              onChange={(e) => setFeedback(e.target.value)}
              maxLength={5000}
              placeholder="Obligatorio al solicitar cambios"
            />
          </label>
        )}
        {!canApprove && (
          <p>La aprobación corresponde a gerencia o a personas designadas.</p>
        )}
        {error && (
          <div role="alert" className="mk-danger">
            <p>{error}</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (
                  !feedback ||
                  window.confirm(
                    "¿Recargar la pieza? Tu comentario permanecerá disponible.",
                  )
                )
                  onReload();
              }}
            >
              Actualizar versión para revisar
            </button>
          </div>
        )}
      </div>
      <footer>
        {canEdit && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (
                !feedback ||
                window.confirm("¿Abrir la ficha y descartar este comentario?")
              )
                onEdit();
            }}
          >
            Editar ficha
          </button>
        )}
        {canApprove && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void decide("changes_requested")}
            >
              Solicitar cambios
            </button>
            <button
              type="button"
              className="button button-dark"
              disabled={busy}
              onClick={() => void decide("approved")}
            >
              <CheckCircle2 size={15} />
              {busy ? "Guardando…" : "Aprobar versión"}
            </button>
          </>
        )}
      </footer>
    </WorkflowDialog>
  );
}

export function DateProposal({
  post,
  today,
  closedDays,
  initialDate,
  onSave,
  onClose,
}: {
  post: WorkflowPost;
  today: string;
  closedDays: NonproductionDay[];
  initialDate?: string;
  onSave: (field: string, date: string) => Promise<void>;
  onClose: () => void;
}) {
  const [date, setDate] = useState(
    () => initialDate || proposePublicationDate(today, closedDays),
  );
  const [field, setField] = useState("scheduled_date");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const closed = closedDays.find((d) => d.day === date);
  return (
    <WorkflowDialog
      title="Proponer nueva fecha"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await onSave(field, date);
            onClose();
          } catch (err: any) {
            setError(err.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="mk-panel-body">
          <h3>{post.title || "Idea por definir"}</h3>
          <label className="mk-field">
            Fecha que quieres cambiar
            <select value={field} onChange={(e) => setField(e.target.value)}>
              <option value="scheduled_date">Publicación</option>
              <option value="due_date">Producción</option>
            </select>
          </label>
          <p>
            Fecha actual: <b>{post[field] || "sin fecha"}</b>
          </p>
          <label className="mk-field">
            Fecha propuesta
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <p>La fecha actual se conserva hasta que confirmes el cambio.</p>
          {closed && (
            <p className="mk-danger">
              Día sin producción: {closed.reason}. Puedes programar contenido en
              redes para ese día.
            </p>
          )}
          {error && (
            <p role="alert" className="mk-danger">
              {error}
            </p>
          )}
        </div>
        <footer>
          <button type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="button button-dark" disabled={busy}>
            {busy ? "Guardando…" : "Confirmar nueva fecha"}
          </button>
        </footer>
      </form>
    </WorkflowDialog>
  );
}

export function NonproductionSettings({
  days,
  onSave,
  onClose,
}: {
  days: NonproductionDay[];
  onSave: (date: string, reason: string, remove?: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const act = async (day: string, label: string, remove = false) => {
    setBusy(true);
    setError("");
    try {
      await onSave(day, label, remove);
      setDate("");
      setReason("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <WorkflowDialog
      title="Días sin producción"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="mk-panel-body">
        <p>
          Las propuestas de fechas evitan estos días. El contenido sí puede
          quedar programado en redes.
        </p>
        {days.map((day) => (
          <article className="mk-closure" key={day.id}>
            <span>
              <b>{day.day}</b> · {day.reason}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`¿Quitar el cierre del ${day.day}?`))
                  void act(day.day, day.reason, true);
              }}
            >
              Quitar
            </button>
          </article>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act(date, reason);
          }}
        >
          <label className="mk-field">
            Fecha
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="mk-field">
            Motivo
            <input
              required
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button type="submit" className="button button-dark" disabled={busy}>
            Guardar día sin producción
          </button>
        </form>
        {error && (
          <p role="alert" className="mk-danger">
            {error}
          </p>
        )}
      </div>
    </WorkflowDialog>
  );
}

export function BulkAssignment({
  assignees,
  busy,
  onAssign,
}: {
  assignees: Assignee[];
  busy: boolean;
  onAssign: (id: string) => void;
}) {
  const [owner, setOwner] = useState("");
  return (
    <div className="mk-bulk-assignment">
      <label>
        Asignar seleccionadas
        <select
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          disabled={busy}
        >
          <option value="">Elige responsable</option>
          {assignees.map((a) => (
            <option key={a.user_id} value={a.user_id}>
              {a.display_name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={busy || !owner}
        onClick={() => onAssign(owner)}
      >
        Asignar
      </button>
    </div>
  );
}
