import fs from 'node:fs';

const filePath = 'src/pages/rider/RiderDashboard.tsx';
const marker = '// storage-capacity-guard: compressed stable order receipt upload';

let source = fs.readFileSync(filePath, 'utf8');

if (source.includes(marker)) {
  console.log('Order receipt storage guard already applied.');
  process.exit(0);
}

const oldRefs = `  const receiptCameraInputRef = useRef<HTMLInputElement | null>(null);
  const receiptUploadInputRef = useRef<HTMLInputElement | null>(null);`;
const newRefs = `  const receiptCameraInputRef = useRef<HTMLInputElement | null>(null);
  const receiptUploadInputRef = useRef<HTMLInputElement | null>(null);
  const orderReceiptUploadKeyRef = useRef(createClientTripId());
  const receiptUploadLockRef = useRef(false);`;

const oldReset = `    setReceiptOcrData(null);
    setOrderSaveError("");
    setReceiptExtracting(false);`;
const newReset = `    setReceiptOcrData(null);
    setOrderSaveError("");
    setReceiptExtracting(false);
    orderReceiptUploadKeyRef.current = createClientTripId();
    receiptUploadLockRef.current = false;`;

const oldHandler = `  function handleReceiptPhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    setReceiptFile(file);
    setReceiptOcrNote("");
    setReceiptUploadInfo(null);
    setReceiptUploadState(file ? "not_uploaded" : "not_uploaded");
    setReceiptUploadError("");
    setReceiptOcrData(null);
    if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
    setReceiptPreviewUrl(file ? URL.createObjectURL(file) : "");
  }`;

const newHandler = `  async function handleReceiptPhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const originalFile = input.files?.[0] || null;
    input.value = "";

    setReceiptOcrNote("");
    setReceiptUploadInfo(null);
    setReceiptUploadState("not_uploaded");
    setReceiptUploadError("");
    setReceiptOcrData(null);

    if (!originalFile) {
      setReceiptFile(null);
      if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
      setReceiptPreviewUrl("");
      return;
    }

    if (!originalFile.type.startsWith("image/")) {
      setReceiptFile(null);
      toast.error("اختار صورة صحيحة للريسيت");
      return;
    }

    try {
      const compressedFile = await compressImageForUpload(originalFile);
      const finalFile = compressedFile.type === "image/jpeg"
        ? compressedFile
        : new File([compressedFile], "order-receipt.jpg", { type: compressedFile.type || "image/jpeg" });

      setReceiptFile(finalFile);
      if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
      setReceiptPreviewUrl(URL.createObjectURL(finalFile));

      if (import.meta.env.DEV) {
        console.debug("order receipt compressed", {
          originalSize: originalFile.size,
          compressedSize: finalFile.size,
          reductionPercent: originalFile.size > 0
            ? Math.round((1 - finalFile.size / originalFile.size) * 100)
            : 0,
        });
      }
    } catch (error: any) {
      setReceiptFile(null);
      setReceiptPreviewUrl("");
      setReceiptUploadState("failed");
      setReceiptUploadError(error?.message || "تعذر تجهيز الصورة");
      toast.error("تعذر تجهيز صورة الريسيت. أعد التصوير بصورة أوضح.");
    }
  }`;

const oldUploadFunction = `  async function uploadReceiptPhoto(
    currentInvoiceNumber: string,
  ): Promise<ReceiptUploadInfo | null> {
    if (receiptUploadInfo) return receiptUploadInfo;
    if (!receiptFile || !rider) return null;

    setReceiptUploadState("uploading");
    setReceiptUploadError("");

    const ext = receiptFile.name.split(".").pop()?.toLowerCase() || "jpg";
    const safeInvoice =
      currentInvoiceNumber.replace(/[^a-zA-Z0-9_.-]/g, "_") || "no_invoice";
    const path = \`orders/\${rider.id}/\${activeWorkDate}/\${Date.now()}-\${safeInvoice}.\${ext}\`;

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
  }`;

const newUploadFunction = `  async function uploadReceiptPhoto(
    currentInvoiceNumber: string,
  ): Promise<ReceiptUploadInfo | null> {
    if (receiptUploadInfo) return receiptUploadInfo;
    if (!receiptFile || !rider) return null;
    if (receiptUploadLockRef.current) {
      toast.info("جارٍ رفع صورة الريسيت بالفعل");
      return null;
    }

    receiptUploadLockRef.current = true;
    setReceiptUploadState("uploading");
    setReceiptUploadError("");

    ${marker}
    const normalizedInvoice = currentInvoiceNumber.trim();
    const safeInvoice = normalizedInvoice.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const stableObjectKey = safeInvoice || orderReceiptUploadKeyRef.current;
    const path = \`orders/\${rider.id}/\${activeWorkDate}/\${stableObjectKey}.jpg\`;
    const uploadFile = receiptFile;
    const timeoutMs = 60000;
    const maxAttempts = 3;
    let finalError: Error | null = null;

    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const { error } = await uploadWithTimeout(
            supabase.storage
              .from("delivery-receipts")
              .upload(path, uploadFile, {
                cacheControl: "60",
                contentType: "image/jpeg",
                upsert: true,
              }),
            timeoutMs,
          );
          if (error) throw error;

          const { data } = supabase.storage
            .from("delivery-receipts")
            .getPublicUrl(path);
          const version = Date.now();
          const info: ReceiptUploadInfo = {
            path,
            url: \`\${data.publicUrl}?v=\${version}\`,
            fileName: uploadFile.name || "order-receipt-compressed.jpg",
            fileSize: uploadFile.size,
            mimeType: "image/jpeg",
          };
          setReceiptUploadInfo(info);
          setReceiptUploadState("uploaded");
          setReceiptUploadError("");
          return info;
        } catch (error: any) {
          finalError = error instanceof Error ? error : new Error(String(error?.message || error || "upload_failed"));
          if (attempt < maxAttempts) {
            await sleep(backoffDelayMs(attempt - 1));
          }
        }
      }

      const failedMessage = finalError?.message === "timeout"
        ? "انتهى وقت رفع صورة الريسيت. تأكد من الإنترنت وحاول مرة أخرى."
        : \`فشل رفع صورة الريسيت: \${finalError?.message || "خطأ شبكة"}\`;
      setReceiptUploadState(navigator.onLine ? "failed" : "pending_retry");
      setReceiptUploadError(failedMessage);
      return null;
    } finally {
      receiptUploadLockRef.current = false;
    }
  }`;

const replacements = [
  [oldRefs, newRefs, 'receipt upload refs'],
  [oldReset, newReset, 'receipt reset state'],
  [oldHandler, newHandler, 'receipt file handler'],
  [oldUploadFunction, newUploadFunction, 'receipt upload function'],
];

for (const [oldText, newText, label] of replacements) {
  if (!source.includes(oldText)) {
    throw new Error(`Could not find ${label}; RiderDashboard changed and needs a manual review.`);
  }
  source = source.replace(oldText, newText);
}

fs.writeFileSync(filePath, source, 'utf8');
console.log('Applied hardened order receipt compression and stable-path storage guard.');
