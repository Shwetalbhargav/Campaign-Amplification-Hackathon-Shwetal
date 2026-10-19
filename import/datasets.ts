import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import {schemas,type RowMap} from '../src/types/rows.js';
export const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export async function readJson(path:string):Promise<unknown>{return JSON.parse(await readFile(resolve(root,path),'utf8'));}
export const files:Partial<Record<keyof RowMap,string>>={profiles:'profiles',categories:'categories',campaigns:'campaigns',campaign_assets:'campaign-assets',campaign_story_sections:'campaign-stories',campaign_sources:'campaign-sources',campaign_targeting:'campaign-targeting',campaign_updates:'campaign-updates',distribution_reports:'distribution-reports',advertising_creatives:'advertising-creatives'};
export const demoFiles:Partial<Record<keyof RowMap,string>>={...files,profiles:'users',categories:undefined,contributions:'contributions',notifications:'notifications'};
export type Dataset={ [K in keyof RowMap]:RowMap[K][] };
export async function loadDatasets(includeDemo=false):Promise<Dataset>{
 const result=Object.fromEntries(Object.keys(schemas).map(k=>[k,[]])) as unknown as Dataset;
 for(const [table,schema] of Object.entries(schemas)){
  const key=table as keyof RowMap;
  const inputs:unknown[]=[];
  if(files[key])inputs.push(await readJson(`json/${files[key]}.json`));
  if(includeDemo&&demoFiles[key])inputs.push(await readJson(`demo/demo-${demoFiles[key]}.json`));
  for(const input of inputs)(result[key] as unknown[]).push(...z.array(schema).parse(input));
 }
 validateRelations(result);return result;
}
export function validateRelations(d:Dataset){
 const fail=(m:string):never=>{throw new Error(m);};
 for(const [table,rows] of Object.entries(d)){
  const ids=new Set<string>();
  for(const row of rows){if(ids.has(row.id))fail(`Duplicate ID ${table}:${row.id}`);ids.add(row.id);}
 }
 const campaigns=new Map(d.campaigns.map(c=>[c.id,c])),assets=new Map(d.campaign_assets.map(a=>[a.id,a]));
 const exists=(t:keyof Dataset,id:string|null)=>id===null||d[t].some(r=>r.id===id);
 const unique=(values:string[],label:string)=>{if(new Set(values).size!==values.length)fail(`Duplicate ${label}`);};
 unique(d.campaigns.map(c=>c.slug),'campaign slug');unique(d.categories.map(c=>c.slug),'category slug');
 unique(d.campaign_sources.map(c=>`${c.campaign_id}:${c.url}`),'campaign source URL');
 unique(d.campaign_story_sections.map(c=>`${c.campaign_id}:${c.display_order}`),'story order');
 unique(d.campaign_targeting.map(c=>c.campaign_id),'targeting campaign');
 for(const c of d.campaigns){
  if(!exists('categories',c.category_id)||!exists('profiles',c.creator_id))fail(`Campaign FK ${c.id}`);
  if(c.cover_asset_id&&assets.get(c.cover_asset_id)?.campaign_id!==c.id)fail(`Cover/campaign mismatch ${c.id}`);
  if(c.estimated_reach_min!==null&&c.estimated_reach_max!==null&&c.estimated_reach_max<c.estimated_reach_min)fail(`Reach range ${c.id}`);
  if(c.deadline_at&&c.published_at&&c.deadline_at<c.published_at)fail(`Deadline ${c.id}`);
 }
 for(const [table,rows] of Object.entries(d))for(const row of rows){
  if('campaign_id' in row&&row.campaign_id!==null&&!campaigns.has(row.campaign_id))fail(`Campaign FK ${table}:${row.id}`);
  if('asset_id' in row&&row.asset_id&&assets.get(row.asset_id)?.campaign_id!==row.campaign_id)fail(`Asset FK ${table}:${row.id}`);
 }
 for(const a of d.campaign_assets)if((a.storage_bucket===null)!==(a.storage_path===null))fail(`Storage bucket/path pair ${a.id}`);
 for(const b of d.contributions){if(!exists('profiles',b.backer_id))fail(`Backer FK ${b.id}`);if(campaigns.get(b.campaign_id)?.currency!==b.currency)fail(`Contribution currency ${b.id}`);if(b.is_simulated&&!['website_demo','generated_demo'].includes(campaigns.get(b.campaign_id)!.data_origin))fail(`Simulated payment on real campaign ${b.id}`);}
 for(const n of d.notifications)if(!exists('profiles',n.user_id))fail(`Notification FK ${n.id}`);
 for(const r of d.distribution_reports){if(r.metric_basis!=='measured'&&[r.impressions,r.measured_reach,r.clicks].some(n=>n!==null))fail(`Unmeasured actual metrics ${r.id}`);if(r.reporting_start&&r.reporting_end&&r.reporting_end<r.reporting_start)fail(`Report period ${r.id}`);}
}
