import type { RowMap } from './rows.js';
export type Json=string|number|boolean|null|Json[]|{[key:string]:Json|undefined};
type Table<R>={Row:R;Insert:Partial<R>;Update:Partial<R>;Relationships:[]};
type Link={id:string;campaign_id:string;user_id:string;created_at:string};
type Tables={ [K in keyof RowMap]:Table<RowMap[K]> } & {
 campaign_follows:Table<Link>;saved_campaigns:Table<Link>;
 campaign_reviews:Table<{id:string;campaign_id:string;reviewer_id:string;decision:'approved'|'changes_requested'|'rejected';feedback:string|null;reviewed_at:string}>;
 campaign_status_history:Table<{id:string;campaign_id:string;from_status:string|null;to_status:string;actor_id:string|null;created_at:string}>;
};
export type Database={public:{Tables:Tables;Views:Record<string,never>;Enums:Record<string,never>;CompositeTypes:Record<string,never>;Functions:{
 create_campaign_draft:{Args:{p_title:string;p_category_id?:string};Returns:RowMap['campaign_drafts']};
 submit_campaign:{Args:{p_campaign_id:string};Returns:undefined};
 review_campaign:{Args:{p_campaign_id:string;p_decision:string;p_feedback?:string};Returns:undefined};
}}};
// Hand-maintained bootstrap types. After applying SQL, replace with Supabase CLI generated types.
