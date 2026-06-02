import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { getCurrentPositionWithTimeout } from '@/lib/geo';
import { logAudit, supabase } from '@/lib/supabase';
import type { DeliveryCustomer, DeliveryPayrollRow, InternalTripStatus, OrderStatus } from '@/types/delivery';

const PAGE_SIZE = 25;

export function deliveryMonthRange(anchor = new Date()) {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const start = anchor.getDate() >= 26 ? new Date(year, month, 26) : new Date(year, month - 1, 26);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 25, 23, 59, 59, 999);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
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

export function useDeliveryCustomers(search: string) {
  return useQuery({
    queryKey: ['delivery-customers', search],
    enabled: search.trim().length >= 2,
    queryFn: async () => {
      const term = search.trim();
      const { data, error } = await supabase.rpc('delivery_search_customers', { search_text: term });
      if (error) {
        const { data: fallback, error: fallbackError } = await supabase
          .from('delivery_customers')
          .select('id, customer_code, customer_name, phone, address, branch_id')
          .or(`customer_name.ilike.%${term}%,customer_code.ilike.%${term}%,phone.ilike.%${term}%`)
          .eq('active', true)
          .limit(20);
        if (fallbackError) throw fallbackError;
        return (fallback || []).map(normalizeCustomer);
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
      const [availableRiders, activeRuns, todayOrders, todayInternalTrips, delivered, pendingReview, internalTrips] = await Promise.all([
        supabase.from('delivery_riders').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('delivery_trips').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('delivery_orders').select('id', { count: 'exact', head: true }).gte('created_at', `${today}T00:00:00`).lte('created_at', `${today}T23:59:59`),
        supabase.from('delivery_internal_trips').select('id', { count: 'exact', head: true }).gte('created_at', `${today}T00:00:00`).lte('created_at', `${today}T23:59:59`),
        supabase.from('delivery_orders').select('id', { count: 'exact', head: true }).eq('status', 'delivered').gte('created_at', range.start).lte('created_at', range.end),
        supabase.from('delivery_trips').select('id', { count: 'exact', head: true }).eq('needs_review', true).gte('started_at', range.start).lte('started_at', range.end),
        supabase.from('delivery_internal_trips').select('id', { count: 'exact', head: true }).in('status', ['approved', 'completed']).gte('created_at', range.start).lte('created_at', range.end),
      ]);

      for (const result of [availableRiders, activeRuns, todayOrders, todayInternalTrips, delivered, pendingReview, internalTrips]) {
        if (result.error) throw result.error;
      }

      return {
        range,
        availableRiders: availableRiders.count || 0,
        activeRuns: activeRuns.count || 0,
        todayOrders: todayOrders.count || 0,
        todayInternalTrips: todayInternalTrips.count || 0,
        deliveredOrders: delivered.count || 0,
        reviewTrips: pendingReview.count || 0,
        internalTrips: internalTrips.count || 0,
      };
    },
  });
}

export function useDeliveryRiderProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['delivery-rider-profile', user?.authUserId, user?.id],
    enabled: Boolean(user?.authUserId || user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('delivery_riders')
        .select('id, name, username, branch_id, level, status, delivery_branches(name)')
        .or(`auth_user_id.eq.${user?.authUserId || user?.id},profile_id.eq.${user?.id}`)
        .maybeSingle();
      if (error) throw error;
      return data ? { ...data, display_name: data.name, branchName: (data as any).delivery_branches?.name || '' } : null;
    },
  });
}

async function getCurrentRider(authUserId?: string, profileId?: string) {
  if (!authUserId && !profileId) return null;
  const filter = authUserId && profileId ? `auth_user_id.eq.${authUserId},profile_id.eq.${profileId}` : authUserId ? `auth_user_id.eq.${authUserId}` : `profile_id.eq.${profileId}`;
  const { data, error } = await supabase.from('delivery_riders').select('id, branch_id').or(filter).maybeSingle();
  if (error) throw error;
  return data;
}

