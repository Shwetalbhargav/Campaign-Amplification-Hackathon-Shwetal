import {supabase,unwrap} from '../lib/supabase.js';
export async function fetchCategories(){return unwrap(await supabase().from('categories').select('*').order('display_order',{ascending:true,nullsFirst:false}));}
