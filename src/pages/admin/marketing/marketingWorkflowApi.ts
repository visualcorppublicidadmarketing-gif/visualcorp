import { supabase } from "../../../lib/supabaseClient";
import type { WorkflowPost } from "./marketingWorkflow";

export function workflowError(error: any): Error {
  return new Error(
    error?.code === "42501" &&
      /permission denied for table marketing_posts/i.test(error?.message || "")
      ? "Actualiza la página para usar el nuevo guardado de Marketing."
      : error?.message ||
          "No se pudo guardar. Tus cambios permanecen disponibles.",
  );
}
export async function saveMarketingPost(
  organizationId: string,
  post: WorkflowPost | null,
  patch: Record<string, unknown>,
  creationKey?: string,
): Promise<WorkflowPost> {
  if (!supabase) throw new Error("Conexión no disponible.");
  // Preserve legacy values (including old time ranges) when unrelated fields are edited.
  const changes = Object.fromEntries(
    Object.entries(patch).filter(
      ([key, value]) =>
        !post || JSON.stringify(value) !== JSON.stringify(post[key]),
    ),
  );
  const { data, error } = await supabase.rpc("save_marketing_post", {
    p_organization_id: organizationId,
    p_post_id: post?.id || null,
    p_expected_version: post?.row_version || null,
    p_patch: changes,
    p_creation_key: creationKey || null,
  });
  if (error) throw workflowError(error);
  return data as WorkflowPost;
}
