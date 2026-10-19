import 'dotenv/config';
import {createClient} from '@supabase/supabase-js';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {loadDatasets,root,type Dataset} from './datasets.js';
import {validateAll} from '../scripts/validate.js';
const includeDemo=process.argv.includes('--include-demo'),dryRun=process.argv.includes('--dry-run');
const summary:{dryRun:boolean;includeDemo:boolean;tables:Record<string,{prepared:number;inserted:number;skipped:number}>;errors:string[]}={dryRun,includeDemo,tables:{},errors:[]};
try{
 await validateAll();const datasets=await loadDatasets(includeDemo);
 if(includeDemo&&!dryRun&&!process.argv.includes('--website-permission-confirmed'))throw new Error('Website Terms section 9 prohibits scraping. Owner permission for content reuse must be confirmed before importing website demos; pass --website-permission-confirmed only after obtaining it.');
 const order:(keyof Dataset)[]=['profiles','categories','campaigns','campaign_assets','campaign_story_sections','campaign_sources','campaign_targeting','advertising_creatives','campaign_updates','distribution_reports','contributions','notifications'];
 if(dryRun){for(const t of order)summary.tables[t]={prepared:datasets[t].length,inserted:0,skipped:0};}
 else{
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key||url.includes('YOUR_PROJECT')||key.startsWith('YOUR_'))throw new Error('Set real SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in local .env. No connection attempted.');
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  // Profile IDs must already exist in Supabase Auth; never fabricate or create Auth users.
  for(const p of datasets.profiles){const {data,error}=await db.auth.admin.getUserById(p.id);if(error||!data.user)throw new Error(`Missing Auth identity ${p.id}`);}
  // Preflight every campaign conflict before writes. IDs cannot collide across provenance domains.
  for(const c of datasets.campaigns){
   const {data,error}=await db.from('campaigns').select('id,slug,data_origin,website_id').or(`id.eq.${c.id},slug.eq.${c.slug}`);
   if(error)throw error;
   if(data?.some(r=>r.id!==c.id||r.slug!==c.slug||r.data_origin!==c.data_origin||r.website_id!==c.website_id))throw new Error(`Conflicting existing campaign ${c.slug}; refusing overwrite`);
  }
  for(const table of order){
   const rows=datasets[table].map(r=>table==='campaigns'?{...r,cover_asset_id:null}:r);
   let inserted=0;
   for(let i=0;i<rows.length;i+=100){
    const {data,error}=await db.from(table).upsert(rows.slice(i,i+100),{onConflict:'id',ignoreDuplicates:true}).select('id');
    if(error)throw new Error(`${table} batch ${i}: ${error.message}`);inserted+=data?.length||0;
   }
   summary.tables[table]={prepared:rows.length,inserted,skipped:rows.length-inserted};
  }
  // Resolve cyclic cover FK after assets exist. Only fill absent cover, never replace a live value.
  for(const c of datasets.campaigns.filter(c=>c.cover_asset_id)){
   const {error}=await db.from('campaigns').update({cover_asset_id:c.cover_asset_id}).eq('id',c.id).eq('data_origin',c.data_origin).is('cover_asset_id',null);
   if(error)throw new Error(`Cover ${c.slug}: ${error.message}`);
  }
 }
}catch(error){summary.errors.push(error instanceof Error?error.message:String(error));process.exitCode=1;}
await writeFile(resolve(root,'reports/import-summary.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
// REST batches are not one transaction. A failure exits nonzero; rerun skips already inserted IDs.
// Existing rows are never overwritten; source JSON is always read-only.
