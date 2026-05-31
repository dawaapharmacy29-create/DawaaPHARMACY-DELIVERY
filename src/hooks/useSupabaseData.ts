import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, logAudit } from '@/lib/supabase';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

export function useBranches() {
  return useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const { data, error } = await supabase.from('branches').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });
}

export function useSuppliers() {
  return useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
  });
}

export function useSuppliersWithBalances() {
  return useQuery({
    queryKey: ['suppliers-balances'],
    queryFn: async () => {
      const { data: suppliers, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;

      // Get aggregated purchase data per supplier
      const { data: invoiceSums } = await supabase
        .from('purchase_invoices')
        .select('supplier_id, value, returned, remaining');

      const { data: payments } = await supabase
        .from('supplier_payments')
        .select('supplier_id, amount, payment_date');

      const { data: returns } = await supabase
        .from('supplier_returns')
        .select('supplier_id, value');

      return suppliers.map(s => {
        const myInvoices = (invoiceSums || []).filter(i => i.supplier_id === s.id);
        const myPayments = (payments || []).filter(p => p.supplier_id === s.id);
        const myReturns = (returns || []).filter(r => r.supplier_id === s.id);

        const totalInvoices = myInvoices.length;
        const totalPurchases = myInvoices.reduce((sum, i) => sum + (i.value || 0), 0);
        const totalPaid = myPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
        const totalReturns = myReturns.reduce((sum, r) => sum + (r.value || 0), 0);
        const balance = totalPurchases - totalPaid - totalReturns;
        const lastPayment = myPayments.sort((a, b) => b.payment_date.localeCompare(a.payment_date))[0]?.payment_date || '-';

        return {
          ...s,
          totalInvoices,
          totalPurchases,
          totalPaid,
          totalReturns,
          balance,
          hasOldDebt: balance > 0,
          lastPayment,
          lastReconciliation: '-',
        };
      });
    },
  });
}

export function useAddSupplier() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (data: { name: string; representative: string; phone: string; payment_type: string; credit_days?: number }) => {
      const { error } = await supabase.from('suppliers').insert(data);
      if (error) throw error;
    },
    onSuccess: async (_, vars) => {
      await logAudit({ userId: user?.id, userName: user?.displayName, role: user?.role, department: 'الموردين', operation: 'إضافة مورد', details: `supplier: ${vars.name}` });
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      qc.invalidateQueries({ queryKey: ['suppliers-balances'] });
      toast.success('تم إضافة المورد بنجاح');
    },
    onError: (err: any) => toast.error(err.message),
  });
}

export function useAddPayment() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (data: { supplier_id: string; invoice_id?: string; amount: number; payment_method: string; payment_date: string; notes?: string }) => {
      const { error } = await supabase.from('supplier_payments').insert({ ...data, created_by: user?.id });
      if (error) throw error;
    },
    onSuccess: async (_, vars) => {
      await logAudit({ userId: user?.id, userName: user?.displayName, role: user?.role, department: 'المدفوعات', operation: 'تسجيل دفعة', details: `amount: ${vars.amount}` });
      qc.invalidateQueries({ queryKey: ['suppliers-balances'] });
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success('تم تسجيل الدفعة بنجاح');
    },
    onError: (err: any) => toast.error(err.message),
  });
}

