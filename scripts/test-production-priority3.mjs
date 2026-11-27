import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync(new URL('../supabase/migrations/20261127141606_production_coordination_and_private_vault.sql', import.meta.url), 'utf8');
const raw = readFileSync(new URL('../src/lib/productionHub.ts', import.meta.url), 'utf8').replace(/import[\s\S]*?from ['"][^'"]+['"];?\r?\n/g, '');
const stubbed = `const ClipboardList=()=>{}, PenTool=()=>{}, Printer=()=>{}, Shirt=()=>{}, ScanLine=()=>{}, Hammer=()=>{}; const supabase=null;\n${raw}`;
const ui = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(stubbed)).toString('base64')}`);
const uuid = (n) => `10000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const org=uuid(1), otherOrg=uuid(2), branch=uuid(3), otherBranch=uuid(4), editor=uuid(5), viewer=uuid(6), outsider=uuid(7), job=uuid(8), otherJob=uuid(9), line=uuid(10), area=uuid(11), step=uuid(12), order=uuid(13);
let db;
before(async () => {
 db = new PGlite();
 await db.exec(`
 create schema auth; create schema app_private; create schema storage;
 create role anon; create role authenticated;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
 create table public.test_permissions(user_id uuid, organization_id uuid, branch_id uuid, module text, action text);
 create function app_private.has_visualcorp_access(o uuid,m text,a text,b uuid default null) returns boolean language sql stable security definer as $$
   select exists(select 1 from public.test_permissions p where p.user_id=auth.uid() and p.organization_id=o and p.module=m and (p.action=a or (a='view' and p.action='edit')) and (b is null or p.branch_id is null or p.branch_id=b)); $$;
 create table public.branches(id uuid primary key, organization_id uuid);
 create table public.profiles(user_id uuid primary key,full_name text);
 create table public.production_jobs(id uuid primary key, organization_id uuid,branch_id uuid,sale_id uuid,sale_line_id uuid,sale_code text,title text,workflow_code text,status text,due_at timestamptz,updated_at timestamptz,created_at timestamptz,fulfillment_status text,fulfillment_due_at timestamptz,approval_required boolean,artwork_review_status text,artwork_reference text,customer_name text,advisor_id uuid,specifications jsonb);
 create table public.areas(id uuid primary key,organization_id uuid,code text,name text);
 create table public.production_job_steps(id uuid primary key,organization_id uuid,job_id uuid,step_order int,title text,status text,due_at timestamptz,assigned_to uuid,handoff_status text,area_id uuid,readiness_reasons jsonb,notes text,step_key text,created_at timestamptz,updated_at timestamptz);
 create table public.production_job_lots(job_id uuid,unit text,quantity numeric,status text);
 create table public.production_orders(id uuid primary key,organization_id uuid,branch_id uuid,due_at timestamptz,created_at timestamptz,order_code text,title text,next_step text,priority text,status text,assigned_to uuid,area_id uuid);
 create table public.sale_material_consumptions(organization_id uuid,sale_line_id uuid,backordered_quantity numeric,status text);
 create table public.purchase_orders(id uuid,organization_id uuid,status text);
 create table public.purchase_requests(organization_id uuid,production_job_id uuid,purchase_order_id uuid,status text);
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 grant usage on schema storage,app_private,auth to authenticated;
 grant select,insert,delete on storage.objects to authenticated;
 insert into public.branches values('${branch}','${org}'),('${otherBranch}','${org}');
 insert into public.profiles values('${editor}','Responsable real');
 insert into public.test_permissions values('${editor}','${org}','${branch}','workshop','edit'),('${viewer}','${org}','${branch}','workshop','view');
 insert into public.production_jobs(id,organization_id,branch_id,sale_id,sale_line_id,sale_code,title,workflow_code,status,due_at,updated_at,created_at,approval_required,artwork_review_status,artwork_reference,customer_name,advisor_id,specifications)
 values('${job}','${org}','${branch}','${uuid(20)}','${line}','OT-100','Trabajo A','print','open','2026-11-01T12:00:00Z',now(),now(),true,'awaiting_art','','Cliente exacto','${editor}','{"description":"Instrucción del cliente"}'),
 ('${otherJob}','${org}','${otherBranch}','${uuid(21)}','${uuid(22)}','OT-200','Otro trabajo','print','open',null,now(),now(),true,'approved','','Cliente otra sucursal','${outsider}','{}');
 insert into public.areas values('${area}','${org}','IMP','Impresión');
 insert into public.production_job_steps values('${step}','${org}','${job}',1,'Imprimir','ready','2026-11-01T12:00:00Z','${editor}','accepted','${area}','[]','Nota de etapa','print',now(),now());
 `);
 await db.exec(migration);
});
after(async () => { await db?.close(); });
async function as(user, query) { await db.exec(`set role authenticated; select set_config('test.uid','${user}',false)`); try { return await db.query(query); } finally { await db.exec('reset role'); } }
async function scalar(query) { return (await db.query(query)).rows[0].value; }

