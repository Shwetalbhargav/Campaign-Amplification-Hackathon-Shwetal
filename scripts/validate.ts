import {readFile,readdir,stat} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {loadDatasets,readJson,root} from '../import/datasets.js';
export const manifestSchema=z.array(z.object({id:z.string().uuid(),campaign_id:z.string().uuid().nullable(),asset_role:z.string(),original_source_url:z.string().url(),local_file_path:z.string().nullable(),proposed_storage_path:z.string(),file_extension:z.string().nullable(),mime_type:z.string().nullable(),file_size:z.number().int().nonnegative().nullable(),width:z.number().int().positive().nullable(),height:z.number().int().positive().nullable(),duration_seconds:z.number().nonnegative().nullable(),credit:z.string().nullable(),download_status:z.enum(['downloaded','failed','skipped_rights_unverified']),content_hash:z.string().regex(/^[a-f0-9]{64}$/).nullable(),source_page_url:z.string().url(),source_page_urls:z.array(z.string().url()),rights_status:z.enum(['unverified','permission_granted','licensed']),upload_permitted:z.boolean(),rights_note:z.string(),campaign_associations:z.array(z.object({campaign_id:z.string().uuid(),roles:z.array(z.string())})),error:z.string().optional()}).strict());
export function safeAssetPath(path:string){const p=resolve(root,path),r=relative(resolve(root,'assets'),p);if(!r||r.startsWith('..')||isAbsolute(r))throw new Error(`Unsafe asset path ${path}`);return p;}
export async function validateAll(){
 let jsonCount=0;
 async function walk(dir:string){for(const entry of await readdir(resolve(root,dir),{withFileTypes:true})){const p=`${dir}/${entry.name}`;if(entry.isDirectory())await walk(p);else if(p.endsWith('.json')){await readJson(p);jsonCount++;}}}
 for(const dir of ['json','demo','reports','src/constants'])await walk(dir);
 const real=await loadDatasets(false),all=await loadDatasets(true);
 const manifest=manifestSchema.parse(await readJson('reports/media-manifest.json'));
 const assetIds=new Set(all.campaign_assets.map(a=>a.id));const ids=new Set<string>(),urls=new Set<string>();
 for(const a of manifest){
  if(ids.has(a.id)||urls.has(a.original_source_url))throw new Error(`Duplicate manifest asset ${a.id}`);ids.add(a.id);urls.add(a.original_source_url);
  if(!assetIds.has(a.id))throw new Error(`Manifest missing DB asset ${a.id}`);
  if(a.proposed_storage_path.includes('..')||a.proposed_storage_path.startsWith('/'))throw new Error('Unsafe storage path');
  if(a.upload_permitted&&a.rights_status==='unverified')throw new Error(`Unverified upload rights ${a.id}`);
  if(a.download_status==='downloaded'){
   if(!a.local_file_path||!a.content_hash)throw new Error(`Missing file/hash ${a.id}`);
   const p=safeAssetPath(a.local_file_path);if((await stat(p)).size!==a.file_size)throw new Error(`Size mismatch ${a.id}`);
   if(createHash('sha256').update(await readFile(p)).digest('hex')!==a.content_hash)throw new Error(`Hash mismatch ${a.id}`);
  }
  for(const c of a.campaign_associations){if(!all.campaigns.some(r=>r.id===c.campaign_id))throw new Error(`Manifest campaign missing ${a.id}`);if(a.campaign_id!==c.campaign_id)throw new Error(`Unexpected shared campaign ownership ${a.id}`);}
 }
 for(const a of all.campaign_assets)if(!ids.has(a.id))throw new Error(`Asset missing manifest ${a.id}`);
 const original=z.array(z.object({id:z.string(),slug:z.string(),campaign_sources:z.array(z.string()),title:z.string(),long_description:z.string(),funding_goal:z.number(),funding_current:z.number()})).parse(await readJson('reports/raw/public-campaigns.json'));
 for(const c of all.campaigns.filter(c=>c.data_origin==='website_demo')){
  const r=original.find(r=>r.id===c.website_id);if(!r||r.title!==c.title||r.slug!==c.slug||r.funding_goal*100!==c.funding_goal_minor||r.funding_current*100!==c.amount_raised_minor)throw new Error(`Extraction evidence mismatch ${c.id}`);
  const sourceRows=all.campaign_sources.filter(s=>s.campaign_id===c.id).sort((a,b)=>a.display_order-b.display_order);
  if(JSON.stringify(sourceRows.map(s=>s.url))!==JSON.stringify(r.campaign_sources))throw new Error(`Sources not preserved ${c.id}`);
  if(!all.campaign_story_sections.some(s=>s.campaign_id===c.id&&s.body===r.long_description))throw new Error(`Story not preserved ${c.id}`);
  const pages=z.array(z.object({url:z.string(),text:z.string()})).parse(await readJson('reports/raw/pages.json'));
  const text=pages.find(p=>p.url===c.source_page_url)?.text??'';
  const reach=text.match(/If the campaign reaches its goal, about ([\d,]+) people/);
  if(c.estimated_reach_point!==(reach?Number(reach[1].replaceAll(',','')):null))throw new Error(`Reach estimate evidence mismatch ${c.id}`);
 }
 return {jsonFiles:jsonCount,defaultCampaigns:real.campaigns.length,websiteDemoCampaigns:all.campaigns.length,categories:all.categories.length,assets:manifest.length,imagesDownloaded:manifest.filter(a=>a.download_status==='downloaded'&&a.mime_type?.startsWith('image/')).length,videosDownloaded:manifest.filter(a=>a.download_status==='downloaded'&&a.mime_type?.startsWith('video/')).length};
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/scripts/validate.ts'))console.log(await validateAll());

