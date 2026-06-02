import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { getCurrentPositionWithTimeout } from '@/lib/geo';
import { logAudit, supabase } from '@/lib/supabase';
import type { DeliveryCustomer, DeliveryPayrollRow, InternalTripStatus, OrderStatus } from '@/types/delivery';

const PAGE_SIZE = 25;
const RUN_TABLES = ['delivery_trips', 'delivery_runs'] as const;

function devWarn(label: string, error: unknown) {
  if (import.meta.env.DEV) console.warn(`[Dawaa Delivery] ${label}`, error);
}

async function countOrZero(builder: any): Promise<number> {
  try {
    const { count, error } = await builder;
    if (error) {
      devWarn('count query failed', error);
      return 0;
    }
    return count || 0;
  } catch (error) {
    devWarn('count query crashed', error);
    return 0;
  }
}

async function firstSuccessful<T>(attempts: Array<() => Promise<{ data: T | null; error: any }>>): Promise<T | null> {
  for (const attempt of attempts) {
    try {
      const { data, error } = await attempt();
      if (!error) return data;
      devWarn('query attempt failed', error);
    } catch (error) {
      devWarn('query attempt crashed', error);
    }
  }
  return null;
}

async function tryRunTables<T>(fn: (table: string) => Promise<{ data: T | null; error: any }>): Promise<{ table: string; data: T | null } | null> {
  for (const table of RUN_TABLES) {
    try {
      const { data, error } = await fn(table);
      if (!error) return { table, data };
      devWarn(`${table} query failed`, error);
    } catch (error) {
      devWarn(`${table} query crashed`, error);
    }
  }
  return null;
}

export function deliveryMonthRange(anchor = new Date()) {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const start = anchor.getDate() >= 26 ? new Date(year, month, 26) : new Date(year, month - 1, 26);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 25, 23, 59, 59, 999);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    label: `${start.toLocaleDateString('ar-EG')} - ${end.toLocaleDateString('ar-EG')}`,
  };
}

function normalizeCustomer(row: any): DeliveryCustomer {
  return {
    id: row.id,
    customer_code: row.customer_code || row.code || '',
    name: row.name || row.customer_name || '',
    phone: row.phone || row.mobile || '',
    address: row.address || '',
    branch_id: row.branch_id || null,
  };
}

function normalizeOrder(row: any) {
  return {
    ...row,
    trip_id: row.trip_id || row.run_id,
    invoice_no: row.invoice_no || row.invoice_number || '',
    amount: Number(row.amount ?? row.invoice_value ?? row.invoice_amount ?? 0),
    delivered_at: row.delivered_at || row.delivered_time || null,
  };
}

function normalizeRun(row: any) {
  return {
    ...row,
    started_at: row.started_at || row.start_time || row.created_at,
    ended_at: row.ended_at || row.return_time || null,
  };
}

export function useDeliveryCustomers(search: string) {
  return useQuery({
    queryKey: ['delivery-customers', search],
    enabled: search.trim().length >= 2,
    queryFn: async () => {
      const term = search.trim();
      try {
        const { data, error } = await supabase.rpc('delivery_search_customers', { search_text: term });
        if (!error && data) return (data || []).map(normalizeCustomer);
      } catch (error) {
        devWarn('customer rpc failed', error);
      }

      const { data, error } = await supabase
        .from('delivery_customers')
        .select('id, customer_code, customer_name, phone, address, branch_id')
        .or(`customer_name.ilike.%${term}%,customer_code.ilike.%${term}%,phone.ilike.%${term}%`)
        .limit(20);
      if (error) {
        devWarn('customer search fallback failed', error);
        return [];
      }
      return (data || []).map(normalizeCustomer);
    },
    staleTime: 1000 * 60,
  });
}

