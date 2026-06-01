import { useNavigate } from 'react-router-dom';

interface DatabaseNotReadyProps {
  reason: string;
  onRetry: () => void;
}

export default function DatabaseNotReady({ reason, onRetry }: DatabaseNotReadyProps) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-xl bg-white rounded-3xl shadow-2xl p-8 text-right">
        <h1 className="text-2xl font-bold text-slate-900 mb-3">قاعدة بيانات الدليفري غير جاهزة</h1>
        <p className="text-sm text-slate-600 mb-6">{reason}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onRetry}
            className="w-full rounded-xl bg-emerald-500 text-white py-3 text-sm font-semibold hover:bg-emerald-600 transition-colors"
          >
            حاول مرة أخرى
          </button>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="w-full rounded-xl border border-slate-300 bg-white text-slate-700 py-3 text-sm font-semibold hover:bg-slate-50 transition-colors"
          >
            الذهاب إلى تسجيل الدخول
          </button>
        </div>
      </div>
    </div>
  );
}
