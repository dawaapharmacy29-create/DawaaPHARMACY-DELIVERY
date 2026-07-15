from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
DASHBOARD = ROOT / "src/pages/rider/RiderDashboard.tsx"
MIGRATIONS = ROOT / "supabase/migrations"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


text = DASHBOARD.read_text(encoding="utf-8")

# 1) Helpers: never append the same trip twice to React state.
anchor = """function uniqueCustomers(rows: NormalizedCustomer[]): NormalizedCustomer[] {
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
"""
replacement = anchor + """
function prependUniqueTrip(rows: InternalTrip[], trip: InternalTrip): InternalTrip[] {
  const tripId = String((trip as any)?.id || "");
  const requestId = String((trip as any)?.client_request_id || "");
  const filtered = rows.filter((row: any) => {
    if (tripId && String(row?.id || "") === tripId) return false;
    if (requestId && String(row?.client_request_id || "") === requestId) return false;
    return true;
  });
  return [trip, ...filtered];
}
"""
text = replace_once(text, anchor, replacement, "prependUniqueTrip helper")

# 2) Exact cycle count state, stable idempotency key, and synchronous save lock.
text = replace_once(
    text,
    """  const [cycleOrders, setCycleOrders] = useState<DeliveryOrder[]>([]);
  const [cycleTrips, setCycleTrips] = useState<InternalTrip[]>([]);
""",
    """  const [cycleOrders, setCycleOrders] = useState<DeliveryOrder[]>([]);
  const [cycleTrips, setCycleTrips] = useState<InternalTrip[]>([]);
  const [cycleOrderExactCount, setCycleOrderExactCount] = useState<number | null>(null);
""",
    "cycle exact count state",
)

text = replace_once(
    text,
    """  const tripProofCameraInputRef = useRef<HTMLInputElement | null>(null);
  const tripProofGalleryInputRef = useRef<HTMLInputElement | null>(null);
""",
    """  const tripProofCameraInputRef = useRef<HTMLInputElement | null>(null);
  const tripSaveLockRef = useRef(false);
  const tripOperationIdRef = useRef(createClientTripId());
""",
    "trip save refs",
)

text = replace_once(
    text,
    """  const cycleTotalOrders = safeCycleOrders.length;
""",
    """  const cycleTotalOrders = cycleOrderExactCount ?? safeCycleOrders.length;
""",
    "exact cycle total usage",
)

# 3) Retry proof upload must verify the linked DB row before deleting the local blob.
text = replace_once(
    text,
    """      const { data: updatedTrip, error: updateError } = await supabase
        .from("internal_trips")
        .update(patch)
        .eq("id", record.tripId)
        .select("*")
        .single();
      if (updateError) throw updateError;
      await deletePendingTripProof(record.id);
""",
    """      const { data: updatedTrip, error: updateError } = await supabase
        .from("internal_trips")
        .update(patch)
        .eq("id", record.tripId)
        .select("*")
        .single();
      if (updateError) throw updateError;
      const { data: verifiedTrip, error: verifyError } = await supabase
        .from("internal_trips")
        .select("id, proof_image_path, proof_image_url")
        .eq("id", record.tripId)
        .maybeSingle();
      if (verifyError || !verifiedTrip || (!verifiedTrip.proof_image_path && !verifiedTrip.proof_image_url)) {
        throw verifyError || new Error("proof_link_verification_failed");
      }
      await deletePendingTripProof(record.id);
""",
    "proof link verification",
)

# 4) Uploading to Storage alone is not enough to delete the local copy.
text = replace_once(
    text,
    """        if (tripProofLocalId) {
          void deletePendingTripProof(tripProofLocalId).then(refreshPendingTripProofs).catch(() => {});
        }
""",
    """        // Keep the local proof until the trip row is saved and verified with this path.
""",
    "defer local proof deletion",
)

# 5) Reset creates a fresh operation id only after a completed/cancelled form.
text = replace_once(
    text,
    """    setTripProofRetryCount(0);
    setAllowTripProofException(false);
""",
    """    setTripProofRetryCount(0);
    tripOperationIdRef.current = createClientTripId();
    setAllowTripProofException(false);
""",
    "reset stable operation id",
)

# 6) Lock before the first await; all retries in the same form use one request id.
text = replace_once(
    text,
    """  async function handleSaveTrip() {
    if (!rider) return;
    const finalToLabel =
""",
    """  async function handleSaveTrip() {
    if (!rider) return;
    if (tripSaveLockRef.current) {
      toast.info("جاري حفظ نفس المشوار بالفعل — لا تضغط مرة أخرى");
      return;
    }
    tripSaveLockRef.current = true;
    setSaving(true);
    const finalToLabel =
""",
    "early trip lock",
)

text = replace_once(
    text,
    """    try {
      setSaving(true);
      let tripProofUpload = tripProofUploadInfo;
""",
    """    try {
      let tripProofUpload = tripProofUploadInfo;
""",
    "remove late saving state",
)

text = replace_once(
    text,
    """      const clientRequestId = typeof crypto !== 'undefined' && (crypto as any).randomUUID ? (crypto as any).randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
""",
    """      const clientRequestId = tripOperationIdRef.current;
""",
    "stable client request id",
)

text = replace_once(
    text,
    """    } finally {
      setSaving(false);
    }
  }

  // ── ORDER STATUS""",
    """    } finally {
      tripSaveLockRef.current = false;
      setSaving(false);
    }
  }

  // ── ORDER STATUS""",
    "unlock trip save",
)

