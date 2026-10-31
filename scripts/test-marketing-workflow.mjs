import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import ts from "typescript";
import {
  createMarketingDatabase,
  asUser,
  save,
  ORG,
  OTHER_ORG,
  USERS,
} from "./lib/marketing-test-database.mjs";

// Compile the actual pure UI rules into an ignored cache; no duplicated implementation.
const cache = resolve("node_modules/.cache/marketing-tests");
mkdirSync(cache, { recursive: true });
for (const file of ["marketingScheduleRules", "marketingWorkflow"]) {
  const source = readFileSync(
    `src/pages/admin/marketing/${file}.ts`,
    "utf8",
  ).replaceAll("./marketingScheduleRules", "./marketingScheduleRules.mjs");
  writeFileSync(
    `${cache}/${file}.mjs`,
    ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    }).outputText,
  );
}
const rules = await import(
  pathToFileURL(`${cache}/marketingWorkflow.mjs`).href
);
test("Queues separate plans, untitled ideas, overdue production and missing publication confirmation", () => {
  const p = {
    id: "1",
    title: "Pieza",
    status: "En revisión",
    scheduled_date: "2026-10-29",
    due_date: "2026-10-30",
  };
  assert(rules.productionOverdue(p, "2026-10-31"));
  assert(rules.publicationUnconfirmed(p, "2026-10-31"));
  assert(rules.matchesQueue(p, "review", "2026-10-31"));
  assert(rules.matchesQueue(p, "unassigned", "2026-10-31"));
  assert(!rules.isPublication({ ...p, record_kind: "monthly_plan" }));
  assert(!rules.isPublication({ ...p, title: "" }));
  assert(
    !rules.matchesQueue({ ...p, status: "Terminada" }, "overdue", "2026-10-31"),
  );
  assert(
    rules.matchesQueue(
      { ...p, owner_user_id: USERS.editor },
      "mine",
      "2026-10-31",
      USERS.editor,
    ),
  );
});
test("Checklist denominator excludes N/A and proposals skip weekends and confirmed closures", () => {
  assert.deepEqual(
    rules.checklistProgress({
      cover_status: "Sí",
      art_status: "Sí",
      caption_status: "No",
      video_status: "No aplica",
      voiceover_status: "No aplica",
      tiktok_status: "No aplica",
    }),
    { done: 2, total: 3 },
  );
  assert.equal(
    rules.proposePublicationDate("2026-10-31", [
      { day: "2026-11-02" },
      { day: "2026-11-03" },
    ]),
    "2026-11-04",
  );
  assert.equal(rules.proposePublicationDate("2026-11-05", []), "2026-11-05");
});
test("Scheduling warnings do not treat local paths or an old approval as verified", () => {
  const p = {
    id: "p",
    title: "Aviso",
    status: "Programada",
    scheduled_date: "2026-11-04",
    content_revision: 2,
    owner: "histórico",
  };
  const warnings = rules.publicationWarnings(
    p,
    [
      {
        post_id: "p",
        content_revision: 1,
        decision: "approved",
        created_at: "2026-10-31",
      },
    ],
    [{ storage_status: "local_only" }],
  );
  assert(warnings.some((x) => x.includes("solo local")));
  assert(warnings.some((x) => x.includes("sin hora")));
  assert(warnings.some((x) => x.includes("sin aprobación")));
});
test("Postgres migration, authenticated permissions, concurrency, approvals and material invalidation", async (t) => {
  const db = await createMarketingDatabase();
  try {
    await t.test(
      "Migration preserves historic data, classifies plans and disables the daily job",
      async () => {
        assert.equal(
          (await db.query(`select count(*)::int as n from cron.job`)).rows[0].n,
          0,
        );
        const legacy = (
          await db.query(
            `select * from marketing_posts where source_id='legacy'`,
          )
        ).rows[0];
        assert.equal(legacy.owner, "ARIANNA");
        assert.equal(legacy.scheduled_date, "2026-10-20");
        assert.equal(
          (
            await db.query(
              `select record_kind from marketing_posts where source_id='monthly'`,
            )
          ).rows[0].record_kind,
          "monthly_plan",
        );
        assert.equal(
          (
            await db.query(
              `select count(*)::int as n from marketing_nonproduction_days`,
            )
          ).rows[0].n,
          2,
        );
      },
    );
    await t.test('Retrying a creation key returns the same publication without duplicating it',async()=>{
      const key='90000000-0000-0000-0000-000000000001';
      const create=()=>asUser(db,'editor',async tx=>(await tx.query('select * from save_marketing_post($1,null,null,$2::jsonb,$3)',[ORG,JSON.stringify({title:'Creación recuperable'}),key])).rows[0]);
      const first=await create();const retry=await create();assert.equal(retry.id,first.id);assert.equal(retry.row_version,first.row_version);
    });
    let post = await asUser(db, "editor", (tx) =>
      save(tx, {
        title: "Aviso de feriado",
        caption: "Mensaje",
        scheduled_date: "2026-11-04",
        owner_user_id: USERS.editor,
        art_status: "Sí",
      }),
    );
    await t.test(
      "Assignments/checklist persist; historic label survives unrelated edits",
      async () => {
        assert.equal(post.owner, "editor");
        assert.equal(post.art_status, "Sí");
        const legacy = (
          await db.query(
            `select * from marketing_posts where source_id='legacy'`,
          )
        ).rows[0];
        const changed = await asUser(db, "editor", (tx) =>
          save(tx, { next_action: "Revisar" }, legacy),
        );
        assert.equal(changed.owner, "ARIANNA");
      },
    );
    await t.test(
      "Viewer, outsider, unassigned foreign user and direct legacy writes are rejected",
      async () => {
        await assert.rejects(
          asUser(db, "viewer", (tx) =>
            save(tx, { title: "No permitido" }, post),
          ),
          /permiso/,
        );
        await assert.rejects(
          asUser(db, "outsider", (tx) =>
            save(tx, { title: "No permitido" }, post),
          ),
          /permiso/,
        );
        await assert.rejects(
          asUser(db, "editor", (tx) =>
            save(tx, { owner_user_id: USERS.outsider }, post),
          ),
          /miembro activo/,
        );
        await assert.rejects(
          asUser(db, "editor", (tx) =>
            tx.exec(`update marketing_posts set scheduled_date='2026-11-04'`),
          ),
          /Actualiza la página/,
        );
        assert.equal(
          (
            await asUser(db, "viewer", (tx) =>
              tx.query(`select * from list_marketing_assignees($1)`, [ORG]),
            )
          ).rows.length,
          3,
        );
        assert.equal(
          (
            await asUser(db, "outsider", (tx) =>
              tx.query(
                `select * from marketing_posts where organization_id=$1`,
                [ORG],
              ),
            )
          ).rows.length,
          0,
        );
      },
    );
    const review = (user, decision, feedback = "", current = post) =>
      asUser(
        db,
        user,
        async (tx) =>
          (
            await tx.query(
              `select * from public.review_marketing_post($1,$2,$3,$4,$5)`,
              [ORG, current.id, current.row_version, decision, feedback],
            )
          ).rows[0],
      );
    await t.test(
      "Editor cannot approve via review RPC or a status patch",
      async () => {
        await assert.rejects(review("editor", "approved"), /gerencia/);
        await assert.rejects(
          asUser(db, "editor", (tx) => save(tx, { status: "Aprobada" }, post)),
          /panel de revisión/,
        );
        const approved = await review("manager", "approved");
        assert.equal(approved.actor_id, USERS.manager);
        assert.equal(approved.content_revision, post.content_revision);
        post = (
          await db.query(`select * from marketing_posts where id=$1`, [post.id])
        ).rows[0];
      },
    );
    await t.test(
      "Administrative edits preserve approval; old snapshots cannot save/review",
      async () => {
        const old = post;
        post = await asUser(db, "editor", (tx) =>
          save(
            tx,
            { scheduled_date: "2026-11-05", owner_user_id: USERS.manager },
            post,
          ),
        );
        assert.equal(post.content_revision, old.content_revision);
        await assert.rejects(
          asUser(db, "editor", (tx) => save(tx, { caption: "stale" }, old)),
          /ficha cambió/,
        );
        await assert.rejects(
          review("manager", "approved", "", old),
          /versión cambió/,
        );
      },
    );
    await t.test(
      "Caption/material changes invalidate the approved version; requesting changes needs feedback",
      async () => {
        const rev = post.content_revision;
        post = await asUser(db, "editor", (tx) =>
          save(tx, { caption: "Nuevo contenido" }, post),
        );
        assert.equal(post.content_revision, rev + 1);
        await assert.rejects(review("manager", "changes_requested"), /Explica/);
        await review("manager", "changes_requested", "Mejorar el mensaje");
        post = (
          await db.query(`select * from marketing_posts where id=$1`, [post.id])
        ).rows[0];
        assert.equal(post.status, "En diseño");
        const asset = (
          await db.query(
            `insert into marketing_assets(organization_id,source_id,rel_path,filename) values($1,'asset','archivo.png','archivo.png') returning id`,
            [ORG],
          )
        ).rows[0].id;
        await asUser(db, "editor", (tx) =>
          tx.query(
            `insert into marketing_post_assets(organization_id,source_id,source_post_id,source_asset_id,post_id,asset_id) values($1,'link',$2,'asset',$3,$4)`,
            [ORG, post.source_id, post.id, asset],
          ),
        );
        const linked = (
          await db.query(`select * from marketing_posts where id=$1`, [post.id])
        ).rows[0];
        assert.equal(linked.content_revision, post.content_revision + 1);
        post = linked;
      },
    );
    await t.test(
      "Scheduling with missing data remains allowed and records the manual date change",
      async () => {
        post = await asUser(db, "editor", (tx) =>
          save(
            tx,
            { status: "Programada", scheduled_date: "2026-11-03" },
            post,
          ),
        );
        assert.equal(post.status, "Programada");
        assert.equal(
          (
            await db.query(
              `select count(*)::int n from marketing_post_events where post_id=$1 and field_name='schedule'`,
              [post.id],
            )
          ).rows[0].n,
          3,
        );
        assert.equal(
          (await db.query(`select roll_overdue_marketing_posts() as n`)).rows[0]
            .n,
          0,
        );
      },
    );
    await t.test(
      "Designated profiles can be granted approval through the existing profile editor",
      async () => {
        const profile = (
          await db.query(
            `select profile_id from organization_memberships where user_id=$1`,
            [USERS.editor],
          )
        ).rows[0].profile_id;
        await asUser(db, "manager", (tx) =>
          tx.query(
            `select save_visualcorp_access_profile($1,'editor','Editor','', $2::jsonb)`,
            [
              profile,
              JSON.stringify(
                ["view", "edit", "approve_content"].map((action) => ({
                  module_key: "marketing",
                  action_key: action,
                  enabled: true,
                })),
              ),
            ],
          ),
        );
        const approved = await review("editor", "approved");
        assert.equal(approved.actor_id, USERS.editor);
        post = (
          await db.query("select * from marketing_posts where id=$1", [post.id])
        ).rows[0];
      },
    );
    await t.test(
      "Review history is read-only and a disabled membership loses permission immediately",
      async () => {
        await assert.rejects(
          asUser(db, "manager", (tx) =>
            tx.exec("delete from marketing_reviews"),
          ),
          /permission denied/,
        );
        await db.query(
          `update organization_memberships set active=false where user_id=$1`,
          [USERS.manager],
        );
        await assert.rejects(review("manager", "approved"), /gerencia/);
      },
    );
  } finally {
    await db.close();
  }
});
