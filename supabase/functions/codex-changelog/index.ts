import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const organizationSlug = "visual-corp";
const maximumBodyBytes = 24 * 1024;
const maximumClockSkewSeconds = 300;
const validCategories = new Set(["general", "website", "sales", "inventory", "operations", "security"]);
const validAudiences = new Set(["both", "admin", "operations"]);
const encoder = new TextEncoder();

type ExistingEntry = { id: string; status: string; published_at: string | null };

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function readBodyWithinLimit(request: Request): Promise<string | null> {
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maximumBodyBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function decodeHex(value: string): Uint8Array | null {
  if (!/^[a-f0-9]{64}$/i.test(value)) return null;
  const result = new Uint8Array(32);
  for (let index = 0; index < result.length; index += 1) {
    result[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return result;
}

async function hasValidSignature(secret: string, timestamp: string, signature: string, rawBody: string) {
  if (!/^\d{10,12}$/.test(timestamp)) return false;
  const timestampSeconds = Number(timestamp);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(timestampSeconds) || Math.abs(nowSeconds - timestampSeconds) > maximumClockSkewSeconds) {
    return false;
  }

  const supplied = decodeHex(signature);
  if (!supplied) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${rawBody}`)));
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected[index] ^ supplied[index];
  }
  return difference === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textField(value: unknown, minimum: number, maximum: number, optional = false): string | null {
  if (optional && (value === undefined || value === null)) return "";
  if (typeof value !== "string") return null;
  const text = value.trim();
  if ((!optional && text.length < minimum) || text.length > maximum) return null;
  return text;
}

async function findEntry(
  supabaseUrl: string,
  serviceRoleKey: string,
  organizationId: string,
  entryId: string,
): Promise<ExistingEntry | null | "error"> {
  const url = new URL(`${supabaseUrl}/rest/v1/internal_change_log`);
  url.searchParams.set("select", "id,status,published_at");
  url.searchParams.set("id", `eq.${entryId}`);
  url.searchParams.set("organization_id", `eq.${organizationId}`);

  try {
    const response = await fetch(url, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Accept: "application/json",
      },
    });
    if (!response.ok) return "error";
    const rows = await response.json() as ExistingEntry[];
    return rows[0] ?? null;
  } catch {
    return "error";
  }
}

async function handleRequest(request: Request) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return jsonResponse({ error: "Expected JSON" }, 415);
  }

  const signingSecret = Deno.env.get("CODEX_CHANGELOG_HMAC_SECRET");
  if (!signingSecret || !/^[a-f0-9]{64}$/i.test(signingSecret)) {
    return jsonResponse({ error: "Publisher is not configured" }, 503);
  }

  const rawBody = await readBodyWithinLimit(request);
  if (rawBody === null) return jsonResponse({ error: "Invalid or oversized request body" }, 413);

  const timestamp = request.headers.get("x-vc-timestamp") ?? "";
  const signature = request.headers.get("x-vc-signature") ?? "";
  if (!(await hasValidSignature(signingSecret, timestamp, signature, rawBody))) {
    return jsonResponse({ error: "Invalid publisher signature" }, 401);
  }

  let input: unknown;
  try {
    input = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }
  if (!isRecord(input)) return jsonResponse({ error: "Invalid publication payload" }, 400);

  const allowedFields = new Set(["id", "title", "summary", "details", "category", "audience", "version_tag", "tags"]);
  if (Object.keys(input).some((key) => !allowedFields.has(key))) {
    return jsonResponse({ error: "Unsupported publication fields" }, 400);
  }

  const id = textField(input.id, 36, 36);
  const title = textField(input.title, 3, 160);
  const summary = textField(input.summary, 3, 500);
  const details = textField(input.details, 0, 10000, true);
  const versionTag = textField(input.version_tag, 0, 80, true);
  const category = input.category === undefined ? "website" : input.category;
  const audience = input.audience === undefined ? "both" : input.audience;

  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return jsonResponse({ error: "A valid request ID is required" }, 400);
  }
  if (!title || !summary || details === null || versionTag === null) {
    return jsonResponse({ error: "Title, summary, or details are invalid" }, 400);
  }
  if (typeof category !== "string" || !validCategories.has(category)) {
    return jsonResponse({ error: "Invalid category" }, 400);
  }
  if (typeof audience !== "string" || !validAudiences.has(audience)) {
    return jsonResponse({ error: "Invalid audience" }, 400);
  }

  const requestedTags = input.tags === undefined ? [] : input.tags;
  if (!Array.isArray(requestedTags) || requestedTags.length > 7) {
    return jsonResponse({ error: "Use at most seven custom tags" }, 400);
  }
  const tags: string[] = [];
  const seenTags = new Set<string>();
  for (const tag of requestedTags) {
    if (typeof tag !== "string") return jsonResponse({ error: "Invalid tag" }, 400);
    const value = tag.trim();
    if (!value || value.length > 32) return jsonResponse({ error: "Invalid tag" }, 400);
    const normalized = value.toLocaleLowerCase("es");
    if (!seenTags.has(normalized)) {
      tags.push(value);
      seenTags.add(normalized);
    }
  }
  if (!seenTags.has("codex")) tags.push("Codex");

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ error: "Publisher is not configured" }, 503);

  const organizationUrl = new URL(`${supabaseUrl}/rest/v1/organizations`);
  organizationUrl.searchParams.set("select", "id");
  organizationUrl.searchParams.set("slug", `eq.${organizationSlug}`);
  organizationUrl.searchParams.set("limit", "1");

  try {
    const organizationResponse = await fetch(organizationUrl, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Accept: "application/json",
      },
    });
    if (!organizationResponse.ok) return jsonResponse({ error: "Publisher could not resolve its organization" }, 503);
    const organizations = await organizationResponse.json() as Array<{ id: string }>;
    const organizationId = organizations[0]?.id;
    if (!organizationId) return jsonResponse({ error: "Publisher organization is unavailable" }, 503);

    const existing = await findEntry(supabaseUrl, serviceRoleKey, organizationId, id);
    if (existing === "error") return jsonResponse({ error: "Publisher could not check the request ID" }, 503);
    if (existing) {
      if (existing.status !== "published") return jsonResponse({ error: "Request ID is already in use" }, 409);
      return jsonResponse({ ok: true, id, status: "published", published_at: existing.published_at, duplicate: true });
    }

    const publishedAt = new Date().toISOString();
    const payload = {
      id,
      organization_id: organizationId,
      title,
      summary,
      details,
      category,
      audience,
      version_tag: versionTag,
      tags,
      status: "published",
      published_at: publishedAt,
      created_by: null,
      updated_by: null,
    };
    const insertResponse = await fetch(`${supabaseUrl}/rest/v1/internal_change_log`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(payload),
    });

    if (!insertResponse.ok) {
      const racedEntry = await findEntry(supabaseUrl, serviceRoleKey, organizationId, id);
      if (racedEntry && racedEntry !== "error" && racedEntry.status === "published") {
        return jsonResponse({ ok: true, id, status: "published", published_at: racedEntry.published_at, duplicate: true });
      }
      return jsonResponse({ error: "Publisher could not create the entry" }, 503);
    }

    return jsonResponse({ ok: true, id, status: "published", published_at: publishedAt, duplicate: false }, 201);
  } catch {
    return jsonResponse({ error: "Publisher could not complete the request" }, 503);
  }
}

Deno.serve(handleRequest);
