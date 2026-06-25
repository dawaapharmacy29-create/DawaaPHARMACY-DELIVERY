import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Search, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { clearRiderSession, getRiderSession, getRiderById, logout } from "../../lib/auth";
import {
  formatMoney,
  formatTime,
  formatDateTime,
  getOperationalPeriod,
  TRIP_TYPE_LABELS,
  DUPLICATE_REASON_LABELS,
  ORDER_STATUS_LABELS,
  TRIP_STATUS_LABELS,
} from "../../lib/helpers";
import type {
  Attendance,
  Branch,
  DeliveryOrder,
  InternalTrip,
  Rider,
} from "../../lib/types";
import { todayIso } from "../../lib/helpers";
import PwaInstallPrompt from "../../components/PwaInstallPrompt";
import RiderDeviceMonitor from "../../components/RiderDeviceMonitor";
import ConnectivitySyncBanner from "../../components/ConnectivitySyncBanner";
import OrderTimelineBadge from "../../components/OrderTimelineBadge";
import { enqueueOfflineMutation } from "../../lib/offlineQueue";
import { useRealtimeSync } from "../../lib/useRealtimeSync";
import { LiveEarningsBar, NavigateButton, SmartCustomerCard } from "../../components/rider/RiderIntelligence";

// ─── Types ────────────────────────────────────────────────────────────────────
type ModalName =
  | "order"
  | "trip"
  | "orders"
  | "trips"
  | "pay"
  | "fail_reason"
  | "duplicate"
  | "edit_order"
  | "notifications"
  | "policies"
  | null;
type OrderViewMode =
  | "all"
  | "delivered"
  | "failed"
  | "pending"
  | "duplicates"
  | "multiplier";
type TripViewMode = "all" | "approved" | "pending" | "rejected";

type NormalizedCustomer = {
  id: string | null;
  code: string;
  name: string;
  phone: string;
  address: string;
  branch_name?: string | null;
  raw?: Record<string, unknown>;
};

type ReceiptUploadInfo = {
  path: string;
  url: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
};
type ReceiptUploadState = "not_uploaded" | "uploading" | "uploaded" | "failed" | "pending_retry";
type EditOrderDraft = { invoice_number: string; customer_name: string; customer_code: string; customer_phone: string; customer_address: string; invoice_amount: string; order_multiplier: number; multiplier_reason: string; notes: string; receipt_image_url?: string | null; receipt_image_path?: string | null; receipt_upload_status?: string };

type ReceiptOcrExtract = {
  invoice_number?: string | null;
  customer_code?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  doctor_name?: string | null;
  invoice_amount?: number | string | null;
  invoice_date?: string | null;
  confidence?: number | null;
  warnings?: string[];
  raw_text?: string | null;
};

const CUSTOMER_TEXT_COLUMNS = [
  "customer_code",
  "code",
  "customer_id",
  "client_code",
  "cust_code",
  "customer_name",
  "name",
  "client_name",
  "cust_name",
  "phone",
  "mobile",
  "customer_phone",
  "telephone",
  "tel",
  "phone_number",
  "address",
  "customer_address",
  "area",
];

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function getFirstText(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = normalizeText(row[key]);
    if (value) return value;
  }
  return "";
}

function normalizeCustomer(row: Record<string, unknown>): NormalizedCustomer {
  return {
    id: getFirstText(row, ["id", "customer_uuid", "uuid"]) || null,
    code: getFirstText(row, [
      "customer_code",
      "code",
      "customer_id",
      "client_code",
      "cust_code",
    ]),
    name: getFirstText(row, [
      "customer_name",
      "name",
      "client_name",
      "cust_name",
      "full_name",
    ]),
    phone: getFirstText(row, [
      "phone",
      "mobile",
      "customer_phone",
      "telephone",
      "tel",
      "phone_number",
    ]),
    address: getFirstText(row, [
      "address",
      "customer_address",
      "area",
      "location",
      "delivery_address",
    ]),
    branch_name: getFirstText(row, ["branch_name", "branch"]) || null,
    raw: row,
  };
}

