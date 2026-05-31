export type DeliveryRole = 'admin' | 'shift_manager' | 'rider';
export type RiderTier = 'senior' | 'mid' | 'junior';
export type TripStatus = 'active' | 'review' | 'completed' | 'cancelled';
export type OrderStatus = 'pending' | 'delivered' | 'returned' | 'cancelled';
export type InternalTripStatus = 'pending_approval' | 'approved' | 'completed' | 'rejected';

// delivery_trips is the Delivery Run: one rider outing that can contain many orders.
export interface DeliveryCustomer {
  id: string;
  customer_code: string;
  name: string;
  phone: string;
  address: string;
  branch_id?: string;
}

export interface DeliveryTrip {
  id: string;
  rider_id: string;
  branch_id: string;
  status: TripStatus;
  started_at: string;
  ended_at?: string | null;
  start_lat?: number | null;
  start_lng?: number | null;
  start_accuracy?: number | null;
  return_lat?: number | null;
  return_lng?: number | null;
  return_accuracy?: number | null;
  needs_review?: boolean;
  review_reason?: string | null;
  manual_return_reason?: string | null;
}

export interface DeliveryOrder {
  id: string;
  trip_id: string;
  rider_id: string;
  customer_id: string;
  invoice_no: string;
  status: OrderStatus;
  amount: number;
  customer_name_snapshot: string;
  customer_code_snapshot: string;
  customer_phone_snapshot: string;
  customer_address_snapshot: string;
  delivered_at?: string | null;
  customers?: DeliveryCustomer | null;
}

export interface DeliveryPayrollRow {
  rider_id: string;
  rider_name: string;
  tier: RiderTier;
  hours_count: number;
  delivered_orders_count: number;
  internal_trips_count: number;
  hourly_rate_snapshot: number;
  order_rate_snapshot: number;
  internal_trip_rate_snapshot: number;
  gross_total: number;
  bonuses_total: number;
  deductions_total: number;
  net_total: number;
  pending_review_count: number;
  unapproved_trips_count: number;
  failed_orders_count: number;
  can_approve_payroll: boolean;
}

export interface GeoPoint {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  needsReview: boolean;
  reason: string | null;
}
