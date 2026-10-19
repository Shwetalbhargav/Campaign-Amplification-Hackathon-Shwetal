import 'dotenv/config';
import {createClient} from '@supabase/supabase-js';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {readJson,root} from './datasets.js';
import {manifestSchema,safeAssetPath,validateAll} from '../scripts/validate.js';
const dryRun=process.argv.includes('--dry-run');
const results:{assetId:string;status:string;reason?:string}[]=[];
let fatal:string|undefined;
try{
 await validateAll();const assets=manifestSchema.parse(await readJson('reports/media-manifest.json'));
 const permitted=assets.filter(a=>a.upload_permitted&&a.rights_status!=='unverified'&&a.download_status==='downloaded');
 for(const a of assets.filter(a=>!permitted.includes(a)))results.push({assetId:a.id,status:'skipped',reason:'Not downloaded or redistribution permission unconfirmed'});
 if(dryRun)for(const a of permitted)results.push({assetId:a.id,status:'would_upload'});
 else if(permitted.length){
  if(!process.argv.includes('--website-permission-confirmed'))throw new Error('Confirm owner permission using --website-permission-confirmed before uploading website assets.');
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key||url.includes('YOUR_PROJECT')||key.startsWith('YOUR_'))throw new Error('Set real local Supabase administrative credentials.');
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});const bucket='campaign-media';
  const existing=await db.storage.getBucket(bucket);
  if(existing.error){const created=await db.storage.createBucket(bucket,{public:false});if(created.error)throw created.error;}
  else if(existing.data.public)throw new Error('campaign-media must be private to protect draft media.');
  for(const a of permitted){
   try{
    const {data:record,error:recordError}=await db.from('campaign_assets').select('id,original_url').eq('id',a.id).single();
    if(recordError||record.original_url!==a.original_source_url)throw new Error('Import matching asset metadata first.');
    const bytes=await readFile(safeAssetPath(a.local_file_path!));
    if(createHash('sha256').update(bytes).digest('hex')!==a.content_hash)throw new Error('Local hash mismatch');
    const upload=await db.storage.from(bucket).upload(a.proposed_storage_path,bytes,{upsert:false,contentType:a.mime_type||undefined});
    if(upload.error){
     const old=await db.storage.from(bucket).download(a.proposed_storage_path);
     if(old.error||createHash('sha256').update(Buffer.from(await old.data.arrayBuffer())).digest('hex')!==a.content_hash)throw upload.error;
    }
    const {error}=await db.from('campaign_assets').update({storage_bucket:bucket,storage_path:a.proposed_storage_path}).eq('id',a.id).eq('original_url',a.original_source_url);
    if(error)throw error;
    results.push({assetId:a.id,status:upload.error?'already_present':'uploaded'});
   }catch(e){results.push({assetId:a.id,status:'failed',reason:e instanceof Error?e.message:JSON.stringify(e)});process.exitCode=1;}
  }
 }
}catch(e){fatal=e instanceof Error?e.message:String(e);process.exitCode=1;}
const summary={dryRun,results,...(fatal?{fatal}:{})};
await writeFile(resolve(root,'reports/upload-summary.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary,null,2));
