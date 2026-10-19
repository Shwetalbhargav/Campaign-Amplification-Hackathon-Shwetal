import type { RowMap } from './rows.js';
export type Campaign=RowMap['campaigns'];
export type CampaignStory=RowMap['campaign_story_sections'];
export type CampaignAsset=RowMap['campaign_assets'];
export interface CampaignFilters {categoryId?:string;search?:string;limit?:number;offset?:number;includeDemo?:boolean}
export interface DraftData {story?:string;sources?:{title:string|null;url:string}[];[key:string]:unknown}
export interface FundingStatus {goalMinor:number|null;raisedMinor:number|null;currency:string|null;percentage:number|null;basis:'website_demo'|'generated_demo'|'website'|'user'}
