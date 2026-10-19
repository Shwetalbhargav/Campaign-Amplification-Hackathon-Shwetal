import {supabase,unwrap} from '../lib/supabase.js';
import type {CampaignAsset} from '../types/campaign.js';
export async function getAssetUrl(asset:CampaignAsset){
 if(!asset.storage_bucket||!asset.storage_path)return null;
 // No fallback hotlinking: only explicitly permitted media uploaded by trusted tooling.
 const data=unwrap(await supabase().storage.from(asset.storage_bucket).createSignedUrl(asset.storage_path,300));return data.signedUrl;
}