# 7) Dedupe every local prepend path.
text = text.replace(
    "setTrips((prev) => [existing as InternalTrip, ...prev])",
    "setTrips((prev) => prependUniqueTrip(prev, existing as InternalTrip))",
)
text = text.replace(
    "setTrips((prev) => [data as InternalTrip, ...prev]);",
    "setTrips((prev) => prependUniqueTrip(prev, data as InternalTrip));",
)

# Offline optimistic row: replace the exact multi-line prepend.
text = replace_once(
    text,
    """        setTrips((prev) => [
          {
            ...(payload as any),
            offline_sync_status: "pending",
          } as InternalTrip,
          ...prev,
        ]);
""",
    """        setTrips((prev) =>
          prependUniqueTrip(prev, {
            ...(payload as any),
            offline_sync_status: "pending",
          } as InternalTrip),
        );
""",
    "offline optimistic dedupe",
)

# 8) Delete cached proof only after the saved row is verified to contain the uploaded path/url.
text = replace_once(
    text,
    """      setTrips((prev) => prependUniqueTrip(prev, data as InternalTrip));
      toast.success(isPendingProofUpload ? "تم حفظ المشوار، جاري رفع صورة الإثبات عند تحسن الشبكة" : "تم تسجيل المشوار وهو بانتظار الاعتماد");
""",
    """      setTrips((prev) => prependUniqueTrip(prev, data as InternalTrip));
      if (hasProofUpload && tripProofLocalId) {
        const { data: verifiedTrip, error: verifyError } = await supabase
          .from("internal_trips")
          .select("id, proof_image_path, proof_image_url")
          .eq("id", data.id)
          .maybeSingle();
        if (!verifyError && verifiedTrip && (verifiedTrip.proof_image_path || verifiedTrip.proof_image_url)) {
          await deletePendingTripProof(tripProofLocalId);
          await refreshPendingTripProofs();
        }
      }
      toast.success(isPendingProofUpload ? "تم حفظ المشوار، جاري رفع صورة الإثبات عند تحسن الشبكة" : "تم تسجيل المشوار وهو بانتظار الاعتماد");
""",
    "delete proof after verified trip save",
)

# 9) Exact cycle count, independent from the potentially capped row list.
text = replace_once(
    text,
    """        if (cycleTripRes.status === "fulfilled")
          setCycleTrips((cycleTripRes.value.data ?? []) as InternalTrip[]);
""",
    """        if (cycleTripRes.status === "fulfilled")
          setCycleTrips((cycleTripRes.value.data ?? []) as InternalTrip[]);

        const { count: exactCycleCount, error: exactCycleCountError } = await supabase
          .from("delivery_orders")
          .select("id", { count: "exact", head: true })
          .eq("rider_id", riderId)
          .is("deleted_at", null)
          .or(
            `and(work_date.gte.${period.start},work_date.lte.${period.end}),and(delivery_date.gte.${period.start},delivery_date.lte.${period.end})`,
          );
        if (!exactCycleCountError && typeof exactCycleCount === "number") {
          setCycleOrderExactCount(exactCycleCount);
        }
""",
    "exact cycle count load",
)

# 10) Camera-only trip proof. Remove gallery button and its input.
button_pattern = re.compile(
    r"\n\s*<button\n\s*type=\"button\"\n\s*onClick=\{handleOpenTripProofGallery\}[\s\S]*?</button>",
    re.MULTILINE,
)
text, count = button_pattern.subn("", text, count=1)
if count != 1:
    raise RuntimeError(f"gallery button removal: expected one match, found {count}")

input_pattern = re.compile(
    r"\n\s*<input\n\s*ref=\{tripProofGalleryInputRef\}[\s\S]*?\n\s*/>",
    re.MULTILINE,
)
text, count = input_pattern.subn("", text, count=1)
if count != 1:
    raise RuntimeError(f"gallery input removal: expected one match, found {count}")

text = text.replace(
    "لو الكاميرا لم تفتح، تأكد من السماح للكاميرا من إعدادات المتصفح أو اختر صورة من المعرض.",
    "لو الكاميرا لم تفتح، اسمح للتطبيق باستخدام الكاميرا من إعدادات المتصفح. لا يمكن اختيار صورة قديمة من المعرض.",
)

# Remove any now-unused gallery opener function conservatively.
gallery_fn_pattern = re.compile(
    r"\n\s*(?:async\s+)?function handleOpenTripProofGallery\([^)]*\)\s*\{[\s\S]*?\n\s*\}",
    re.MULTILINE,
)
text, _ = gallery_fn_pattern.subn("", text, count=1)

DASHBOARD.write_text(text, encoding="utf-8")

# DB-level idempotency. Existing rows are preserved; this only rejects reuse of the same request key.
MIGRATIONS.mkdir(parents=True, exist_ok=True)
migration = MIGRATIONS / "20260715143000_internal_trips_idempotency.sql"
migration.write_text(
    """-- Prevent one client operation from creating more than one trip.
-- This migration is non-destructive and does not delete or merge existing rows.

create unique index if not exists internal_trips_client_request_id_uidx
  on public.internal_trips (client_request_id)
  where client_request_id is not null;

comment on index public.internal_trips_client_request_id_uidx is
  'Idempotency guard: retries of the same rider trip operation must return/reuse one row.';
""",
    encoding="utf-8",
)

print("Applied rider trip safety and exact cycle count patch successfully.")