function uniqueCustomers(rows: NormalizedCustomer[]): NormalizedCustomer[] {
  const seen = new Set<string>();
  const out: NormalizedCustomer[] = [];
  for (const c of rows) {
    const key = c.id || `${c.code}|${c.name}|${c.phone}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

function buildPostgrestSearchPattern(value: string): string {
  const cleaned = value.replace(/[,]/g, " ").trim().replace(/\s+/g, " ");
  if (!cleaned) return "";
  // Support * as a wildcard for riders, e.g. "محمد*احمد".
  const wildcarded = cleaned.replace(/[%]/g, "").replace(/[＊*]+/g, "%");
  return wildcarded.includes("%") ? wildcarded : `%${wildcarded}%`;
}

function getStoredRiderToken(): string | null {
  try {
    const raw = localStorage.getItem("dawaa_rider_session");
    if (raw) return JSON.parse(raw)?.session_token || null;
  } catch {}
  return localStorage.getItem("rider_session_token");
}

function getRpcResult<T = any>(data: any): T | null {
  return (Array.isArray(data) ? data[0] : data) as T | null;
}

function shiftIsoDate(dateIso: string, days: number): string {
  const date = new Date(`${dateIso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

type RiderGpsFix = {
  lat: number;
  lng: number;
  accuracy: number | null;
};

function requestRiderGps(): Promise<RiderGpsFix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(
        new Error(
          "الموبايل أو المتصفح لا يدعم تحديد الموقع. لا يمكن تنفيذ العملية الآمنة بدون GPS.",
        ),
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Number.isFinite(pos.coords.accuracy)
            ? Math.round(pos.coords.accuracy)
            : null,
        }),
      () =>
        reject(
          new Error(
            "لازم تسمح للتطبيق بالوصول للموقع GPS عشان نمنع التلاعب ونسجل العملية بأمان.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  });
}

async function requestNotificationPermissionIfNeeded() {
  if (typeof window === "undefined" || !("Notification" in window))
    return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  } catch {
    return false;
  }
}

async function showDawaaBrowserNotification(
  title: string,
  body: string,
  url = "/rider",
) {
  const allowed = await requestNotificationPermissionIfNeeded();
  if (!allowed) return;
  try {
    const registration = await navigator.serviceWorker?.ready;
    if (registration?.active) {
      registration.active.postMessage({
        type: "DAWAA_SHOW_NOTIFICATION",
        title,
        body,
        url,
        tag: `dawaa-${Date.now()}`,
        requireInteraction: true,
      });
      return;
    }
  } catch {}
  try {
    new Notification(title, {
      body,
      icon: "/logo.png",
      dir: "rtl",
      lang: "ar-EG",
    });
  } catch {}
}

function notificationKey(n: any): string {
  return String(
    n?.id ||
      `${n?.title || ""}-${n?.message || n?.body || ""}-${n?.created_at || ""}`,
  );
}

const BRANCH_DESTINATIONS = [
  "فرع الشامي",
  "فرع شكري",
  "فرع بسيسة",
  "فرع زكريا",
  "فرع المنشية",
];

const WAREHOUSE_DESTINATIONS = [
  { code: "1", name: "مخزن المعداوي" },
  { code: "2", name: "مخزن سونيستا" },
  { code: "3", name: "مخزن الحياة" },
  { code: "4", name: "مخزن المحلة" },
  { code: "5", name: "المخزن الرئيسي" },
  { code: "6", name: "المكتب" },
];

const SUPPLIES_DESTINATIONS = [
  "مستلزمات الفرع",
  "مخزن المستلزمات",
  "مورد مستلزمات",
];

const ACCESSORY_DESTINATIONS = [
  "كيان إكسسوار",
  "المدينة المنورة إكسسوار",
  "أورجينال إكسسوار",
  "سوفيكو",
];

function normalizeBranchLabel(value?: string | null) {
  const v = normalizeText(value);
  if (!v) return "";
  return v.startsWith("فرع ") ? v : `فرع ${v}`;
}

function destinationLabelWithCode(item: { code: string; name: string }) {
  return `${item.name} (${item.code})`;
}

function tripTypeHelp(type: InternalTrip["trip_type"]) {
  switch (type) {
    case "branch_to_branch":
      return "اختار الفرع اللي خارج منه المندوب والفرع اللي رايح له. مثال: من فرع الشامي إلى فرع شكري.";
    case "warehouse":
      return "اختار الفرع الخارج منه، ثم اختار المخزن أو أضف مخزن جديد.";
    case "supplies":
      return "مشوار مستلزمات: اختار جهة المستلزمات أو اكتبها يدويًا.";
    case "pharmacy":
      return "اكتب اسم الصيدلية وجهة الخروج بوضوح.";
    case "shipment_pickup":
      return "استلام شحن: اكتب مكان أو شركة الشحن والفرع المستلم.";
    case "accessories":
      return "مشوار إكسسوار: اختار مخزن الإكسسوار أو اكتب اسم المخزن.";
    default:
      return "اكتب جهة الخروج وجهة الوصول وسبب المشوار بوضوح.";
  }
}
// ─── Main ─────────────────────────────────────────────────────────────────────
export default function RiderDashboard() {
  const navigate = useNavigate();

  // Core state
  const [rider, setRider] = useState<Rider | null>(null);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [attendance, setAttendance] = useState<Attendance | null>(null);
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [trips, setTrips] = useState<InternalTrip[]>([]);
  const [cycleOrders, setCycleOrders] = useState<DeliveryOrder[]>([]);
  const [cycleTrips, setCycleTrips] = useState<InternalTrip[]>([]);
  const [riderActions, setRiderActions] = useState<any[]>([]);
  const [riderPermissions, setRiderPermissions] = useState<any[]>([]);
  const [riderNotifications, setRiderNotifications] = useState<any[]>([]);
  const [browserNotificationsEnabled, setBrowserNotificationsEnabled] =
    useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeModal, setActiveModal] = useState<ModalName>(null);
  const [orderViewMode, setOrderViewMode] = useState<OrderViewMode>("all");
  const [orderViewTitle, setOrderViewTitle] = useState("أوردرات اليوم");
  const [tripViewMode, setTripViewMode] = useState<TripViewMode>("all");
  const [tripViewTitle, setTripViewTitle] = useState("مشاوير اليوم");

  // Order form
  const [customerSearch, setCustomerSearch] = useState("");
  const [customers, setCustomers] = useState<NormalizedCustomer[]>([]);
  const [selectedCustomer, setSelectedCustomer] =
    useState<NormalizedCustomer | null>(null);
  const [customerCode, setCustomerCode] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [useMultiplier, setUseMultiplier] = useState(false);
  const [multiplierReason, setMultiplierReason] = useState("");
  const [dupWarning, setDupWarning] = useState<DeliveryOrder | null>(null);
  const [dupReason, setDupReason] = useState("");
  const [dupNote, setDupNote] = useState("");
  const [dupDoctorName, setDupDoctorName] = useState("");
  const [searching, setSearching] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState("");
  const [receiptOcrNote, setReceiptOcrNote] = useState("");
  const [receiptUploadInfo, setReceiptUploadInfo] =
    useState<ReceiptUploadInfo | null>(null);
  const [receiptUploadState, setReceiptUploadState] = useState<ReceiptUploadState>("not_uploaded");
  const [receiptUploadError, setReceiptUploadError] = useState("");
  const [receiptOcrData, setReceiptOcrData] =
    useState<ReceiptOcrExtract | null>(null);
  const [orderSaveError, setOrderSaveError] = useState("");
  const [, setReceiptExtracting] = useState(false);
  const receiptCameraInputRef = useRef<HTMLInputElement | null>(null);
  const receiptUploadInputRef = useRef<HTMLInputElement | null>(null);
  const [editOrder, setEditOrder] = useState<DeliveryOrder | null>(null);
  const [editDraft, setEditDraft] = useState<EditOrderDraft | null>(null);
  const [editReason, setEditReason] = useState("");
  const [editReceiptFile, setEditReceiptFile] = useState<File | null>(null);
  const [editReceiptState, setEditReceiptState] = useState<ReceiptUploadState>("not_uploaded");

  // Trip form
  const [tripType, setTripType] =
    useState<InternalTrip["trip_type"]>("branch_to_branch");
  const [fromLabel, setFromLabel] = useState("");
  const [toLabel, setToLabel] = useState("");
  const [customToLabel, setCustomToLabel] = useState("");
  const [tripReason, setTripReason] = useState("");
  const [relatedInvoice, setRelatedInvoice] = useState("");
  const [tripRequesterName, setTripRequesterName] = useState("");
  const [, setTripProofType] = useState<
    "invoice" | "photo" | "manager_note" | "none"
  >("invoice");
  const [tripProofNote, setTripProofNote] = useState("");
  const [tripProofFile, setTripProofFile] = useState<File | null>(null);
  const [tripProofPreviewUrl, setTripProofPreviewUrl] = useState("");
  const [tripProofUploadInfo, setTripProofUploadInfo] =
    useState<ReceiptUploadInfo | null>(null);
  const [tripProofUploadState, setTripProofUploadState] =
    useState<ReceiptUploadState>("not_uploaded");
  const [tripProofUploadError, setTripProofUploadError] = useState("");
  const [tripProofCapturedAt, setTripProofCapturedAt] = useState("");
  const [allowTripProofException, setAllowTripProofException] = useState(false);
  const [tripProofExceptionReason, setTripProofExceptionReason] = useState("");
  const tripProofCameraInputRef = useRef<HTMLInputElement | null>(null);

  // Fail reason
  const [failOrderId, setFailOrderId] = useState<string | null>(null);
  const [failReason, setFailReason] = useState("");

  // Monthly earnings
  const [, setMonthlyEarnings] = useState(0);

  const period = getOperationalPeriod();
  const safeOrdersRaw = Array.isArray(orders) ? orders : [];
  // Soft-deleted orders stay in the database for the admin audit trail, but riders do not see them in daily counters.
  const safeOrders = safeOrdersRaw.filter((o) => !(o as any).deleted_at);
  const safeTrips = Array.isArray(trips) ? trips : [];
  const safeCycleOrders = (
    Array.isArray(cycleOrders) ? cycleOrders : []
  ).filter((o) => !(o as any).deleted_at);
  const safeCycleTrips = Array.isArray(cycleTrips) ? cycleTrips : [];
  const todayTotalOrders = safeOrders.length;
  const todayTotalTrips = safeTrips.length;
  const cycleTotalOrders = safeCycleOrders.length;
  const cycleTotalTrips = safeCycleTrips.length;
  const cycleDeliveredOrders = safeCycleOrders.filter(
    (o) => o.status === "delivered",
  ).length;
  const cycleFailedOrders = safeCycleOrders.filter(
    (o) => o.status === "failed",
  ).length;
  const cycleMultiplierOrders = safeCycleOrders.filter(
    (o) => (o.order_multiplier ?? 1) >= 1.5,
  ).length;
  const delivered = safeOrders.filter((o) => o.status === "delivered").length;
  const failedOrders = safeOrders.filter((o) => o.status === "failed").length;
  const pendingOrders = safeOrders.filter(
    (o) => o.status === "registered" || o.status === "needs_review",
  ).length;
  const missingShiftOrders = safeOrders.filter(
    (o: any) => !o.attendance_id || o.review_status === "missing_shift" || o.review_reason === "missing_shift",
  ).length;
  const countableOrders = safeOrders.filter(
    (o) =>
      (o as any).final_count_status === "counted" ||
      (o as any).is_countable === true,
  ).length;
  const dups = safeOrders.filter((o) => o.is_duplicate_invoice).length;
  const mult15 = safeOrders.filter(
    (o) => (o.order_multiplier ?? 1) >= 1.5,
  ).length;
  const openOrderRows = safeOrders.filter((o: any) => !["delivered", "تم التسليم", "failed", "cancelled", "canceled"].includes(String(o.status || "").toLowerCase()));
  const oldestOpenMinutes = openOrderRows.length ? Math.max(...openOrderRows.map((o: any) => Math.max(0, Math.floor((Date.now() - new Date(o.registered_at || o.created_at).getTime()) / 60000)))) : 0;

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeWorkDate = (attendance as any)?.work_date || (attendance as any)?.shift_date || todayIso();
  const activeAttendanceId = (attendance as any)?.id || null;
  const isShiftOpen = Boolean((attendance as any)?.check_in_at && !(attendance as any)?.check_out_at);


  function openOrders(mode: OrderViewMode, title: string) {
    setOrderViewMode(mode);
    setOrderViewTitle(title);
    setActiveModal("orders");
  }

  function openTrips(mode: TripViewMode, title: string) {
    setTripViewMode(mode);
    setTripViewTitle(title);
    setActiveModal("trips");
  }

  const notDispatchedOrders = orders.filter(
    (o: any) => !o.dispatched_at && o.status === "registered",
  ).length;
  const dispatchedTodayOrders = orders.filter(
    (o: any) => !!o.dispatched_at,
  ).length;

  const displayedOrders = safeOrders.filter((order) => {
    if (orderViewMode === "delivered") return order.status === "delivered";
    if (orderViewMode === "failed") return order.status === "failed";
    if (orderViewMode === "pending")
      return order.status === "registered" || order.status === "needs_review";
    if (orderViewMode === "duplicates") return !!order.is_duplicate_invoice;
    if (orderViewMode === "multiplier")
      return (order.order_multiplier ?? 1) >= 1.5;
    return true;
  });

  const displayedTrips = safeTrips.filter((trip) => {
    if (tripViewMode === "approved") return trip.status === "approved";
    if (tripViewMode === "pending") return trip.status === "pending_approval";
    if (tripViewMode === "rejected") return trip.status === "rejected";
    return true;
  });

  const lastSevenDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const iso = d.toISOString().slice(0, 10);
    return {
      label: i === 6 ? "اليوم" : i === 5 ? "أمس" : `منذ ${6 - i} أيام`,
      value: safeCycleOrders.filter(
        (o: any) =>
          ((o as any).work_date || o.delivery_date ||
            String(o.registered_at || o.created_at || "").slice(0, 10)) === iso,
      ).length,
    };
  });

  // ── LOAD ────────────────────────────────────────────────────────────────────
  const loadAll = useCallback(
    async (showToast = false) => {
      try {
        setLoading(true);

        // 1. Get rider session from localStorage (NOT Supabase Auth)
        const session = getRiderSession();

        if (!session.rider_id) {
          navigate("/login", { replace: true });
          return;
        }

        // 2. Get rider by rider_id from session
        const riderData = await getRiderById(session.rider_id);

        if (!riderData) {
          setRider(null);
          setLoading(false);
          return;
        }

        setRider(riderData);
        const riderId = riderData.id;

        // 3. Get branch
        if (riderData.branch_id) {
          const { data: branchData } = await supabase
            .from("branches")
            .select("*")
            .eq("id", riderData.branch_id)
            .maybeSingle();
          setBranch(branchData as Branch | null);
        }

        // 4. Prefer secure token-based RPC dashboard data if available.
        const token = session.session_token || getStoredRiderToken();
        if (token) {
          const { data: dashboardData, error: dashboardError } =
            await supabase.rpc("rider_get_dashboard_data", {
              p_token: token,
              p_date_start: period.start,
              p_date_end: period.end,
            });
          const dash = getRpcResult<any>(dashboardData);
          if (!dashboardError && dash?.success) {
            if (dash.rider) setRider(dash.rider as Rider);
            if (dash.attendance) setAttendance(dash.attendance as Attendance);
            setOrders(
              ((dash.orders?.today ?? []) as DeliveryOrder[]).filter(Boolean),
            );
            setCycleOrders(
              ((dash.orders?.cycle ?? []) as DeliveryOrder[]).filter(Boolean),
            );
            setTrips(
              ((dash.trips?.today ?? []) as InternalTrip[]).filter(Boolean),
            );
            setCycleTrips(
              ((dash.trips?.cycle ?? []) as InternalTrip[]).filter(Boolean),
            );
            if (Array.isArray(dash.notifications))
              setRiderNotifications(dash.notifications);
            // Keep loading non-critical legacy tables for actions/permissions only.
            const [actionsRes, permissionsRes] = await Promise.allSettled([
              supabase
                .from("rider_shift_actions")
                .select("*")
                .eq("rider_id", riderId)
                .gte("shift_date", period.start)
                .lte("shift_date", period.end)
                .order("incident_at", { ascending: false }),
              supabase
                .from("rider_schedule_exceptions")
                .select("*")
                .eq("rider_id", riderId)
                .gte("exception_date", period.start)
                .lte("exception_date", period.end)
                .order("exception_date", { ascending: false }),
            ]);
            if (actionsRes.status === "fulfilled" && !actionsRes.value.error)
              setRiderActions(actionsRes.value.data ?? []);
            if (
              permissionsRes.status === "fulfilled" &&
              !permissionsRes.value.error
            )
              setRiderPermissions(permissionsRes.value.data ?? []);
            if (showToast) toast.success("تم تحديث البيانات");
            setLoading(false);
            return;
          } else if (dash?.error === "expired_session" || dash?.error === "invalid_session") {
            clearRiderSession();
            navigate("/rider-login", { replace: true });
            return;
          } else if (dashboardError) {
          }
        }

        // 5. Legacy fallback: direct table reads for older database versions.
        const today = todayIso();
        const yesterday = shiftIsoDate(today, -1);
        const candidateWorkDates = [today, yesterday];
        const [
          attRes,
          ordRes,
          tripRes,
          cycleOrdRes,
          cycleTripRes,
          actionsRes,
          permissionsRes,
          notificationsRes,
        ] = await Promise.allSettled([
          // Load today's attendance plus any open attendance record. This prevents the UI from
          // showing "not checked in" if the DB function used a slightly different work_date.
          supabase
            .from("delivery_attendance")
            .select("*")
            .eq("rider_id", riderId)
            .or(`work_date.in.(${candidateWorkDates.join(",")}),shift_date.in.(${candidateWorkDates.join(",")}),check_out_time.is.null,check_out_at.is.null`)
            .order("created_at", { ascending: false })
            .limit(5),
          supabase
            .from("delivery_orders")
            .select("*")
            .eq("rider_id", riderId)
            .in("work_date", candidateWorkDates)
            .order("registered_at", { ascending: false }),
          supabase
            .from("internal_trips")
            .select("*")
            .eq("rider_id", riderId)
            .in("work_date", candidateWorkDates)
            .order("registered_at", { ascending: false }),
          supabase
            .from("delivery_orders")
            .select("*")
            .eq("rider_id", riderId)
            .gte("work_date", period.start)
            .lte("work_date", period.end)
            .order("work_date", { ascending: false }),
          supabase
            .from("internal_trips")
            .select("*")
            .eq("rider_id", riderId)
            .gte("work_date", period.start)
            .lte("work_date", period.end)
            .order("work_date", { ascending: false }),
          supabase
            .from("rider_shift_actions")
            .select("*")
            .eq("rider_id", riderId)
            .gte("shift_date", period.start)
            .lte("shift_date", period.end)
            .order("incident_at", { ascending: false }),
          supabase
            .from("rider_schedule_exceptions")
            .select("*")
            .eq("rider_id", riderId)
            .gte("exception_date", period.start)
            .lte("exception_date", period.end)
            .order("exception_date", { ascending: false }),
          supabase
            .from("rider_notifications")
            .select("*")
            .or(`rider_id.eq.${riderId},rider_id.is.null`)
            .order("created_at", { ascending: false })
            .limit(20),
        ]);

        let effectiveDailyWorkDates = new Set<string>([today]);
        if (attRes.status === "fulfilled" && !attRes.value.error) {
          const rows = (attRes.value.data ?? []) as Attendance[];
          const normalizedRows = rows.map((r: any) => ({
            ...r,
            work_date: r.work_date || r.shift_date,
            check_in_at: r.check_in_at || r.check_in_time,
            check_out_at: r.check_out_at || r.check_out_time,
          })) as Attendance[];
          const best =
            normalizedRows.find((r: any) => r.check_in_at && !r.check_out_at) ||
            normalizedRows.find((r: any) => r.work_date === today) ||
            normalizedRows[0] ||
            null;
          const openShiftWorkDate = (best as any)?.check_in_at && !(best as any)?.check_out_at
            ? String((best as any)?.work_date || (best as any)?.shift_date || today)
            : today;
          effectiveDailyWorkDates = new Set([today, openShiftWorkDate].filter(Boolean));
          setAttendance(best);
        }
        if (ordRes.status === "fulfilled")
          setOrders(((ordRes.value.data ?? []) as DeliveryOrder[]).filter((order: any) => effectiveDailyWorkDates.has(String(order.work_date || order.delivery_date || "").slice(0, 10))));
        if (tripRes.status === "fulfilled")
          setTrips(((tripRes.value.data ?? []) as InternalTrip[]).filter((trip: any) => effectiveDailyWorkDates.has(String(trip.work_date || trip.trip_date || "").slice(0, 10))));
        if (cycleOrdRes.status === "fulfilled")
          setCycleOrders((cycleOrdRes.value.data ?? []) as DeliveryOrder[]);
        if (cycleTripRes.status === "fulfilled")
          setCycleTrips((cycleTripRes.value.data ?? []) as InternalTrip[]);
        if (actionsRes.status === "fulfilled" && !actionsRes.value.error)
          setRiderActions(actionsRes.value.data ?? []);
        if (
          permissionsRes.status === "fulfilled" &&
          !permissionsRes.value.error
        )
          setRiderPermissions(permissionsRes.value.data ?? []);
        if (
          notificationsRes.status === "fulfilled" &&
          !notificationsRes.value.error
        )
          setRiderNotifications(notificationsRes.value.data ?? []);

        // 5. Monthly earnings from reconciliation_results
        const { data: recData } = await supabase
          .from("reconciliation_results")
          .select("total_earnings")
          .eq("rider_id", riderId)
          .gte("period_start", period.start)
          .lte("period_end", period.end)
          .maybeSingle();
        setMonthlyEarnings(recData?.total_earnings ?? 0);

        if (showToast) toast.success("اتحدثت البيانات ✅");
      } catch (e) {
        toast.error("حصلت مشكلة في تحميل البيانات");
      } finally {
        setLoading(false);
      }
    },
    [navigate, period.start, period.end],
  );

  useRealtimeSync({
    riderId: rider?.id || getRiderSession().rider_id,
    onOrderChange: () => {
      void loadAll();
    },
    onTripChange: () => {
      void loadAll();
    },
    onAttendanceChange: () => {
      void loadAll();
    },
    enabled: !!(rider?.id || getRiderSession().rider_id),
  });

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!openOrderRows.length || oldestOpenMinutes < 45) return;
    const showReminder = () => toast.warning(oldestOpenMinutes >= 90 ? `تنبيه قوي: يوجد أوردر مفتوح منذ ${oldestOpenMinutes} دقيقة، برجاء تأكيد التسليم أو توضيح السبب` : `تنبيه: يوجد أوردر مفتوح منذ أكثر من 45 دقيقة`);
    showReminder();
    const timer = window.setInterval(showReminder, 10 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [openOrderRows.length, oldestOpenMinutes]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    setBrowserNotificationsEnabled(Notification.permission === "granted");
  }, []);

  useEffect(() => {
    const riderId = rider?.id || getRiderSession().rider_id;
    if (!riderId) return;

    const channel = supabase
      .channel(`rider-notifications-${riderId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "rider_notifications",
          filter: `rider_id=eq.${riderId}`,
        },
        (payload) => {
          const n: any = payload.new;
          setRiderNotifications((prev) => {
            const key = notificationKey(n);
            if (prev.some((item) => notificationKey(item) === key)) return prev;
            return [n, ...prev].slice(0, 50);
          });
          toast.info(n.title || "تنبيه جديد من الإدارة");
          void showDawaaBrowserNotification(
            n.title || "تنبيه جديد من Dawaa Delivery",
            n.message || n.body || "يوجد تحديث جديد متعلق بعملك",
            "/rider",
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "rider_notifications",
          filter: "rider_id=is.null",
        },
        (payload) => {
          const n: any = payload.new;
          setRiderNotifications((prev) => {
            const key = notificationKey(n);
            if (prev.some((item) => notificationKey(item) === key)) return prev;
            return [n, ...prev].slice(0, 50);
          });
          toast.info(n.title || "تنبيه عام");
          void showDawaaBrowserNotification(
            n.title || "تنبيه عام من الإدارة",
            n.message || n.body || "يوجد تحديث عام جديد",
            "/rider",
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [rider?.id]);

  useEffect(() => {
    if (!activeModal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveModal(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeModal]);

  const runCustomerSearch = useCallback(
    async (query = customerSearch) => {
      const q = query.trim();
      if (q.length < 1) {
        setCustomers([]);
        return;
      }

      try {
        setSearching(true);
        const token = getStoredRiderToken();
        if (token) {
          const { data: rpcData, error: rpcError } = await supabase.rpc(
            "rider_search_customers",
            {
              p_token: token,
              p_query: q,
              p_limit: 20,
            },
          );
          const result = getRpcResult<any>(rpcData);
          if (!rpcError && result?.success) {
            const rows = Array.isArray(result.data) ? result.data : [];
            setCustomers(
              uniqueCustomers(
                rows.map((row: any) =>
                  normalizeCustomer(row as Record<string, unknown>),
                ),
              ).slice(0, 20),
            );
            return;
          } else if (rpcError) {
          }
        }
        const pattern = buildPostgrestSearchPattern(q);
        const collected: NormalizedCustomer[] = [];

        // Try common schemas one by one. If a column does not exist, ignore that query
        // instead of breaking the whole rider order form.
        for (const column of CUSTOMER_TEXT_COLUMNS) {
          if (collected.length >= 20) break;
          const { data, error } = await supabase
            .from("customers")
            .select("*")
            .ilike(column, pattern)
            .limit(10);

          if (error) {
            continue;
          }

          const normalized = (data ?? [])
            .map((row) => normalizeCustomer(row as Record<string, unknown>))
            .filter((c) => c.name || c.code || c.phone);
          collected.push(...normalized);
        }

        setCustomers(uniqueCustomers(collected).slice(0, 20));
      } catch (e) {
        setCustomers([]);
      } finally {
        setSearching(false);
      }
    },
    [customerSearch],
  );

  // Customer search: auto-search with debounce, plus an explicit search button in the UI.
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = customerSearch.trim();
    if (q.length < 2) {
      setCustomers([]);
      return;
    }
    searchTimer.current = setTimeout(() => {
      void runCustomerSearch(q);
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [customerSearch, runCustomerSearch]);

  function selectCustomer(c: NormalizedCustomer) {
    setSelectedCustomer(c);
    setCustomerCode(c.code || "");
    setCustomerName(c.name || "");
    setCustomerPhone(c.phone || "");
    setCustomerAddress(c.address || "");
    setCustomerSearch("");
    setCustomers([]);
  }

  // ── ATTENDANCE ────────────────────────────────────────────────────────────
  async function handleCheckInOut() {
    if (!rider) return;
    try {
      setSaving(true);
      const action =
        attendance?.check_in_at && !attendance?.check_out_at
          ? "checkout"
          : "checkin";
      const token = getStoredRiderToken();
      if (!token)
        throw new Error("انتهت الجلسة. سجل دخول مرة أخرى من تطبيق الدليفري.");
      let gps: { lat: number | null; lng: number | null; accuracy: number | null } = { lat: null, lng: null, accuracy: null };
      try {
        gps = await requestRiderGps();
      } catch {
        toast.info("تعذر قراءة GPS الآن، سنكمل تسجيل الشيفت بدون تعطيلك");
      }
      const { data: secureData, error: secureError } = await supabase.rpc(
        "rider_check_in_out",
        {
          p_token: token,
          p_action: action === "checkin" ? "check_in" : "check_out",
          p_lat: gps.lat,
          p_lng: gps.lng,
          p_accuracy_m: gps.accuracy,
        },
      );
      const result = getRpcResult<any>(secureData);
      if (secureError) throw secureError;
      if (!result?.success)
        throw new Error(
          result?.message ||
            result?.error ||
            "رفض السيرفر تسجيل الحضور/الانصراف",
        );
      if (gps.accuracy && gps.accuracy > 100) {
        toast.warning(
          `تم التسجيل لكن دقة GPS ضعيفة (${gps.accuracy} متر)، وقد يحتاج لمراجعة المدير`,
        );
      } else {
        toast.success(
          action === "checkin"
            ? "تم تسجيل الحضور بنجاح"
            : "تم تسجيل الانصراف بنجاح",
        );
      }
      await loadAll(true);
      return;
    } catch (e: any) {
      toast.error(
        e?.message
          ? `تعذر تسجيل الحضور/الانصراف: ${e.message}`
          : "تعذر تسجيل الحضور/الانصراف",
      );
    } finally {
      setSaving(false);
    }
  }

  // ── ORDER FORM ────────────────────────────────────────────────────────────
  function resetOrderForm() {
    setCustomerSearch("");
    setCustomers([]);
    setSelectedCustomer(null);
    setCustomerCode("");
    setCustomerName("");
    setCustomerPhone("");
    setCustomerAddress("");
    setInvoiceNumber("");
    setInvoiceAmount("");
    setOrderNotes("");
    setUseMultiplier(false);
    setMultiplierReason("");
    setReceiptFile(null);
    setReceiptPreviewUrl("");
    setReceiptOcrNote("");
    setReceiptUploadInfo(null);
    setReceiptUploadState("not_uploaded");
    setReceiptUploadError("");
    setReceiptOcrData(null);
    setOrderSaveError("");
    setReceiptExtracting(false);
    setDupWarning(null);
    setDupReason("");
    setDupNote("");
    setDupDoctorName("");
  }

  function handleReceiptPhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    setReceiptFile(file);
    setReceiptOcrNote("");
    setReceiptUploadInfo(null);
    setReceiptUploadState(file ? "not_uploaded" : "not_uploaded");
    setReceiptUploadError("");
    setReceiptOcrData(null);
    if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
    setReceiptPreviewUrl(file ? URL.createObjectURL(file) : "");
  }

  async function uploadReceiptPhoto(
    currentInvoiceNumber: string,
  ): Promise<ReceiptUploadInfo | null> {
    if (receiptUploadInfo) return receiptUploadInfo;
    if (!receiptFile || !rider) return null;

    setReceiptUploadState("uploading");
    setReceiptUploadError("");

    const ext = receiptFile.name.split(".").pop()?.toLowerCase() || "jpg";
    const safeInvoice =
      currentInvoiceNumber.replace(/[^a-zA-Z0-9_.-]/g, "_") || "no_invoice";
    const path = `orders/${rider.id}/${activeWorkDate}/${Date.now()}-${safeInvoice}.${ext}`;

    const { error } = await supabase.storage
      .from("delivery-receipts")
      .upload(path, receiptFile, { cacheControl: "3600", upsert: false });

    if (error) {
      setReceiptUploadState(navigator.onLine ? "failed" : "pending_retry");
      setReceiptUploadError(error.message);
      return null;
    }

    const { data } = supabase.storage
      .from("delivery-receipts")
      .getPublicUrl(path);
    const info = {
      path,
      url: data.publicUrl,
      fileName: receiptFile.name,
      fileSize: receiptFile.size,
      mimeType: receiptFile.type || "image/jpeg",
    };
    setReceiptUploadInfo(info);
    setReceiptUploadState("uploaded");
    return info;
  }

  function handleTripProofPhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    setTripProofFile(file);
    setTripProofUploadInfo(null);
    setTripProofUploadState(file ? "not_uploaded" : "not_uploaded");
    setTripProofUploadError("");
    const capturedAt = new Date().toISOString();
    setTripProofCapturedAt(file ? capturedAt : "");
    if (tripProofPreviewUrl) URL.revokeObjectURL(tripProofPreviewUrl);
    setTripProofPreviewUrl(file ? URL.createObjectURL(file) : "");
  }

  async function uploadTripProofPhoto(): Promise<ReceiptUploadInfo | null> {
    if (tripProofUploadInfo) return tripProofUploadInfo;
    if (!tripProofFile || !rider) return null;

    setTripProofUploadState("uploading");
    setTripProofUploadError("");

    const ext = tripProofFile.name.split(".").pop()?.toLowerCase() || "jpg";
    const safeType = String(tripType || "trip").replace(/[^a-zA-Z0-9_.-]/g, "_");
    const path = `trips/${rider.id}/${activeWorkDate}/${Date.now()}-${safeType}.${ext}`;

    const { error } = await supabase.storage
      .from("delivery-receipts")
      .upload(path, tripProofFile, { cacheControl: "3600", upsert: false });

    if (error) {
      setTripProofUploadState(navigator.onLine ? "failed" : "pending_retry");
      setTripProofUploadError(error.message);
      return null;
    }

    const { data } = supabase.storage
      .from("delivery-receipts")
      .getPublicUrl(path);

    const info = {
      path,
      url: data.publicUrl,
      fileName: tripProofFile.name || "camera-proof.jpg",
      fileSize: tripProofFile.size,
      mimeType: tripProofFile.type || "image/jpeg",
    };

    setTripProofUploadInfo(info);
    setTripProofUploadState("uploaded");
    return info;
  }

  function applyReceiptOcrData(extracted: ReceiptOcrExtract) {
    const invoice = normalizeText(extracted.invoice_number);
    const code = normalizeText(extracted.customer_code);
    const name = normalizeText(extracted.customer_name);
    const phone = normalizeText(extracted.customer_phone);
    const address = normalizeText(extracted.customer_address);
    const amount = normalizeText(extracted.invoice_amount);

    if (invoice && !invoiceNumber.trim()) setInvoiceNumber(invoice);
    if (code && !customerCode.trim()) setCustomerCode(code);
    if (name && !customerName.trim()) setCustomerName(name);
    if (phone && !customerPhone.trim()) setCustomerPhone(phone);
    if (address && !customerAddress.trim()) setCustomerAddress(address);
    if (amount && !invoiceAmount.trim())
      setInvoiceAmount(amount.replace(/[^0-9.]/g, ""));

    const doctor = normalizeText(extracted.doctor_name);
    if (doctor && !orderNotes.includes(doctor)) {
      setOrderNotes(
        (prev) =>
          `${prev ? `${prev}\n` : ""}الدكتور/البائع من صورة الفاتورة: ${doctor}`,
      );
    }
  }

  async function handleExtractReceiptData() {
    if (!receiptFile) {
      toast.error("اختار أو صور الريسيت الأول");
      return;
    }
    try {
      setReceiptExtracting(true);
      const uploadInfo = await uploadReceiptPhoto(
        invoiceNumber.trim() || "ocr",
      );
      if (!uploadInfo?.url)
        throw new Error("لم يتم رفع الصورة لاستخراج البيانات");

      const { data, error } = await supabase.functions.invoke(
        "extract-receipt-ocr",
        {
          body: {
            imageUrl: uploadInfo.url,
            imagePath: uploadInfo.path,
            manualNote: receiptOcrNote,
          },
        },
      );

      if (error) throw error;
      const result = (data?.extracted ?? data) as ReceiptOcrExtract;
      if (!result) throw new Error("لم ترجع خدمة OCR أي بيانات");

      setReceiptOcrData(result);
      applyReceiptOcrData(result);
      setReceiptOcrNote((prev) => {
        const confidence =
          typeof result.confidence === "number"
            ? ` — ثقة ${(result.confidence * 100).toFixed(0)}%`
            : "";
        const warnings = result.warnings?.length
          ? `\nتنبيهات: ${result.warnings.join("، ")}`
          : "";
        return `${prev ? `${prev}\n` : ""}تم استخراج البيانات بالذكاء${confidence}.${warnings}`;
      });
      toast.success("تم استخراج بيانات الريسيت ومراجعتها في الخانات ✅");
    } catch (e: any) {
      toast.error("تعذر استخراج بيانات الصورة: " + (e?.message ?? ""));
    } finally {
      setReceiptExtracting(false);
    }
  }
  void handleExtractReceiptData;

  async function handleSaveOrder(isDup = false) {
    if (!rider) return;
    const manualCustomerText = customerSearch.trim();
    const nameForValidation = (
      customerName ||
      selectedCustomer?.name ||
      manualCustomerText
    ).trim();
    const codeForValidation = (
      customerCode ||
      selectedCustomer?.code ||
      ""
    ).trim();
    const phoneForValidation = (
      customerPhone ||
      selectedCustomer?.phone ||
      ""
    ).trim();

    void nameForValidation;
    void codeForValidation;
    void phoneForValidation;
    if (!invoiceNumber.trim()) {
      toast.error("اكتب رقم الفاتورة");
      return;
    }
    // صورة الريسيت اختيارية حاليًا: يتم حفظها لو موجودة وتساعد الإدارة في المراجعة،
    // لكن لا تمنع تسجيل الأوردر في المرحلة الحالية.
    if (useMultiplier && multiplierReason.trim().length < 5) {
      toast.error("اكتب سبب واضح لأوردر ×1.5");
      return;
    }
    if (isDup && !dupReason) {
      toast.error("اختار سبب التكرار");
      return;
    }
    if (isDup && !dupDoctorName.trim()) {
      toast.error("اكتب اسم الدكتور اللي طلع/حضّر الأوردر");
      return;
    }
    if (isDup && dupNote.trim().length < 10) {
      toast.error("اكتب ملاحظة 10 حروف على الأقل");
      return;
    }

    try {
      setSaving(true);
      setOrderSaveError("");

      // Check duplicate (if not already confirmed)
      if (!isDup && navigator.onLine) {
        const { data: existing } = await supabase
          .from("delivery_orders")
          .select(
            "id, invoice_number, registered_at, rider_name, customer_name_snapshot, preparing_doctor_name",
          )
          .eq("invoice_number", invoiceNumber.trim())
          .maybeSingle();
        if (existing) {
          setDupWarning(existing as unknown as DeliveryOrder);
          setActiveModal("duplicate");
          return;
        }
      }

      const multiplier = useMultiplier ? 1.5 : 1;
      const orderRate = 0; // حساب الراتب النهائي غير مفعل حاليًا؛ التسجيل للمراجعة ومنع التلاعب فقط.

      const customerNameForSave = (
        customerName ||
        selectedCustomer?.name ||
        manualCustomerText ||
        customerCode ||
        customerPhone ||
        "عميل غير مسجل"
      ).trim();
      const customerCodeForSave = (
        customerCode ||
        selectedCustomer?.code ||
        ""
      ).trim();
      const customerPhoneForSave = (
        customerPhone ||
        selectedCustomer?.phone ||
        ""
      ).trim();
      const customerAddressForSave = (
        customerAddress ||
        selectedCustomer?.address ||
        ""
      ).trim();
      if (!navigator.onLine)
        throw new Error(
          "تسجيل الأوردرات الآن يحتاج إنترنت عشان يتسجل من خلال RPC آمن ولا يحتسب أي أوردر Offline إلا بعد مراجعة لاحقة",
        );
      let gps: { lat: number | null; lng: number | null; accuracy: number | null } = { lat: null, lng: null, accuracy: null };
      try {
        gps = await requestRiderGps();
      } catch {
        toast.info("تعذر قراءة GPS الآن، سيتم تسجيل الأوردر ومراجعته إذا لزم الأمر");
      }
      const receiptUpload = await uploadReceiptPhoto(invoiceNumber.trim());

      const payload = {
        rider_id: rider.id,
        rider_name: rider.name,
        branch_id: rider.branch_id,
        branch_name: branch?.name ?? rider.branch_name ?? null,
        customer_id: selectedCustomer?.id ?? null,
        delivery_date: todayIso(),
        work_date: activeWorkDate,
        attendance_id: activeAttendanceId,
        invoice_number: invoiceNumber.trim(),
        invoice_no: invoiceNumber.trim(),
        invoice_amount: invoiceAmount ? Number(invoiceAmount) : 0,
        invoice_value: invoiceAmount ? Number(invoiceAmount) : 0,
        customer_code: customerCodeForSave,
        customer_name: customerNameForSave,
        customer_phone: customerPhoneForSave,
        customer_address: customerAddressForSave,
        customer_code_snapshot: customerCodeForSave,
        customer_name_snapshot: customerNameForSave,
        customer_phone_snapshot: customerPhoneForSave,
        customer_address_snapshot: customerAddressForSave,
        manual_customer: !selectedCustomer,
        is_multiplier_order: useMultiplier,
        preparing_doctor_name: isDup ? dupDoctorName.trim() : null,
        review_status:
          isDup || useMultiplier || !selectedCustomer ? "pending" : "pending",
        approval_status: "pending",
        duplicate_warning: isDup,
        created_source: "rider_app",
        status: "registered",
        registered_at: new Date().toISOString(),
        prepared_at: new Date().toISOString(),
        ready_at: new Date().toISOString(),
        dispatched_at: new Date().toISOString(),
        dispatch_status: "dispatched",
        dispatch_by: rider.id,
        dispatch_by_name: rider.name,
        picked_up_at: new Date().toISOString(),
        picked_up_by: rider.id,
        picked_up_by_name: rider.name,
        dispatch_notes:
          "تم تسجيل الأوردر من تطبيق الدليفري؛ يعتبر خارجًا من الفرع وقت التسجيل.",
        notes: orderNotes || null,
        receipt_image_path: receiptUpload?.path ?? null,
        receipt_image_url: receiptUpload?.url ?? null,
        receipt_file_name: receiptUpload?.fileName ?? null,
        receipt_file_size: receiptUpload?.fileSize ?? null,
        receipt_mime_type: receiptUpload?.mimeType ?? null,
        receipt_ocr_status: receiptUpload
          ? receiptOcrData
            ? "extracted"
            : "pending_ocr"
          : "not_uploaded",
        receipt_ocr_note: receiptOcrNote.trim() || null,
        receipt_ocr_json: receiptOcrData ?? null,
        receipt_ocr_confidence: receiptOcrData?.confidence ?? null,
        receipt_extracted_invoice_no: receiptOcrData?.invoice_number ?? null,
        receipt_extracted_customer_code: receiptOcrData?.customer_code ?? null,
        receipt_extracted_customer_name: receiptOcrData?.customer_name ?? null,
        receipt_extracted_customer_phone:
          receiptOcrData?.customer_phone ?? null,
        receipt_extracted_address: receiptOcrData?.customer_address ?? null,
        receipt_extracted_doctor_name: receiptOcrData?.doctor_name ?? null,
        receipt_review_status: receiptOcrData
          ? "pending_admin_review"
          : receiptUpload
            ? "pending_ocr"
            : "not_required",
        source: "rider_app",
        is_duplicate_invoice: isDup,
        duplicate_reason: isDup ? dupReason : null,
        duplicate_note: isDup ? dupNote : null,
        original_order_id: isDup ? (dupWarning?.id ?? null) : null,
        duplicate_review_status: isDup ? "pending" : "not_required",
        needs_review: isDup,
        review_reason: isDup ? "duplicate_invoice" : null,
        order_multiplier: multiplier,
        order_rate: orderRate,
        order_earning: 0,
        multiplier_reason: multiplier > 1 ? multiplierReason.trim() : null,
        bconnect_match_status: "pending",
        is_countable: true,
        final_count_status: "pending_reconciliation",
        count_exclusion_reason: null,
      };

      let data: any = null;
      const token = getStoredRiderToken();
      if (!token)
        throw new Error("انتهت الجلسة. سجل دخول مرة أخرى من تطبيق الدليفري.");
      const { data: secureData, error: secureError } = await supabase.rpc(
        "rider_create_order",
        {
          p_token: token,
          p_customer_id: selectedCustomer?.id ?? null,
          p_customer_code: customerCodeForSave || null,
          p_customer_name: customerNameForSave,
          p_customer_phone: customerPhoneForSave || null,
          p_customer_address: customerAddressForSave || null,
          p_invoice_number: invoiceNumber.trim(),
          p_invoice_amount: invoiceAmount ? Number(invoiceAmount) : 0,
          p_order_multiplier: multiplier,
          p_notes: orderNotes || null,
          p_gps_lat: gps.lat,
          p_gps_lng: gps.lng,
          p_gps_accuracy_m: gps.accuracy,
          p_receipt_image_path: receiptUpload?.path ?? null,
          p_receipt_image_url: receiptUpload?.url ?? null,
          p_receipt_ocr_json: receiptOcrData ?? null,
        },
      );
      const result = getRpcResult<any>(secureData);
      if (secureError) throw secureError;
      if (!result?.success)
        throw new Error(
          result?.message || result?.error || "رفض السيرفر تسجيل الأوردر",
        );
      data = {
        ...payload,
        id: result.order_id,
        work_date: result.work_date || activeWorkDate,
        attendance_id: result.attendance_id || activeAttendanceId,
        is_duplicate_invoice: !!result.is_duplicate,
        needs_review: !!result.needs_review || payload.needs_review,
        review_reason: result.review_reason || payload.review_reason,
        receipt_upload_status: receiptUpload ? "uploaded" : receiptFile ? (navigator.onLine ? "failed" : "pending_retry") : "not_uploaded",
        receipt_uploaded_at: receiptUpload ? new Date().toISOString() : null,
        receipt_upload_error: receiptUpload ? null : receiptFile ? (receiptUploadError || "تعذر رفع الريسيت") : null,
      };

      if (receiptFile) {
        void supabase.rpc("rider_update_order_before_delivery", {
          p_token: token,
          p_order_id: String(data.id),
          p_patch: {
            receipt_image_url: receiptUpload?.url || null,
            receipt_image_path: receiptUpload?.path || null,
            receipt_upload_status: receiptUpload ? "uploaded" : navigator.onLine ? "failed" : "pending_retry",
            receipt_upload_error: receiptUpload ? "" : (receiptUploadError || "تعذر رفع الريسيت"),
          },
          p_edit_reason: "تحديث حالة رفع الريسيت بعد تسجيل الأوردر",
        });
      }

      setOrders((prev) => [data as DeliveryOrder, ...prev]);
      setCycleOrders((prev) => [data as DeliveryOrder, ...prev]);
      void loadAll(false);
      toast.success(result?.message || (isDup ? "تم تسجيل الأوردر ويحتاج إلى مراجعة" : "تم تسجيل الأوردر بنجاح"));
      if (receiptFile && !receiptUpload) toast.warning("تم حفظ الأوردر، وفشل رفع الريسيت. يمكنك إعادة رفعه من زر تعديل الأوردر.");
      if (customerPhoneForSave) {
        const digits = customerPhoneForSave.replace(/\D/g, "");
        const normalizedPhone = digits.startsWith("2") ? digits : `2${digits}`;
        const messageText = `أهلاً ${customerNameForSave}، طلبك من صيدلية دواء في الطريق إليك الآن. رقم الفاتورة: ${invoiceNumber.trim()}`;
        window.open(`https://api.whatsapp.com/send?phone=${normalizedPhone}&text=${encodeURIComponent(messageText)}`, "_blank", "noopener,noreferrer");
        void supabase.rpc("rider_log_customer_notification", {
          p_token: token,
          p_order_id: data.id,
          p_recipient_phone: normalizedPhone,
          p_message_preview: messageText,
        });
      }
      setActiveModal(null);
      resetOrderForm();
    } catch (e: any) {
      setOrderSaveError(e?.message || "حدث خطأ شبكة. بياناتك ما زالت محفوظة ويمكن إعادة المحاولة.");
      toast.error("تعذر تسجيل الأوردر: " + (e?.message ?? ""));
    } finally {
      setSaving(false);
    }
  }

  // ── TRIP FORM ─────────────────────────────────────────────────────────────
  function resetTripForm() {
    setTripType("branch_to_branch");
    setFromLabel("");
    setToLabel("");
    setCustomToLabel("");
    setTripReason("");
    setRelatedInvoice("");
    setTripRequesterName("");
    setTripProofType("invoice");
    setTripProofNote("");
    setTripProofFile(null);
    setTripProofUploadInfo(null);
    setTripProofUploadState("not_uploaded");
    setTripProofUploadError("");
    setTripProofCapturedAt("");
    setAllowTripProofException(false);
    setTripProofExceptionReason("");
    if (tripProofPreviewUrl) URL.revokeObjectURL(tripProofPreviewUrl);
    setTripProofPreviewUrl("");
  }

  function applyTripTypeDefaults(nextType: InternalTrip["trip_type"]) {
    const currentBranch = normalizeBranchLabel(
      branch?.name ?? rider?.branch_name,
    );
    setTripType(nextType);
    setCustomToLabel("");
    if (nextType === "branch_to_branch") {
      setFromLabel(currentBranch || BRANCH_DESTINATIONS[0]);
      setToLabel(
        BRANCH_DESTINATIONS.find((b) => b !== currentBranch) ??
          BRANCH_DESTINATIONS[1] ??
          "",
      );
    } else if (nextType === "warehouse") {
      setFromLabel(currentBranch || BRANCH_DESTINATIONS[0]);
      setToLabel(destinationLabelWithCode(WAREHOUSE_DESTINATIONS[0]));
    } else if (nextType === "supplies") {
      setFromLabel(currentBranch || BRANCH_DESTINATIONS[0]);
      setToLabel(SUPPLIES_DESTINATIONS[0]);
    } else if (nextType === "accessories") {
      setFromLabel(currentBranch || BRANCH_DESTINATIONS[0]);
      setToLabel(ACCESSORY_DESTINATIONS[0]);
    } else if (nextType === "pharmacy") {
      setFromLabel(currentBranch || BRANCH_DESTINATIONS[0]);
      setToLabel("");
    } else if (nextType === "shipment_pickup") {
      setFromLabel("شركة الشحن / مكان الاستلام");
      setToLabel(currentBranch || BRANCH_DESTINATIONS[0]);
    } else {
      setFromLabel("");
      setToLabel("");
    }
  }

  async function handleSaveTrip() {
    if (!rider) return;
    const finalToLabel =
      toLabel === "custom" ? customToLabel.trim() : toLabel.trim();
    const finalFromLabel = fromLabel.trim();

    if (!finalFromLabel || !finalToLabel) {
      toast.error("اختار أو اكتب من وإلى");
      return;
    }
    if (tripType === "branch_to_branch" && finalFromLabel === finalToLabel) {
      toast.error("يرجى اختيار فرعين مختلفين");
      return;
    }
    const exceptionReason = tripProofExceptionReason.trim();
    if (!allowTripProofException && !tripProofFile && !tripProofUploadInfo) {
      toast.error("لا يمكن حفظ المشوار بدون تصوير إثبات. لو لم تجد الصنف اختر استثناء واكتب السبب.");
      return;
    }
    if (allowTripProofException && exceptionReason.length < 8) {
      toast.error("اكتب سبب الاستثناء بوضوح، مثال: دورت على الصنف ومش موجود.");
      return;
    }

    try {
      setSaving(true);
      const tripProofUpload = allowTripProofException ? null : await uploadTripProofPhoto();
      if (!allowTripProofException && !tripProofUpload) {
        throw new Error(tripProofUploadError || "تعذر رفع صورة إثبات المشوار. حاول التصوير مرة أخرى.");
      }
      const nowIso = new Date().toISOString();
      const proofCapturedAt = tripProofCapturedAt || nowIso;
      const tripRate = rider.trip_rate ?? 10;
      const payload = {
        rider_id: rider.id,
        rider_name: rider.name,
        branch_id: rider.branch_id,
        branch_name: branch?.name ?? rider.branch_name ?? null,
        trip_date: todayIso(),
        work_date: activeWorkDate,
        attendance_id: activeAttendanceId,
        trip_type: tripType,
        from_label: finalFromLabel,
        to_label: finalToLabel,
        reason: tripReason.trim() || "مشوار بدون سبب تفصيلي",
        related_invoice_number: relatedInvoice || null,
        has_invoice_reference: Boolean(relatedInvoice.trim()),
        requested_by_name: tripRequesterName.trim() || null,
        evidence_type: relatedInvoice.trim()
          ? (tripProofUpload ? "invoice_photo" : "invoice")
          : tripProofUpload ? "trip_photo" : "exception",
        evidence_note: tripProofNote.trim() || null,
        evidence_status: tripProofUpload ? "pending_admin_review" : "exception_review",
        proof_required: !allowTripProofException,
        proof_image_url: tripProofUpload?.url ?? null,
        proof_note: tripProofNote.trim() || null,
        proof_captured_at: tripProofUpload ? proofCapturedAt : null,
        proof_uploaded_at: tripProofUpload ? nowIso : null,
        proof_source: tripProofUpload ? "camera" : "exception",
        proof_review_status: tripProofUpload ? "pending" : "exception_review",
        proof_exception_status: allowTripProofException ? "pending" : "none",
        proof_exception_reason: allowTripProofException ? exceptionReason : null,
        needs_review: !isShiftOpen || allowTripProofException,
        review_reason: !isShiftOpen ? "missing_shift" : allowTripProofException ? "trip_proof_exception" : null,
        review_status: relatedInvoice.trim()
          ? "pending_evidence_review"
          : !isShiftOpen ? "missing_shift" : allowTripProofException ? "exception_review" : "pending",
        notes: `نوع المشوار: ${TRIP_TYPE_LABELS[tripType] ?? tripType}${tripRequesterName.trim() ? ` | طالب المشوار: ${tripRequesterName.trim()}` : ""}${tripReason.trim() ? ` | السبب: ${tripReason.trim()}` : ""}${relatedInvoice.trim() ? ` | فاتورة/إذن: ${relatedInvoice.trim()}` : ""}${tripProofNote.trim() ? ` | ملاحظة: ${tripProofNote.trim()}` : ""}`,
        status: "pending_approval",
        registered_at: new Date().toISOString(),
        trip_rate: tripRate,
        trip_multiplier: 1,
        trip_earning: tripRate,
      };

      if (!navigator.onLine) {
        const offline = enqueueOfflineMutation({
          table: "internal_trips",
          action: "insert",
          payload: {
            ...payload,
            offline_created_at: new Date().toISOString(),
            offline_sync_status: "pending",
          },
          label: `مشوار ${finalFromLabel} إلى ${finalToLabel}`,
        });
        setTrips((prev) => [
          {
            ...(payload as any),
            id: offline.id,
            offline_sync_status: "pending",
          } as InternalTrip,
          ...prev,
        ]);
        toast.success(
          "تم حفظ المشوار مؤقتًا وسيتم رفعه تلقائيًا عند رجوع الإنترنت",
        );
        setActiveModal(null);
        resetTripForm();
        return;
      }

      const { data, error } = await supabase
        .from("internal_trips")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw error;
      setTrips((prev) => [data as InternalTrip, ...prev]);
      toast.success("تم تسجيل المشوار وهو بانتظار الاعتماد");
      setActiveModal(null);
      resetTripForm();
    } catch (e: any) {
      console.error(e);
      toast.error("تعذر تسجيل المشوار: " + (e?.message ?? ""));
    } finally {
      setSaving(false);
    }
  }

  // ── ORDER STATUS ──────────────────────────────────────────────────────────
  async function handlePickedUp(orderId: string) {
    if (!rider) return;
    try {
      const pickedAt = new Date().toISOString();
      const { data, error } = await supabase
        .from("delivery_orders")
        .update({
          picked_up_at: pickedAt,
          picked_up_by: rider.id,
          picked_up_by_name: rider.name,
          dispatch_status: "picked_up",
          updated_at: pickedAt,
        })
        .eq("id", orderId)
        .select("*")
        .single();
      if (error) throw error;
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? (data as DeliveryOrder) : o)),
      );
      toast.success("تم تسجيل استلام الأوردر من الفرع ✅");
    } catch {
      toast.error("تعذر تسجيل استلام الأوردر");
    }
  }

  async function handleDelivered(orderId: string) {
    try {
      const token = getStoredRiderToken();
      if (!token) throw new Error("انتهت الجلسة");
      const { data, error } = await supabase.rpc("rider_mark_order_delivered", { p_token: token, p_order_id: String(orderId) });
      const result = getRpcResult<any>(data);
      if (error || !result?.success) throw new Error(error?.message || result?.message || "تعذر تأكيد التسليم");
      const updated = result.order as DeliveryOrder;
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      setCycleOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      toast.success(result.message || "تم تأكيد التسليم بنجاح");
    } catch (e: any) {
      toast.error(e?.message || "فشل تحديث الأوردر");
    }
  }


  async function handleFailed() {
    if (!failOrderId || !failReason.trim()) {
      toast.error("اكتب سبب الفشل");
      return;
    }
    try {
      const token = getStoredRiderToken();
      if (!token) throw new Error("انتهت الجلسة");
      const { data, error } = await supabase.rpc("rider_mark_order_failed", { p_token: token, p_order_id: String(failOrderId), p_reason: failReason.trim() });
      const result = getRpcResult<any>(data);
      if (error || !result?.success) throw new Error(error?.message || result?.message || "تعذر تسجيل الفشل");
      const updated = result.order as DeliveryOrder;
      setOrders((prev) => prev.map((o) => (o.id === failOrderId ? updated : o)));
      setCycleOrders((prev) => prev.map((o) => (o.id === failOrderId ? updated : o)));
      toast.success(result.message || "تم تسجيل فشل التوصيل للمراجعة");
      setActiveModal(null);
      setFailOrderId(null);
      setFailReason("");
    } catch (e: any) {
      toast.error(e?.message || "فشل تحديث الأوردر");
    }
  }

  function openEditOrder(order: DeliveryOrder) {
    if (["delivered", "تم التسليم"].includes(String(order.status).toLowerCase())) return toast.error("لا يمكن تعديل أوردر تم تسليمه");
    setEditOrder(order);
    setEditDraft({ invoice_number: order.invoice_number || "", customer_name: order.customer_name_snapshot || "", customer_code: order.customer_code_snapshot || "", customer_phone: order.customer_phone_snapshot || "", customer_address: order.customer_address_snapshot || "", invoice_amount: String(order.invoice_amount || ""), order_multiplier: Number(order.order_multiplier || 1), multiplier_reason: order.multiplier_reason || "", notes: order.notes || "", receipt_image_url: (order as any).receipt_image_url, receipt_image_path: (order as any).receipt_image_path, receipt_upload_status: (order as any).receipt_upload_status || "not_uploaded" });
    setEditReason(""); setEditReceiptFile(null); setEditReceiptState(((order as any).receipt_upload_status || "not_uploaded") as ReceiptUploadState); setActiveModal("edit_order");
  }

  async function uploadEditReceipt() {
    if (!editOrder || !editDraft || !editReceiptFile || !rider) return;
    setEditReceiptState("uploading");
    const ext = editReceiptFile.name.split(".").pop() || "jpg";
    const path = `orders/${rider.id}/${activeWorkDate}/${Date.now()}-edit.${ext}`;
    const { error } = await supabase.storage.from("delivery-receipts").upload(path, editReceiptFile, { cacheControl: "3600", upsert: false });
    if (error) { setEditReceiptState(navigator.onLine ? "failed" : "pending_retry"); return toast.error("فشل رفع الريسيت، حاول مرة أخرى"); }
    const { data } = supabase.storage.from("delivery-receipts").getPublicUrl(path);
    setEditDraft(v => v ? { ...v, receipt_image_url: data.publicUrl, receipt_image_path: path, receipt_upload_status: "uploaded" } : v);
    setEditReceiptState("uploaded"); toast.success("تم رفع الريسيت بنجاح ✅");
  }

  async function handleSaveEditOrder() {
    if (!editOrder || !editDraft || !editDraft.invoice_number.trim()) return toast.error("رقم الفاتورة مطلوب");
    setSaving(true);
    try {
      const token = getStoredRiderToken(); if (!token) throw new Error("انتهت الجلسة");
      const { data, error } = await supabase.rpc("rider_update_order_before_delivery", { p_token: token, p_order_id: String(editOrder.id), p_patch: { ...editDraft, invoice_amount: Number(editDraft.invoice_amount || 0), receipt_upload_status: editReceiptState }, p_edit_reason: editReason || "تعديل من تطبيق الدليفري" });
      const result = getRpcResult<any>(data); if (error || !result?.success) throw new Error(error?.message || result?.message || "تعذر تعديل الأوردر");
      const updated = result.order as DeliveryOrder; setOrders(v => v.map(o => o.id === editOrder.id ? updated : o)); setCycleOrders(v => v.map(o => o.id === editOrder.id ? updated : o)); toast.success("تم تعديل الأوردر بنجاح"); setActiveModal("orders"); setEditOrder(null); setEditDraft(null);
    } catch (e: any) { toast.error(e?.message || "تعذر تعديل الأوردر"); } finally { setSaving(false); }
  }

  // ── LOADING / NO RIDER ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-[#F3F7F8]"
        dir="rtl"
      >
        <div className="text-center">
          <img
            src="/logo.png"
            className="mx-auto mb-4 h-20 w-20 rounded-2xl object-contain shadow-lg"
            alt="دواء"
          />
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#008E92] border-t-transparent mx-auto" />
          <p className="mt-3 font-bold text-slate-500">جاري تحميل بياناتك...</p>
        </div>
      </div>
    );
  }

  if (!rider) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-[#F3F7F8] p-4"
        dir="rtl"
      >
        <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-xl">
          <img
            src="/logo.png"
            className="mx-auto mb-4 h-20 w-20 rounded-2xl object-contain"
            alt="دواء"
          />
          <p className="text-xl font-black text-red-700">
            جلسة الدخول غير مكتملة
          </p>
          <p className="mt-2 text-slate-500">
            لم يتم العثور على حساب الدليفري المرتبط بهذا المستخدم. برجاء تسجيل
            الدخول مرة أخرى، أو يرجى التواصل مع الإدارة.
          </p>
          <button
            onClick={() => {
              supabase.auth.signOut();
              navigate("/login");
            }}
            className="mt-6 w-full rounded-2xl bg-[#008E92] py-3 font-black text-white"
          >
            تسجيل الدخول
          </button>
        </div>
      </div>
    );
  }

  const attText = !attendance?.check_in_at
    ? "لم يتم بدء الشيفت بعد"
    : !attendance.check_out_at
      ? `شيفت ${activeWorkDate}: حضور ${formatTime(attendance.check_in_at)}`
      : `شيفت ${activeWorkDate}: حضور ${formatTime(attendance.check_in_at)} — انصراف ${formatTime(attendance.check_out_at)}`;

  const attBtnText = !attendance?.check_in_at
    ? "بدء الشيفت"
    : !attendance.check_out_at
      ? "إنهاء الشيفت"
      : "تم إنهاء الشيفت";

  const approvedDeductions = riderActions.filter(
    (a) =>
      String(a.review_status || "") === "approved" &&
      ["deduction", "deduction_request"].includes(
        String(a.final_action_type || a.action_type || ""),
      ),
  );
  const approvedRewards = riderActions.filter(
    (a) =>
      String(a.review_status || "") === "approved" &&
      ["reward", "reward_request", "bonus_request"].includes(
        String(a.final_action_type || a.action_type || ""),
      ),
  );
  const pendingActions = riderActions.filter((a) =>
    String(a.review_status || "").includes("pending"),
  );
  const notificationCount =
    riderNotifications.length +
    dups +
    failedOrders +
    mult15 +
    pendingActions.length;
  const deductionsAmount = approvedDeductions.reduce(
    (sum, a) => sum + Number(a.final_amount ?? a.requested_amount ?? 0),
    0,
  );
  const rewardsAmount = approvedRewards.reduce(
    (sum, a) => sum + Number(a.final_amount ?? a.requested_amount ?? 0),
    0,
  );
  const lastActionReason =
    riderActions[0]?.summary ||
    riderActions[0]?.general_manager_note ||
    "لا توجد ملاحظات مسجلة";
  const latestPermission = riderPermissions[0];
  const permissionSummary = latestPermission
    ? `${latestPermission.exception_type === "leave" ? "إجازة" : "إذن"}: ${latestPermission.reason || "بدون سبب مسجل"}`
    : "لا توجد أذونات مسجلة";

  const cycleTrendValues = (() => {
    const start = new Date(period.start + "T00:00:00");
    const end = new Date(
      Math.min(
        new Date(period.end + "T00:00:00").getTime(),
        new Date().getTime(),
      ),
    );
    const days: { iso: string; label: string; value: number }[] = [];
    for (
      let d = new Date(start);
      d <= end && days.length < 40;
      d.setDate(d.getDate() + 1)
    ) {
      const iso = d.toISOString().slice(0, 10);
      const ordersCount = safeCycleOrders.filter(
        (o: any) =>
          ((o as any).work_date || o.delivery_date ||
            String(o.registered_at || o.created_at || "").slice(0, 10)) === iso,
      ).length;
      const tripsCount = safeCycleTrips.filter(
        (t: any) =>
          (t.trip_date ||
            String(t.registered_at || t.created_at || "").slice(0, 10)) === iso,
      ).length;
      days.push({
        iso,
        label: d.toLocaleDateString("ar-EG", {
          day: "numeric",
          month: "numeric",
        }),
        value: ordersCount + tripsCount,
      });
    }
    if (days.length <= 10) return days;
    const step = Math.ceil(days.length / 10);
    return days
      .filter((_, i) => i % step === 0 || i === days.length - 1)
      .slice(-10);
  })();

  // ── RENDER ────────────────────────────────────────────────────────────────
  async function handleDeviceLogout() {
    await logout();
    navigate("/rider-login", { replace: true });
  }

  return (
    <>
      <PwaInstallPrompt />
      <div className="min-h-screen bg-[#F7FBFC] pb-10" dir="rtl">
        {/* MOBILE APP HEADER - premium mobile design */}
        <header className="relative mx-auto max-w-[980px] overflow-hidden rounded-b-[42px] bg-gradient-to-l from-[#061827] via-[#006A70] to-[#009A9E] px-5 pb-12 pt-6 text-white shadow-[0_18px_45px_rgba(6,24,39,0.25)]">
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 20%, white 0 1px, transparent 1px)",
              backgroundSize: "22px 22px",
            }}
          />
          <div className="relative flex items-center justify-between gap-4">
            <div className="flex gap-2"><button onClick={() => void handleDeviceLogout()} className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 text-white backdrop-blur" aria-label="تسجيل خروج من هذا الجهاز"><LogOut size={18}/></button><button
                onClick={() => setActiveModal("notifications")}
                className="relative grid h-11 w-11 place-items-center rounded-2xl bg-white/10 text-white backdrop-blur transition active:scale-95"
                aria-label="التنبيهات"
              ><span className="text-xl">🔔</span>{notificationCount > 0 && <span className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-rose-500 ring-2 ring-white" />}</button></div>

            <div className="flex flex-1 items-center justify-end gap-5">
              <div className="hidden items-center gap-4 border-r border-white/35 pr-5 sm:flex">
                <div className="text-right">
                  <p className="text-xl font-black leading-6">صيدليات دواء</p>
                  <p className="mt-1 text-xs font-bold text-teal-50/90">
                    Dawaa Pharmacy
                  </p>
                </div>
                <img
                  src="/logo.png"
                  className="h-16 w-16 rounded-3xl border-2 border-white/70 bg-white object-contain p-1 shadow-xl"
                  alt="شعار صيدليات دواء"
                />
              </div>

              <div className="flex items-center gap-4 text-right">
                <div className="grid h-[72px] w-[72px] place-items-center overflow-hidden rounded-full border-[5px] border-white/70 bg-gradient-to-br from-teal-100 to-white shadow-xl">
                  <span className="text-4xl">🧑‍✈️</span>
                </div>
                <div>
                  <p className="text-sm font-bold text-teal-50">مرحباً بك</p>
                  <div className="mt-1 flex items-center justify-end gap-2">
                    <h1 className="text-2xl font-black tracking-tight">
                      {rider.name || "أحمد السعيد"}
                    </h1>
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-white/15 text-xs">
                      🛡️
                    </span>
                  </div>
                  <p className="mt-2 inline-flex rounded-full bg-white/12 px-4 py-1 text-xs font-black text-teal-50 shadow-inner">
                    شريك توصيل
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="relative mt-5 flex items-center justify-center gap-2 text-sm font-black text-teal-50">
            <span>{branch?.name ?? rider.branch_name ?? "الفرع"}</span>
            <span>•</span>
            <span>
              {new Date().toLocaleDateString("ar-EG", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </span>
          </div>
        </header>

        <main className="relative z-10 mx-auto -mt-8 max-w-[980px] space-y-5 px-4 pb-24">
          <ConnectivitySyncBanner />
          <LiveEarningsBar
            deliveredCount={delivered}
            orderRate={Number(rider.order_rate || 0)}
            approvedTrips={safeTrips.filter(t => ["approved", "completed"].includes(t.status)).length}
            tripRate={Number(rider.trip_rate || 0)}
            hoursWorked={Number((attendance as any)?.total_minutes || ((attendance as any)?.check_in_at ? (new Date((attendance as any)?.check_out_at || Date.now()).getTime() - new Date((attendance as any).check_in_at).getTime()) / 60000 : 0)) / 60}
            hourlyRate={Number(rider.hourly_rate || 0)}
          />
          <RiderDeviceMonitor
            riderId={rider?.id}
            riderName={rider?.name}
            branchId={rider?.branch_id}
            branchName={branch?.name ?? rider?.branch_name}
          />
          {/* Attendance status */}
          <section className="rounded-[30px] border border-teal-100 bg-white/95 p-4 shadow-[0_15px_35px_rgba(6,24,39,0.10)] backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#EAF8F8] text-xl">
                  🛡️
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-base font-black text-[#006C70]">
                      حالة الحضور: {attText}
                    </p>
                    <span
                      className={`h-3 w-3 rounded-full ${attendance?.check_in_at && !attendance?.check_out_at ? "bg-emerald-500" : attendance?.check_out_at ? "bg-slate-400" : "bg-rose-500"}`}
                    />
                  </div>
                </div>
              </div>
              <button
                onClick={handleCheckInOut}
                disabled={
                  saving ||
                  !!(attendance?.check_in_at && attendance?.check_out_at)
                }
                className="rounded-2xl bg-[#EAF8F8] px-4 py-3 text-sm font-black text-[#008E92] transition active:scale-95 disabled:opacity-50"
              >
                {saving ? "جاري الحفظ..." : attBtnText}
              </button>
            </div>
            {attendance?.check_in_at && !attendance?.check_out_at && (
              <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-xs font-black text-amber-800">
                يجب تسجيل الانصراف في نهاية الشيفت حتى يتم احتساب ساعات الحضور
                بدقة.
              </p>
            )}
          </section>

          {/* Primary actions */}
          <section className="grid grid-cols-1 gap-4 md:grid-cols-[0.82fr_1fr_1fr]">
            <div className="grid grid-cols-1 gap-4">
              <ActionMini
                title={attendance?.check_in_at && !attendance?.check_out_at ? "إنهاء الشيفت" : "بدء الشيفت"}
                subtitle="كل الأوردرات أثناء الشيفت تتحسب على يوم بداية الشيفت حتى بعد 12 بالليل"
                icon="👆"
                onClick={handleCheckInOut}
              />
              <ActionMini
                title="تسجيل إذن"
                subtitle="طلب إذن لمدة محددة"
                icon="🪪"
                onClick={() =>
                  toast.info("يتم تسجيل الإذن من الإدارة أو مدير الفرع حالياً")
                }
              />
            </div>
            <ActionHero
              title="تسجيل أوردر سريع"
              subtitle={isShiftOpen ? `يتحسب على شيفت ${activeWorkDate}` : "يمكن التسجيل الآن وسيظهر للإدارة للمراجعة"}
              icon="🛍️"
              onClick={() => {
                setActiveModal("order");
              }}
            />
            <ActionHero
              title="تسجيل مشوار"
              subtitle={isShiftOpen ? `يتحسب على شيفت ${activeWorkDate}` : "يمكن التسجيل وسيتم ربطه إداريًا"}
              icon="🛵"
              onClick={() => {
                applyTripTypeDefaults("branch_to_branch");
                setActiveModal("trip");
              }}
            />
          </section>
          {openOrderRows.length > 0 && (
            <section className={`rounded-[26px] border p-4 shadow-sm ${oldestOpenMinutes >= 90 ? "border-rose-200 bg-rose-50" : oldestOpenMinutes >= 45 ? "border-amber-200 bg-amber-50" : "border-sky-100 bg-white"}`}>
              <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black text-slate-500">أوردرات لم يتم التسليم</p><p className="mt-1 text-3xl font-black text-[#061827]">{openOrderRows.length}</p><p className={`mt-1 text-xs font-bold ${oldestOpenMinutes >= 90 ? "text-rose-700" : oldestOpenMinutes >= 45 ? "text-amber-700" : "text-slate-400"}`}>أقدم أوردر مفتوح منذ {oldestOpenMinutes} دقيقة</p></div><button onClick={() => openOrders("pending", "الأوردرات المفتوحة")} className="rounded-2xl bg-[#008E92] px-5 py-3 text-sm font-black text-white">عرض الأوردرات المفتوحة</button></div>
            </section>
          )}
          {missingShiftOrders > 0 && (
            <p className="rounded-2xl border border-sky-100 bg-sky-50 p-3 text-center text-xs font-black text-sky-700">
              يوجد {missingShiftOrders} أوردر قيد مراجعة إدارية بسبب عدم وضوح الشيفت — تم تسجيلهم ولن يضيعوا.
            </p>
          )}

          {/* Daily summary */}
          <section className="rounded-[28px] border border-slate-100 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-black text-[#061827]">ملخص اليوم</h2>
              <button
                onClick={() => openOrders("all", "كل أوردرات اليوم")}
                className="text-xs font-black text-[#008E92]"
              >
                عرض الكل
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
              <MetricCard
                label="أوردرات مضاعفة"
                sub="(1.5x)"
                value={mult15}
                icon="1.5x"
                tone="purple"
                onClick={() =>
                  openOrders("multiplier", "أوردرات ×1.5 للمراجعة")
                }
              />
              <MetricCard
                label="مشاوير اليوم"
                value={todayTotalTrips}
                icon="🛣️"
                tone="blue"
                onClick={() => openTrips("all", "كل مشاوير اليوم")}
              />
              <MetricCard
                label="أوردرات اليوم"
                value={todayTotalOrders}
                icon="📋"
                tone="green"
                onClick={() => openOrders("all", "كل أوردرات اليوم")}
              />
              <MetricCard
                label="خرجت من الفرع"
                sub="بتوقيت الخروج"
                value={dispatchedTodayOrders}
                icon="🛵"
                tone="blue"
                onClick={() =>
                  openOrders("all", "الأوردرات التي خرجت من الفرع")
                }
              />
              <MetricCard
                label="لم تخرج بعد"
                sub="تحتاج متابعة"
                value={notDispatchedOrders}
                icon="⏳"
                tone="orange"
                onClick={() => openOrders("pending", "أوردرات لم تخرج بعد")}
              />
              <MetricCard
                label="قيد المراجعة"
                sub="بانتظار التحقق"
                value={pendingOrders}
                icon="⏱️"
                tone="orange"
                onClick={() => openOrders("pending", "الأوردرات قيد المراجعة")}
              />
              <MetricCard
                label="فاشلة"
                sub="لا تُحتسب"
                value={failedOrders}
                icon="✕"
                tone="red"
                onClick={() =>
                  openOrders("failed", "الأوردرات الفاشلة لا تحتسب")
                }
              />
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-100 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-black text-[#061827]">آخر الأوردرات</h2><button onClick={() => openOrders("all", "كل أوردرات الشيفت")} className="text-xs font-black text-[#008E92]">عرض الكل</button></div>
            <div className="space-y-2">{safeOrders.slice(0, 5).map((o: any) => <div key={o.id} className="rounded-2xl bg-slate-50 p-3"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-black">فاتورة {o.invoice_number || o.invoice_no}</p><p className="truncate text-[10px] font-bold text-slate-400">{o.customer_name_snapshot || o.customer_name || "عميل غير محدد"}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-black ${o.review_status === "missing_shift" ? "bg-sky-100 text-sky-700" : o.status === "delivered" ? "bg-emerald-100 text-emerald-700" : o.status === "failed" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>{o.review_status === "missing_shift" ? "مراجعة بسيطة" : ORDER_STATUS_LABELS[o.status] || o.status}</span></div><div className="mt-2 flex items-center justify-between"><span className={`text-[10px] font-black ${(o.receipt_upload_status === "uploaded" || o.receipt_image_url) ? "text-emerald-700" : o.receipt_upload_status === "failed" ? "text-rose-600" : "text-slate-400"}`}>{(o.receipt_upload_status === "uploaded" || o.receipt_image_url) ? "ريسيت مرفوع ✅" : o.receipt_upload_status === "failed" ? "فشل رفع الريسيت ⚠️" : "بدون ريسيت"}</span>{!["delivered", "تم التسليم"].includes(String(o.status).toLowerCase()) && <button onClick={() => openEditOrder(o)} className="rounded-lg bg-white px-3 py-1.5 text-[10px] font-black text-teal-700">تعديل</button>}</div></div>)}{!safeOrders.length && <p className="py-5 text-center text-xs font-bold text-slate-400">لم تسجل أوردرات في الشيفت الحالي</p>}</div>
          </section>

          {/* Cycle summary */}
          <section className="rounded-[28px] border border-slate-100 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-black text-[#061827]">ملخص الدورة</h2>
              <button
                onClick={() => setActiveModal("pay")}
                className="text-xs font-black text-[#008E92]"
              >
                عرض التفاصيل
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-xs font-black text-slate-500">
                  إجمالي الأوردرات
                </p>
                <p className="mt-2 text-3xl font-black text-[#061827]">
                  {cycleTotalOrders}
                </p>
                <p className="text-xs text-slate-400">
                  مسلمة: {cycleDeliveredOrders} · ×1.5: {cycleMultiplierOrders}{" "}
                  · فاشلة: {cycleFailedOrders}
                </p>
              </div>
              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-xs font-black text-slate-500">
                  إجمالي المشاوير
                </p>
                <p className="mt-2 text-3xl font-black text-[#061827]">
                  {cycleTotalTrips}
                </p>
                <p className="text-xs text-slate-400">مشوار</p>
              </div>
              <div className="rounded-3xl bg-slate-50 p-4 text-center">
                <p className="text-xs font-black text-slate-500">التقدم</p>
                <div className="mx-auto mt-2 grid h-20 w-20 place-items-center rounded-full border-[10px] border-teal-100 text-xl font-black text-[#008E92]">
                  {Math.min(100, Math.round((cycleTotalTrips / 60) * 100))}%
                </div>
                <p className="mt-1 text-xs text-slate-400">من الهدف</p>
              </div>
              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-xs font-black text-slate-500">أيام العمل</p>
                <p className="mt-2 text-3xl font-black text-[#061827]">0 / 6</p>
                <p className="text-xs text-slate-400">يتم احتسابها من الحضور</p>
              </div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-[#008E92]"
                style={{
                  width: `${Math.min(100, Math.round((cycleTotalTrips / 60) * 100))}%`,
                }}
              />
            </div>
            <p className="mt-2 text-center text-xs font-bold text-slate-500">
              متبقي لتحقيق هدف المشاوير:{" "}
              <span className="font-black text-[#008E92]">
                {Math.max(0, 60 - cycleTotalTrips)}
              </span>{" "}
              مشوار
            </p>
          </section>

          {/* Analytics and deductions */}
          <section className="grid gap-4 lg:grid-cols-2">
            <RiderLineChart
              title="تطور الأداء اليومي خلال الدورة"
              values={
                cycleTrendValues.length ? cycleTrendValues : lastSevenDays
              }
            />
            <section className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-black text-[#061827]">
                  ملخص الخصومات والأذونات
                </h3>
                <span className="text-xl">📄</span>
              </div>
              <div className="divide-y divide-slate-100">
                <SummaryLine
                  icon="⛔"
                  label="عدد الخصومات"
                  value={approvedDeductions.length}
                  tone="red"
                />
                <SummaryLine
                  icon="💰"
                  label="قيمة الخصومات"
                  value={formatMoney(deductionsAmount)}
                  tone="red"
                />
                <SummaryLine
                  icon="✅"
                  label="عدد الأذونات"
                  value={riderPermissions.length}
                  tone="green"
                />
                <SummaryLine
                  icon="🕒"
                  label="آخر إذن مسجل"
                  value={permissionSummary}
                  tone="blue"
                />
                <SummaryLine
                  icon="👤"
                  label="آخر سبب مسجل"
                  value={lastActionReason}
                  tone="orange"
                />
                {rewardsAmount > 0 && (
                  <SummaryLine
                    icon="🎁"
                    label="قيمة المكافآت"
                    value={formatMoney(rewardsAmount)}
                    tone="green"
                  />
                )}
              </div>
            </section>
          </section>

          {/* Notifications */}
          <section className="rounded-[28px] border border-teal-100 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-black text-[#061827]">
                التنبيهات المهمة
              </h3>
              <button
                onClick={() => setActiveModal("notifications")}
                className="rounded-2xl bg-[#EAF8F8] px-3 py-2 text-xs font-black text-[#008E92]"
              >
                عرض الكل
              </button>
            </div>
            <div className="rounded-3xl bg-gradient-to-l from-teal-50 to-white p-5 text-center">
              {notificationCount === 0 ? (
                <>
                  <p className="text-4xl">🔔</p>
                  <p className="mt-2 font-black text-slate-700">
                    لا توجد تنبيهات حالياً
                  </p>
                  <p className="text-xs font-bold text-slate-400">
                    سيظهر هنا أي تنبيه مهم متعلق بعملك
                  </p>
                </>
              ) : (
                <div className="space-y-2 text-right text-sm font-bold text-slate-700">
                  {riderNotifications.slice(0, 3).map((n, idx) => (
                    <p key={n.id || idx}>
                      🔔 {n.title || n.message || n.body || "تنبيه من الإدارة"}
                    </p>
                  ))}
                  {dups > 0 && <p>⚠️ توجد {dups} فاتورة مكررة تحتاج مراجعة.</p>}
                  {mult15 > 0 && (
                    <p>🔥 توجد {mult15} طلبات ×1.5 بانتظار موافقة الإدارة.</p>
                  )}
                  {failedOrders > 0 && (
                    <p>❌ توجد {failedOrders} أوردرات فاشلة لا تُحتسب.</p>
                  )}
                  {pendingActions.length > 0 && (
                    <p>
                      🧾 توجد {pendingActions.length} ملاحظات أو إجراءات تحت
                      المراجعة.
                    </p>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Policies */}
          <section className="rounded-[28px] border border-slate-100 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-black text-[#061827]">
                السياسات والتعليمات
              </h3>
              <button
                onClick={() => setActiveModal("policies")}
                className="text-xs font-black text-[#008E92]"
              >
                عرض التفاصيل
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <PolicyTile
                icon="📸"
                title="صورة الريسيت"
                text="تصوير أو رفع كإثبات"
              />
              <PolicyTile
                icon="🧾"
                title="رقم الفاتورة"
                text="إلزامي لكل أوردر"
              />
              <PolicyTile
                icon="🔥"
                title="طلبات ×1.5"
                text="لا تُحتسب إلا بعد الموافقة"
              />
              <PolicyTile
                icon="🛵"
                title="المشاوير"
                text="تحتاج سبباً وإثباتاً واضحاً"
              />
              <PolicyTile
                icon="❌"
                title="الفاشل"
                text="لا يدخل في الحساب النهائي"
              />
              <PolicyTile icon="⏱️" title="الحضور" text="حضور وانصراف إلزامي" />
              <PolicyTile
                icon="🔔"
                title="التنبيهات"
                text="راجع تنبيهات الإدارة"
              />
              <PolicyTile
                icon="🛡️"
                title="منع التلاعب"
                text="أي شك يدخل مراجعة"
              />
            </div>
          </section>
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-100 bg-white/95 px-3 py-2 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
          <div className="grid grid-cols-5 gap-1 text-center text-[11px] font-black text-slate-500">
            <button className="rounded-2xl p-2 text-[#008E92]">
              🏠<span className="block">الرئيسية</span>
            </button>
            <button
              onClick={() => openOrders("all", "كل أوردرات اليوم")}
              className="rounded-2xl p-2"
            >
              📦<span className="block">الأوردرات</span>
            </button>
            <button
              onClick={() => openTrips("all", "كل مشاوير اليوم")}
              className="rounded-2xl p-2"
            >
              🛵<span className="block">المشاوير</span>
            </button>
            <button
              onClick={() => setActiveModal("pay")}
              className="rounded-2xl p-2"
            >
              📊<span className="block">التقارير</span>
            </button>
            <button
              onClick={() => setActiveModal("pay")}
              className="rounded-2xl p-2"
            >
              •••<span className="block">المزيد</span>
            </button>
          </div>
        </nav>

        {/* ═══════ MODALS ═══════ */}

        {/* NOTIFICATIONS */}
        <Sheet
          open={activeModal === "notifications"}
          title="التنبيهات والإشعارات"
          onClose={() => setActiveModal(null)}
        >
          <div className="space-y-3">
            <div className="rounded-3xl border border-teal-100 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="text-right">
                  <p className="font-black text-[#061827]">إشعارات الهاتف</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">
                    فعّلها ليظهر للدليفري تنبيه على الموبايل عند إضافة سياسة،
                    خصم، مكافأة، حافز، أو تغيير أوردر.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () =>
                    setBrowserNotificationsEnabled(
                      await requestNotificationPermissionIfNeeded(),
                    )
                  }
                  className="rounded-2xl bg-[#008E92] px-4 py-3 text-xs font-black text-white"
                >
                  {browserNotificationsEnabled
                    ? "مفعلة ✅"
                    : "تفعيل إشعارات الهاتف 🔔"}
                </button>
              </div>
            </div>
            <button type="button" onClick={() => void handleDeviceLogout()} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 py-3 text-sm font-black text-rose-700"><LogOut size={17}/> تسجيل خروج من هذا الجهاز</button>
            {notificationCount === 0 ? (
              <div className="rounded-3xl bg-white p-6 text-center shadow-sm">
                <p className="text-4xl">🔔</p>
                <p className="mt-2 font-black text-slate-700">
                  لا توجد تنبيهات حالياً
                </p>
                <p className="mt-1 text-xs font-bold text-slate-400">
                  ستظهر هنا تنبيهات الإدارة والتغييرات المهمة.
                </p>
              </div>
            ) : (
              <>
                {riderNotifications.map((n, idx) => (
                  <div
                    key={n.id || idx}
                    className="rounded-3xl bg-white p-4 shadow-sm"
                  >
                    <p className="font-black text-[#061827]">
                      {n.title || "تنبيه من الإدارة"}
                    </p>
                    <p className="mt-1 text-sm font-bold text-slate-600">
                      {n.message ||
                        n.body ||
                        n.description ||
                        "تم تسجيل تحديث متعلق بعملك."}
                    </p>
                    {n.created_at && (
                      <p className="mt-2 text-xs font-bold text-slate-400">
                        {formatDateTime(n.created_at)}
                      </p>
                    )}
                  </div>
                ))}
                {dups > 0 && (
                  <NotificationItem
                    icon="⚠️"
                    title="فواتير مكررة"
                    text={`توجد ${dups} فاتورة مكررة أو استثنائية تحتاج مراجعة.`}
                  />
                )}
                {mult15 > 0 && (
                  <NotificationItem
                    icon="🔥"
                    title="طلبات ×1.5"
                    text={`توجد ${mult15} طلبات مضاعفة لا تُحتسب إلا بعد موافقة الإدارة.`}
                  />
                )}
                {failedOrders > 0 && (
                  <NotificationItem
                    icon="❌"
                    title="أوردرات فاشلة"
                    text={`توجد ${failedOrders} أوردرات فاشلة لا تدخل في الحساب.`}
                  />
                )}
                {pendingActions.length > 0 && (
                  <NotificationItem
                    icon="🧾"
                    title="إجراءات تحت المراجعة"
                    text={`توجد ${pendingActions.length} ملاحظات أو خصومات/مكافآت تحت مراجعة الإدارة.`}
                  />
                )}
              </>
            )}
          </div>
        </Sheet>

        {/* POLICIES */}
        <Sheet
          open={activeModal === "policies"}
          title="السياسات والتعليمات"
          onClose={() => setActiveModal(null)}
        >
          <div className="space-y-3">
            <NotificationItem
              icon="🧾"
              title="رقم الفاتورة إلزامي"
              text="لا يتم احتساب أي أوردر بدون رقم فاتورة صحيح وواضح. اكتب الرقم كما هو ظاهر في برنامج الصيدلية أو الريسيت."
            />
            <NotificationItem
              icon="📸"
              title="تصوير أو رفع الريسيت"
              text="يمكن تصوير الريسيت بالكاميرا أو رفع صورة محفوظة كإثبات للمراجعة ومنع التلاعب. مرحلة قراءة OCR مؤجلة حاليًا."
            />
            <NotificationItem
              icon="👤"
              title="بيانات العميل"
              text="اختيار العميل من قاعدة البيانات أفضل من الكتابة اليدوية. لو العميل غير موجود، اكتب الاسم والرقم والعنوان بوضوح."
            />
            <NotificationItem
              icon="📍"
              title="العنوان الحالي"
              text="لو العميل في عنوان مختلف عن المسجل، اكتب عنوان التسليم الحالي لأنه يؤثر على المراجعة وطلبات ×1.5."
            />
            <NotificationItem
              icon="🔥"
              title="أوردرات ×1.5"
              text="طلبات ×1.5 لا تُحتسب تلقائياً. هي علامة مراجعة للإدارة فقط، ولا تعتمد إلا بعد موافقة المدير ووجود سبب واضح."
            />
            <NotificationItem
              icon="❌"
              title="الأوردر الفاشل"
              text="الأوردر الفاشل يظهر في التقرير للمتابعة، لكنه لا يدخل ضمن الأوردرات المحتسبة للمندوب."
            />
            <NotificationItem
              icon="⚠️"
              title="الفاتورة المكررة"
              text="أي رقم فاتورة مكرر يدخل تحت المراجعة. يجب كتابة سبب واضح مثل خطأ تحضير أو إعادة إرسال، واسم الدكتور/البائع إن وجد."
            />
            <NotificationItem
              icon="🛵"
              title="المشاوير"
              text="كل مشوار يجب أن يحتوي على نوع المشوار، من وإلى، وسبب واضح. المشوار بين الفروع أو المخزن يفضل ربطه برقم فاتورة أو صورة إثبات."
            />
            <NotificationItem
              icon="⏱️"
              title="الحضور والانصراف"
              text="يجب تسجيل الحضور في بداية الشيفت والانصراف في نهايته حتى يتم احتساب أيام وساعات العمل بدقة."
            />
            <NotificationItem
              icon="🔔"
              title="التنبيهات"
              text="أي خصم، مكافأة، إذن، رفض، تحويل أوردر، أو ملاحظة من الإدارة ستظهر في التنبيهات ويجب مراجعتها."
            />
            <NotificationItem
              icon="🛡️"
              title="منع التلاعب"
              text="أي بيانات غير واضحة أو غير مكتملة يتم وضعها تحت المراجعة ولا تدخل في الحساب النهائي إلا بعد اعتماد الإدارة."
            />
          </div>
        </Sheet>

        {/* ORDER */}
        <Sheet
          open={activeModal === "order"}
          title="تسجيل أوردر"
          onClose={() => {
            setActiveModal(null);
            resetOrderForm();
          }}
        >
          {/* Customer */}
          <label className="block text-sm font-black text-[#061827]">
            العميل أو كود العميل — اختياري
          </label>
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search
                  size={15}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void runCustomerSearch();
                    }
                  }}
                  placeholder="اكتب الاسم / الكود / رقم الهاتف — استخدم * للبحث المرن"
                  className="dawaa-input pr-9 text-right"
                />
                {searching && (
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin rounded-full border-2 border-[#008E92] border-t-transparent" />
                )}
              </div>
              <button
                type="button"
                onClick={() => void runCustomerSearch()}
                disabled={searching || !customerSearch.trim()}
                className="rounded-2xl bg-[#008E92] px-4 font-black text-white disabled:opacity-50"
              >
                بحث 🔎
              </button>
            </div>
            <p className="text-xs font-bold text-slate-500">
              مثال: اكتب 010 أو محمد*أحمد أو كود العميل ثم اضغط علامة البحث.
            </p>
            {selectedCustomer && (
              <div className="flex items-center justify-between rounded-2xl bg-teal-50 border border-[#008E92] p-3">
                <p className="font-black text-[#008E92]">
                  ✅ تم اختيار عميل من قاعدة البيانات
                </p>
                <button
                  onClick={() => {
                    setSelectedCustomer(null);
                    setCustomerSearch("");
                  }}
                  className="rounded-xl bg-white p-2"
                >
                  <X size={18} className="text-slate-400" />
                </button>
              </div>
            )}
            {customers.length > 0 && (
              <div className="max-h-56 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-lg">
                {customers.map((c, idx) => (
                  <button
                    key={c.id || `${c.code}-${c.phone}-${idx}`}
                    onClick={() => selectCustomer(c)}
                    className="w-full border-b border-slate-100 p-3 text-right hover:bg-teal-50 last:border-0"
                  >
                    <p className="font-black">{c.name || "عميل بدون اسم"}</p>
                    <p className="text-xs text-slate-500">
                      كود: {c.code || "—"} | تليفون: {c.phone || "—"}
                    </p>
                    <p className="text-xs text-slate-400">
                      {c.address || "لا يوجد عنوان مسجل"}
                    </p>
                  </button>
                ))}
              </div>
            )}
            {customerSearch.trim().length >= 2 &&
              !searching &&
              customers.length === 0 &&
              !selectedCustomer && (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                  لا يوجد عميل مطابق. يمكن تسجيل عميل يدويًا، لكن سيظهر للإدارة
                  كـ "عميل غير مسجل" للمراجعة.
                </div>
              )}
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-white p-3">
            <Field label="اسم العميل (اختياري)">
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="dawaa-input text-right"
                placeholder="اسم العميل"
              />
            </Field>
            <Field label="كود العميل">
              <input
                value={customerCode}
                onChange={(e) => setCustomerCode(e.target.value)}
                className="dawaa-input text-right"
                placeholder="كود العميل"
              />
            </Field>
            <Field label="رقم التليفون">
              <input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="dawaa-input text-right"
                placeholder="رقم التليفون"
              />
            </Field>
            <Field label="عنوان التسليم (اختياري)">
              <input
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                className="dawaa-input text-right"
                placeholder="العنوان الحالي، ويمكن تعديله لو العميل في مكان مختلف"
              />
            </Field>
          </div>
          <SmartCustomerCard customerCode={customerCode || selectedCustomer?.code || ""} />

          {/* Invoice number */}
          <Field label="رقم الفاتورة *">
            <input
              type="text"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="رقم الفاتورة"
              className="dawaa-input text-right"
            />
          </Field>

          {/* Invoice amount */}
          <Field label="قيمة الفاتورة (اختياري)">
            <input
              type="number"
              value={invoiceAmount}
              onChange={(e) => setInvoiceAmount(e.target.value)}
              placeholder="0"
              className="dawaa-input text-right"
            />
          </Field>

          {/* Receipt photo */}
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
            <p className="mb-2 font-black text-emerald-900">
              تصوير أو رفع الريسيت / الفاتورة - اختياري حاليًا 📸
            </p>
            <p className="mb-3 text-xs font-bold text-emerald-700">
              هذه المرحلة اختيارية حاليًا لحفظ صورة الريسيت كإثبات إضافي. الأوردر يمكن تسجيله بدون صورة،
              لكن وجود الصورة يساعد الإدارة في مراجعة الفواتير المكررة أو المشكوك فيها.
            </p>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => receiptCameraInputRef.current?.click()}
                className="rounded-2xl bg-[#008E92] py-3 font-black text-white shadow-sm"
              >
                فتح الكاميرا وتصوير الريسيت 📷
              </button>
              <button
                type="button"
                onClick={() => receiptUploadInputRef.current?.click()}
                className="rounded-2xl border border-emerald-200 bg-white py-3 font-black text-emerald-800 shadow-sm"
              >
                رفع صورة الريسيت من الجهاز 🖼️
              </button>
            </div>

            <input
              ref={receiptCameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleReceiptPhotoChange}
              className="hidden"
            />
            <input
              ref={receiptUploadInputRef}
              type="file"
              accept="image/*"
              onChange={handleReceiptPhotoChange}
              className="hidden"
            />

            {receiptFile && (
              <p className="mt-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-600">
                تم اختيار: {receiptFile.name || "صورة من الكاميرا"}
              </p>
            )}

            {receiptPreviewUrl && (
              <div className="mt-3 grid gap-2 sm:grid-cols-[140px_1fr]">
                <img
                  src={receiptPreviewUrl}
                  alt="معاينة الريسيت"
                  className="h-32 w-full rounded-2xl object-cover border border-emerald-200"
                />
                <div className="space-y-2">
                  <textarea
                    value={receiptOcrNote}
                    onChange={(e) => setReceiptOcrNote(e.target.value)}
                    rows={3}
                    className="dawaa-input resize-none text-right bg-white"
                    placeholder="ملاحظة اختيارية على صورة الريسيت أو سبب الإرفاق..."
                  />
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">
                    OCR مؤجل حاليًا. اكتب رقم الفاتورة وبيانات العميل يدويًا،
                    وسيتم حفظ الصورة مع الأوردر للمراجعة.
                  </div>
                </div>
              </div>
            )}

            <p className="mt-2 text-xs font-bold text-emerald-700">
              الصورة اختيارية الآن، وتُحفظ داخل الأوردر فقط عند رفعها للمساعدة في مراجعة الفواتير
              المكررة، الفاشلة، وطلبات ×1.5.
            </p>
            {receiptUploadState === "uploading" && <p className="mt-2 rounded-xl bg-sky-50 p-2 text-xs font-black text-sky-700">جاري رفع الريسيت...</p>}
            {receiptUploadState === "uploaded" && <p className="mt-2 rounded-xl bg-white p-2 text-xs font-black text-emerald-700">تم رفع الريسيت بنجاح ✅</p>}
            {(receiptUploadState === "failed" || receiptUploadState === "pending_retry") && <div className="mt-2 rounded-xl bg-rose-50 p-2 text-xs font-black text-rose-700"><p>{receiptUploadState === "pending_retry" ? "الصورة محفوظة مؤقتًا وسيتم إعادة المحاولة عند رجوع الإنترنت" : "فشل رفع الريسيت، حاول مرة أخرى ❌"}</p><button type="button" onClick={() => void uploadReceiptPhoto(invoiceNumber.trim() || "retry")} className="mt-2 rounded-lg bg-white px-3 py-1.5 text-rose-700">إعادة رفع الريسيت</button></div>}
          </div>

          {/* Multiplier */}
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={useMultiplier}
                onChange={(e) => setUseMultiplier(e.target.checked)}
                className="h-5 w-5"
              />
              <span className="font-black text-blue-800">
                الأوردر يستحق مراجعة ×1.5 بسبب بعد العنوان / مشوار خاص 🔥
              </span>
            </label>
            {useMultiplier && (
              <input
                type="text"
                value={multiplierReason}
                onChange={(e) => setMultiplierReason(e.target.value)}
                placeholder="اكتب سبب واضح: عنوان بعيد، منطقة مختلفة، انتظار طويل..."
                className="mt-2 w-full rounded-xl border border-blue-200 p-2 text-sm text-right"
              />
            )}
            <p className="mt-2 text-xs font-bold text-blue-700">
              ملحوظة: ×1.5 علامة مراجعة للإدارة فقط وليست حساب راتب نهائي
              تلقائي.
            </p>
          </div>

          {/* Notes */}
          <Field label="ملاحظات (اختياري)">
            <textarea
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              rows={2}
              className="dawaa-input text-right resize-none"
              placeholder="ملاحظة إن وجد"
            />
          </Field>

          <button
            onClick={() => handleSaveOrder(false)}
            disabled={saving}
            className="w-full rounded-2xl bg-[#008E92] py-4 text-lg font-black text-white disabled:opacity-60"
          >
            {saving ? "جاري تسجيل الأوردر..." : orderSaveError ? "إعادة محاولة الحفظ" : "حفظ الأوردر ✅"}
          </button>
          {orderSaveError && <p className="rounded-2xl bg-rose-50 p-3 text-center text-xs font-black text-rose-700">لم نفقد بياناتك: {orderSaveError}</p>}
        </Sheet>

        {/* DUPLICATE WARNING */}
        <Sheet
          open={activeModal === "duplicate"}
          title="⚠️ الفاتورة متسجلة قبل كده"
          onClose={() => setActiveModal("order")}
        >
          <div className="rounded-2xl bg-amber-50 border border-amber-300 p-4">
            <p className="font-black text-amber-800">
              الفاتورة دي متسجلة قبل كده لأي دليفري، ولازم سبب استثنائي واضح.
            </p>
            <p className="text-xs text-amber-600 mt-1">
              سُجلت في: {formatDateTime(dupWarning?.registered_at)}
            </p>
            <p className="text-xs text-amber-600">
              الدليفري السابق: {(dupWarning as any)?.rider_name || "غير معروف"}{" "}
              — العميل:{" "}
              {(dupWarning as any)?.customer_name_snapshot || "غير معروف"}
            </p>
          </div>
          <Field label="سبب التكرار *">
            <select
              value={dupReason}
              onChange={(e) => setDupReason(e.target.value)}
              className="dawaa-input text-right"
            >
              <option value="">اختار سبب</option>
              {Object.entries(DUPLICATE_REASON_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="اسم الدكتور اللي طلع/حضّر الأوردر *">
            <input
              value={dupDoctorName}
              onChange={(e) => setDupDoctorName(e.target.value)}
              className="dawaa-input text-right"
              placeholder="مثال: د/ أحمد أو د/ شيماء"
            />
          </Field>
          <Field label="ملاحظة * (10 حروف على الأقل)">
            <textarea
              value={dupNote}
              onChange={(e) => setDupNote(e.target.value)}
              rows={3}
              className="dawaa-input text-right resize-none"
              placeholder="اكتب تفاصيل التكرار"
            />
            <p className="text-xs text-slate-400">{dupNote.length}/10</p>
          </Field>
          <button
            onClick={() => handleSaveOrder(true)}
            disabled={
              saving ||
              !dupReason ||
              !dupDoctorName.trim() ||
              dupNote.trim().length < 10
            }
            className="w-full rounded-2xl bg-amber-500 py-4 font-black text-white disabled:opacity-50"
          >
            {saving ? "⏳" : "تأكيد الأوردر المتكرر ⚠️"}
          </button>
          <button
            onClick={() => {
              setActiveModal(null);
              resetOrderForm();
            }}
            className="w-full rounded-2xl bg-slate-100 py-3 font-black text-slate-600"
          >
            إلغاء
          </button>
        </Sheet>

        {/* TRIP */}
        <Sheet
          open={activeModal === "trip"}
          title="تسجيل مشوار"
          onClose={() => {
            setActiveModal(null);
            resetTripForm();
          }}
        >
          <Field label="نوع المشوار *">
            <select
              value={tripType}
              onChange={(e) =>
                applyTripTypeDefaults(
                  e.target.value as InternalTrip["trip_type"],
                )
              }
              className="dawaa-input text-right"
            >
              <option value="branch_to_branch">بين الفروع</option>
              <option value="warehouse">مخزن</option>
              <option value="supplies">مستلزمات</option>
              <option value="pharmacy">صيدلية</option>
              <option value="shipment_pickup">استلام شحن</option>
              <option value="accessories">إكسسوار</option>
              <option value="other">أخرى</option>
            </select>
            <p className="mt-1 rounded-xl bg-teal-50 p-2 text-xs font-bold text-teal-700">
              {tripTypeHelp(tripType)}
            </p>
          </Field>

          {tripType === "branch_to_branch" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="من أي فرع؟ *">
                <select
                  value={fromLabel}
                  onChange={(e) => setFromLabel(e.target.value)}
                  className="dawaa-input text-right"
                >
                  {BRANCH_DESTINATIONS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="إلى أي فرع؟ *">
                <select
                  value={toLabel}
                  onChange={(e) => setToLabel(e.target.value)}
                  className="dawaa-input text-right"
                >
                  {BRANCH_DESTINATIONS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}

          {tripType === "warehouse" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="خارج من *">
                  <select
                    value={fromLabel}
                    onChange={(e) => setFromLabel(e.target.value)}
                    className="dawaa-input text-right"
                  >
                    {BRANCH_DESTINATIONS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="رايح إلى مخزن *">
                  <select
                    value={toLabel === "custom" ? "custom" : toLabel}
                    onChange={(e) => setToLabel(e.target.value)}
                    className="dawaa-input text-right"
                  >
                    {WAREHOUSE_DESTINATIONS.map((w) => (
                      <option key={w.code} value={destinationLabelWithCode(w)}>
                        {w.code} - {w.name}
                      </option>
                    ))}
                    <option value="custom">إضافة مخزن جديد...</option>
                  </select>
                </Field>
              </div>
              {toLabel === "custom" && (
                <Field label="اسم المخزن الجديد *">
                  <input
                    value={customToLabel}
                    onChange={(e) => setCustomToLabel(e.target.value)}
                    className="dawaa-input text-right"
                    placeholder="اكتب اسم المخزن"
                  />
                </Field>
              )}
            </div>
          )}

          {tripType === "supplies" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="خارج من *">
                  <select
                    value={fromLabel}
                    onChange={(e) => setFromLabel(e.target.value)}
                    className="dawaa-input text-right"
                  >
                    {BRANCH_DESTINATIONS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="جهة المستلزمات *">
                  <select
                    value={toLabel === "custom" ? "custom" : toLabel}
                    onChange={(e) => setToLabel(e.target.value)}
                    className="dawaa-input text-right"
                  >
                    {SUPPLIES_DESTINATIONS.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                    <option value="custom">إضافة جهة مستلزمات...</option>
                  </select>
                </Field>
              </div>
              {toLabel === "custom" && (
                <Field label="اسم جهة المستلزمات *">
                  <input
                    value={customToLabel}
                    onChange={(e) => setCustomToLabel(e.target.value)}
                    className="dawaa-input text-right"
                    placeholder="اكتب اسم الجهة"
                  />
                </Field>
              )}
            </div>
          )}

          {tripType === "accessories" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="خارج من *">
                  <select
                    value={fromLabel}
                    onChange={(e) => setFromLabel(e.target.value)}
                    className="dawaa-input text-right"
                  >
                    {BRANCH_DESTINATIONS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="مخزن الإكسسوار *">
                  <select
                    value={toLabel === "custom" ? "custom" : toLabel}
                    onChange={(e) => setToLabel(e.target.value)}
                    className="dawaa-input text-right"
                  >
                    {ACCESSORY_DESTINATIONS.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                    <option value="custom">إضافة مخزن إكسسوار...</option>
                  </select>
                </Field>
              </div>
              {toLabel === "custom" && (
                <Field label="اسم مخزن الإكسسوار *">
                  <input
                    value={customToLabel}
                    onChange={(e) => setCustomToLabel(e.target.value)}
                    className="dawaa-input text-right"
                    placeholder="اكتب اسم المخزن"
                  />
                </Field>
              )}
            </div>
          )}

          {tripType === "pharmacy" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="خارج من *">
                <select
                  value={fromLabel}
                  onChange={(e) => setFromLabel(e.target.value)}
                  className="dawaa-input text-right"
                >
                  {BRANCH_DESTINATIONS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="اسم الصيدلية *">
                <input
                  type="text"
                  value={toLabel}
                  onChange={(e) => setToLabel(e.target.value)}
                  className="dawaa-input text-right"
                  placeholder="اكتب اسم الصيدلية"
                />
              </Field>
            </div>
          )}

          {tripType === "shipment_pickup" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="مكان / شركة الشحن *">
                <input
                  type="text"
                  value={fromLabel}
                  onChange={(e) => setFromLabel(e.target.value)}
                  className="dawaa-input text-right"
                  placeholder="مثال: شركة الشحن / المكتب"
                />
              </Field>
              <Field label="التسليم إلى *">
                <select
                  value={toLabel}
                  onChange={(e) => setToLabel(e.target.value)}
                  className="dawaa-input text-right"
                >
                  {BRANCH_DESTINATIONS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}

          {tripType === "other" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="من *">
                <input
                  type="text"
                  value={fromLabel}
                  onChange={(e) => setFromLabel(e.target.value)}
                  className="dawaa-input text-right"
                  placeholder="من"
                />
              </Field>
              <Field label="إلى *">
                <input
                  type="text"
                  value={toLabel}
                  onChange={(e) => setToLabel(e.target.value)}
                  className="dawaa-input text-right"
                  placeholder="إلى"
                />
              </Field>
            </div>
          )}

          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800">
            المشوار يحتاج إثبات بالكاميرا لمنع التلاعب. اضغط تصوير إثبات المشوار، ولا تحفظ بدون صورة إلا في استثناء واضح مثل: دورت على صنف ومش موجود.
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
            <p className="mb-2 font-black text-emerald-900">تصوير إثبات المشوار 📸</p>
            <button
              type="button"
              onClick={() => tripProofCameraInputRef.current?.click()}
              className="w-full rounded-2xl bg-[#008E92] py-3 font-black text-white shadow-sm"
            >
              فتح الكاميرا وتصوير الفاتورة أو الكيسة
            </button>
            <input
              ref={tripProofCameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleTripProofPhotoChange}
              className="hidden"
            />
            {tripProofPreviewUrl && (
              <div className="mt-3 grid gap-2 sm:grid-cols-[140px_1fr]">
                <img src={tripProofPreviewUrl} alt="إثبات المشوار" className="h-32 w-full rounded-2xl border border-emerald-200 object-cover" />
                <div className="space-y-2">
                  <textarea
                    value={tripProofNote}
                    onChange={(e) => setTripProofNote(e.target.value)}
                    rows={3}
                    className="dawaa-input resize-none bg-white text-right"
                    placeholder="ملاحظة اختيارية على صورة المشوار..."
                  />
                  <p className="rounded-xl bg-white p-2 text-xs font-black text-emerald-700">
                    وقت التصوير: {tripProofCapturedAt ? new Date(tripProofCapturedAt).toLocaleString("ar-EG") : "—"}
                  </p>
                </div>
              </div>
            )}
            {tripProofUploadState === "uploading" && <p className="mt-2 rounded-xl bg-sky-50 p-2 text-xs font-black text-sky-700">جاري رفع إثبات المشوار...</p>}
            {tripProofUploadState === "uploaded" && <p className="mt-2 rounded-xl bg-white p-2 text-xs font-black text-emerald-700">تم رفع إثبات المشوار بنجاح ✅</p>}
            {(tripProofUploadState === "failed" || tripProofUploadState === "pending_retry") && (
              <p className="mt-2 rounded-xl bg-rose-50 p-2 text-xs font-black text-rose-700">
                تعذر رفع صورة المشوار. حاول التصوير مرة أخرى قبل الحفظ.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
            <label className="flex items-center gap-3 text-sm font-black text-amber-900">
              <input
                type="checkbox"
                checked={allowTripProofException}
                onChange={(e) => setAllowTripProofException(e.target.checked)}
                className="h-5 w-5"
              />
              استثناء بدون صورة: دورت على صنف أو مشوار ولم أجد المطلوب
            </label>
            {allowTripProofException && (
              <textarea
                value={tripProofExceptionReason}
                onChange={(e) => setTripProofExceptionReason(e.target.value)}
                rows={2}
                className="mt-2 w-full rounded-xl border border-amber-200 bg-white p-2 text-right text-sm"
                placeholder="اكتب السبب بوضوح، مثال: دورت على الصنف في المخزن ولم أجده"
              />
            )}
            <p className="mt-2 text-xs font-bold text-amber-800">
              الاستثناء سيتم عرضه للإدارة يوميًا للمراجعة ولا يتم اعتماده تلقائيًا.
            </p>
          </div>

          <Field label="رقم فاتورة / إذن مرتبط — اختياري">
            <input
              type="text"
              value={relatedInvoice}
              onChange={(e) => setRelatedInvoice(e.target.value)}
              className="dawaa-input text-right"
              placeholder="اختياري: رقم الفاتورة أو إذن التحويل"
            />
          </Field>
          <button
            onClick={handleSaveTrip}
            disabled={saving}
            className="w-full rounded-2xl bg-[#008E92] py-4 text-lg font-black text-white disabled:opacity-60"
          >
            {saving ? "⏳" : "تسجيل المشوار 🗺️"}
          </button>
        </Sheet>

        {/* TODAY ORDERS */}
        <Sheet
          open={activeModal === "orders"}
          title={`${orderViewTitle} (${displayedOrders.length})`}
          onClose={() => setActiveModal(null)}
        >
          {displayedOrders.length === 0 ? (
            <p className="py-8 text-center text-slate-400 font-bold">
              لا توجد أوردرات في هذا القسم
            </p>
          ) : (
            displayedOrders.map((o) => (
              <div
                key={o.id}
                className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm space-y-2"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-black">{o.customer_name_snapshot}</p>
                    <p className="text-xs text-slate-500">
                      كود:{" "}
                      {(o as any).customer_code_snapshot ||
                        (o as any).customer_code ||
                        "—"}{" "}
                      · {o.customer_phone_snapshot}
                    </p>
                    <p className="text-xs text-slate-500">
                      {o.customer_address_snapshot}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-black ${o.status === "delivered" ? "bg-emerald-100 text-emerald-700" : o.status === "failed" ? "bg-red-100 text-red-700" : "bg-sky-100 text-sky-700"}`}
                  >
                    {ORDER_STATUS_LABELS[o.status] ?? o.status}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  فاتورة: {o.invoice_number} ·{" "}
                  {o.status === "failed" ? "لا تحتسب للدليفري" : "تحت المراجعة"}
                  {o.order_multiplier >= 1.5 ? " 🔥" : ""}
                </p>
                <OrderTimelineBadge order={o as any} />
                <p className={`text-xs font-black ${((o as any).receipt_upload_status === "uploaded" || (o as any).receipt_image_url) ? "text-emerald-700" : (o as any).receipt_upload_status === "failed" ? "text-rose-600" : "text-slate-400"}`}>{((o as any).receipt_upload_status === "uploaded" || (o as any).receipt_image_url) ? "ريسيت مرفوع ✅" : (o as any).receipt_upload_status === "failed" ? "فشل رفع الريسيت ⚠️" : (o as any).receipt_upload_status === "pending_retry" ? "الريسيت ينتظر إعادة الرفع" : "بدون ريسيت"}</p>
                <NavigateButton address={o.customer_address_snapshot} />
                {o.status === "registered" && !(o as any).picked_up_at && (
                  <button
                    onClick={() => handlePickedUp(o.id)}
                    className="w-full rounded-xl bg-sky-100 py-2 text-sm font-black text-sky-700"
                  >
                    استلمت الأوردر من الفرع 🛵
                  </button>
                )}
                {o.order_multiplier >= 1.5 && (
                  <p className="text-xs font-black text-blue-600">
                    🔥 أوردر ×1.5 للمراجعة: {o.multiplier_reason || "بدون سبب"}
                  </p>
                )}
                {o.is_duplicate_invoice && (
                  <p className="text-xs font-black text-amber-600">
                    ⚠️ فاتورة مكررة — دكتور التحضير:{" "}
                    {(o as any).preparing_doctor_name || "غير مسجل"} — مستنية
                    مراجعة
                  </p>
                )}
                {!["delivered", "تم التسليم", "failed", "cancelled", "canceled"].includes(String(o.status).toLowerCase()) && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleDelivered(o.id)}
                      disabled={saving}
                      className="flex-1 rounded-xl bg-emerald-500 py-2 text-sm font-black text-white"
                    >
                      تم التسليم ✅
                    </button>
                    <button onClick={() => openEditOrder(o)} className="rounded-xl bg-teal-50 py-2 text-sm font-black text-teal-700">تعديل الأوردر ✏️</button>
                    <button
                      onClick={() => {
                        setFailOrderId(o.id);
                        setActiveModal("fail_reason");
                      }}
                      className="col-span-2 rounded-xl bg-red-100 py-2 text-sm font-black text-red-600"
                    >
                      فشل ❌
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </Sheet>

        {/* EDIT ORDER BEFORE DELIVERY */}
        <Sheet open={activeModal === "edit_order"} title="تعديل الأوردر قبل التسليم" onClose={() => { setActiveModal("orders"); setEditOrder(null); setEditDraft(null); }}>
          {editDraft && <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3"><Field label="رقم الفاتورة *"><input value={editDraft.invoice_number} onChange={e => setEditDraft(v => v ? { ...v, invoice_number: e.target.value } : v)} className="dawaa-input text-right"/></Field><Field label="قيمة الفاتورة"><input type="number" value={editDraft.invoice_amount} onChange={e => setEditDraft(v => v ? { ...v, invoice_amount: e.target.value } : v)} className="dawaa-input text-right"/></Field><Field label="اسم العميل"><input value={editDraft.customer_name} onChange={e => setEditDraft(v => v ? { ...v, customer_name: e.target.value } : v)} className="dawaa-input text-right"/></Field><Field label="كود العميل"><input value={editDraft.customer_code} onChange={e => setEditDraft(v => v ? { ...v, customer_code: e.target.value } : v)} className="dawaa-input text-right"/></Field><Field label="الهاتف"><input value={editDraft.customer_phone} onChange={e => setEditDraft(v => v ? { ...v, customer_phone: e.target.value } : v)} className="dawaa-input text-right"/></Field><Field label="العنوان"><input value={editDraft.customer_address} onChange={e => setEditDraft(v => v ? { ...v, customer_address: e.target.value } : v)} className="dawaa-input text-right"/></Field></div>
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3"><label className="flex items-center gap-2 text-sm font-black text-blue-800"><input type="checkbox" checked={editDraft.order_multiplier >= 1.5} onChange={e => setEditDraft(v => v ? { ...v, order_multiplier: e.target.checked ? 1.5 : 1 } : v)}/> أوردر بعيد ×1.5</label>{editDraft.order_multiplier >= 1.5 && <input value={editDraft.multiplier_reason} onChange={e => setEditDraft(v => v ? { ...v, multiplier_reason: e.target.value } : v)} placeholder="سبب الأوردر البعيد" className="mt-2 w-full rounded-xl border p-2 text-right text-sm"/>}</div>
            <Field label="ملاحظات"><textarea value={editDraft.notes} onChange={e => setEditDraft(v => v ? { ...v, notes: e.target.value } : v)} rows={2} className="dawaa-input resize-none text-right"/></Field>
            <div className="rounded-2xl border bg-slate-50 p-3"><p className="mb-2 text-sm font-black">صورة الريسيت</p><input type="file" accept="image/*" capture="environment" onChange={e => { setEditReceiptFile(e.target.files?.[0] || null); setEditReceiptState("not_uploaded"); }} className="w-full text-xs"/>{editReceiptFile && <button type="button" onClick={() => void uploadEditReceipt()} disabled={editReceiptState === "uploading"} className="mt-3 w-full rounded-xl bg-[#008E92] py-2 text-xs font-black text-white">{editReceiptState === "uploading" ? "جاري رفع الريسيت..." : editReceiptState === "failed" || editReceiptState === "pending_retry" ? "إعادة رفع الريسيت" : "رفع الريسيت"}</button>}<p className={`mt-2 text-xs font-black ${editReceiptState === "uploaded" ? "text-emerald-700" : editReceiptState === "failed" ? "text-rose-600" : "text-slate-500"}`}>{editReceiptState === "uploaded" ? "تم رفع الريسيت بنجاح ✅" : editReceiptState === "failed" ? "فشل رفع الريسيت، حاول مرة أخرى ❌" : editReceiptState === "pending_retry" ? "محفوظ مؤقتًا وينتظر الإنترنت" : "رفع الريسيت اختياري"}</p></div>
            <Field label="سبب التعديل (اختياري)"><input value={editReason} onChange={e => setEditReason(e.target.value)} placeholder="مثال: تصحيح رقم الفاتورة" className="dawaa-input text-right"/></Field>
            <button onClick={() => void handleSaveEditOrder()} disabled={saving} className="w-full rounded-2xl bg-[#008E92] py-4 text-lg font-black text-white disabled:opacity-50">{saving ? "جاري حفظ التعديل..." : "حفظ التعديلات"}</button>
          </div>}
        </Sheet>

        {/* FAIL REASON */}
        <Sheet
          open={activeModal === "fail_reason"}
          title="سبب فشل الأوردر"
          onClose={() => {
            setActiveModal("orders");
            setFailOrderId(null);
            setFailReason("");
          }}
        >
          <div className="mb-3 grid grid-cols-2 gap-2">{["العميل لا يرد", "العنوان غير واضح", "العميل رفض الطلب", "تأجيل", "أخرى"].map(reason => <button key={reason} onClick={() => setFailReason(reason)} className={`rounded-xl border p-2 text-xs font-black ${failReason === reason ? "border-rose-400 bg-rose-50 text-rose-700" : "bg-white text-slate-600"}`}>{reason}</button>)}</div>
          <Field label="اكتب سبب الفشل *">
            <textarea
              value={failReason}
              onChange={(e) => setFailReason(e.target.value)}
              rows={3}
              className="dawaa-input text-right resize-none"
              placeholder="مثال: مش لاقي العميل..."
            />
          </Field>
          <button
            onClick={handleFailed}
            disabled={!failReason.trim()}
            className="w-full rounded-2xl bg-red-500 py-4 font-black text-white disabled:opacity-50"
          >
            تأكيد الفشل
          </button>
        </Sheet>

        {/* TODAY TRIPS */}
        <Sheet
          open={activeModal === "trips"}
          title={`${tripViewTitle} (${displayedTrips.length})`}
          onClose={() => setActiveModal(null)}
        >
          {displayedTrips.length === 0 ? (
            <p className="py-8 text-center text-slate-400 font-bold">
              لا توجد مشاوير في هذا القسم
            </p>
          ) : (
            displayedTrips.map((t) => (
              <div
                key={t.id}
                className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm space-y-1"
              >
                <div className="flex items-center justify-between">
                  <p className="font-black">
                    {TRIP_TYPE_LABELS[t.trip_type] ?? t.trip_type}
                  </p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-black ${t.status === "approved" ? "bg-emerald-100 text-emerald-700" : t.status === "rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}
                  >
                    {TRIP_STATUS_LABELS[t.status] ?? t.status}
                  </span>
                </div>
                <p className="text-sm text-slate-600">
                  {t.from_label} → {t.to_label}
                </p>
                <p className="text-sm text-slate-500">{t.reason}</p>
                <p className="text-xs font-black text-slate-500">
                  {(t as any).proof_image_url ? "صورة إثبات موجودة ✅" : (t as any).proof_exception_status === "pending" ? "استثناء بدون صورة تحت المراجعة ⚠️" : "بدون صورة إثبات ❌"}
                </p>
                {(t as any).proof_image_url && (
                  <img src={(t as any).proof_image_url} alt="إثبات المشوار" className="mt-2 h-32 w-full rounded-2xl object-cover border" />
                )}
                {t.status === "approved" && (
                  <p className="text-sm font-black text-emerald-600">
                    {formatMoney(t.trip_earning)}
                  </p>
                )}
                {t.status === "rejected" && (
                  <p className="text-xs text-red-500">{t.rejection_reason}</p>
                )}
              </div>
            ))
          )}
        </Sheet>

        {/* REVIEW SUMMARY */}
        <Sheet
          open={activeModal === "pay"}
          title="ملخص التسجيلات تحت المراجعة"
          onClose={() => setActiveModal(null)}
        >
          <div className="rounded-2xl bg-teal-50 border border-[#008E92] p-5 text-center">
            <p className="text-sm font-bold text-teal-700">
              الدورة: {period.start} → {period.end}
            </p>
            <p className="mt-3 text-3xl font-black text-[#008E92]">
              بدون حساب راتب نهائي
            </p>
            <p className="text-sm text-teal-600">
              هذه الصفحة لتتبع التسجيلات ومراجعة تشغيلية فقط. الحساب النهائي يتم
              إداريًا حسب الحضور والالتزام.
            </p>
          </div>
          <div className="space-y-2">
            {[
              { label: "أوردرات اليوم المسجلة", value: todayTotalOrders },
              { label: "إجمالي أوردرات الدورة", value: cycleTotalOrders },
              { label: "اتسلموا بانتظار مطابقة بي كونكت", value: delivered },
              { label: "أوردرات فاشلة لا تحتسب", value: failedOrders },
              { label: "أوردرات معتمدة بعد المطابقة", value: countableOrders },
              { label: "أوردرات ×1.5 للمراجعة", value: mult15 },
              { label: "فواتير مكررة/استثنائية", value: dups },
              { label: "مشاوير اليوم", value: todayTotalTrips },
              { label: "إجمالي مشاوير الدورة", value: cycleTotalTrips },
              {
                label: "مشاوير معتمدة",
                value: safeTrips.filter((t) => t.status === "approved").length,
              },
            ].map((row) => (
              <div
                key={row.label}
                className="flex justify-between rounded-xl bg-white p-3 shadow-sm"
              >
                <span className="font-bold text-slate-600">{row.label}</span>
                <span className="font-black">{row.value}</span>
              </div>
            ))}
          </div>
        </Sheet>
      </div>
    </>
  );
}

// ─── Small components ─────────────────────────────────────────────────────────

function RiderLineChart({
  title,
  values,
}: {
  title: string;
  values: { label: string; value: number }[];
}) {
  const safeValues = values.length
    ? values
    : [{ label: "لا توجد بيانات", value: 0 }];
  const max = Math.max(1, ...safeValues.map((v) => v.value));
  const chartW = 320;
  const chartH = 150;
  const padX = 18;
  const padY = 18;
  const points = safeValues.map((v, i) => {
    const x =
      safeValues.length <= 1
        ? chartW / 2
        : padX + (i / (safeValues.length - 1)) * (chartW - padX * 2);
    const y = chartH - padY - (v.value / max) * (chartH - padY * 2);
    return { x, y, ...v };
  });
  const line = points.map((p) => `${p.x},${p.y}`).join(" ");
  const area = `${padX},${chartH - padY} ${line} ${chartW - padX},${chartH - padY}`;
  const total = safeValues.reduce((sum, v) => sum + v.value, 0);
  const best = safeValues.reduce(
    (acc, v) => (v.value > acc.value ? v : acc),
    safeValues[0],
  );
  const avg = safeValues.length ? total / safeValues.length : 0;

  return (
    <section className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-black text-[#061827]">{title}</h3>
        <span className="rounded-2xl bg-[#EAF8F8] px-3 py-1 text-xs font-black text-[#008E92]">
          تحليل الدورة
        </span>
      </div>
      <div className="rounded-3xl bg-gradient-to-b from-emerald-50 to-white p-3">
        <svg
          viewBox={`0 0 ${chartW} ${chartH}`}
          className="h-48 w-full overflow-visible"
          role="img"
          aria-label={title}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
            const y = chartH - padY - tick * (chartH - padY * 2);
            return (
              <line
                key={tick}
                x1={padX}
                x2={chartW - padX}
                y1={y}
                y2={y}
                stroke="#dbe7e8"
                strokeDasharray="4 5"
                strokeWidth="1"
              />
            );
          })}
          <polygon points={area} fill="#008E92" opacity="0.10" />
          <polyline
            points={line}
            fill="none"
            stroke="#008E92"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {points.map((p, i) => (
            <g key={`${p.label}-${i}`}>
              <circle
                cx={p.x}
                cy={p.y}
                r="5"
                fill="#fff"
                stroke="#008E92"
                strokeWidth="3"
              />
              {p.value > 0 && (
                <text
                  x={p.x}
                  y={p.y - 10}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="800"
                  fill="#064e52"
                >
                  {p.value}
                </text>
              )}
            </g>
          ))}
        </svg>
        <div className="mt-1 flex items-center justify-between gap-1 text-center text-[10px] font-bold text-slate-400">
          {points.map((v, i) => (
            <span className="min-w-0 flex-1 truncate" key={`${v.label}-${i}`}>
              {v.label}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 rounded-3xl bg-slate-50 p-3 text-center">
        <div>
          <p className="text-[10px] font-bold text-slate-400">المتوسط اليومي</p>
          <p className="font-black text-[#008E92]">{avg.toFixed(1)}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-slate-400">أعلى يوم</p>
          <p className="font-black text-[#008E92]">{best?.value ?? 0}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-slate-400">إجمالي الفترة</p>
          <p className="font-black text-[#008E92]">{total}</p>
        </div>
      </div>
    </section>
  );
}

function ActionHero({
  title,
  subtitle,
  icon,
  onClick,
}: {
  title: string;
  subtitle: string;
  icon: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group relative min-h-[150px] overflow-hidden rounded-[28px] bg-gradient-to-br from-[#009A9E] to-[#063B48] p-5 text-right text-white shadow-xl transition active:scale-[0.98]"
    >
      <div className="absolute -left-10 -top-10 h-32 w-32 rounded-full bg-white/10" />
      <div className="absolute bottom-4 left-5 grid h-12 w-12 place-items-center rounded-2xl bg-white text-2xl text-[#063B48] shadow-lg transition group-active:translate-x-1">
        ←
      </div>
      <div className="absolute left-20 top-8 text-6xl opacity-70">{icon}</div>
      <p className="relative text-3xl font-black leading-tight">{title}</p>
      <p className="relative mt-3 text-sm font-bold text-teal-50">{subtitle}</p>
    </button>
  );
}

function ActionMini({
  title,
  subtitle,
  icon,
  onClick,
}: {
  title: string;
  subtitle: string;
  icon: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex min-h-[70px] items-center justify-between rounded-[24px] border border-slate-100 bg-white p-4 text-right shadow-sm transition active:scale-[0.98]"
    >
      <div>
        <p className="text-lg font-black text-[#061827]">{title}</p>
        <p className="text-xs font-bold text-slate-500">{subtitle}</p>
      </div>
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#EAF8F8] text-2xl">
        {icon}
      </span>
    </button>
  );
}

function MetricCard({
  label,
  sub,
  value,
  icon,
  tone,
  onClick,
}: {
  label: string;
  sub?: string;
  value: string | number;
  icon: string;
  tone: "green" | "blue" | "orange" | "red" | "purple";
  onClick: () => void;
}) {
  const toneMap = {
    green: "bg-emerald-50 text-emerald-700",
    blue: "bg-sky-50 text-sky-700",
    orange: "bg-amber-50 text-amber-700",
    red: "bg-rose-50 text-rose-700",
    purple: "bg-violet-50 text-violet-700",
  } as const;
  return (
    <button
      onClick={onClick}
      className="rounded-3xl border border-slate-100 bg-white p-4 text-center shadow-sm transition active:scale-[0.98]"
    >
      <span
        className={`mx-auto grid h-12 w-12 place-items-center rounded-full text-sm font-black ${toneMap[tone]}`}
      >
        {icon}
      </span>
      <p className="mt-2 text-3xl font-black text-[#061827]">{value}</p>
      <p className="text-sm font-black text-slate-600">{label}</p>
      {sub && <p className="text-xs font-bold text-slate-400">{sub}</p>}
    </button>
  );
}

function NotificationItem({
  icon,
  title,
  text,
}: {
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#EAF8F8] text-xl">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-black text-[#061827]">{title}</p>
          <p className="mt-1 text-sm font-bold leading-6 text-slate-600">
            {text}
          </p>
        </div>
      </div>
    </div>
  );
}

function PolicyTile({
  icon,
  title,
  text,
}: {
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <button className="rounded-3xl border border-slate-100 bg-slate-50 p-4 text-center transition active:scale-[0.98]">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-2xl shadow-sm">
        {icon}
      </span>
      <p className="mt-2 text-sm font-black text-[#061827]">{title}</p>
      <p className="mt-1 text-[11px] font-bold leading-5 text-slate-500">
        {text}
      </p>
    </button>
  );
}

function SummaryLine({
  icon,
  label,
  value,
  tone,
}: {
  icon: string;
  label: string;
  value: React.ReactNode;
  tone: "green" | "blue" | "orange" | "red";
}) {
  const toneMap = {
    green: "bg-emerald-50 text-emerald-700",
    blue: "bg-sky-50 text-sky-700",
    orange: "bg-amber-50 text-amber-700",
    red: "bg-rose-50 text-rose-700",
  } as const;
  return (
    <div className="flex items-center gap-3 py-3">
      <span
        className={`grid h-9 w-9 place-items-center rounded-full ${toneMap[tone]}`}
      >
        {icon}
      </span>
      <p className="flex-1 text-sm font-black text-slate-600">{label}</p>
      <p className="max-w-[50%] text-left text-sm font-black text-[#061827]">
        {value}
      </p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-black text-[#061827]">{label}</label>
      {children}
    </div>
  );
}

function Sheet({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col" dir="rtl">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative mt-auto max-h-[92vh] overflow-y-auto rounded-t-3xl bg-[#F3F7F8] px-4 pb-8 pt-4 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-black text-[#061827]">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-xl bg-white p-2 shadow-sm"
          >
            <X size={20} />
          </button>
        </div>
        <div className="space-y-4">{children}</div>
      </div>
    </div>
  );
}
