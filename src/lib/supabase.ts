import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
export const isSupabaseConfigReady = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// ─── Audit log helper ──────────────────────────────────────────────────────────
export async function logAudit(params: {
  userId?: string;
  userName?: string;
  role?: string;
  department?: string;
  operation: string;
  branch?: string;
  details?: string;
}) {
  await supabase.from('audit_logs').insert({
    user_id: params.userId || null,
    user_name: params.userName || 'غير معروف',
    role: params.role || '',
    department: params.department || '',
    operation: params.operation,
    branch: params.branch || '',
    details: params.details || '',
  });
}
