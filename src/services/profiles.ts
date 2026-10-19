import {supabase,unwrap} from '../lib/supabase.js';
import type {RowMap} from '../types/rows.js';
export async function fetchMyProfile(){const {data,error}=await supabase().auth.getUser();if(error||!data.user)throw new Error('Sign in required');return unwrap(await supabase().from('profiles').select('*').eq('id',data.user.id).single());}
export async function updateMyProfile(fields:Partial<Pick<RowMap['profiles'],'display_name'|'avatar_url'|'organization_name'|'bio'>>){const profile=await fetchMyProfile();return unwrap(await supabase().from('profiles').update(fields).eq('id',profile.id).select('*').single());}
