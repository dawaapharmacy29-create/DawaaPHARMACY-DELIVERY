# مراجعة وتعديل تشغيل التطبيق كتطبيق على iPhone

تمت مراجعة إعدادات PWA الخاصة بتطبيق Dawaa Delivery Control، وتم تنفيذ التعديلات التالية:

## المشاكل التي تم العثور عليها

1. ملف `index.html` يحتوي على Meta Tags مكررة خاصة بـ iPhone و theme-color.
2. ملف `manifest.webmanifest` كان يستخدم `dawaa-logo.jpeg` كأيقونة بمقاسات 192 و512 رغم أن الصورة الأصلية ليست مربعة، وهذا قد يجعل الأيقونة تظهر بشكل غير ثابت على iPhone/Android.
3. كانت هناك إعدادات PWA مكررة بين `vite-plugin-pwa` وملف `public/sw.js` اليدوي، وقد يؤدي ذلك إلى تضارب في Service Worker أو Manifest بعد البناء.
4. ملف Service Worker كان يعتمد على اللوجو JPEG في الإشعارات والكاش بدل أيقونات PWA المربعة الجاهزة.

## التعديلات المنفذة

1. تنظيف `index.html` وإبقاء إعدادات PWA/iPhone مرة واحدة فقط.
2. إضافة `viewport-fit=cover` لتحسين العرض داخل iPhone Home Screen.
3. إضافة `apple-touch-icon.png` من الأيقونة المربعة 180x180.
4. تحديث `manifest.webmanifest` لاستخدام أيقونات PNG المربعة الموجودة فعلًا داخل `public`.
5. إضافة أيقونات maskable منفصلة داخل Manifest.
6. تحديث Service Worker إلى نسخة كاش جديدة `dawaa-delivery-v53-pwa-ios`.
7. إضافة أيقونات PWA المهمة إلى App Shell cache.
8. تغيير أيقونة الإشعارات إلى `/pwa-icon-192.png` والـ badge إلى `/pwa-maskable-192.png`.
9. إزالة `vite-plugin-pwa` من `vite.config.ts` لتجنب تضارب الـ Manifest/Service Worker، مع الإبقاء على Service Worker اليدوي المستقر `/sw.js`.

## طريقة الاختبار بعد الرفع على Vercel

1. افتح الرابط من Safari على iPhone.
2. اضغط Share.
3. اختر Add to Home Screen.
4. افتح الأيقونة من الشاشة الرئيسية.
5. تأكد أن التطبيق يفتح باسم Dawaa Delivery وبأيقونة واضحة.
6. افتح التطبيق مرة أخرى بعد أي Deploy جديد للتأكد من عدم ظهور مشكلة Failed to fetch dynamically imported module.

## ملاحظة مهمة

هذا يجعل التطبيق Web App / PWA على iPhone. لا يحتاج App Store، لكن iPhone سيظل يضيفه يدويًا من Safari عبر Add to Home Screen.