test('coordination RPC returns real owner, customer, instructions, and branch-scoped count', async () => {
 const result=await as(editor,`select public.list_production_coordination_jobs('${org}',50,0) as value`);
 const board=result.rows[0].value;
 assert.equal(board.total,1); assert.equal(board.items[0].job.customer_name,'Cliente exacto');
 assert.equal(board.items[0].job.specifications.description,'Instrucción del cliente');
 assert.equal(board.items[0].steps[0].assigned_to,editor); assert.equal(board.items[0].steps[0].assigned_name,'Responsable real');
 assert.equal(board.items[0].steps[0].notes,'Nota de etapa'); assert.equal(board.items[0].job.material_blocked,false);
 assert.equal((await as(editor,`select public.list_production_coordination_jobs('${org}',1,1) as value`)).rows[0].value.items.length,0);
 await assert.rejects(as(outsider,`select public.list_production_coordination_jobs('${org}',50,0)`), /acceso/);
 await assert.rejects(as(editor,`select public.list_production_coordination_jobs('${org}',101,0)`), /Paginación/);
});

test('material flags follow exact sale line, open requests, converted orders and receipt', async () => {
 await db.exec(`insert into public.sale_material_consumptions values('${org}','${uuid(99)}',8,'backordered')`);
 assert.equal(await scalar(`select app_private.production_job_material_blocked('${job}') as value`),false);
 await db.exec(`insert into public.sale_material_consumptions values('${org}','${line}',2,'backordered')`);
 assert.equal(await scalar(`select app_private.production_job_material_blocked('${job}') as value`),true);
 await db.exec(`update public.sale_material_consumptions set backordered_quantity=0 where sale_line_id='${line}'; insert into public.purchase_requests values('${org}','${job}',null,'submitted')`);
 assert.equal(await scalar(`select app_private.production_job_material_blocked('${job}') as value`),true);
 await db.exec(`update public.purchase_requests set status='rejected'`);
 assert.equal(await scalar(`select app_private.production_job_material_blocked('${job}') as value`),false);
 await db.exec(`insert into public.purchase_orders values('${order}','${org}','approved'); update public.purchase_requests set status='converted',purchase_order_id='${order}'`);
 assert.equal(await scalar(`select app_private.production_job_material_blocked('${job}') as value`),true);
 await db.exec(`update public.purchase_orders set status='received'`);
 assert.equal(await scalar(`select app_private.production_job_material_blocked('${job}') as value`),false);
});

test('batch metadata does not expose another branch, organization, or unauthenticated data', async () => {
 const result=(await as(viewer,`select public.production_coordination_metadata('${org}',array['${job}','${otherJob}']::uuid[]) as value`)).rows[0].value;
 assert.deepEqual(result.map(row=>row.id),[job]); assert.equal(result[0].steps[0].assigned_name,'Responsable real');
 assert.deepEqual((await as(viewer,`select public.production_coordination_metadata('${otherOrg}',array['${job}']::uuid[]) as value`)).rows[0].value,[]);
 await db.exec(`select set_config('test.uid','',false)`);
 await assert.rejects(db.query(`select public.production_coordination_metadata('${org}',array['${job}']::uuid[])`),/Inicia sesión/);
});

test('coordination permission is modular and scoped, never profile-key based', async () => {
 await db.exec(`select set_config('test.uid','${editor}',false)`);
 assert.equal(await scalar(`select app_private.can_coordinate_production('${org}','${branch}','${editor}') as value`),true);
 assert.equal(await scalar(`select app_private.can_coordinate_production('${org}','${otherBranch}','${editor}') as value`),false);
 assert.equal(ui.resolveProductionPermissions({profiles:[{key:'new-custom-profile'}],hasPermission:(m,a)=>m==='workshop'&&['edit','view'].includes(a)}).canCoordinate,true);
 assert.equal(ui.resolveProductionPermissions({profiles:[{key:'admin'}],roles:['admin'],hasPermission:()=>false}).canCoordinate,false);
});

