import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function NotFound() {
  const location = useLocation();

  useEffect(() => {
    if (import.meta.env.DEV) console.error('404 route:', location.pathname);
  }, [location.pathname]);

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4" dir="rtl">
      <div className="text-center">
        <img src="/brand/dawaa-logo.jpeg" alt="Dawaa Delivery" className="mx-auto mb-4 h-24 w-24 rounded-2xl bg-white object-contain p-2 shadow" />
        <h1 className="text-4xl font-bold text-slate-950">404</h1>
        <p className="mt-2 text-slate-500">الصفحة غير موجودة داخل Dawaa Delivery.</p>
        <Link to="/delivery" className="mt-5 inline-flex rounded-xl bg-emerald-500 px-5 py-3 font-bold text-white">
          العودة للوحة الدليفري
        </Link>
      </div>
    </main>
  );
}
