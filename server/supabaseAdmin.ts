import { createClient } from '@supabase/supabase-js';

export const createSupabaseAdmin = () => {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || '';

  if (!url || !serviceRoleKey) {
    throw new Error('Server-side Supabase configuration is incomplete.');
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
};
