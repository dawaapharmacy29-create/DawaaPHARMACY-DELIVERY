import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  iconBg?: string;
  valueColor?: string;
  sub?: string;
}

export default function StatCard({ label, value, icon, iconBg = 'bg-blue-100', valueColor = 'text-gray-900', sub }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-start gap-3 shadow-sm">
      <div className={`w-10 h-10 ${iconBg} rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5`}>
        {icon}
      </div>
      <div className="text-right flex-1">
        <div className="text-xs text-gray-500 mb-1">{label}</div>
        <div className={`text-xl font-bold ${valueColor}`}>{value}</div>
        {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}
