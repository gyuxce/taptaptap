import { createServerClient } from '@supabase/ssr';
import type { NextRequest } from 'next/server';
import type { Profile } from '@/types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export async function getVerifiedProfile(request: NextRequest): Promise<Profile | null> {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: () => {
        // Route handlers only verify the existing session. Refresh is handled by the browser client.
      },
    },
  });

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return null;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) return null;
  return profile as Profile;
}

export async function getVerifiedAdmin(request: NextRequest): Promise<Profile | null> {
  const profile = await getVerifiedProfile(request);
  return profile?.role === 'admin' ? profile : null;
}
