import { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, requireSupabaseConfig } from './supabase';
import type { Profile } from '@/types';
import { loginSchema } from './validations';

const AUTH_TIMEOUT_MS = 10000;
type AuthUser = Pick<User, 'id' | 'email'>;

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs = AUTH_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(
      () => reject(new Error('Permintaan autentikasi terlalu lama')),
      timeoutMs
    );

    promise.then(
      value => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      error => {
        window.clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await withTimeout(
    supabase.from('profiles').select('*').eq('id', userId).single()
  );
  return error || !data ? null : data as Profile;
}

export async function signIn(email: string, password: string) {
  const validation = loginSchema.safeParse({ email, password });
  if (!validation.success) {
    return {
      user: null,
      profile: null,
      error: validation.error.issues[0]?.message || 'Email atau password salah',
    };
  }

  try {
    requireSupabaseConfig();
    const { data, error } = await withTimeout(
      supabase.auth.signInWithPassword({ email, password })
    );
    if (error) {
      return { user: null, profile: null, error: 'Email atau password salah' };
    }

    const profile = await fetchProfile(data.user.id);
    if (!profile) {
      await supabase.auth.signOut();
      return {
        user: data.user,
        profile: null,
        error: 'Akun belum memiliki profil atau hak akses',
      };
    }

    return { user: data.user, profile, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Terjadi kesalahan, coba lagi';
    return { user: null, profile: null, error: message };
  }
}

export async function signOut() {
  requireSupabaseConfig();
  await supabase.auth.signOut();
}

export async function getSession() {
  try {
    requireSupabaseConfig();
    const { data: { session }, error } = await withTimeout(supabase.auth.getSession());
    if (error || !session) return null;

    const profile = await fetchProfile(session.user.id);
    return profile ? { session, profile } : null;
  } catch {
    return null;
  }
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let requestId = 0;

    const applySession = async (session: Session | null) => {
      const currentRequest = ++requestId;
      try {
        if (!session?.user) {
          if (active && currentRequest === requestId) {
            setUser(null);
            setProfile(null);
          }
          return;
        }

        const nextProfile = await fetchProfile(session.user.id);
        if (!active || currentRequest !== requestId) return;

        setUser(session.user);
        setProfile(nextProfile);
      } catch {
        if (!active || currentRequest !== requestId) return;
        setUser(null);
        setProfile(null);
      } finally {
        if (active && currentRequest === requestId) setLoading(false);
      }
    };

    const initialize = async () => {
      try {
        requireSupabaseConfig();
        const { data, error } = await withTimeout(supabase.auth.getSession());
        if (error) throw error;
        await applySession(data.session);
      } catch {
        if (!active) return;
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== 'INITIAL_SESSION') void applySession(session);
    });

    void initialize();

    return () => {
      active = false;
      requestId += 1;
      subscription.unsubscribe();
    };
  }, []);

  return { user, profile, loading, signOut };
}
