import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase, isSupabaseConfigReady } from '@/lib/supabase';
import type { Session, User } from '@supabase/supabase-js';

export interface AuthUser {
  id: string;
  authUserId: string;
  email: string;
  displayName: string;
  role: 'super_admin' | 'admin' | 'shift_manager' | 'rider' | string;
  branchId: string | null;
  branchName: string | null;
  status: string;
}

interface AuthContextType {
  user: AuthUser | null;
  session: Session | null;
  loading: boolean;
  authError: string | null;
  login: (usernameOrEmail: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  sendOtp: (email: string) => Promise<void>;
  verifyOtpAndSetPassword: (email: string, otp: string, password: string, displayName: string) => Promise<void>;
  retryAuth: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((value) => resolve(value))
      .catch((error) => reject(error))
      .finally(() => window.clearTimeout(timer));
  });
}

function normalizeProfile(row: any, supabaseUser: User): AuthUser {
  return {
    id: row.id,
    authUserId: row.auth_user_id || supabaseUser.id,
    email: row.email || supabaseUser.email || '',
    displayName: row.display_name || supabaseUser.user_metadata?.display_name || supabaseUser.email?.split('@')[0] || 'مستخدم',
    role: row.role || 'rider',
    branchId: row.branch_id || null,
    branchName: row.delivery_branches?.name || row.branch_name || null,
    status: row.status || 'active',
  };
}

async function fetchProfile(supabaseUser: User): Promise<AuthUser> {
  const profileQuery = supabase
    .from('user_profiles')
    .select('id, auth_user_id, email, display_name, role, branch_id, status, delivery_branches(name)')
    .eq('auth_user_id', supabaseUser.id)
    .maybeSingle();

  const { data, error } = await withTimeout(profileQuery as unknown as Promise<any>, 8000, 'انتهى وقت تحميل ملف المستخدم.');

  if (error) {
    throw new Error(error.message || 'تعذر تحميل ملف المستخدم من Supabase.');
  }

  if (!data) {
    throw new Error('الحساب موجود في Supabase Auth لكنه غير مربوط بملف مستخدم داخل user_profiles.');
  }

  const profile = normalizeProfile(data, supabaseUser);
  if (profile.status !== 'active' && profile.status !== 'نشط') {
    throw new Error('هذا الحساب غير مفعل. تواصل مع الإدارة.');
  }

  return profile;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const loadProfile = useCallback(async (supabaseUser: User) => {
    const profile = await fetchProfile(supabaseUser);
    if (!mountedRef.current) return profile;
    setUser(profile);
    setAuthError(null);
    return profile;
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
      return;
    }

    try {
      const { data, error } = await withTimeout(
        supabase.auth.getSession(),
        8000,
        'انتهى وقت انتظار المصادقة. تحقق من إعدادات Supabase والإنترنت.'
      );

      if (error) throw error;
      if (!mountedRef.current) return;

      const currentSession = data.session;
      setSession(currentSession);

      if (!currentSession?.user) {
        setUser(null);
        setLoading(false);
        return;
      }

      await loadProfile(currentSession.user);
    } catch (error: any) {
      if (!mountedRef.current) return;
      console.error('[Dawaa Delivery Auth Init]', error);
      setUser(null);
      setSession(null);
      setAuthError(error?.message || 'تعذر الاتصال بقاعدة البيانات أو لم يتم تجهيز Supabase بعد.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [loadProfile]);

  useEffect(() => {
    mountedRef.current = true;
    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (!mountedRef.current) return;
      setSession(currentSession);

      if (event === 'SIGNED_OUT') {
        setUser(null);
        setAuthError(null);
        setLoading(false);
        return;
      }

      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && currentSession?.user) {
        try {
          await loadProfile(currentSession.user);
        } catch (error: any) {
          console.error('[Dawaa Delivery Profile Load]', error);
          setUser(null);
          setAuthError(error?.message || 'تعذر تحميل ملف المستخدم.');
        } finally {
          setLoading(false);
        }
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

    try {
      const cleanLogin = usernameOrEmail.trim();
      if (!cleanLogin || !password) throw new Error('أدخل اسم المستخدم وكلمة المرور.');

      let email = cleanLogin;
      if (!cleanLogin.includes('@')) {
        const { data: resolvedEmail, error: resolveError } = await withTimeout(
          (supabase.rpc('delivery_resolve_login', { login_name: cleanLogin }) as unknown) as Promise<any>,
          8000,
          'انتهى وقت تحويل اسم المستخدم.'
        );
        if (resolveError) throw new Error(resolveError.message || 'تعذر التحقق من اسم المستخدم.');
        if (!resolvedEmail) throw new Error('اسم المستخدم غير موجود أو غير مفعل.');
        email = String(resolvedEmail);
      }

      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({ email: email.toLowerCase(), password }),
        10000,
        'انتهى وقت تسجيل الدخول. تحقق من الإنترنت أو إعدادات Supabase.'
      );

      if (error) {
        if (error.message?.toLowerCase().includes('invalid')) {
          throw new Error('كلمة المرور غير صحيحة أو الحساب غير موجود في Supabase Auth.');
        }
        throw new Error(error.message || 'فشل تسجيل الدخول.');
      }

      if (!data.user) throw new Error('لم يتم استلام بيانات المستخدم بعد تسجيل الدخول.');
      const profile = await loadProfile(data.user);
      return profile;
    } catch (error: any) {
      setAuthError(error?.message || 'خطأ في تسجيل الدخول.');
      throw error;
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setAuthError(null);
  };

  const sendOtp = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) throw error;
  };

  const verifyOtpAndSetPassword = async (email: string, otp: string, password: string, displayName: string) => {
    const { data, error } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' });
    if (error) throw error;

    const { error: updateError } = await supabase.auth.updateUser({ password, data: { display_name: displayName } });
    if (updateError) throw updateError;

    if (data.user) await loadProfile(data.user);
  };

  const retryAuth = () => initializeAuth();

  return (
    <AuthContext.Provider value={{ user, session, loading, authError, login, logout, sendOtp, verifyOtpAndSetPassword, retryAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
