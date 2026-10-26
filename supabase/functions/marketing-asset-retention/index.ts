import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const bucket = "marketing-assets";
const pathPrefix = `storage://${bucket}/`;
const imageExtensions = new Set(["png", "jpg", "jpeg", "webp", "gif", "avif", "svg", "bmp", "tif", "tiff"]);
const pageSize = 500;
const maxDeletesPerRun = 200;

type Asset = {
  id: string;
  organization_id: string;
  source_system: string;
  rel_path: string;
  extension: string;
  retention_months: number;
};

function ecuadorToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addMonths(dateText: string, months: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
  if (!match || !Number.isInteger(months) || months < 1 || months > 120) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const original = new Date(Date.UTC(year, month - 1, day));
  if (original.getUTCFullYear() !== year || original.getUTCMonth() !== month - 1 || original.getUTCDate() !== day) return null;
  const targetMonthIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = targetMonthIndex % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const projectUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!projectUrl || !serviceRoleKey) return Response.json({ error: "Missing server configuration" }, { status: 500 });

  const supabase = createClient(projectUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const today = ecuadorToday();
  let removed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let offset = 0; removed < maxDeletesPerRun; offset += pageSize) {
    const { data: assets, error: assetError } = await supabase
      .from("marketing_assets")
      .select("id, organization_id, source_system, rel_path, extension, retention_months")
      .eq("source_system", "visualcorp-suite")
      .eq("storage_status", "supabase_storage")
      .eq("retention_enabled", true)
      .order("updated_at", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (assetError) return Response.json({ error: "Could not read retention candidates" }, { status: 500 });
    if (!assets?.length) break;

    for (const asset of assets as Asset[]) {
      if (removed >= maxDeletesPerRun) break;
      const extension = asset.extension.replace(/^\./, "").toLowerCase();
      const objectPath = asset.rel_path.startsWith(pathPrefix) ? asset.rel_path.slice(pathPrefix.length) : "";
      if (!imageExtensions.has(extension) || !objectPath || objectPath.split("/")[0] !== asset.organization_id) {
        skipped += 1;
        continue;
      }

      const { data: links, error: linkError } = await supabase
        .from("marketing_post_assets")
        .select("post_id")
        .eq("organization_id", asset.organization_id)
        .eq("asset_id", asset.id);
      if (linkError) { errors.push(`${asset.id}: could not read publication links`); continue; }
      if (!links?.length) { skipped += 1; continue; }

      const postIds = [...new Set(links.map((link) => link.post_id))];
      const { data: posts, error: postError } = await supabase
        .from("marketing_posts")
        .select("id, scheduled_date")
        .eq("organization_id", asset.organization_id)
        .in("id", postIds);
      if (postError) { errors.push(`${asset.id}: could not read publication dates`); continue; }

      const dates = new Map((posts || []).map((post) => [post.id, post.scheduled_date]));
      const expirations = postIds.map((id) => {
        const rawDate = dates.get(id);
        const scheduledDate = typeof rawDate === "string" ? rawDate.slice(0, 10) : "";
        return addMonths(scheduledDate, asset.retention_months);
      });
      // An asset shared by multiple posts is retained through the latest date;
      // missing or invalid dates never trigger deletion.
      if (expirations.some((date) => !date)) { skipped += 1; continue; }
      const latestExpiry = expirations.sort().at(-1)!;
      if (today <= latestExpiry) { skipped += 1; continue; }

      const { error: removeError } = await supabase.storage.from(bucket).remove([objectPath]);
      if (removeError) { errors.push(`${asset.id}: storage removal failed`); continue; }

      const { error: updateError } = await supabase
        .from("marketing_assets")
        .update({
          storage_status: "retention_deleted",
          is_available: false,
          preview_status: "retention_deleted",
          preview_error: "Archivo eliminado automáticamente al vencer el plazo de conservación.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", asset.id)
        .eq("organization_id", asset.organization_id)
        .eq("storage_status", "supabase_storage");
      if (updateError) { errors.push(`${asset.id}: metadata update failed after removal`); continue; }
      removed += 1;
    }

    if (assets.length < pageSize) break;
  }

  return Response.json({ today, removed, skipped, errors: errors.slice(0, 20) });
});
