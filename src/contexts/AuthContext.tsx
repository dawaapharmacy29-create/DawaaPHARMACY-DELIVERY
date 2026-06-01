import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigReady } from '@/lib/supabase';
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
  authError: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  sendOtp: (email: string) => Promise<void>;
  verifyOtpAndSetPassword: (email: string, otp: string, password: string, displayName: string) => Promise<void>;
  retryAuth: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

async function fetchProfile(userId: string): Promise<AuthUser | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, email, username, display_name, role, branch_id, status, branches(name)')
    .eq('id', userId)
    .single();

  if (error) throw error;
  if (!data) return null;

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
  const [authError, setAuthError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const loadProfile = useCallback(async (supabaseUser: User) => {
    try {
      const profile = await fetchProfile(supabaseUser.id);
      if (profile) {
        setUser(profile);
        setAuthError(null);
        return true;
      }

      setUser({
        id: supabaseUser.id,
        email: supabaseUser.email || '',
        displayName: supabaseUser.user_metadata?.display_name || supabaseUser.email?.split('@')[0] || 'مستخدم',
        role: supabaseUser.user_metadata?.role || 'مدير عام',
        branchId: null,
        branchName: null,
        status: 'نشط',
      });
      setAuthError(null);
      return true;
    } catch (error) {
      if (import.meta.env.DEV) console.debug('profile failed', error);
      setUser(null);
      setAuthError('قاعدة بيانات الدليفري غير مجهزة بعد. شغّل ملفات Supabase SQL.');
      return false;
    }
  }, []);

  const initializeAuth = useCallback(async () => {
    if (!mountedRef.current) return;
    setLoading(true);
    setAuthError(null);

    if (!isSupabaseConfigReady) {
      setUser(null);
      setSession(null);
      setAuthError('إعدادات Supabase غير مكتملة. راجع VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY.');
      setLoading(false);
      if (import.meta.env.DEV) console.debug('auth init finished with missing config');
      return;
    }

    if (import.meta.env.DEV) console.debug('auth init started');

    let timeoutId: number | undefined;
    const timeoutPromise = new Promise<{ timeout: true }>((resolve) => {
      timeoutId = window.setTimeout(() => resolve({ timeout: true }), 8000);
    });

    try {
      const authResult = await Promise.race([supabase.auth.getSession(), timeoutPromise]) as Awaited<ReturnType<typeof supabase.auth.getSession>> | { timeout: true };

      if (!mountedRef.current) return;
      if ('timeout' in authResult) {
        setUser(null);
        setSession(null);
        setAuthError('انتهى وقت انتظار المصادقة. تحقق من اتصال Supabase أو الإعدادات.');
        setLoading(false);
        if (import.meta.env.DEV) console.debug('auth init finished with timeout');
        return;
      }

      const { data: { session: currentSession }, error } = authResult;
      if (error) {
        throw error;
      }

      if (import.meta.env.DEV) console.debug('session found', Boolean(currentSession));
      setSession(currentSession);

      if (!currentSession?.user) {
        setUser(null);
        setLoading(false);
        if (import.meta.env.DEV) console.debug('auth init finished without session');
        return;
      }

      const profileLoaded = await loadProfile(currentSession.user);
      if (!profileLoaded) {
        setLoading(false);
        if (import.meta.env.DEV) console.debug('auth init finished with profile error');
        return;
      }

      setLoading(false);
      if (import.meta.env.DEV) console.debug('auth init finished');
    } catch (error) {
      if (!mountedRef.current) return;
      if (import.meta.env.DEV) console.error('auth init failed', error);
      setUser(null);
      setSession(null);
      setAuthError('قاعدة بيانات الدليفري غير مجهزة بعد. شغّل ملفات Supabase SQL.');
      setLoading(false);
    } finally {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    }
  }, [loadProfile]);

  useEffect(() => {
    mountedRef.current = true;
    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (!mountedRef.current) return;
      setSession(currentSession);
      if (event === 'SIGNED_IN' && currentSession?.user) {
        await loadProfile(currentSession.user);
        setLoading(false);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setLoading(false);
      } else if (event === 'TOKEN_REFRESHED' && currentSession?.user) {
        await loadProfile(currentSession.user);
      }
    });

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [initializeAuth, loadProfile]);

  const login = async (usernameOrEmail: string, password: string) => {
    setLoading(true);
    setAuthError(null);
    let email = usernameOrEmail;
    if (!usernameOrEmail.includes('@')) {
      const { data: resolvedEmail, error: resolveError } = await supabase
        .rpc('delivery_resolve_login', { login_name: usernameOrEmail });
      if (resolveError || !resolvedEmail) {
        setLoading(false);
        throw new Error('اسم المستخدم غير موجود');
      }
      email = String(resolvedEmail);
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      throw new Error('كلمة المرور غير صحيحة');
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

    if (data.user) {
      await supabase.from('user_profiles').update({
        display_name: displayName,
        role: 'مدير عام',
        status: 'نشط',
      }).eq('id', data.user.id);
      await loadProfile(data.user);
    }
  };

  const retryAuth = () => {
    initializeAuth();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        authError,
        login,
        logout,
        sendOtp,
        verifyOtpAndSetPassword,
        retryAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