export function useActiveDeliveryTrip() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['delivery-active-trip', user?.authUserId, user?.id],
    enabled: Boolean(user?.authUserId || user?.id),
    queryFn: async () => {
      const rider = await getCurrentRider(user?.authUserId, user?.id);
      if (!rider?.id) return null;

      const { data: trip, error: tripError } = await supabase
        .from('delivery_trips')
        .select('id, rider_id, branch_id, status, started_at, ended_at, needs_review, review_reason, manual_return_reason')
        .eq('rider_id', rider.id)
        .eq('status', 'active')
        .maybeSingle();
      if (tripError) throw tripError;
      if (!trip) return null;

      const { data: orders, error: ordersError } = await supabase
        .from('delivery_orders')
        .select('id, run_id, rider_id, customer_id, invoice_number, invoice_value, status, failed_reason, delivered_at, customer_name_snapshot, customer_code_snapshot, customer_phone_snapshot, customer_address_snapshot, created_at')
        .eq('run_id', trip.id)
        .order('created_at', { ascending: false });
      if (ordersError) throw ordersError;

      return {
        ...trip,
        delivery_orders: (orders || []).map((order: any) => ({
          ...order,
          invoice_no: order.invoice_number,
          amount: order.invoice_value,
        })),
      };
    },
  });
}

export function useHasCheckedIn() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['delivery-has-checked-in', user?.authUserId, user?.id],
    enabled: Boolean(user?.authUserId || user?.id),
    queryFn: async () => {
      const rider = await getCurrentRider(user?.authUserId, user?.id);
      if (!rider?.id) return false;
      const todayStart = new Date().toISOString().slice(0, 10) + 'T00:00:00';
      const todayEnd = new Date().toISOString().slice(0, 10) + 'T23:59:59';
      const { count, error } = await supabase.from('delivery_attendance').select('id', { count: 'exact', head: true }).eq('rider_id', rider.id).gte('created_at', todayStart).lte('created_at', todayEnd);
      if (error) throw error;
      return (count || 0) > 0;
    },
    staleTime: 1000 * 60,
  });
}

export function useStartAttendance() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async () => {
      const position = await getCurrentPositionWithTimeout();
      const { error } = await supabase.rpc('delivery_start_attendance', {
        p_lat: position.lat,
        p_lng: position.lng,
        p_accuracy: position.accuracy,
        p_gps_review: position.needsReview,
        p_gps_reason: position.reason,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await logAudit({ userId: user?.id, userName: user?.displayName, role: user?.role, department: 'delivery_attendance', operation: 'delivery attendance check-in' });
      qc.invalidateQueries({ queryKey: ['delivery-dashboard'] });
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
      const position = await getCurrentPositionWithTimeout();
      const { error } = await supabase.rpc('delivery_start_run', {
        p_lat: position.lat,
        p_lng: position.lng,
        p_accuracy: position.accuracy,
        p_gps_review: position.needsReview,
        p_gps_reason: position.reason,
      });
      if (error) throw error;
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
    mutationFn: async (order: { trip_id: string; rider_id: string; customer_id: string; invoice_no: string; amount: number }) => {
      if (!order.invoice_no.trim()) throw new Error('رقم الفاتورة إجباري');
      const { error } = await supabase.rpc('delivery_add_order', {
        p_run_id: order.trip_id,
        p_invoice_number: order.invoice_no.trim(),
        p_invoice_value: order.amount,
        p_customer_id: order.customer_id,
        p_metadata: {},
      });
      if (error) throw error;
    },
    onSuccess: async (_, vars) => {
      await logAudit({ userId: user?.id, userName: user?.displayName, role: user?.role, department: 'delivery_orders', operation: 'add delivery order', details: `invoice_no: ${vars.invoice_no}` });
      qc.invalidateQueries({ queryKey: ['delivery-active-trip'] });
      toast.success('تمت إضافة الأوردر');
    },
    onError: (error: any) => toast.error(error.message),
  });
}

