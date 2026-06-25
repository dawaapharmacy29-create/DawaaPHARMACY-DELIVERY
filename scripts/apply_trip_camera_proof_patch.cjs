#!/usr/bin/env node
/**
 * Safe patch for src/pages/rider/RiderDashboard.tsx
 * Adds camera-only trip proof + explicit exception workflow.
 *
 * Run from repo root:
 *   node scripts/apply_trip_camera_proof_patch.cjs
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src', 'pages', 'rider', 'RiderDashboard.tsx');
if (!fs.existsSync(filePath)) {
  console.error('File not found:', filePath);
  process.exit(1);
}

let s = fs.readFileSync(filePath, 'utf8');
const original = s;

function replaceOnce(find, replacement, label) {
  if (!s.includes(find)) {
    console.error(`Patch marker not found: ${label}`);
    process.exit(1);
  }
  s = s.replace(find, replacement);
}

function insertAfter(find, insert, label) {
  if (!s.includes(find)) {
    console.error(`Patch marker not found: ${label}`);
    process.exit(1);
  }
  s = s.replace(find, find + insert);
}

// 1) Trip proof states
insertAfter(
`  const [tripProofNote, setTripProofNote] = useState("");
`,
`  const [tripProofFile, setTripProofFile] = useState<File | null>(null);
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
`,
'trip proof states'
);

// 2) resetTripForm clears proof
insertAfter(
`    setTripProofNote("");
`,
`    setTripProofFile(null);
    setTripProofUploadInfo(null);
    setTripProofUploadState("not_uploaded");
    setTripProofUploadError("");
    setTripProofCapturedAt("");
    setAllowTripProofException(false);
    setTripProofExceptionReason("");
    if (tripProofPreviewUrl) URL.revokeObjectURL(tripProofPreviewUrl);
    setTripProofPreviewUrl("");
`,
'resetTripForm proof reset'
);

// 3) Add trip proof handlers before applyReceiptOcrData
insertAfter(
`    setReceiptUploadState("uploaded");
    return info;
  }
`,
`
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
    const path = \`trips/\${rider.id}/\${activeWorkDate}/\${Date.now()}-\${safeType}.\${ext}\`;

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
`,
'trip proof upload helpers'
);

// 4) Add validations and upload inside handleSaveTrip before old try body
replaceOnce(
`    try {
      setSaving(true);
      const tripRate = rider.trip_rate ?? 10;
      const payload = {
`,
`    const exceptionReason = tripProofExceptionReason.trim();
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
`,
'handleSaveTrip validation/upload'
);

// 5) Replace proof/evidence payload block
replaceOnce(
`        evidence_type: relatedInvoice.trim() ? "invoice" : "none",
        evidence_note: tripProofNote.trim() || null,
        evidence_status: relatedInvoice.trim()
          ? "pending_admin_review"
          : "not_required",
        proof_required: false,
        needs_review: !isShiftOpen,
        review_reason: !isShiftOpen ? "missing_shift" : null,
        review_status: relatedInvoice.trim()
          ? "pending_evidence_review"
          : !isShiftOpen ? "missing_shift" : "pending",
`,
`        evidence_type: relatedInvoice.trim()
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
`,
'payload evidence/proof block'
);

// 6) Replace old easy note with proof UI block
replaceOnce(
`          <div className="rounded-3xl border border-teal-100 bg-teal-50 p-3 text-xs font-bold text-teal-800">
            حالياً لتسهيل تعوّد الدليفري على النظام: المطلوب فقط تحديد{" "}
            <b>منين</b> و <b>لفين</b>. رقم الفاتورة اختياري، وباقي التفاصيل يمكن
            إضافتها لاحقاً من الإدارة.
          </div>
`,
`          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800">
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
`,
'trip modal proof UI block'
);

// 7) Improve trip list card with proof info
replaceOnce(
`                {t.status === "approved" && (
                  <p className="text-sm font-black text-emerald-600">
                    {formatMoney(t.trip_earning)}
                  </p>
                )}
`,
`                <p className="text-xs font-black text-slate-500">
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
`,
'trip list proof display'
);

if (s === original) {
  console.error('No changes made.');
  process.exit(1);
}

const backupPath = `${filePath}.bak-trip-proof-${Date.now()}`;
fs.writeFileSync(backupPath, original, 'utf8');
fs.writeFileSync(filePath, s, 'utf8');

console.log('✅ RiderDashboard trip camera proof patch applied.');
console.log('Backup:', backupPath);
console.log('Next: npm run build');
