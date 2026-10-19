import {supabase,unwrap} from '../lib/supabase.js';
export async function fetchMyContributions(){return unwrap(await supabase().from('contributions').select('id,campaign_id,backer_id,contribution_amount_minor,fee_amount_minor,total_amount_minor,currency,payment_status,is_anonymous,is_simulated,created_at').order('created_at',{ascending:false}));}
// Checkout and guest receipt retrieval must be implemented in a trusted Edge Function.
// No direct mobile writes to contributions or campaign totals. Amounts fund advertising.
export interface CheckoutRequest {campaignId:string;amountMinor:number;currency:string;isAnonymous:boolean;guestEmail?:string}
export interface CheckoutResponse {checkoutUrl:string;reference:string;isSimulated:boolean}
export interface ContributionGateway {createCheckout(input:CheckoutRequest):Promise<CheckoutResponse>;getGuestReceipt(receiptToken:string):Promise<{campaignId:string;totalMinor:number;currency:string;status:string;isSimulated:boolean}>}
