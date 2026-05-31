import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { getCurrentPositionWithTimeout } from '@/lib/geo';
import { logAudit, supabase } from '@/lib/supabase';
import type { DeliveryPayrollRow, InternalTripStatus, OrderStatus } from '@/types/delivery';

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

export function useDeliveryCustomers(search: string) {
  return useQuery({
    queryKey: ['delivery-customers', search],
    enabled: search.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('delivery_search_customers', {
        search_text: search.trim(),
      });
      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60,
  });
}

export function useDeliveryDashboard() {
  const range = deliveryMonthRange();
  return useQuery({
    queryKey: ['delivery-dashboard', range.start, range.end],
    queryFn: async () => {
      const [trips, delivered, pendingReview, internalTrips] = await Promise.all([
        supabase.from('delivery_trips').select('id', { count: 'exact', head: true }).gte('started_at', range.start).lte('started_at', range.end),
        supabase.from('delivery_orders').select('id', { count: 'exact', head: true }).eq('status', 'delivered').gte('created_at', range.start).lte('created_at', range.end),
        supabase.from('delivery_trips').select('id', { count: 'exact', head: true }).eq('status', 'review').gte('started_at', range.start).lte('started_at', range.end),
        supabase.from('delivery_internal_trips').select('id', { count: 'exact', head: true }).in('status', ['approved', 'completed']).gte('created_at', range.start).lte('created_at', range.end),
      ]);

      for (const result of [trips, delivered, pendingReview, internalTrips]) {
        if (result.error) throw result.error;
      }

      return {
        range,
        trips: trips.count || 0,
        deliveredOrders: delivered.count || 0,
        reviewTrips: pendingReview.count || 0,
        internalTrips: internalTrips.count || 0,
      };
    },
  });
}

export function useActiveDeliveryTrip() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['delivery-active-trip', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data: rider } = await supabase
        .from('delivery_riders')
        .select('id')
        .eq('user_id', user?.id)
        .maybeSingle();
      if (!rider?.id) return null;

      const { data, error } = await supabase
        .from('delivery_trips')
        .select(`
          id,
          rider_id,
          branch_id,
          status,
          started_at,
          ended_at,
          needs_review,
          review_reason,
          manual_return_reason,
          delivery_orders(
            id,
            trip_id,
            rider_id,
            customer_id,
            invoice_no,
            amount,
            status,
            customer_name_snapshot,
            customer_code_snapshot,
            customer_phone_snapshot,
            customer_address_snapshot,
            delivered_at,
            created_at
          )
        `)
        .eq('rider_id', rider.id)
        .eq('status', 'active')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
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
      await logAudit({ userId: user?.id, userName: user?.displayName, role: user?.role, department: 'delivery', operation: 'delivery attendance check-in' });
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
      await logAudit({ userId: user?.id, userName: user?.displayName, role: user?.role, department: 'delivery', operation: 'start delivery run' });
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
      const { error } = await supabase.from('delivery_orders').insert({
        ...order,
        status: 'pending',
        invoice_no: order.invoice_no.trim(),
      });
      if (error) throw error;
    },
    onSuccess: async (_, vars) => {
      await logAudit({ userId: user?.id, userName: user?.displayName, role: user?.role, department: 'delivery', operation: 'add delivery order', details: `invoice_no: ${vars.invoice_no}` });
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
      await logAudit({ userId: user?.id, userName: user?.displayName, role: user?.role, department: 'delivery', operation: 'update delivery order', details: `order_id: ${vars.id} status: ${vars.status}` });
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
      await logAudit({ userId: user?.id, userName: user?.displayName, role: user?.role, department: 'delivery', operation: vars.manualReason ? 'manual return to review' : 'complete delivery run', details: `trip_id: ${vars.tripId}` });
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
        .select(`
          id,
          invoice_no,
          amount,
          status,
          customer_name_snapshot,
          customer_code_snapshot,
          customer_phone_snapshot,
          customer_address_snapshot,
          created_at,
          delivery_trips(started_at, status)
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (status) query = query.eq('status', status);
      const { data, count, error } = await query;
      if (error) throw error;
      return { rows: data || [], count: count || 0, pageSize: PAGE_SIZE };
    },
  });
}

export function useCreateInternalTrip() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ reason }: { reason: string }) => {
      const { data: rider, error: riderError } = await supabase.from('delivery_riders').select('id, branch_id').eq('user_id', user?.id).single();
      if (riderError) throw riderError;
      const { data: settings } = await supabase.from('delivery_settings').select('internal_trip_requires_approval').eq('branch_id', rider.branch_id).maybeSingle();
      const status: InternalTripStatus = settings?.internal_trip_requires_approval === false ? 'approved' : 'pending_approval';
      const { error } = await supabase.from('delivery_internal_trips').insert({ rider_id: rider.id, branch_id: rider.branch_id, reason, status });
      if (error) throw error;
    },
    onSuccess: async () => {
      await logAudit({ userId: user?.id, userName: user?.displayName, role: user?.role, department: 'delivery', operation: 'request internal trip' });
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
