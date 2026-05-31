import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Session, User } from '@supabase/supabase-js';

export interface AuthUser {
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
  login: (usernameOrEmail: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  sendOtp: (email: string) => Promise<void>;
  verifyOtpAndSetPassword: (email: string, otp: string, password: string, displayName: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function isActiveStatus(status?: string | null) {
  return ['active', 'نشط'].includes(status || '');
}

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
    role: data.role || 'unassigned',
    branchId: data.branch_id || null,
    branchName: (data as any).branches?.name || null,
    status: data.status || 'active',
  };
}

async function resolveLoginIdentifier(usernameOrEmail: string) {
  const input = usernameOrEmail.trim();
  if (input.includes('@')) return input;

  const { data: aliasData, error: aliasError } = await supabase.rpc('delivery_resolve_login', {
    login_name: input,
  });

  if (!aliasError && aliasData?.[0]?.email) {
    if (!isActiveStatus(aliasData[0].status)) throw new Error('هذا الحساب غير مفعل.');
    return aliasData[0].email as string;
  }

  const { data: profileData } = await supabase
    .from('user_profiles')
    .select('email, status')
    .ilike('username', input)
    .maybeSingle();

  if (!profileData?.email) throw new Error('اسم المستخدم غير صحيح أو غير موجود.');
  if (!isActiveStatus(profileData.status)) throw new Error('هذا الحساب غير مفعل.');
  return profileData.email;
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
      setUser({
        id: supabaseUser.id,
        email: supabaseUser.email || '',
        displayName: supabaseUser.user_metadata?.display_name || supabaseUser.email?.split('@')[0] || 'مستخدم',
        role: 'unassigned',
        branchId: null,
        branchName: null,
        status: 'inactive',
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

  const login = async (usernameOrEmail: string, password: string) => {
    setLoading(true);
    try {
      const email = await resolveLoginIdentifier(usernameOrEmail);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.user) throw new Error('حدث خطأ في الاتصال، حاول مرة أخرى.');

      const profile = await fetchProfile(data.user.id);
      if (!profile) {
        await supabase.auth.signOut();
        throw new Error('هذا الحساب غير مربوط بدور داخل نظام الدليفري.');
      }
      if (!isActiveStatus(profile.status)) {
        await supabase.auth.signOut();
        throw new Error('هذا الحساب غير مفعل.');
      }

      setUser(profile);
      setLoading(false);
      return profile;
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Login failed', error);
      setLoading(false);
      if (String(error?.message || '').includes('Invalid login credentials')) {
        throw new Error('كلمة المرور غير صحيحة.');
      }
      throw error;
    }
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
      data: { display_name: displayName, role: 'rider' },
    });
    if (updateError) throw updateError;

    if (data.user) {
      await supabase.from('user_profiles').update({
        display_name: displayName,
        role: 'rider',
        status: 'active',
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