export function useDeliveryDashboard() {
  const range = deliveryMonthRange();
  const today = new Date().toISOString().slice(0, 10);
  return useQuery({
    queryKey: ['delivery-dashboard', range.start, range.end],
    queryFn: async () => {
      const runTable = (await tryRunTables(async table => await supabase.from(table).select('id').limit(1)))?.table || 'delivery_trips';
      const [availableRiders, activeRuns, todayOrders, todayInternalTrips, delivered, pendingReview, internalTrips] = await Promise.all([
        countOrZero(supabase.from('delivery_riders').select('id', { count: 'exact', head: true }).eq('status', 'active')),
        countOrZero(supabase.from(runTable).select('id', { count: 'exact', head: true }).eq('status', 'active')),
        countOrZero(supabase.from('delivery_orders').select('id', { count: 'exact', head: true }).gte('created_at', `${today}T00:00:00`).lte('created_at', `${today}T23:59:59`)),
        countOrZero(supabase.from('delivery_internal_trips').select('id', { count: 'exact', head: true }).gte('created_at', `${today}T00:00:00`).lte('created_at', `${today}T23:59:59`)),
        countOrZero(supabase.from('delivery_orders').select('id', { count: 'exact', head: true }).eq('status', 'delivered').gte('created_at', range.start).lte('created_at', range.end)),
        countOrZero(supabase.from(runTable).select('id', { count: 'exact', head: true }).eq('needs_review', true)),
        countOrZero(supabase.from('delivery_internal_trips').select('id', { count: 'exact', head: true }).in('status', ['approved', 'completed']).gte('created_at', range.start).lte('created_at', range.end)),
      ]);

      return { range, availableRiders, activeRuns, todayOrders, todayInternalTrips, deliveredOrders: delivered, reviewTrips: pendingReview, internalTrips };
    },
    staleTime: 1000 * 20,
  });
}

export function useDeliveryRiderProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['delivery-rider-profile', user?.authUserId, user?.id],
    enabled: Boolean(user?.authUserId || user?.id),
    queryFn: async () => {
      const data = await firstSuccessful<any>([
        async () => await supabase.from('delivery_riders').select('id, name, username, branch_id, level, hourly_rate, order_rate, trip_rate, status, current_status').eq('auth_user_id', user?.authUserId || user?.id).maybeSingle(),
        async () => await supabase.from('delivery_riders').select('id, name, username, branch_id, level, hourly_rate, order_rate, trip_rate, status, current_status').eq('profile_id', user?.id).maybeSingle(),
        async () => await supabase.from('delivery_riders').select('id, name, username, branch_id, level, hourly_rate, order_rate, trip_rate, status, current_status').eq('username', user?.displayName || '').maybeSingle(),
      ]);
      if (!data) return null;
      let branchName = '';
      if (data.branch_id) {
        const { data: branch } = await supabase.from('delivery_branches').select('name').eq('id', data.branch_id).maybeSingle();
        branchName = branch?.name || '';
      }
      return { ...data, display_name: data.name, branchName };
    },
  });
}

async function getCurrentRider(authUserId?: string, profileId?: string, username?: string) {
  if (!authUserId && !profileId && !username) return null;
  return await firstSuccessful<any>([
    async () => await supabase.from('delivery_riders').select('id, branch_id, level, hourly_rate, order_rate, trip_rate').eq('auth_user_id', authUserId || '').maybeSingle(),
    async () => await supabase.from('delivery_riders').select('id, branch_id, level, hourly_rate, order_rate, trip_rate').eq('profile_id', profileId || '').maybeSingle(),
    async () => await supabase.from('delivery_riders').select('id, branch_id, level, hourly_rate, order_rate, trip_rate').eq('username', username || '').maybeSingle(),
  ]);
}

export function useActiveDeliveryTrip() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['delivery-active-trip', user?.authUserId, user?.id],
    enabled: Boolean(user?.authUserId || user?.id),
    queryFn: async () => {
      const rider = await getCurrentRider(user?.authUserId, user?.id, user?.displayName);
      if (!rider?.id) return null;

      const runResult = await tryRunTables<any>(async table => await supabase.from(table).select('*').eq('rider_id', rider.id).eq('status', 'active').maybeSingle());
      const trip = runResult?.data;
      if (!trip) return null;

      const orders = await firstSuccessful<any[]>([
        async () => await supabase.from('delivery_orders').select('*').eq('trip_id', trip.id).order('created_at', { ascending: false }),
        async () => await supabase.from('delivery_orders').select('*').eq('run_id', trip.id).order('created_at', { ascending: false }),
      ]);

      return { ...normalizeRun(trip), delivery_orders: (orders || []).map(normalizeOrder) };
    },
    staleTime: 1000 * 10,
  });
}

