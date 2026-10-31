import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

export const ORG = "10000000-0000-0000-0000-000000000001";
export const OTHER_ORG = "10000000-0000-0000-0000-000000000002";
export const USERS = {
  editor: "20000000-0000-0000-0000-000000000001",
  manager: "20000000-0000-0000-0000-000000000002",
  viewer: "20000000-0000-0000-0000-000000000003",
  outsider: "20000000-0000-0000-0000-000000000004",
};
const read = (name) =>
  readFileSync(
    new URL(`../../supabase/migrations/${name}`, import.meta.url),
    "utf8",
  );
function definition(source, name) {
  const start = source.indexOf(`create or replace function ${name}(`);
  if (start < 0) throw Error(name);
  return source.slice(start, source.indexOf("$$;", start) + 3);
}
export async function createMarketingDatabase() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated;
    create schema auth; create schema app_private;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth,app_private to authenticated;
    grant execute on function auth.uid() to authenticated;
    create table public.organizations(id uuid primary key,slug text,name text);
    create table public.profiles(user_id uuid primary key,full_name text,email text);
    create table public.organization_memberships(id uuid default gen_random_uuid(),organization_id uuid,user_id uuid,role text,active boolean default true,branch_id uuid,profile_id uuid,created_at timestamptz default now());
    create function app_private.has_org_role(p_org uuid,p_branch uuid,p_roles text[] default null) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.organization_memberships where organization_id=p_org and user_id=auth.uid() and active and (p_roles is null or role=any(p_roles)))$$;
    create schema cron; create table cron.job(jobid bigint,jobname text,active boolean);
    create function cron.unschedule(p_id bigint) returns boolean language plpgsql as $$begin delete from cron.job where jobid=p_id;return true;end;$$;
    insert into cron.job values(1,'marketing-overdue-publications-daily',true);
    insert into public.organizations values('${ORG}','visual-corp','Visual Corp'),('${OTHER_ORG}','other','Other');
    insert into auth.users values ${Object.values(USERS)
      .map((id) => `('${id}')`)
      .join(",")};
    insert into public.profiles values ${Object.entries(USERS)
      .map(([name, id]) => `('${id}','${name}','${name}@example.invalid')`)
      .join(",")};
  `);
  const access = read("20261023215919_visualcorp_editable_access_profiles.sql");
  await db.exec(
    access.slice(
      access.indexOf("create table public.access_profiles"),
      access.indexOf("create table public.access_audit_log"),
    ),
  );
  await db.exec(
    `create table public.access_audit_log(organization_id uuid,actor_user_id uuid,profile_id uuid,event_key text,details jsonb);`,
  );
  await db.exec(definition(access, "app_private.has_visualcorp_access"));
  await db.exec(definition(access, "public.save_visualcorp_access_profile"));
  await db.exec(definition(access, "public.get_my_visualcorp_access"));
  for (const [name, id] of Object.entries(USERS)) {
    const org = name === "outsider" ? OTHER_ORG : ORG;
    const profile = (
      await db.query(
        `insert into public.access_profiles(organization_id,profile_key,name,base_role,is_system) values($1,$2,$2,$3,true) returning id`,
        [
          org,
          name === "manager" ? "gerencia" : name,
          name === "manager" ? "manager" : "marketing",
        ],
      )
    ).rows[0].id;
    await db.query(
      `insert into public.organization_memberships(organization_id,user_id,role,profile_id) values($1,$2,$3,$4)`,
      [org, id, name === "manager" ? "manager" : "marketing", profile],
    );
    await db.query(
      `insert into public.access_profile_permissions(profile_id,module_key,action_key,enabled) values($1,'marketing','view',true)`,
      [profile],
    );
    if (name !== "viewer")
      await db.query(
        `insert into public.access_profile_permissions(profile_id,module_key,action_key,enabled) values($1,'marketing','edit',true)`,
        [profile],
      );
    if (name === "manager")
      await db.query(
        `insert into public.access_profile_permissions(profile_id,module_key,action_key,enabled) values($1,'team','manage_profiles',true)`,
        [profile],
      );
  }
  await db.exec(read("20261024055010_tracking_content_workspace.sql"));
  await db.exec(read("20261026154428_marketing_publication_copy_fields.sql"));
  await db.exec(
    read("20261026172029_marketing_post_tags_and_calendar_color.sql"),
  );
  await db.exec(read("20261030151941_marketing_readiness_and_dimensions.sql"));
  await db.exec(
    `insert into public.marketing_posts(organization_id,source_id,title,owner,scheduled_date) values('${ORG}','legacy','Legacy piece','ARIANNA','2026-10-20'),('${ORG}','monthly','PLAN MENSUAL — Noviembre 2026','','2026-11-13');`,
  );
  await db.exec(read("20261031154030_marketing_editorial_workflow.sql"));
  return db;
}
export async function asUser(db, user, fn) {
  return db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query(`select set_config('request.jwt.claim.sub',$1,true)`, [
      USERS[user],
    ]);
    return fn(tx);
  });
}
export async function save(tx, patch, post = null, org = ORG) {
  return (
    await tx.query(
      `select * from public.save_marketing_post($1,$2,$3,$4::jsonb)`,
      [org, post?.id || null, post?.row_version || null, JSON.stringify(patch)],
    )
  ).rows[0];
}
