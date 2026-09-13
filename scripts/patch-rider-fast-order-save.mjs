import fs from 'node:fs'

const file = 'src/pages/rider/RiderDashboard.tsx'
let source = fs.readFileSync(file, 'utf8')
let changed = false

const orderBefore = `      let gps: { lat: number | null; lng: number | null; accuracy: number | null } = { lat: null, lng: null, accuracy: null };
      try {
        gps = await requestRiderGps();
      } catch {
        toast.info("تعذر قراءة GPS الآن، سيتم تسجيل الأوردر ومراجعته إذا لزم الأمر");
      }
      const receiptUpload = await uploadReceiptPhoto(invoiceNumber.trim());`

const orderAfter = `      const gpsPromise = requestRiderGps().catch(() => {
        toast.info("تعذر قراءة GPS الآن، سيتم تسجيل الأوردر ومراجعته إذا لزم الأمر");
        return { lat: null, lng: null, accuracy: null };
      });
      const receiptUploadPromise = uploadReceiptPhoto(invoiceNumber.trim());
      // GPS ورفع الريسيت مستقلان؛ تشغيلهما بالتوازي يقلل زمن الحفظ مع الحفاظ على الاثنين.
      const [gps, receiptUpload] = await Promise.all([gpsPromise, receiptUploadPromise]);`

if (source.includes(orderBefore)) {
  source = source.replace(orderBefore, orderAfter)
  changed = true
  console.log('Rider order save now runs GPS and receipt upload concurrently')
} else if (!source.includes(orderAfter)) {
  console.error('Rider order fast-save patch anchor not found')
  process.exit(1)
} else {
  console.log('Rider order fast-save patch already applied')
}

const tripBefore = `      if (hasProofUpload && tripProofLocalId && tripProofFile) {
        const { data: verifiedTrip, error: verifyError } = await supabase
          .from("internal_trips")
          .select("id,client_request_id,proof_capture_session_id,proof_sha256,proof_image_path,proof_image_url")
          .eq("client_request_id", clientRequestId)
          .maybeSingle();
        if (
          !verifyError &&
          verifiedTrip &&
          ((verifiedTrip as any).proof_image_path || (verifiedTrip as any).proof_image_url) &&
          (verifiedTrip as any).client_request_id === clientRequestId &&
          (!tripProofSha256 || (verifiedTrip as any).proof_sha256 === tripProofSha256)
        ) {
          await deletePendingTripProof(tripProofLocalId).then(refreshPendingTripProofs).catch(() => {});
        } else {
          await savePendingTripProof({
            id: tripProofLocalId,
            tripId: data.id,
            clientRequestId,
            captureSessionId: tripCaptureSessionIdRef.current,
            riderId: rider.id,
            blob: tripProofFile,
            fileName: tripProofFile.name || "trip-proof.jpg",
            mimeType: tripProofFile.type || "image/jpeg",
            capturedAt: proofCapturedAt,
            cameraOpenedAt: tripProofCameraOpenedAt || null,
            proofSha256: tripProofSha256 || null,
            createdAt: new Date().toISOString(),
            uploadPath: tripProofStoragePath || tripProofUpload?.path || null,
            retryCount: tripProofRetryCount,
            lastError: "trip_proof_verification_failed",
          }).then(refreshPendingTripProofs).catch(() => {});
        }
      }`

const tripAfter = `      if (hasProofUpload && tripProofLocalId && tripProofFile) {
        // الحفظ على السيرفر تم بالفعل؛ التحقق والتنظيف المحلي لا يجب أن يعطلا المندوب أمام شاشة الحفظ.
        void (async () => {
          try {
            const { data: verifiedTrip, error: verifyError } = await supabase
              .from("internal_trips")
              .select("id,client_request_id,proof_capture_session_id,proof_sha256,proof_image_path,proof_image_url")
              .eq("client_request_id", clientRequestId)
              .maybeSingle();
            if (
              !verifyError &&
              verifiedTrip &&
              ((verifiedTrip as any).proof_image_path || (verifiedTrip as any).proof_image_url) &&
              (verifiedTrip as any).client_request_id === clientRequestId &&
              (!tripProofSha256 || (verifiedTrip as any).proof_sha256 === tripProofSha256)
            ) {
              await deletePendingTripProof(tripProofLocalId).then(refreshPendingTripProofs).catch(() => {});
            } else {
              await savePendingTripProof({
                id: tripProofLocalId,
                tripId: data.id,
                clientRequestId,
                captureSessionId: tripCaptureSessionIdRef.current,
                riderId: rider.id,
                blob: tripProofFile,
                fileName: tripProofFile.name || "trip-proof.jpg",
                mimeType: tripProofFile.type || "image/jpeg",
                capturedAt: proofCapturedAt,
                cameraOpenedAt: tripProofCameraOpenedAt || null,
                proofSha256: tripProofSha256 || null,
                createdAt: new Date().toISOString(),
                uploadPath: tripProofStoragePath || tripProofUpload?.path || null,
                retryCount: tripProofRetryCount,
                lastError: "trip_proof_verification_failed",
              }).then(refreshPendingTripProofs).catch(() => {});
            }
          } catch (verificationError) {
            console.warn('[trip-proof] post-save verification deferred', verificationError);
          }
        })();
      }`

if (source.includes(tripBefore)) {
  source = source.replace(tripBefore, tripAfter)
  changed = true
  console.log('Rider trip post-save proof verification no longer blocks modal close')
} else if (!source.includes(tripAfter)) {
  console.error('Rider trip post-save verification patch anchor not found')
  process.exit(1)
} else {
  console.log('Rider trip post-save verification patch already applied')
}

if (changed) fs.writeFileSync(file, source)
