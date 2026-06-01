import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
export const isSupabaseConfigReady = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder', {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export async function logAudit(params: {
  userId?: string;
  userName?: string;
  role?: string;
  department?: string;
  operation: string;
  branch?: string;
  details?: string;
}) {
  try {
    await supabase.from('delivery_audit_log').insert({
      actor_profile_id: params.userId || null,
      actor_name: params.userName || 'غير معروف',
      action: params.operation,
      table_name: params.department || 'delivery',
      old_data: null,
      new_data: { role: params.role || '', branch: params.branch || '', details: params.details || '' },
    });
  } catch (error) {
    if (import.meta.env.DEV) console.warn('audit log skipped', error);
  }
}
