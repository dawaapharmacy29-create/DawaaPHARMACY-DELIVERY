# Dawaa Delivery Control

نظام إدارة الدليفري لصيدليات دواء - تحويل دفتر الدليفري الورقي إلى تطبيق إلكتروني ذكي.

**ملاحظة مهمة:** PWA/Service Worker معطل أثناء التطوير لتجنب cache قديم بعد التحديث.

## المتطلبات

- Node.js 18 أو أحدث
- حساب Supabase
- Git

## الإعداد الأولي

### 1. إنشاء مشروع Supabase جديد

1. اذهب إلى [Supabase](https://supabase.com) وسجل حساب جديد
2. أنشئ مشروع جديد باسم `dawaa-delivery-control`
3. انتظر حتى يكتمل إنشاء المشروع

### 2. تشغيل ملفات SQL

افتح Supabase SQL Editor وشغل الملفات بالترتيب:

1. `supabase/01_schema.sql` - إنشاء الجداول
2. `supabase/02_functions.sql` - إنشاء الدوال
3. `supabase/03_rls.sql` - إعداد سياسات الأمان
4. `supabase/04_seed_admin.sql` - إنشاء المستخدم الأول

### 3. إنشاء Auth User الأول

**مهم جداً:** قبل تشغيل `04_seed_admin.sql`، يجب إنشاء Auth User من Supabase Dashboard:

1. اذهب إلى Authentication > Users
2. اضغط Add user
3. أدخل:
   - Email: `dr.moaz@dawaa-delivery.local`
   - Password: `9493`
   - Auto-confirm user: نعم
4. احفظ المستخدم
5. انسخ User ID من الصفحة
6. عد إلى SQL Editor واستبدل `AUTH_USER_ID` في `04_seed_admin.sql` بالـ UUID الفعلي
7. شغل الجزء المعلق في `04_seed_admin.sql`

### 4. إعداد البيئة

1. انسخ `.env.example` إلى `.env`
2. افتح `.env` وأضف:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```
3. يمكنك الحصول على هذه القيم من Supabase Dashboard > Settings > API

### 5. تشغيل المشروع محلياً

```bash
# تثبيت الاعتماديات
npm install

# تشغيل خادم التطوير
npm run dev
```

افتح المتصفح على `http://localhost:5173`

### 6. تسجيل الدخول

استخدم:
- Username: `DR.MOAZ`
- Password: `9493`

## هيكل المشروع

```
dawaa-delivery-control/
├── src/
│   ├── lib/
│   │   ├── supabase.ts       # إعداد Supabase
│   │   ├── types.ts          # تعريفات TypeScript
│   │   ├── helpers.ts        # دوال مساعدة
│   │   └── auth.ts           # دوال المصادقة
│   ├── pages/
│   │   ├── Login.tsx         # صفحة تسجيل الدخول
│   │   ├── rider/
│   │   │   └── RiderDashboard.tsx  # لوحة الدليفري
│   │   └── admin/
│   │       └── AdminDashboard.tsx  # لوحة الإدارة
│   ├── App.tsx               # التطبيق الرئيسي
│   ├── main.tsx              # نقطة الدخول
│   └── index.css             # التنسيقات
├── supabase/
│   ├── 01_schema.sql         # إنشاء الجداول
│   ├── 02_functions.sql      # الدوال
│   ├── 03_rls.sql            # سياسات الأمان
│   ├── 04_seed_admin.sql     # بيانات الإدارة
│   └── 05_seed_demo.sql      # بيانات تجريبية
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── README.md
```

## الجداول الرئيسية

- `branches` - الفروع
- `user_profiles` - بيانات المستخدمين
- `riders` - بيانات الدليفري
- `customers` - بيانات العملاء
- `attendance` - سجل الحضور والانصراف
- `delivery_orders` - أوردرات التوصيل
- `internal_trips` - المشاوير الداخلية
- `bconnect_invoices` - فواتير بي كونكت
- `reconciliation_results` - نتائج المطابقة
- `monthly_payroll` - المستحقات الشهرية
- `incidents` - الأخطاء والملاحظات
- `performance_scores` - درجات الأداء
- `notifications` - التنبيهات
- `audit_log` - سجل التدقيق

## الصفحات

### صفحة الدخول
- `/login` - تسجيل الدخول باسم المستخدم وكلمة السر

### صفحات الدليفري
- `/rider` - لوحة الدليفري الرئيسية
- `/rider/orders` - أوردرات اليوم
- `/rider/trips` - مشاوير اليوم
- `/rider/pay` - المستحقات

### صفحات الإدارة
- `/admin` - لوحة الإدارة الرئيسية
- `/admin/orders` - إدارة الأوردرات
- `/admin/trips` - إدارة المشاوير
- `/admin/bconnect-import` - رفع فواتير بي كونكت
- `/admin/reconciliation` - مطابقة الفواتير
- `/admin/monthly-review` - مراجعة الشهر
- `/admin/payroll` - المستحقات والحوافز
- `/admin/incidents` - الأخطاء والملاحظات
- `/admin/leaderboard` - ترتيب الدليفري
- `/admin/riders` - إدارة الدليفري
- `/admin/customers` - إدارة العملاء
- `/admin/settings` - الإعدادات

## الفترة التشغيلية

الشهر التشغيلي من يوم 26 إلى 25:
- لو اليوم >= 26: من 26 من نفس الشهر إلى 25 من الشهر التالي
- لو اليوم < 26: من 26 من الشهر السابق إلى 25 من نفس الشهر

## نظام الأسعار

### Senior
- hourly_rate: 23 ج.م/ساعة
- order_rate: 10 ج.م/أوردر
- trip_rate: 4 ج.م/مشوار
- monthly_incentive_base: 1000 ج.م
- quarterly_incentive_base: 1000 ج.م

### Mid
- hourly_rate: 21.5 ج.م/ساعة
- order_rate: 8 ج.م/أوردر
- trip_rate: 4 ج.م/مشوار
- monthly_incentive_base: 750 ج.م
- quarterly_incentive_base: 750 ج.م

### Junior
- hourly_rate: 19.25 ج.م/ساعة
- order_rate: 6 ج.م/أوردر
- trip_rate: 3 ج.م/مشوار
- monthly_incentive_base: 750 ج.م
- quarterly_incentive_base: 750 ج.م

## الحوافز

حسب درجة الأداء:
- 95-100: 100%
- 90-94: 95%
- 80-89: 80%
- 70-79: 60%
- أقل من 70: 0 أو مراجعة

## النشر على Vercel

1. ارفع الكود على GitHub
2. أنشئ مشروع جديد على Vercel
3. أضف متغيرات البيئة:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. انشر

## الاختبار

```bash
# فحص الأنواع
npm run typecheck

# فحص الكود
npm run lint

# بناء التطبيق
npm run build
```

## الدعم

لأي مشاكل أو استفسارات، تواصل مع فريق التطوير.
