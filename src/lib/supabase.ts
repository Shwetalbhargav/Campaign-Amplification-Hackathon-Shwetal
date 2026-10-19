import {createClient,type SupportedStorage} from '@supabase/supabase-js';
import type {Database} from '../types/database.js';
// Only the public anon key belongs in Expo. Pass AsyncStorage from the app bootstrap
// with createMobileClient(AsyncStorage); no native dependency is required by this data package.
export function createMobileClient(storage?:SupportedStorage){
 const url=process.env.EXPO_PUBLIC_SUPABASE_URL,key=process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)throw new Error('EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY required');
 return createClient<Database>(url,key,{auth:{storage,persistSession:!!storage,autoRefreshToken:true,detectSessionInUrl:false}});
}
let client:ReturnType<typeof createMobileClient>|undefined;
export function configureSupabase(storage:SupportedStorage){client=createMobileClient(storage);return client;}
export function supabase(){return client??=createMobileClient();}
export function unwrap<T>({data,error}:{data:T;error:{message:string}|null}):NonNullable<T>{if(error)throw new Error(error.message);if(data===null||data===undefined)throw new Error('No data returned');return data as NonNullable<T>;}