export function useUpdateDeliveryOrderStatus() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: OrderStatus }) => {
      const patch = status === 'delivered' ? { status, delivered_at: new Date().toISOString() } : { status };
      const { error } = await supabase.from('delivery_orders').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: async (_, vars) => {
      await logAudit({ userId: user?.id, userName: user?.displayName, role: user?.role, department: 'delivery_orders', operation: 'update delivery order', details: `order_id: ${vars.id} status: ${vars.status}` });
      qc.invalidateQueries({ queryKey: ['delivery-active-trip'] });
      qc.invalidateQueries({ queryKey: ['delivery-orders'] });
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
      const { error } = await supabase.rpc('delivery_finish_run', {
        p_trip_id: tripId,
        p_lat: position.lat,
        p_lng: position.lng,
        p_accuracy: position.accuracy,
        p_gps_review: position.needsReview,
        p_gps_reason: position.reason,
        p_manual_reason: manualReason || null,
      });
      if (error) throw error;
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
      let query = supabase
        .from('delivery_orders')
        .select('id, invoice_number, invoice_value, status, customer_name_snapshot, customer_code_snapshot, customer_phone_snapshot, customer_address_snapshot, created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (status) query = query.eq('status', status);
      const { data, count, error } = await query;
      if (error) throw error;
      return {
        rows: (data || []).map((order: any) => ({
          ...order,
          invoice_no: order.invoice_number,
          amount: order.invoice_value,
        })),
        count: count || 0,
        pageSize: PAGE_SIZE,
      };
    },
  });
}

export function useCreateInternalTrip() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ reason }: { reason: string }) => {
      const rider = await getCurrentRider(user?.authUserId, user?.id);
      if (!rider?.id) throw new Error('هذا الحساب غير مربوط بمندوب دليفري.');
      const status: InternalTripStatus = 'pending_approval';
      const { error } = await supabase.from('delivery_internal_trips').insert({ rider_id: rider.id, branch_id: rider.branch_id, reason, status });
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
      const { data, error } = await supabase.rpc('delivery_calculate_payroll', {
        p_period_start: range.start.slice(0, 10),
        p_period_end: range.end.slice(0, 10),
      });
      if (error) throw error;
      return { range, rows: (data || []) as DeliveryPayrollRow[] };
    },
  });
}

export function usePendingDeliveryTrips() {
  return useQuery({
    queryKey: ['delivery-pending-trips'],
    queryFn: async () => {
      const { data, error } = await supabase.from('delivery_trips').select('*').eq('status', 'pending_approval').order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 30,
  });
}

export function useApproveTrip() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('delivery_trips').update({ status: 'approved', updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: async (_, id) => {
      await logAudit({ userId: user?.id, userName: user?.displayName, role: user?.role, department: 'delivery_trips', operation: 'approve trip', details: `trip_id: ${id}` });
      qc.invalidateQueries({ queryKey: ['delivery-pending-trips'] });
      qc.invalidateQueries({ queryKey: ['delivery-dashboard'] });
    },
    onError: (err: any) => {
      throw err;
    },
  });
}

export function useRejectTrip() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const { error } = await supabase.from('delivery_trips').update({ status: 'rejected', notes: reason || null, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: async (_, vars) => {
      await logAudit({ userId: user?.id, userName: user?.displayName, role: user?.role, department: 'delivery_trips', operation: 'reject trip', details: `trip_id: ${vars.id}` });
      qc.invalidateQueries({ queryKey: ['delivery-pending-trips'] });
      qc.invalidateQueries({ queryKey: ['delivery-dashboard'] });
    },
    onError: (err: any) => {
      throw err;
    },
  });
}

export function useIncentives() {
  return useQuery({
    queryKey: ['delivery-incentives'],
    queryFn: async () => {
      const { data, error } = await supabase.from('delivery_performance_scores').select('*, delivery_riders(name)');
      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60,
  });
}

export function useLeaderboard() {
  return useQuery({
    queryKey: ['delivery-leaderboard'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('delivery_leaderboard');
      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60,
  });
}

export function useDeliveryIncidents() {
  return useQuery({
    queryKey: ['delivery-incidents'],
    queryFn: async () => {
      const { data, error } = await supabase.from('delivery_incidents').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 30,
  });
}

export function useDeliveryNotifications() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['delivery-notifications', user?.authUserId, user?.id],
    enabled: Boolean(user?.authUserId || user?.id),
    queryFn: async () => {
      const rider = await getCurrentRider(user?.authUserId, user?.id);
      if (!rider?.id) return [];
      const { data, error } = await supabase.from('delivery_notifications').select('*').eq('rider_id', rider.id).order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 30,
  });
}

export function useMarkDeliveryNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase.from('delivery_notifications').update({ is_read: true }).eq('id', notificationId);
      if (error) throw error;
    },
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ['delivery-notifications'] });
    },
    onError: (error: any) => {
      throw error;
    },
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
    onError: (error: any) => {
      throw error;
    },
  });
}
