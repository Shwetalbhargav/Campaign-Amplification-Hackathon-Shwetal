import {supabase,unwrap} from '../lib/supabase.js';
import type {CampaignFilters,DraftData,FundingStatus} from '../types/campaign.js';
const publicStatuses=['approved','active','completed'] as const;
export async function fetchPublicCampaigns(filters:CampaignFilters={}){
 const limit=Math.max(1,Math.min(filters.limit??20,100)),offset=Math.max(0,filters.offset??0);
 let query=supabase().from('campaigns').select('*').in('status',publicStatuses).order('published_at',{ascending:false,nullsFirst:false}).order('id').range(offset,offset+limit-1);
 if(!filters.includeDemo)query=query.in('data_origin',['user','website']);
 if(filters.categoryId)query=query.eq('category_id',filters.categoryId);
 if(filters.search?.trim())query=query.ilike('title',`%${filters.search.trim().replace(/[%_\\]/g,'\\$&')}%`);
 return unwrap(await query);
}
export async function fetchFeaturedCampaigns(includeDemo=false){let q=supabase().from('campaigns').select('*').in('status',publicStatuses).eq('is_featured',true).order('published_at',{ascending:false,nullsFirst:false}).limit(20);if(!includeDemo)q=q.in('data_origin',['user','website']);return unwrap(await q);}
export const fetchCampaignsByCategory=(categoryId:string,filters:CampaignFilters={})=>fetchPublicCampaigns({...filters,categoryId});
export const searchCampaigns=(search:string,filters:CampaignFilters={})=>fetchPublicCampaigns({...filters,search});
export async function fetchCampaignDetails(slug:string){return unwrap(await supabase().from('campaigns').select('*').eq('slug',slug).in('status',publicStatuses).single());}
export async function fetchCampaignStories(campaignId:string){return unwrap(await supabase().from('campaign_story_sections').select('*').eq('campaign_id',campaignId).order('display_order'));}
export async function fetchCampaignSources(campaignId:string){return unwrap(await supabase().from('campaign_sources').select('*').eq('campaign_id',campaignId).order('display_order'));}
export async function fetchCampaignImages(campaignId:string){return unwrap(await supabase().from('campaign_assets').select('*').eq('campaign_id',campaignId).in('asset_type',['image','svg']));}
export async function createCampaignDraft(title:string,categoryId?:string){return unwrap(await supabase().rpc('create_campaign_draft',{p_title:title,...(categoryId?{p_category_id:categoryId}:{})}));}
export async function saveCampaignDraft(id:string,draftData:DraftData,currentStep:number){
 if(!Number.isInteger(currentStep)||currentStep<0)throw new Error('Invalid draft step');
 return unwrap(await supabase().from('campaign_drafts').update({draft_data:draftData,current_step:currentStep,last_saved_at:new Date().toISOString()}).eq('id',id).select('*').single());
}
export async function updateCampaignDraftFields(id:string,fields:Partial<Pick<import('../types/campaign.js').Campaign,'title'|'summary'|'category_id'|'duration_days'|'funding_goal_minor'|'currency'>>){return unwrap(await supabase().from('campaigns').update(fields).eq('id',id).select('*').single());}
export async function submitCampaign(campaignId:string){const {error}=await supabase().rpc('submit_campaign',{p_campaign_id:campaignId});if(error)throw new Error(error.message);}
export async function fetchCreatorCampaigns(){const {data,error}=await supabase().auth.getUser();if(error||!data.user)throw new Error('Sign in required');return unwrap(await supabase().from('campaigns').select('*').eq('creator_id',data.user.id).order('created_at',{ascending:false}));}
export async function fetchCampaignFundingStatus(id:string):Promise<FundingStatus>{const c=unwrap(await supabase().from('campaigns').select('*').eq('id',id).single());return{goalMinor:c.funding_goal_minor,raisedMinor:c.amount_raised_minor,currency:c.currency,percentage:c.funding_goal_minor&&c.amount_raised_minor!==null?c.amount_raised_minor/c.funding_goal_minor*100:null,basis:c.data_origin};}
