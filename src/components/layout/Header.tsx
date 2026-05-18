import { Bell, RefreshCw } from 'lucide-react';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export default function Header({ title, subtitle }: HeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <button className="flex items-center gap-1.5 text-gray-500 text-sm hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5">
          <RefreshCw size={14} />
          <span>تحديث</span>
        </button>
      </div>
      <div className="text-right">
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}
