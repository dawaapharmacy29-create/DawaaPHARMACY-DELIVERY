# إصلاح مشكلة Failed to fetch dynamically imported module

سبب المشكلة:
Service Worker أو Cache ماسك نسخة قديمة من ملفات /assets بعد Deploy جديد في Vercel.

الملفات:
- public/sw.js
- src/components/CacheRecovery.tsx

التركيب:
1. انسخ public/sw.js فوق الموجود.
2. انسخ CacheRecovery.tsx.
3. افتح App.tsx أو main layout وأضف:
   import CacheRecovery from './components/CacheRecovery'

ثم داخل JSX في أعلى التطبيق:
   <CacheRecovery />

لو صعب تعدل App.tsx، يكفي public/sw.js غالبًا، ثم Clear site data مرة واحدة.

أوامر الرفع:
git add .
git commit -m "fix: prevent stale dynamic import cache"
git push origin main

حل فوري على الجهاز الحالي:
DevTools > Application > Service Workers > Unregister
ثم Storage > Clear site data
ثم Ctrl + F5

---
تحديث V5:
تمت إضافة نظام الشيفت الحقيقي للدليفري. شغل SQL: supabase/55_shift_based_delivery_accounting.sql
