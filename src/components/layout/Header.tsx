import { useAuth } from '@/contexts/AuthContext';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export default function Header({ title, subtitle }: HeaderProps) {
  const { user } = useAuth();

  return (
    <div className="mb-6 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <img src="/brand/dawaa-logo.jpeg" alt="Dawaa Delivery" className="h-10 w-10 rounded-xl object-contain bg-white p-1 ring-1 ring-slate-200" />
        <div className="text-sm font-bold text-slate-600">Dawaa Delivery</div>
      </div>
      <div className="text-right">
        <h1 className="text-2xl font-bold text-slate-950">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        {user && <p className="mt-1 text-xs text-slate-400">{user.displayName} - {user.role}</p>}
      </div>
    </div>
  );
}
