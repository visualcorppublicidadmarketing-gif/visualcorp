// Loopback-only integration adapter for the actual PostgreSQL migration and UI.
// Sessions are synthetic test identities, not real Supabase/Google credentials.
import http from "node:http";
import {
  createMarketingDatabase,
  asUser,
  save,
  ORG,
  USERS,
} from "./marketing-test-database.mjs";
export async function startMarketingTestServer() {
  const db = await createMarketingDatabase();
  const tokens = Object.fromEntries(
    Object.entries(USERS).map(([name, id]) => [
      name,
      [
        Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
          "base64url",
        ),
        Buffer.from(
          JSON.stringify({ sub: id, role: "authenticated", exp: 4102444800 }),
        ).toString("base64url"),
        "local-test-signature",
      ].join("."),
    ]),
  );
  const seed = await asUser(db, "editor", (tx) =>
    save(tx, {
      title: "Aviso de feriado",
      scheduled_date: "2026-10-31",
      due_date: "2026-10-30",
      status: "En revisión",
      caption: "No laboramos lunes y martes.",
      art_status: "Sí",
      caption_status: "Sí",
      video_status: "No aplica",
      voiceover_status: "No aplica",
      tiktok_status: "No aplica",
    }),
  );
  await db.query(
    `insert into marketing_posts(organization_id,source_id,title,scheduled_date) values($1,'blank','','2026-11-09')`,
    [ORG],
  );
  const asset = (
    await db.query(
      `insert into marketing_assets(organization_id,source_id,filename,rel_path,extension,storage_status) values($1,'test-local','Comunicado.png','Referencias/Comunicado.png','.png','local_only') returning *`,
      [ORG],
    )
  ).rows[0];
  await db.query(
    `insert into marketing_post_assets(organization_id,source_id,source_post_id,source_asset_id,post_id,asset_id) values($1,'test-link',$2,'test-local',$3,$4)`,
    [ORG, seed.source_id, seed.id, asset.id],
  );
  let failNextSave = false;
  const server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:5178");
    res.setHeader(
      "Access-Control-Allow-Headers",
      req.headers["access-control-request-headers"] ||
        "authorization,apikey,content-type,x-client-info,prefer,range",
    );
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Content-Type", "application/json");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    const name = Object.keys(tokens).find(
      (name) => req.headers.authorization === `Bearer ${tokens[name]}`,
    );
    if (!name) {
      res.writeHead(401);
      res.end(JSON.stringify({ message: "Test session required" }));
      return;
    }
    const url = new URL(req.url, "http://localhost");
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const data = await asUser(db, name, async (tx) => {
        if (url.pathname === "/auth/v1/user")
          return {
            id: USERS[name],
            email: `${name}@example.invalid`,
            aud: "authenticated",
            role: "authenticated",
            user_metadata: { full_name: name },
          };
        if (url.pathname.includes("/rpc/")) {
          const rpc = url.pathname.split("/").pop();
          const args = body ? JSON.parse(body) : {};
          if (rpc === "claim_organization_access_invitations") return null;
          if (rpc === "get_my_visualcorp_access") {
            return (
              await tx.query(
                "select public.get_my_visualcorp_access() as access",
              )
            ).rows[0].access;
          }
          if (rpc === "save_marketing_post") {
            if (failNextSave) {
              failNextSave = false;
              throw Object.assign(
                Error("Conexión interrumpida de prueba. Reintenta."),
                { code: "08006" },
              );
            }
            return (
              await tx.query(
                "select * from save_marketing_post($1,$2,$3,$4::jsonb,$5)",
                [
                  args.p_organization_id,
                  args.p_post_id,
                  args.p_expected_version,
                  JSON.stringify(args.p_patch),
                  args.p_creation_key || null,
                ],
              )
            ).rows[0];
          }
          if (rpc === "review_marketing_post")
            return (
              await tx.query(
                "select * from review_marketing_post($1,$2,$3,$4,$5)",
                [
                  args.p_organization_id,
                  args.p_post_id,
                  args.p_expected_version,
                  args.p_decision,
                  args.p_feedback,
                ],
              )
            ).rows[0];
          if (rpc === "list_marketing_assignees")
            return (
              await tx.query("select * from list_marketing_assignees($1)", [
                args.p_organization_id,
              ])
            ).rows;
          if (rpc === "set_marketing_nonproduction_day") {
            await tx.query(
              "select set_marketing_nonproduction_day($1,$2,$3,$4)",
              [
                args.p_organization_id,
                args.p_day,
                args.p_reason,
                args.p_remove,
              ],
            );
            return null;
          }
          return [];
        }
        const table = url.pathname.split("/").pop();
        if (/^marketing_[a-z_]+$/.test(table)) {
          const rows = (
            await tx.query(
              `select * from public.${table} where organization_id=$1`,
              [ORG],
            )
          ).rows;
          // PostgREST serializes SQL DATE as YYYY-MM-DD; PGlite decodes it to Date.
          for (const row of rows)
            if (row.day instanceof Date)
              row.day = row.day.toISOString().slice(0, 10);
          // PostgREST paging order used by readAll, then its stable ID tiebreaker.
          const order =
            url.searchParams
              .get("order")
              ?.split(",")
              .map((s) => s.split(".")[0]) || [];
          rows.sort((a, b) => {
            for (const key of order) {
              const n = String(a[key] ?? "").localeCompare(
                String(b[key] ?? ""),
              );
              if (n) return n;
            }
            return 0;
          });
          return rows.slice(
            Number(url.searchParams.get("offset") || 0),
            Number(url.searchParams.get("offset") || 0) +
              Number(url.searchParams.get("limit") || 1000),
          );
        }
        // Other workspace navigation modules have no fixture records.
        return [];
      });
      res.writeHead(200);
      res.end(JSON.stringify(data));
    } catch (error) {
      res.writeHead(
        error.code === "42501" ? 403 : error.code === "40001" ? 409 : 400,
      );
      res.end(
        JSON.stringify({
          message: error.message,
          code: error.code || "TEST_ERROR",
        }),
      );
    }
  });
  await new Promise((resolve) => server.listen(55821, "127.0.0.1", resolve));
  return {
    db,
    tokens,
    seed,
    failNextSave: () => {
      failNextSave = true;
    },
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      await db.close();
    },
  };
}