test('private vault policies enforce branch, organization, uploader and edit permission', async () => {
 const name=`${org}/${branch}/${editor}/file.pdf`;
 const bucket=(await db.query("select * from storage.buckets where id='production-vault'")).rows[0];
 assert.equal(bucket.public,false); assert.equal(Number(bucket.file_size_limit),52428800);
 await as(editor,`insert into storage.objects(bucket_id,name) values('production-vault','${name}')`);
 assert.equal((await as(viewer,'select * from storage.objects')).rows.length,1);
 assert.equal((await as(outsider,'select * from storage.objects')).rows.length,0);
 await assert.rejects(as(viewer,`insert into storage.objects(bucket_id,name) values('production-vault','${org}/${branch}/${viewer}/file.pdf')`),/row-level security/);
 await assert.rejects(as(editor,`insert into storage.objects(bucket_id,name) values('production-vault','${org}/${otherBranch}/${editor}/file.pdf')`),/row-level security/);
 await assert.rejects(as(editor,`insert into storage.objects(bucket_id,name) values('production-vault','${org}/${branch}/${outsider}/file.pdf')`),/row-level security/);
 await assert.rejects(as(editor,"insert into storage.objects(bucket_id,name) values('production-vault','bad/path')"),/row-level security/);
 assert.equal((await as(viewer,`delete from storage.objects where name='${name}' returning id`)).rows.length,0);
 assert.equal((await as(editor,`delete from storage.objects where name='${name}' returning id`)).rows.length,1);
});

test('vault validates zero-byte/oversize files, extensions and MIME mismatches before upload', () => {
 assert.throws(()=>ui.validateProductionVaultFile({name:'evil.pdf',size:12,type:'text/html'}));
 assert.throws(()=>ui.validateProductionVaultFile({name:'empty.pdf',size:0,type:'application/pdf'}));
 assert.throws(()=>ui.validateProductionVaultFile({name:'large.pdf',size:52428801,type:'application/pdf'}));
 assert.throws(()=>ui.validateProductionVaultFile({name:'run.exe',size:1,type:'application/octet-stream'}));
 assert.doesNotThrow(()=>ui.validateProductionVaultFile({name:'design.afdesign',size:52428800,type:'application/octet-stream'}));
});

test('failed upload cannot become success; signed-link failure preserves path for retry without duplicate upload', async () => {
 const file=new File(['pdf'],'art.pdf',{type:'application/pdf'}); let uploads=0; let remembered; let failSign=true;
 const bucket={upload:async(path)=>{uploads++;return {data:{path}}},createSignedUrl:async()=> failSign?{error:new Error('sign failure')}:{data:{signedUrl:'https://local.test/private?token=test'}}};
 await assert.rejects(ui.uploadProductionVaultFile({ ...bucket,upload:async()=>({error:new Error('network failure')})},file,'path',undefined,(p)=>{remembered=p}),/network failure/);
 assert.equal(remembered,undefined);
 await assert.rejects(ui.uploadProductionVaultFile(bucket,file,'path',undefined,(p)=>{remembered=p}),/sign failure/);
 assert.equal(remembered,'path'); failSign=false;
 const result=await ui.uploadProductionVaultFile(bucket,file,'another-path',remembered,()=>assert.fail('must not upload twice'));
 assert.equal(uploads,1); assert.equal(result.storagePath,'path'); assert.match(result.fileUrl,/private/);
});

test('chatter never joins by title or by same ID across record types; artwork signals remain distinct', () => {
 assert.equal(ui.matchesProductionRecord({recordId:'same',recordType:'customer'},'job','same'),false);
 assert.equal(ui.matchesProductionRecord({recordId:'different',recordType:'job',recordTitle:'Same title'},'job','same'),false);
 assert.equal(ui.matchesProductionRecord({recordId:'same',recordType:'job'},'job','same'),true);
 assert.equal(ui.matchesProductionRecord({recordId:'',recordType:'job'},'job',''),false);
 assert.equal(ui.productionArtworkLabel({artwork_review_status:'awaiting_art',approval_required:true}),'Archivo pendiente');
 assert.equal(ui.productionArtworkLabel({artwork_review_status:'awaiting_review',approval_required:true}),'Archivo pendiente de aprobación');
});