export function useHasCheckedIn() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['delivery-has-checked-in', user?.authUserId, user?.id],
    enabled: Boolean(user?.authUserId || user?.id),
    queryFn: async () => {
      const rider = await getCurrentRider(user?.authUserId, user?.id, user?.displayName);
      if (!rider?.id) return false;
      const today = new Date().toISOString().slice(0, 10);
      const countByShiftDate = await countOrZero(supabase.from('delivery_attendance').select('id', { count: 'exact', head: true }).eq('rider_id', rider.id).eq('shift_date', today));
      if (countByShiftDate > 0) return true;
      return (await countOrZero(supabase.from('delivery_attendance').select('id', { count: 'exact', head: true }).eq('rider_id', rider.id).gte('created_at', `${today}T00:00:00`).lte('created_at', `${today}T23:59:59`))) > 0;
    },
    staleTime: 1000 * 30,
  });
}

export function useStartAttendance() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async () => {
      const rider = await getCurrentRider(user?.authUserId, user?.id, user?.displayName);
      if (!rider?.id) throw new Error('هذا الحساب غير مربوط بمندوب دليفري.');
      const position = await getCurrentPositionWithTimeout();
      try {
        const { error } = await supabase.rpc('delivery_start_attendance', { p_lat: position.lat, p_lng: position.lng, p_accuracy: position.accuracy, p_gps_review: position.needsReview, p_gps_reason: position.reason });
        if (!error) return;
      } catch (error) {
        devWarn('attendance rpc failed', error);
      }
      const { error } = await supabase.from('delivery_attendance').insert({
        rider_id: rider.id,
        branch_id: rider.branch_id,
        shift_date: new Date().toISOString().slice(0, 10),
        check_in_time: new Date().toISOString(),
        check_in_lat: position.lat,
        check_in_lng: position.lng,
        check_in_accuracy: position.accuracy,
        needs_review: position.needsReview,
        review_reason: position.reason,
        status: position.needsReview ? 'manual_review' : 'present',
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await logAudit({ userId: user?.id, userName: user?.displayName, role: user?.role, department: 'delivery_attendance', operation: 'delivery attendance check-in' });
      qc.invalidateQueries({ queryKey: ['delivery-dashboard'] });
      qc.invalidateQueries({ queryKey: ['delivery-has-checked-in'] });
      toast.success('تم تسجيل الحضور');
    },
    onError: (error: any) => toast.error(error.message),
  });
}

export function useStartDeliveryTrip() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async () => {
      const rider = await getCurrentRider(user?.authUserId, user?.id, user?.displayName);
      if (!rider?.id) throw new Error('هذا الحساب غير مربوط بمندوب دليفري.');
      const active = await tryRunTables<any>(async table => await supabase.from(table).select('id').eq('rider_id', rider.id).eq('status', 'active').maybeSingle());
      if (active?.data) throw new Error('يوجد خروجة نشطة بالفعل. يجب إنهاؤها أولًا.');
      const position = await getCurrentPositionWithTimeout();
      try {
        const { error } = await supabase.rpc('delivery_start_run', { p_lat: position.lat, p_lng: position.lng, p_accuracy: position.accuracy, p_gps_review: position.needsReview, p_gps_reason: position.reason });
        if (!error) return;
      } catch (error) {
        devWarn('start run rpc failed', error);
      }
      const payloads = [
        { rider_id: rider.id, branch_id: rider.branch_id, status: 'active', started_at: new Date().toISOString(), start_lat: position.lat, start_lng: position.lng, start_accuracy: position.accuracy, needs_review: position.needsReview, review_reason: position.reason },
        { rider_id: rider.id, branch_id: rider.branch_id, status: 'active', start_time: new Date().toISOString(), start_lat: position.lat, start_lng: position.lng, start_accuracy: position.accuracy, needs_review: position.needsReview, review_reason: position.reason, run_type: 'customer_orders' },
      ];
      let lastError: any = null;
      for (const table of RUN_TABLES) {
        for (const payload of payloads) {
          const { error } = await supabase.from(table).insert(payload);
          if (!error) return;
          lastError = error;
        }
      }
      throw lastError || new Error('تعذر بدء الخروجة.');
    },
    onSuccess: async () => {
      await logAudit({ userId: user?.id, userName: user?.displayName, role: user?.role, department: 'delivery_trips', operation: 'start delivery run' });
      qc.invalidateQueries({ queryKey: ['delivery-active-trip'] });
      qc.invalidateQueries({ queryKey: ['delivery-dashboard'] });
      toast.success('تم بدء الخروجة');
    },
    onError: (error: any) => toast.error(error.message),
  });
}

