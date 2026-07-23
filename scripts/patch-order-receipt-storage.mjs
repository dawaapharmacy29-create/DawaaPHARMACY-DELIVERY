import fs from 'node:fs';

const filePath = 'src/pages/rider/RiderDashboard.tsx';
const marker = '// storage-capacity-guard: compressed stable order receipt upload';

let source = fs.readFileSync(filePath, 'utf8');

if (source.includes(marker)) {
  console.log('Order receipt storage guard already applied.');
  process.exit(0);
}

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
    const originalFile = e.target.files?.[0] || null;
    const file = originalFile ? await compressImageForUpload(originalFile) : null;
    setReceiptFile(file);
    setReceiptOcrNote("");
    setReceiptUploadInfo(null);
    setReceiptUploadState("not_uploaded");
    setReceiptUploadError("");
    setReceiptOcrData(null);
    if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
    setReceiptPreviewUrl(file ? URL.createObjectURL(file) : "");
    if (import.meta.env.DEV && originalFile && file) {
      console.debug("order receipt compressed", {
        originalSize: originalFile.size,
        compressedSize: file.size,
        reductionPercent: originalFile.size > 0
          ? Math.round((1 - file.size / originalFile.size) * 100)
          : 0,
      });
    }
    e.target.value = "";
  }`;

const oldPath = `    const ext = receiptFile.name.split(".").pop()?.toLowerCase() || "jpg";
    const safeInvoice =
      currentInvoiceNumber.replace(/[^a-zA-Z0-9_.-]/g, "_") || "no_invoice";
    const path = \`orders/\${rider.id}/\${activeWorkDate}/\${Date.now()}-\${safeInvoice}.\${ext}\`;`;

const newPath = `    ${marker}
    const safeInvoice =
      currentInvoiceNumber.replace(/[^a-zA-Z0-9_.-]/g, "_") || "no_invoice";
    // A stable path means retries and repeated clicks replace the same proof instead of
    // creating a new multi-megabyte object on every attempt.
    const path = \`orders/\${rider.id}/\${activeWorkDate}/\${safeInvoice}.jpg\`;`;

const oldUpload = `.upload(path, receiptFile, { cacheControl: "3600", upsert: false });`;
const newUpload = `.upload(path, receiptFile, {
        cacheControl: "31536000",
        contentType: "image/jpeg",
        upsert: true,
      });`;

const oldInfo = `      fileName: receiptFile.name,
      fileSize: receiptFile.size,
      mimeType: receiptFile.type || "image/jpeg",`;
const newInfo = `      fileName: receiptFile.name || "order-receipt-compressed.jpg",
      fileSize: receiptFile.size,
      mimeType: "image/jpeg",`;

const replacements = [
  [oldHandler, newHandler, 'receipt file handler'],
  [oldPath, newPath, 'stable receipt path'],
  [oldUpload, newUpload, 'upsert upload options'],
  [oldInfo, newInfo, 'receipt metadata'],
];

for (const [oldText, newText, label] of replacements) {
  if (!source.includes(oldText)) {
    throw new Error(`Could not find ${label}; RiderDashboard changed and needs a manual review.`);
  }
  source = source.replace(oldText, newText);
}

fs.writeFileSync(filePath, source, 'utf8');
console.log('Applied order receipt compression and stable-path storage guard.');
