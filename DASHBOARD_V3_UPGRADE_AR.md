# تطوير تطبيق الدليفري V3

هذه النسخة تضيف غرفة تحكم تنفيذية لإدارة الدليفري، وتثبت توحيد أسماء الفروع، وتضيف طبقة Views في Supabase لتقارير جودة البيانات وScorecard لكل دليفري.

## أهم الإضافات
- صفحة جديدة: `/admin/executive`
- جدول تحكم الفريق مع مؤشر مخاطر لكل دليفري.
- عرض مشاكل البيانات: أوردر بدون فرع، بدون مندوب، بدون فاتورة، وأسماء فروع غير موحدة.
- تطوير تحليل العملاء مع تصنيف تلقائي عند نقص بيانات الـ view.
- زر واتساب مباشر لكل عميل في صفحة تحليل العملاء.
- SQL جديد: `supabase/54_delivery_command_center_upgrade.sql`.

## خطوات التشغيل
1. ارفع الملفات على GitHub.
2. شغل `pnpm install` ثم `pnpm run build`.
3. شغل ملفات SQL التالية في Supabase:
   - `supabase/53_rider_compensation_profiles.sql`
   - `supabase/54_delivery_command_center_upgrade.sql`
4. افتح Vercel وانتظر حالة Ready.
5. افتح `/admin/executive`.
