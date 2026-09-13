import fs from 'node:fs'

const file = 'src/pages/rider/RiderDashboard.tsx'
const source = fs.readFileSync(file, 'utf8')

const before = `      let gps: { lat: number | null; lng: number | null; accuracy: number | null } = { lat: null, lng: null, accuracy: null };
      try {
        gps = await requestRiderGps();
      } catch {
        toast.info("تعذر قراءة GPS الآن، سيتم تسجيل الأوردر ومراجعته إذا لزم الأمر");
      }
      const receiptUpload = await uploadReceiptPhoto(invoiceNumber.trim());`

const after = `      const gpsPromise = requestRiderGps().catch(() => {
        toast.info("تعذر قراءة GPS الآن، سيتم تسجيل الأوردر ومراجعته إذا لزم الأمر");
        return { lat: null, lng: null, accuracy: null };
      });
      const receiptUploadPromise = uploadReceiptPhoto(invoiceNumber.trim());
      // GPS ورفع الريسيت مستقلان؛ تشغيلهما بالتوازي يقلل زمن الحفظ مع الحفاظ على الاثنين.
      const [gps, receiptUpload] = await Promise.all([gpsPromise, receiptUploadPromise]);`

if (source.includes(after)) {
  console.log('Rider order fast-save patch already applied')
  process.exit(0)
}

if (!source.includes(before)) {
  console.error('Rider order fast-save patch anchor not found')
  process.exit(1)
}

fs.writeFileSync(file, source.replace(before, after))
console.log('Rider order save now runs GPS and receipt upload concurrently')
