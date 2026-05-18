import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  branchId: string | null;
  branchName: string | null;
  status: string;
}

interface AuthContextType {
  user: AuthUser | null;
  session: Session | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  sendOtp: (email: string) => Promise<void>;
  verifyOtpAndSetPassword: (email: string, otp: string, password: string, displayName: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

async function fetchProfile(userId: string): Promise<AuthUser | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, email, username, display_name, role, branch_id, status, branches(name)')
    .eq('id', userId)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    email: data.email,
    displayName: data.display_name || data.username || data.email.split('@')[0],
    role: data.role || 'مشاهد',
    branchId: data.branch_id || null,
    branchName: (data as any).branches?.name || null,
    status: data.status || 'نشط',
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (supabaseUser: User) => {
    const profile = await fetchProfile(supabaseUser.id);
    if (profile) {
      setUser(profile);
    } else {
      // fallback if profile not created yet
      setUser({
        id: supabaseUser.id,
        email: supabaseUser.email || '',
        displayName: supabaseUser.user_metadata?.display_name || supabaseUser.email?.split('@')[0] || 'مستخدم',
        role: supabaseUser.user_metadata?.role || 'مدير عام',
        branchId: null,
        branchName: null,
        status: 'نشط',
      });
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setSession(session);
      if (session?.user) {
        loadProfile(session.user).finally(() => {
          if (mounted) setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      setSession(session);
      if (event === 'SIGNED_IN' && session?.user) {
        await loadProfile(session.user);
        setLoading(false);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setLoading(false);
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        await loadProfile(session.user);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const login = async (email: string, password: string) => {
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      throw error;
    }
    if (data.user) await loadProfile(data.user);
    setLoading(false);
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  const sendOtp = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    if (error) throw error;
  };

  const verifyOtpAndSetPassword = async (
    email: string,
    otp: string,
    password: string,
    displayName: string
  ) => {
    const { data, error } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' });
    if (error) throw error;

    const { error: updateError } = await supabase.auth.updateUser({
      password,
      data: { display_name: displayName, role: 'مدير عام' },
    });
    if (updateError) throw updateError;

    // Update profile
    if (data.user) {
      await supabase.from('user_profiles').update({
        display_name: displayName,
        role: 'مدير عام',
        status: 'نشط',
      }).eq('id', data.user.id);
      await loadProfile(data.user);
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, login, logout, sendOtp, verifyOtpAndSetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
