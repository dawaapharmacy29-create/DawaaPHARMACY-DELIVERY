import { Search } from 'lucide-react'

export default function SearchInput({
  value,
  onChange,
  placeholder,
  className = '',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={`relative ${className}`}>
      <Search size={17} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-4 pr-10 text-sm font-bold text-slate-800 outline-none transition focus:border-[#008E92] focus:ring-2 focus:ring-teal-100"
      />
    </div>
  )
}