export function useInvoices() {
  return useQuery({
    queryKey: ['invoices'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_invoices')
        .select(`
          *,
          suppliers(name),
          branches(name),
          entered_by_profile:user_profiles!purchase_invoices_entered_by_fkey(display_name, username)
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data.map(inv => ({
        ...inv,
        supplierName: (inv as any).suppliers?.name || '',
        branchName: (inv as any).branches?.name || '',
        enteredByName: (inv as any).entered_by_profile?.display_name || (inv as any).entered_by_profile?.username || '',
      }));
    },
  });
}

export function useAddInvoice() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (data: {
      invoice_no: string; supplier_id: string; branch_id: string;
      date: string; value: number; payment_type: string; notes?: string;
    }) => {
      const { error } = await supabase.from('purchase_invoices').insert({
        ...data,
        remaining: data.value,
        returned: 0,
        payment_status: 'غير مدفوع',
        review_status: 'انتظار مراجعة',
        entered_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: async (_, vars) => {
      await logAudit({ userId: user?.id, userName: user?.displayName, role: user?.role, department: 'الفواتير', operation: 'إضافة فاتورة', details: `invoice_no: ${vars.invoice_no} amount: ${vars.value}` });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('تم إضافة الفاتورة بنجاح');
    },
    onError: (err: any) => toast.error(err.message),
  });
}

export function useUpdateInvoiceStatus() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, review_status, entered_by }: { id: string; review_status: string; entered_by?: string }) => {
      // Prevent same user from reviewing their own invoice
      if (review_status === 'معتمد' && entered_by && entered_by === user?.id) {
        throw new Error('لا يمكنك اعتماد فاتورة قمت بإدخالها بنفسك');
      }
      const { error } = await supabase.from('purchase_invoices')
        .update({ review_status, reviewed_by: user?.id, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: async (_, vars) => {
      await logAudit({ userId: user?.id, userName: user?.displayName, role: user?.role, department: 'الفواتير', operation: `${vars.review_status === 'معتمد' ? 'اعتماد' : vars.review_status === 'مرفوض' ? 'رفض' : 'تعديل'} فاتورة`, details: `invoice_id: ${vars.id}` });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('تم تحديث حالة الفاتورة');
    },
    onError: (err: any) => toast.error(err.message),
  });
}

export function useReturns() {
  return useQuery({
    queryKey: ['returns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('supplier_returns')
        .select('*, suppliers(name), branches(name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data.map(r => ({
        ...r,
        supplierName: (r as any).suppliers?.name || '',
        branchName: (r as any).branches?.name || '',
      }));
    },
  });
}

export function useAddReturn() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (data: { return_no: string; supplier_id: string; branch_id: string; medicine_code?: string; medicine_name: string; quantity: number; value: number; reason: string; date: string }) => {
      const { error } = await supabase.from('supplier_returns').insert({ ...data, status: 'معلق', created_by: user?.id });
      if (error) throw error;
    },
    onSuccess: async (_, vars) => {
      await logAudit({ userId: user?.id, userName: user?.displayName, role: user?.role, department: 'المرتجعات', operation: 'إضافة مرتجع', details: `return_no: ${vars.return_no} amount: ${vars.value}` });
      qc.invalidateQueries({ queryKey: ['returns'] });
      toast.success('تم إضافة المرتجع بنجاح');
    },
    onError: (err: any) => toast.error(err.message),
  });
}

export function useExpenses() {
  return useQuery({
    queryKey: ['expenses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select('*, branches(name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data.map(e => ({ ...e, branchName: (e as any).branches?.name || '' }));
    },
  });
}

export function useAddExpense() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (data: { branch_id: string; category: string; description: string; amount: number; payment_method: string; date: string }) => {
      const { error } = await supabase.from('expenses').insert({ ...data, status: 'انتظار', created_by: user?.id });
      if (error) throw error;
    },
    onSuccess: async (_, vars) => {
      await logAudit({ userId: user?.id, userName: user?.displayName, role: user?.role, department: 'المصروفات', operation: 'إضافة مصروف', details: `amount: ${vars.amount} category: ${vars.category}` });
      qc.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('تم إضافة المصروف بنجاح');
    },
    onError: (err: any) => toast.error(err.message),
  });
}

export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*, branches(name), suppliers(name)')
        .order('name');
      if (error) throw error;
      return data.map(p => ({
        ...p,
        branchName: (p as any).branches?.name || '',
        supplierName: (p as any).suppliers?.name || '',
      }));
    },
  });
}

export function useDeadStock() {
  return useQuery({
    queryKey: ['dead-stock'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*, branches(name), suppliers(name)')
        .not('expiry_date', 'is', null)
        .order('expiry_date');
      if (error) throw error;
      return data.map(p => ({
        ...p,
        branchName: (p as any).branches?.name || '',
        supplierName: (p as any).suppliers?.name || '',
        status: p.expiry_date
          ? new Date(p.expiry_date) < new Date() ? 'منتهي الصلاحية'
          : new Date(p.expiry_date) < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) ? 'قريب الانتهاء'
          : p.days_since_sale > 60 ? 'راكد' : 'طبيعي'
          : p.days_since_sale > 60 ? 'راكد' : 'طبيعي',
      }));
    },
  });
}

export function useAuditLogs() {
  return useQuery({
    queryKey: ['audit-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*, branches(name)')
        .order('created_at');
      if (error) throw error;
      return data.map(u => ({
        ...u,
        branchName: (u as any).branches?.name || 'كل الفروع',
        displayName: u.display_name || u.username || u.email,
      }));
    },
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (data: {
      username: string;
      password: string;
      display_name?: string;
      role: string;
      branch_id?: string;
    }) => {
      const { data: result, error } = await supabase.functions.invoke('create-user', {
        body: data,
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) {
        import('@supabase/supabase-js').then(({ FunctionsHttpError }) => {});
        // Try to get actual error message
        let msg = error.message;
        try {
          const text = await (error as any).context?.text?.();
          if (text) {
            const parsed = JSON.parse(text);
            msg = parsed.error || text;
          }
        } catch {}
        throw new Error(msg);
      }
      if (result?.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('تم إنشاء المستخدم بنجاح');
    },
    onError: (err: any) => toast.error(err.message),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('user_profiles').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await logAudit({ userId: user?.id, userName: user?.displayName, role: user?.role, department: 'المستخدمين', operation: 'تحديث حالة مستخدم' });
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('تم تحديث حالة المستخدم');
    },
    onError: (err: any) => toast.error(err.message),
  });
}

export function useBranchSettings() {
  return useQuery({
    queryKey: ['branch-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branch_settings')
        .select('*, branches(name)')
        .order('branches(name)');
      if (error) throw error;
      return data.map(s => ({
        ...s,
        branchName: (s as any).branches?.name || '',
      }));
    },
  });
}

export function useUpdateBranchSettings() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (settings: { id: string; monthly_limit: number; warning_percent: number; critical_percent: number }[]) => {
      for (const s of settings) {
        const { error } = await supabase.from('branch_settings')
          .update({ monthly_limit: s.monthly_limit, warning_percent: s.warning_percent, critical_percent: s.critical_percent, updated_at: new Date().toISOString() })
          .eq('id', s.id);
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      await logAudit({ userId: user?.id, userName: user?.displayName, role: user?.role, department: 'الإعدادات', operation: 'تحديث إعدادات الفروع' });
      qc.invalidateQueries({ queryKey: ['branch-settings'] });
      toast.success('تم حفظ الإعدادات بنجاح');
    },
    onError: (err: any) => toast.error(err.message),
  });
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const [invoicesRes, paymentsRes, expensesRes, returnsRes, pendingRes] = await Promise.all([
        supabase.from('purchase_invoices').select('value, remaining, review_status'),
        supabase.from('supplier_payments').select('amount'),
        supabase.from('expenses').select('amount'),
        supabase.from('supplier_returns').select('value'),
        supabase.from('purchase_invoices').select('id').eq('review_status', 'انتظار مراجعة'),
      ]);

      const invoices = invoicesRes.data || [];
      const payments = paymentsRes.data || [];
      const expenses = expensesRes.data || [];
      const returns = returnsRes.data || [];

      const totalPurchases = invoices.reduce((s, i) => s + (i.value || 0), 0);
      const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
      const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
      const totalReturns = returns.reduce((s, r) => s + (r.value || 0), 0);

      return {
        totalInvoices: invoices.length,
        totalPurchases,
        totalPaid,
        totalExpenses,
        totalReturns,
        netPurchases: totalPurchases - totalPaid - totalReturns,
        pendingReview: pendingRes.data?.length || 0,
      };
    },
  });
}