export function useAddDeliveryOrder() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (order: { trip_id: string; rider_id: string; customer: DeliveryCustomer; invoice_no: string; amount: number }) => {
      if (!order.invoice_no.trim()) throw new Error('رقم الفاتورة إجباري');
      try {
        const { error } = await supabase.rpc('delivery_add_order', { p_run_id: order.trip_id, p_invoice_number: order.invoice_no.trim(), p_invoice_value: order.amount, p_customer_id: order.customer.id, p_metadata: {} });
        if (!error) return;
      } catch (error) {
        devWarn('add order rpc failed', error);
      }
      const common = {
        rider_id: order.rider_id,
        customer_id: order.customer.id,
        customer_name_snapshot: order.customer.name,
        customer_code_snapshot: order.customer.customer_code,
        customer_phone_snapshot: order.customer.phone,
        customer_address_snapshot: order.customer.address,
        status: 'pending',
      };
      const payloads = [
        { ...common, trip_id: order.trip_id, invoice_no: order.invoice_no.trim(), amount: order.amount },
        { ...common, run_id: order.trip_id, invoice_number: order.invoice_no.trim(), invoice_value: order.amount },
        { ...common, run_id: order.trip_id, invoice_number: order.invoice_no.trim(), invoice_amount: order.amount },
      ];
      let lastError: any = null;
      for (const payload of payloads) {
        const { error } = await supabase.from('delivery_orders').insert(payload);
        if (!error) return;
        lastError = error;
      }
      throw lastError || new Error('تعذر إضافة الأوردر.');
    },
    onSuccess: async (_, vars) => {
      await logAudit({ userId: user?.id, userName: user?.displayName, role: user?.role, department: 'delivery_orders', operation: 'add delivery order', details: `invoice_no: ${vars.invoice_no}` });
      qc.invalidateQueries({ queryKey: ['delivery-active-trip'] });
      qc.invalidateQueries({ queryKey: ['delivery-dashboard'] });
      toast.success('تمت إضافة الأوردر');
    },
    onError: (error: any) => toast.error(error.message),
  });
}

export function useUpdateDeliveryOrderStatus() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, status, reason }: { id: string; status: OrderStatus; reason?: string }) => {
      const patches: any[] = status === 'delivered'
        ? [{ status, delivered_at: new Date().toISOString() }, { status, delivered_time: new Date().toISOString() }]
        : [{ status, failed_reason: reason || null }, { status, notes: reason || null }];
      let lastError: any = null;
      for (const patch of patches) {
        const { error } = await supabase.from('delivery_orders').update(patch).eq('id', id);
        if (!error) return;
        lastError = error;
      }
      throw lastError || new Error('تعذر تحديث حالة الأوردر.');
    },
    onSuccess: async (_, vars) => {
      await logAudit({ userId: user?.id, userName: user?.displayName, role: user?.role, department: 'delivery_orders', operation: 'update delivery order', details: `order_id: ${vars.id} status: ${vars.status}` });
      qc.invalidateQueries({ queryKey: ['delivery-active-trip'] });
      qc.invalidateQueries({ queryKey: ['delivery-orders'] });
      qc.invalidateQueries({ queryKey: ['delivery-dashboard'] });
    },
    onError: (error: any) => toast.error(error.message),
  });
}

