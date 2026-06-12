import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from './supabase';
import { Profile } from '@/types';
import { loginSchema } from './validations';

const SEED_ACCOUNTS = [
  { email: 'admin@wavr.com', role: 'admin', merchant_id: null, merchant_type: null },
  { email: 'zipline@wavr.com', role: 'merchant', merchant_id: 'm-lok1', merchant_type: 'loket' },
  { email: 'cafe@wavr.com', role: 'merchant', merchant_id: 'm-fb1', merchant_type: 'regular' },
];

export async function signIn(email: string, password: string) {
  // Validate with Zod schema
  const validation = loginSchema.safeParse({ email, password });
  if (!validation.success) {
    const errorMsg = validation.error.issues[0]?.message || 'Email atau password salah';
    return { user: null, profile: null, error: errorMsg };
  }

  try {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        return { user: null, profile: null, error: 'Email atau password salah' };
      }

      // Fetch profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();

      if (profileError || !profile) {
        return { user: data.user, profile: null, error: 'Akun tidak terdaftar dalam sistem' };
      }

      // Write session cookie for Next.js Middleware route guards
      if (typeof window !== 'undefined') {
        document.cookie = `ecotour_session=${encodeURIComponent(JSON.stringify(profile))}; path=/; max-age=86400`;
      }

      return { user: data.user, profile, error: null };
    } else {
      // Simulation mode
      const cleanEmail = email.toLowerCase().trim();
      const matched = SEED_ACCOUNTS.find(acc => acc.email === cleanEmail);
      
      if (!matched) {
        return { user: null, profile: null, error: 'Akun tidak terdaftar dalam sistem' };
      }

      if (password !== 'password123' && password !== 'password' && password !== 'demo1234') {
        return { user: null, profile: null, error: 'Email atau password salah' };
      }

      const mockUser = {
        id: matched.role === 'admin' 
          ? 'u-admin' 
          : (matched.merchant_id ? matched.merchant_id.replace('m-', 'u-') : 'u-merchant'),
        email: matched.email,
      };

      const mockProfile: Profile = {
        id: mockUser.id,
        role: matched.role as 'admin' | 'merchant',
        merchant_id: matched.merchant_id,
        merchant_type: matched.merchant_type as 'loket' | 'regular' | null,
        created_at: new Date().toISOString(),
      };

      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem('ecotour_session', JSON.stringify({ user: mockUser, profile: mockProfile }));
        document.cookie = `ecotour_session=${encodeURIComponent(JSON.stringify(mockProfile))}; path=/; max-age=86400`;
        
        // Dispatch custom event to notify useAuth hooks active in other components
        window.dispatchEvent(new Event('auth-change'));
      }

      return { user: mockUser, profile: mockProfile, error: null };
    }
  } catch {
    return { user: null, profile: null, error: 'Terjadi kesalahan, coba lagi' };
  }
}

export async function signOut() {
  try {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
      if (typeof window !== 'undefined') {
        document.cookie = 'ecotour_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      }
    } else {
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem('ecotour_session');
        document.cookie = 'ecotour_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        window.dispatchEvent(new Event('auth-change'));
      }
    }
  } catch {
    // ignore
  }
}

export async function getSession() {
  try {
    if (isSupabaseConfigured) {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session) return null;

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      return { session, profile: profile || null };
    } else {
      if (typeof window !== 'undefined') {
        const stored = window.sessionStorage.getItem('ecotour_session');
        if (stored) {
          const parsed = JSON.parse(stored);
          return { session: { user: parsed.user }, profile: parsed.profile };
        }
      }
      return null;
    }
  } catch {
    return null;
  }
}

export function useAuth() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isSupabaseConfigured) {
      // Fetch initial session
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          setUser(session.user);
          supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single()
            .then(({ data: prof }) => {
              setProfile(prof);
              setLoading(false);
            });
        } else {
          setUser(null);
          setProfile(null);
          setLoading(false);
        }
      });

      // Listen to Auth State Changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        setLoading(true);
        if (session) {
          setUser(session.user);
          const { data: prof } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();
          setProfile(prof);
        } else {
          setUser(null);
          setProfile(null);
        }
        setLoading(false);
      });

      return () => {
        subscription.unsubscribe();
      };
    } else {
      // Simulation mode
      const updateMockState = () => {
        if (typeof window !== 'undefined') {
          const stored = window.sessionStorage.getItem('ecotour_session');
          if (stored) {
            const parsed = JSON.parse(stored);
            setUser(parsed.user);
            setProfile(parsed.profile);
          } else {
            setUser(null);
            setProfile(null);
          }
        }
        setLoading(false);
      };

      updateMockState();

      if (typeof window !== 'undefined') {
        window.addEventListener('auth-change', updateMockState);
        return () => {
          window.removeEventListener('auth-change', updateMockState);
        };
      }
    }
  }, []);

  return { user, profile, loading, signOut };
}
