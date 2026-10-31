import {
  addMarketingDays,
  isTerminalMarketingStatus,
  marketingWeekStart,
} from "./marketingScheduleRules";

export const DELIVERABLES = [
  ["cover_status", "Portada"],
  ["art_status", "Arte"],
  ["caption_status", "Caption"],
  ["video_status", "Video"],
  ["voiceover_status", "Voz"],
  ["tiktok_status", "TikTok"],
] as const;
export type ChecklistField = (typeof DELIVERABLES)[number][0];
export type ChecklistStatus = "Sí" | "No" | "No aplica" | "Por confirmar";
export const CHECKLIST_STATES: ChecklistStatus[] = [
  "Sí",
  "No",
  "No aplica",
  "Por confirmar",
];
export type WorkflowPost = Record<string, any> & {
  id: string;
  title: string;
  status: string;
  scheduled_date: string;
};
export type Assignee = { user_id: string; display_name: string };
export type NonproductionDay = { id: string; day: string; reason: string };
export type MarketingReview = {
  id: string;
  post_id: string;
  content_revision: number;
  decision: "approved" | "changes_requested";
  feedback: string;
  actor_name: string;
  created_at: string;
};
export type WorkQueue =
  | "all"
  | "today"
  | "week"
  | "overdue"
  | "unassigned"
  | "review"
  | "mine"
  | "undated";
export type RecordFilter = "publications" | "monthly_plans" | "ideas";
export function isMonthlyPlan(post: WorkflowPost): boolean {
  return (
    post.record_kind === "monthly_plan" ||
    (!post.record_kind && post.title.startsWith("PLAN MENSUAL"))
  );
}
export function isPublication(post: WorkflowPost): boolean {
  return !isMonthlyPlan(post) && Boolean(post.title.trim());
}
export function productionOverdue(post: WorkflowPost, today: string): boolean {
  return (
    !isTerminalMarketingStatus(post.status) &&
    Boolean(post.due_date && post.due_date < today)
  );
}
export function publicationUnconfirmed(
  post: WorkflowPost,
  today: string,
): boolean {
  return (
    !isTerminalMarketingStatus(post.status) &&
    Boolean(post.scheduled_date && post.scheduled_date < today)
  );
}
export function checklistProgress(post: WorkflowPost) {
  const applicable = DELIVERABLES.filter(([key]) => post[key] !== "No aplica");
  return {
    total: applicable.length,
    done: applicable.filter(([key]) => post[key] === "Sí").length,
  };
}
export function latestReview(
  post: WorkflowPost,
  reviews: MarketingReview[],
): MarketingReview | undefined {
  return reviews
    .filter((review) => review.post_id === post.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}
export function approvalLabel(
  post: WorkflowPost,
  reviews: MarketingReview[],
): string {
  const review = latestReview(post, reviews);
  if (!review) return "Sin aprobación de versión registrada";
  if (review.content_revision !== post.content_revision)
    return "Contenido modificado: requiere nueva revisión";
  return review.decision === "approved"
    ? `Versión ${review.content_revision} aprobada por ${review.actor_name}`
    : "Cambios solicitados";
}
export function publicationWarnings(
  post: WorkflowPost,
  reviews: MarketingReview[],
  materials: any[],
): string[] {
  const warnings: string[] = [];
  if (!post.title.trim()) warnings.push("falta título");
  if (!post.owner_user_id)
    warnings.push(
      post.owner
        ? "responsable histórico sin vincular a una cuenta"
        : "sin responsable",
    );
  if (!post.scheduled_date) warnings.push("sin fecha de publicación");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(post.scheduled_time || ""))
    warnings.push("sin hora válida");
  if (!post.caption?.trim() && post.caption_status !== "No aplica")
    warnings.push("falta caption");
  if (!materials.length) warnings.push("sin material asociado");
  else if (
    !materials.some((asset) => asset.storage_status === "supabase_storage")
  )
    warnings.push("archivo solo local o no disponible en la Suite");
  for (const [key, label] of DELIVERABLES)
    if (!["Sí", "No aplica"].includes(post[key]))
      warnings.push(`${label.toLocaleLowerCase("es")} por confirmar`);
  const review = latestReview(post, reviews);
  if (
    !review ||
    review.decision !== "approved" ||
    review.content_revision !== post.content_revision
  )
    warnings.push("sin aprobación vigente de esta versión");
  return warnings;
}
export function matchesQueue(
  post: WorkflowPost,
  queue: WorkQueue,
  today: string,
  userId?: string,
  reviews: MarketingReview[] = [],
): boolean {
  if (queue === "all") return true;
  const open = !isTerminalMarketingStatus(post.status);
  if (!open) return false;
  const deadline = post.due_date || post.scheduled_date;
  if (queue === "today")
    return post.due_date === today || post.scheduled_date === today;
  if (queue === "week") {
    const start = marketingWeekStart(today);
    return Boolean(
      deadline && deadline >= start && deadline <= addMarketingDays(start, 6),
    );
  }
  if (queue === "overdue")
    return (
      productionOverdue(post, today) || publicationUnconfirmed(post, today)
    );
  if (queue === "unassigned") return !post.owner_user_id;
  if (queue === "review") {
    const review = latestReview(post, reviews);
    return (
      /revisi/i.test(post.status) ||
      Boolean(
        review?.decision === "approved" &&
        review.content_revision !== post.content_revision,
      )
    );
  }
  if (queue === "mine") return Boolean(userId && post.owner_user_id === userId);
  return !post.due_date && !post.scheduled_date;
}
export function compareWork(
  a: WorkflowPost,
  b: WorkflowPost,
  today: string,
): number {
  const rank = (p: WorkflowPost) =>
    isTerminalMarketingStatus(p.status)
      ? 4
      : productionOverdue(p, today) || publicationUnconfirmed(p, today)
        ? 0
        : p.due_date === today || p.scheduled_date === today
          ? 1
          : p.due_date || p.scheduled_date
            ? 2
            : 3;
  return (
    rank(a) - rank(b) ||
    (a.due_date || a.scheduled_date || "9999").localeCompare(
      b.due_date || b.scheduled_date || "9999",
    ) ||
    a.id.localeCompare(b.id)
  );
}
export function proposePublicationDate(
  today: string,
  closedDays: NonproductionDay[],
): string {
  const closed = new Set(closedDays.map((day) => day.day));
  let candidate = today;
  for (let i = 0; i < 3700; i++) {
    const day = new Date(`${candidate}T12:00:00`).getDay();
    if (day !== 0 && day !== 6 && !closed.has(candidate)) return candidate;
    candidate = addMarketingDays(candidate, 1);
  }
  throw new Error("No se encontró un día de producción disponible.");
}