export function useEndDeliveryTrip() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ tripId, manualReason }: { tripId: string; manualReason?: string }) => {
      const position = await getCurrentPositionWithTimeout();
      try {
        const { error } = await supabase.rpc('delivery_finish_run', { p_trip_id: tripId, p_lat: position.lat, p_lng: position.lng, p_accuracy: position.accuracy, p_gps_review: position.needsReview, p_gps_reason: position.reason, p_manual_reason: manualReason || null });
        if (!error) return;
      } catch (error) {
        devWarn('finish run rpc failed', error);
      }
      const review = position.needsReview || Boolean(manualReason);
      const patches = [
        { status: review ? 'review' : 'completed', ended_at: new Date().toISOString(), return_lat: position.lat, return_lng: position.lng, return_accuracy: position.accuracy, needs_review: review, review_reason: position.reason || manualReason || null, manual_return_reason: manualReason || null },
        { status: review ? 'pending_review' : 'completed', return_time: new Date().toISOString(), return_lat: position.lat, return_lng: position.lng, return_accuracy: position.accuracy, needs_review: review, review_reason: position.reason || manualReason || null, manual_return_reason: manualReason || null },
      ];
      let lastError: any = null;
      for (const table of RUN_TABLES) {
        for (const patch of patches) {
          const { error } = await supabase.from(table).update(patch).eq('id', tripId);
          if (!error) return;
          lastError = error;
        }
      }
      throw lastError || new Error('تعذر إنهاء الخروجة.');
    },
    onSuccess: async (_, vars) => {
      await logAudit({ userId: user?.id, userName: user?.displayName, role: user?.role, department: 'delivery_trips', operation: vars.manualReason ? 'manual return to review' : 'complete delivery run', details: `trip_id: ${vars.tripId}` });
      qc.invalidateQueries({ queryKey: ['delivery-active-trip'] });
      qc.invalidateQueries({ queryKey: ['delivery-dashboard'] });
      toast.success(vars.manualReason ? 'تم إرسال الخروجة للمراجعة' : 'تم إنهاء الخروجة');
    },
    onError: (error: any) => toast.error(error.message),
  });
}

export function useDeliveryOrders(page = 0, status?: OrderStatus) {
  return useQuery({
    queryKey: ['delivery-orders', page, status],
    queryFn: async () => {
      try {
        let query = supabase.from('delivery_orders').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
        if (status) query = query.eq('status', status);
        const { data, count, error } = await query;
        if (error) throw error;
        return { rows: (data || []).map(normalizeOrder), count: count || 0, pageSize: PAGE_SIZE, error: null as string | null };
      } catch (error: any) {
        devWarn('orders page query failed', error);
        return { rows: [], count: 0, pageSize: PAGE_SIZE, error: error?.message || 'تعذر تحميل الأوردرات' };
      }
    },
  });
}

export function useCreateInternalTrip() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ reason }: { reason: string }) => {
      const rider = await getCurrentRider(user?.authUserId, user?.id, user?.displayName);
      if (!rider?.id) throw new Error('هذا الحساب غير مربوط بمندوب دليفري.');
      const status: InternalTripStatus = 'pending_approval';
      const { error } = await supabase.from('delivery_internal_trips').insert({ rider_id: rider.id, branch_id: rider.branch_id, trip_type: 'other', from_label: 'الصيدلية', to_label: 'مشوار داخلي', notes: reason, status });
      if (error) throw error;
    },
    onSuccess: async () => {
      await logAudit({ userId: user?.id, userName: user?.displayName, role: user?.role, department: 'delivery_internal_trips', operation: 'request internal trip' });
      qc.invalidateQueries({ queryKey: ['delivery-dashboard'] });
      toast.success('تم تسجيل المشوار الداخلي');
    },
    onError: (error: any) => toast.error(error.message),
  });
}

export function useDeliveryPayroll(anchor = new Date()) {
  const range = deliveryMonthRange(anchor);
  return useQuery({
    queryKey: ['delivery-payroll', range.start, range.end],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.rpc('delivery_calculate_payroll', { p_period_start: range.startDate, p_period_end: range.endDate });
        if (!error) return { range, rows: (data || []) as DeliveryPayrollRow[] };
      } catch (error) {
        devWarn('payroll rpc failed', error);
      }
      return { range, rows: [] as DeliveryPayrollRow[] };
    },
  });
}

