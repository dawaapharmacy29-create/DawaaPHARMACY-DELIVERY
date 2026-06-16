# 🚀 دواء دليفري — Dawaa Delivery Management System

  نظام متكامل لإدارة عمليات التوصيل — مبني بـ React + Vite + Supabase.

  ---

  ## ⚡ المميزات

  - لوحة إدارة ذكية مع رسوم بيانية تفاعلية (Recharts)
  - تتبع أداء المندوبين مع مقارنة حقيقية بين الفترات (يومي/أسبوعي/شهري/ربع سنوي)
  - تحليل العملاء حسب التصنيف ومستوى الخطر
  - مراقبة الحضور وإدارة الجداول
  - مطابقة الفواتير مع BConnect
  - تقارير PDF شاملة
  - PWA يعمل بدون إنترنت
  - تحديث لحظي عبر Supabase Realtime
  - دعم RTL عربي كامل

  ---

  ## 🛠️ التثبيت المحلي

  ```bash
  # 1. استنسخ المشروع
  git clone https://github.com/YOUR_USERNAME/dawaa-delivery.git
  cd dawaa-delivery

  # 2. ثبّت الحزم
  npm install

  # 3. انسخ ملف البيئة وأضف بياناتك
  cp .env.example .env.local
  # ثم عدّل .env.local بمفاتيح Supabase الخاصة بك

  # 4. شغّل المشروع
  npm run dev
  ```

  ---

  ## 🔑 متغيرات البيئة

  ```env
  VITE_SUPABASE_URL=https://your-project.supabase.co
  VITE_SUPABASE_ANON_KEY=your-anon-key
  ```

  أضف هذه المتغيرات في:
  - **محلياً**: ملف `.env.local`
  - **Vercel**: Settings → Environment Variables
  - **GitHub Actions**: Settings → Secrets and variables → Actions

  ---

  ## 🚀 النشر على Vercel

  ### الطريقة السريعة (موصى بها):

  1. ارفع المشروع على GitHub
  2. اذهب لـ [vercel.com](https://vercel.com) → Import Project
  3. اختر الـ repository
  4. أضف متغيرات البيئة:
     - `VITE_SUPABASE_URL`
     - `VITE_SUPABASE_ANON_KEY`
  5. اضغط Deploy ✅

  ### عبر GitHub Actions (تلقائي):

  أضف هذه الـ Secrets في GitHub → Settings → Secrets:
  - `VITE_SUPABASE_URL` — رابط Supabase
  - `VITE_SUPABASE_ANON_KEY` — مفتاح Supabase
  - `VERCEL_TOKEN` — من Vercel → Account Settings → Tokens
  - `VERCEL_ORG_ID` — من Vercel Project Settings
  - `VERCEL_PROJECT_ID` — من Vercel Project Settings

  بعدها كل push على `main` يُنشر تلقائياً 🎉

  ---

  ## 📦 البنية

  ```
  src/
  ├── pages/
  │   ├── admin/
  │   │   ├── AdminDashboard.tsx     ← لوحة الإدارة الرئيسية
  │   │   ├── Performance.tsx        ← أداء المندوبين
  │   │   ├── CustomerAnalytics.tsx  ← تحليل العملاء
  │   │   ├── Reconciliation.tsx     ← مطابقة الفواتير
  │   │   └── ...
  │   └── rider/
  │       └── RiderDashboard.tsx     ← لوحة المندوب
  ├── lib/
  │   ├── delivery.ts    ← كل عمليات Supabase
  │   ├── auth.ts        ← المصادقة
  │   ├── helpers.ts     ← أدوات مساعدة
  │   └── types.ts       ← TypeScript types
  └── components/        ← مكونات مشتركة
  ```

  ---

  ## 🗄️ قاعدة البيانات

  ملفات SQL موجودة في مجلد `supabase/` — شغّلها بالترتيب في Supabase SQL Editor:

  ```
  supabase/00_full_safe_schema.sql  ← الأساس
  supabase/01_schema.sql
  supabase/02_functions.sql
  ...
  ```

  ---

  ## 📝 الدورة التشغيلية

  الدورة تبدأ من يوم **26** وتنتهي يوم **25** من الشهر التالي.

  ---

  Built with ❤️ for Dawaa Pharmacy operations team.
  