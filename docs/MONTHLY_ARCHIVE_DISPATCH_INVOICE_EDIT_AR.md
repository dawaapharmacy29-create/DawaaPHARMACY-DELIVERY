# المرحلة المتقدمة: أرشيف شهري + وقت خروج الأوردر + تعديل رقم الفاتورة

## ما تم تنفيذه

1. تسجيل وقت خروج الأوردر:
   - عند تسجيل الأوردر من الدليفري يتم حفظ:
     - registered_at
     - dispatched_at
     - dispatch_status = dispatched

2. تعديل رقم الفاتورة:
   - متاح من لوحة مدير الفرع فقط.
   - يتم حفظ الرقم القديم والجديد واسم المدير والسبب.
   - بعد التعديل تعود الفاتورة لحالة pending_reconciliation حتى تتم المطابقة من جديد.

3. أرشيف شهري دائم:
   - monthly_invoice_import_batches
   - monthly_system_invoices
   - monthly_invoice_reconciliation_results
   - monthly_rider_performance_archive

4. البحث برقم الفاتورة:
   - دالة search_invoice_global تعرض الفاتورة من التطبيق ومن ملف السيستم.
   - توضح الدليفري، وقت التسجيل، وقت الخروج، العميل، القيمة، حالة المطابقة.

## الملفات المعدلة
- src/pages/rider/RiderDashboard.tsx
- src/pages/admin/BranchManagerDashboard.tsx
- src/pages/admin/Reconciliation.tsx
- src/components/ProtectedRoute.tsx
- supabase/45_monthly_archive_dispatch_invoice_edit.sql

## التشغيل
شغّل SQL:
supabase/45_monthly_archive_dispatch_invoice_edit.sql

ثم ارفع الكود:
git add .
git commit -m "feat: monthly archive dispatch time and branch invoice edit"
git push origin main
