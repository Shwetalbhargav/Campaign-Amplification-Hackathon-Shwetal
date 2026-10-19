import {PGlite} from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readdir} from 'node:fs/promises';
import {loadDatasets,root,validateRelations} from '../import/datasets.js';
import {validateAll} from './validate.js';
const checks:string[]=[];
const db=new PGlite();
async function check(name:string,fn:()=>Promise<void>){await fn();checks.push(name);}
async function denied(sql:string){await assert.rejects(db.exec(sql));}
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',reviewer='33333333-3333-4333-8333-333333333333';
async function role(name:string,user=''){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec(`set role ${name}`);}
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;
 create schema storage;create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated,service_role;grant select on storage.objects to anon,authenticated;grant all on storage.objects to service_role;`);
await check('PostgreSQL parses and executes schema, RLS policies and seed',async()=>{
 for(const file of ['schema.sql','policies.sql','seed.sql'])await db.exec(await readFile(resolve(root,'database',file),'utf8'));
});
await check('All JSON, evidence links, manifest hashes and foreign keys validate',async()=>{await validateAll();});
const data=await loadDatasets(true);
await check('All normalized website demo records insert with relational constraints',async()=>{
 for(const table of ['categories','campaigns','campaign_assets','campaign_story_sections','campaign_sources','campaign_targeting','advertising_creatives'] as const){
  const rows=data[table].map(r=>table==='campaigns'?{...r,cover_asset_id:null}:r);
  if(rows.length)await db.query(`insert into public.${table} select * from jsonb_populate_recordset(null::public.${table},$1::jsonb) on conflict(id) do nothing`,[JSON.stringify(rows)]);
 }
 for(const c of data.campaigns)await db.query('update public.campaigns set cover_asset_id=$1 where id=$2',[c.cover_asset_id,c.id]);
});
await db.query('insert into auth.users(id) values($1),($2),($3)',[owner,other,reviewer]);
await db.query('insert into public.profiles(id,display_name) values($1,\'Owner\'),($2,\'Other\'),($3,\'Reviewer\')',[owner,other,reviewer]);
await db.query('insert into private.reviewer_memberships(user_id) values($1)',[reviewer]);
let draftId='',campaignId='';
await check('Creator creates an owned draft through RPC',async()=>{
 await role('authenticated',owner);
 const res=await db.query<{id:string;campaign_id:string}>('select * from public.create_campaign_draft($1,$2)',['Test message',data.categories[0].id]);
 draftId=res.rows[0].id;campaignId=res.rows[0].campaign_id;
 await db.query('update public.campaigns set funding_goal_minor=10000,currency=\'USD\' where id=$1',[campaignId]);
 await db.query('update public.campaign_drafts set draft_data=$1 where id=$2',[JSON.stringify({story:'An evidence-based draft message.',sources:[{title:'Test citation',url:'https://example.org/test'}]}),draftId]);
});
await check('Anonymous sees six approved campaigns and no drafts, reviews, payments or notifications',async()=>{
 await role('anon');assert.equal((await db.query<{n:number}>('select count(*)::int n from public.campaigns')).rows[0].n,6);
 for(const table of ['campaign_drafts','campaign_reviews','contributions','notifications'])await denied(`select * from public.${table}`);
 await denied('select * from public.profiles');
});
await check('Other users cannot read or alter another creator draft',async()=>{
 await role('authenticated',other);assert.equal((await db.query('select * from public.campaign_drafts')).rows.length,0);
 assert.equal((await db.query('update public.campaign_drafts set current_step=2 returning id')).rows.length,0);
 await denied(`select public.submit_campaign('${campaignId}')`);
});
await check('Reviewer cannot browse unsubmitted drafts',async()=>{
 await role('authenticated',reviewer);assert.equal((await db.query('select * from public.campaigns where id=$1',[campaignId])).rows.length,0);
});
await check('Clients cannot change totals, ownership, status, feature flags or source provenance',async()=>{
 await role('authenticated',owner);
 for(const change of ["amount_raised_minor=9999","status='approved'",`creator_id='${other}'`,'is_featured=true',"data_origin='website'"])await denied(`update public.campaigns set ${change} where id='${campaignId}'`);
 await denied(`insert into public.contributions(campaign_id,contribution_amount_minor,total_amount_minor,currency) values('${campaignId}',100,100,'USD')`);
});
await check('Submission materializes story and source, locks creator editing and remains private',async()=>{
 await db.query('select public.submit_campaign($1)',[campaignId]);
 assert.equal((await db.query('update public.campaigns set title=\'Changed\' where id=$1 returning id',[campaignId])).rows.length,0);
 assert.equal((await db.query('update public.campaign_drafts set current_step=3 returning id')).rows.length,0);
 await role('anon');assert.equal((await db.query('select * from public.campaign_story_sections where campaign_id=$1',[campaignId])).rows.length,0);
});
await check('Only a reviewer can approve, then public story becomes visible',async()=>{
 await role('authenticated',owner);await denied(`select public.review_campaign('${campaignId}','approved',null)`);
 await role('authenticated',reviewer);await db.query('select public.review_campaign($1,\'approved\',null)',[campaignId]);
 await role('anon');assert.equal((await db.query('select * from public.campaign_story_sections where campaign_id=$1',[campaignId])).rows.length,1);
});
const demoCampaign=data.campaigns[0].id,contribution='44444444-4444-4444-8444-444444444444',guest='55555555-5555-4555-8555-555555555555';
await role('service_role');
await db.query(`insert into public.contributions(id,campaign_id,backer_id,contribution_amount_minor,fee_amount_minor,total_amount_minor,currency,payment_reference) values($1,$2,$3,100,20,120,'USD','private-reference')`,[contribution,demoCampaign,owner]);
await db.query(`insert into public.contributions(id,campaign_id,contribution_amount_minor,total_amount_minor,currency) values($1,$2,100,100,'USD')`,[guest,demoCampaign]);
await db.query(`insert into private.guest_receipts(contribution_id,token_sha256,expires_at) values($1,$2,now()+interval '1 hour')`,[guest,'a'.repeat(64)]);
await check('Backer sees only own contributions and cannot read payment references',async()=>{
 await role('authenticated',owner);assert.equal((await db.query('select id,total_amount_minor from public.contributions')).rows.length,1);await denied('select payment_reference from public.contributions');
 await role('authenticated',other);assert.equal((await db.query('select id from public.contributions')).rows.length,0);
 await denied(`select public.complete_simulated_payment('${contribution}','event-1')`);
});
await check('Trusted simulated payment increments funding once across retries',async()=>{
 await role('service_role');const before=(await db.query<{n:number}>('select amount_raised_minor n from public.campaigns where id=$1',[demoCampaign])).rows[0].n;
 await db.query('select public.complete_simulated_payment($1,$2)',[contribution,'event-1']);await db.query('select public.complete_simulated_payment($1,$2)',[contribution,'event-1']);
 const after=(await db.query<{n:number}>('select amount_raised_minor n from public.campaigns where id=$1',[demoCampaign])).rows[0].n;assert.equal(Number(after)-Number(before),100);
});
await check('Guest receipt tokens are server-only and responses omit private payment data',async()=>{
 await role('anon');await denied(`select * from public.get_guest_receipt('${'a'.repeat(64)}')`);
 await role('service_role');const rows=(await db.query<Record<string,unknown>>('select * from public.get_guest_receipt($1)',['a'.repeat(64)])).rows;assert.equal(rows.length,1);assert.ok(!('payment_reference' in rows[0]));
 assert.equal((await db.query('select * from public.get_guest_receipt($1)',['b'.repeat(64)])).rows.length,0);
});
await check('Financial and lifecycle constraints reject invalid data',async()=>{
 await denied(`update public.contributions set fee_amount_minor=-1 where id='${contribution}'`);
 await denied(`update public.contributions set total_amount_minor=1 where id='${contribution}'`);
 await denied(`update public.campaigns set status='draft' where id='${demoCampaign}'`);
});
await check('Saved campaigns, follows and notifications remain user scoped',async()=>{
 await role('service_role');await db.query('insert into public.notifications(user_id,title,message,notification_type) values($1,\'Test\',\'Private\',\'activity\')',[owner]);
 await role('authenticated',owner);await db.query('insert into public.saved_campaigns(campaign_id,user_id) values($1,$2)',[demoCampaign,owner]);
 await db.query('insert into public.campaign_follows(campaign_id,user_id) values($1,$2)',[demoCampaign,owner]);
 assert.equal((await db.query('update public.notifications set is_read=true returning id')).rows.length,1);await denied("update public.notifications set message='forged'");
 await role('authenticated',other);for(const t of ['saved_campaigns','campaign_follows','notifications'])assert.equal((await db.query(`select * from public.${t}`)).rows.length,0);
 await denied(`insert into public.campaign_follows(campaign_id,user_id) values('${demoCampaign}','${owner}')`);
});
await check('Private Storage policy hides unpublished campaign media',async()=>{
 await role('authenticated',owner);
 const unpublished=(await db.query<{campaign_id:string}>('select * from public.create_campaign_draft(\'Private draft\',null)')).rows[0].campaign_id;
 await role('service_role');
 await db.query('update public.campaign_assets set storage_bucket=\'campaign-media\',storage_path=\'test/public.jpg\' where id=$1',[data.campaigns[0].cover_asset_id]);
 await db.query("insert into public.campaign_assets(campaign_id,asset_type,asset_role,original_url,storage_bucket,storage_path) values($1,'image','story','https://example.org/private.jpg','campaign-media','test/private.jpg')",[unpublished]);
 await db.exec("insert into storage.objects(bucket_id,name) values('campaign-media','test/public.jpg'),('campaign-media','test/private.jpg'),('campaign-media','test/unregistered.jpg')");
 await role('anon');assert.deepEqual((await db.query<{name:string}>('select name from storage.objects')).rows.map(r=>r.name),['test/public.jpg']);
 await role('authenticated',owner);assert.equal((await db.query('select * from storage.objects')).rows.length,2);
});
await check('Validator rejects duplicate slugs and broken asset associations',async()=>{
 const duplicate=structuredClone(data);duplicate.campaigns[1].slug=duplicate.campaigns[0].slug;assert.throws(()=>validateRelations(duplicate),/Duplicate campaign slug/);
 const broken=structuredClone(data);broken.campaigns[0].cover_asset_id=broken.campaigns[1].cover_asset_id;assert.throws(()=>validateRelations(broken),/Cover\/campaign mismatch/);
});
await db.close();
await check('Administrative dry runs preserve source JSON byte for byte',async()=>{
 const paths=(await Promise.all(['json','demo'].map(async dir=>(await readdir(resolve(root,dir))).filter(n=>n.endsWith('.json')).map(n=>`${dir}/${n}`)))).flat();
 const hashes=async()=>Promise.all(paths.map(async p=>createHash('sha256').update(await readFile(resolve(root,p))).digest('hex')));
 const before=await hashes();const run=promisify(execFile);
 for(const args of [['import/import-to-supabase.ts','--dry-run'],['import/import-to-supabase.ts','--dry-run','--include-demo'],['import/upload-media.ts','--dry-run']])await run(process.execPath,[resolve(root,'node_modules/tsx/dist/cli.mjs'),...args],{cwd:root});
 assert.deepEqual(await hashes(),before);
});
await writeFile(resolve(root,'reports/validation-results.json'),JSON.stringify({engine:'PGlite PostgreSQL WASM (local, not Supabase)',checks,passed:checks.length},null,2)+'\n');
console.log(`${checks.length} checks passed in local PostgreSQL. No Supabase connection made.`);