export function usePendingDeliveryTrips() {
  return useQuery({
    queryKey: ['delivery-pending-trips'],
    queryFn: async () => {
      const result = await tryRunTables<any[]>(async table => await supabase.from(table).select('*').eq('status', 'pending_approval').order('created_at', { ascending: false }));
      return result?.data || [];
    },
    staleTime: 1000 * 30,
  });
}

export function useApproveTrip() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      let lastError: any = null;
      for (const table of RUN_TABLES) {
        const { error } = await supabase.from(table).update({ status: 'approved', updated_at: new Date().toISOString() }).eq('id', id);
        if (!error) return;
        lastError = error;
      }
      throw lastError || new Error('تعذر اعتماد المشوار.');
    },
    onSuccess: async (_, id) => {
      await logAudit({ userId: user?.id, userName: user?.displayName, role: user?.role, department: 'delivery_trips', operation: 'approve trip', details: `trip_id: ${id}` });
      qc.invalidateQueries({ queryKey: ['delivery-pending-trips'] });
      qc.invalidateQueries({ queryKey: ['delivery-dashboard'] });
    },
  });
}

export function useRejectTrip() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      let lastError: any = null;
      for (const table of RUN_TABLES) {
        const { error } = await supabase.from(table).update({ status: 'rejected', notes: reason || null, updated_at: new Date().toISOString() }).eq('id', id);
        if (!error) return;
        lastError = error;
      }
      throw lastError || new Error('تعذر رفض المشوار.');
    },
    onSuccess: async (_, vars) => {
      await logAudit({ userId: user?.id, userName: user?.displayName, role: user?.role, department: 'delivery_trips', operation: 'reject trip', details: `trip_id: ${vars.id}` });
      qc.invalidateQueries({ queryKey: ['delivery-pending-trips'] });
      qc.invalidateQueries({ queryKey: ['delivery-dashboard'] });
    },
  });
}

export function useIncentives() {
  return useQuery({ queryKey: ['delivery-incentives'], queryFn: async () => {
    const { data, error } = await supabase.from('delivery_performance_scores').select('*').limit(100);
    if (error) return [];
    return data || [];
  }, staleTime: 1000 * 60 });
}

export function useLeaderboard() {
  return useQuery({ queryKey: ['delivery-leaderboard'], queryFn: async () => {
    try {
      const { data, error } = await supabase.rpc('delivery_leaderboard');
      if (!error) return data || [];
    } catch (error) { devWarn('leaderboard rpc failed', error); }
    return [];
  }, staleTime: 1000 * 60 });
}

export function useDeliveryIncidents() {
  return useQuery({ queryKey: ['delivery-incidents'], queryFn: async () => {
    const { data, error } = await supabase.from('delivery_incidents').select('*').order('created_at', { ascending: false }).limit(100);
    if (error) return [];
    return data || [];
  }, staleTime: 1000 * 30 });
}

export function useDeliveryNotifications() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['delivery-notifications', user?.authUserId, user?.id],
    enabled: Boolean(user?.authUserId || user?.id),
    queryFn: async () => {
      const rider = await getCurrentRider(user?.authUserId, user?.id, user?.displayName);
      if (!rider?.id) return [];
      const { data, error } = await supabase.from('delivery_notifications').select('*').eq('rider_id', rider.id).order('created_at', { ascending: false }).limit(100);
      if (error) return [];
      return data || [];
    },
    staleTime: 1000 * 30,
  });
}

export function useMarkDeliveryNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase.from('delivery_notifications').update({ is_read: true, status: 'read' }).eq('id', notificationId);
      if (error) throw error;
    },
    onSuccess: async () => qc.invalidateQueries({ queryKey: ['delivery-notifications'] }),
  });
}

export function useUpdateDeliveryIncidentStatus() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('delivery_incidents').update({ status, resolved_at: status === 'resolved' ? new Date().toISOString() : null }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: async (_, vars) => {
      await logAudit({ userId: user?.id, userName: user?.displayName, role: user?.role, department: 'delivery_incidents', operation: 'update incident status', details: `incident_id: ${vars.id} status: ${vars.status}` });
      qc.invalidateQueries({ queryKey: ['delivery-incidents'] });
    },
  });
}
