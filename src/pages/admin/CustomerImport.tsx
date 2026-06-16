import { ChangeEvent, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, CheckCircle2, FileSpreadsheet, Loader2, UploadCloud, XCircle } from 'lucide-react'
import { read, utils } from 'xlsx'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'

type RawRow = Record<string, any>
type ImportRow = {
  row_number: number
  customer_code: string
  name: string
  phone: string
  phone_normalized: string
  phone2: string
  address: string
  branch_name: string
  first_invoice_date: string | null
  last_invoice_date: string | null
  last_invoice_number: string
  total_sales: number
  invoices_count: number
  average_invoice: number
  raw_data: RawRow
  error?: string
}

const CODE_KEYS = ['customer_code', 'code', 'كود العميل', 'الكود', 'كود', 'رقم العميل']
const NAME_KEYS = ['name', 'customer_name', 'اسم العميل', 'العميل', 'client_name']
const PHONE_KEYS = ['phone', 'mobile', 'customer_phone', 'تليفون', 'هاتف', 'موبايل', 'رقم التليفون']
const PHONE2_KEYS = ['phone2', 'mobile2', 'تليفون 2', 'هاتف 2', 'موبايل 2']
const ADDRESS_KEYS = ['address', 'customer_address', 'العنوان', 'عنوان', 'منطقة']
const BRANCH_KEYS = ['branch', 'branch_name', 'الفرع', 'اسم الفرع']
const LAST_DATE_KEYS = ['last_invoice_date', 'آخر شراء', 'اخر شراء', 'تاريخ اخر فاتورة', 'last_date']
const FIRST_DATE_KEYS = ['first_invoice_date', 'أول شراء', 'اول شراء', 'first_date']
const LAST_INVOICE_KEYS = ['last_invoice_number', 'رقم اخر فاتورة', 'last_invoice', 'invoice_number']
const TOTAL_KEYS = ['total_sales', 'اجمالي المبيعات', 'total', 'إجمالي']
const COUNT_KEYS = ['invoices_count', 'عدد الفواتير', 'count']
const AVG_KEYS = ['average_invoice', 'متوسط الفاتورة', 'avg_invoice']

function first(row: RawRow, keys: string[]) {
  for (const key of keys) {
    const direct = row[key]
    if (direct !== undefined && direct !== null && String(direct).trim() !== '') return String(direct).trim()
    const foundKey = Object.keys(row).find(k => k.trim().toLowerCase() === key.trim().toLowerCase())
    if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && String(row[foundKey]).trim() !== '') return String(row[foundKey]).trim()
  }
  return ''
}

function normalizePhone(value: string) {
  let digits = String(value || '').replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/\D+/g, '')
  if (digits.startsWith('0020')) digits = digits.slice(4)
  if (digits.startsWith('20') && digits.length === 12) digits = digits.slice(2)
  if (digits.length === 10 && digits.startsWith('1')) digits = `0${digits}`
  return digits
}

function num(value: string) {
  const n = Number(String(value || '').replace(/,/g, '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function normalizeDate(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return null
}

function mapRow(row: RawRow, index: number): ImportRow {
  const phone = first(row, PHONE_KEYS)
  const customer_code = first(row, CODE_KEYS)
  const name = first(row, NAME_KEYS)
  const mapped: ImportRow = {
    row_number: index + 2,
    customer_code,
    name,
    phone,
    phone_normalized: normalizePhone(phone),
    phone2: first(row, PHONE2_KEYS),
    address: first(row, ADDRESS_KEYS),
    branch_name: first(row, BRANCH_KEYS),
    first_invoice_date: normalizeDate(first(row, FIRST_DATE_KEYS)),
    last_invoice_date: normalizeDate(first(row, LAST_DATE_KEYS)),
    last_invoice_number: first(row, LAST_INVOICE_KEYS),
    total_sales: num(first(row, TOTAL_KEYS)),
    invoices_count: Math.round(num(first(row, COUNT_KEYS))),
    average_invoice: num(first(row, AVG_KEYS)),
    raw_data: row,
  }
  if (!mapped.customer_code && !mapped.phone_normalized) mapped.error = 'لا يوجد كود عميل أو رقم تليفون صالح'
  if (!mapped.name) mapped.error = mapped.error ? `${mapped.error} — اسم العميل فارغ` : 'اسم العميل فارغ'
  return mapped
}

export default function CustomerImport() {
  const navigate = useNavigate()
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<ImportRow[]>([])
  const [saving, setSaving] = useState(false)
  const validRows = useMemo(() => rows.filter(r => !r.error), [rows])
  const errorRows = useMemo(() => rows.filter(r => r.error), [rows])

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    const buffer = await file.arrayBuffer()
    const workbook = read(buffer, { type: 'array', cellDates: true })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const raw = utils.sheet_to_json<RawRow>(sheet, { defval: '' })
    setRows(raw.map(mapRow))
    toast.success(`تم قراءة ${raw.length} صف من الملف`)
  }

  async function saveImport() {
    if (!validRows.length) { toast.error('لا توجد صفوف صالحة للحفظ'); return }
    try {
      setSaving(true)
      const { data: batch, error: batchError } = await supabase.from('customer_import_batches').insert({
        file_name: fileName || 'manual-upload.xlsx',
        total_rows: rows.length,
        inserted_count: 0,
        updated_count: validRows.length,
        failed_count: errorRows.length,
        status: 'processing',
      }).select('id').single()
      if (batchError) throw batchError

      let inserted = 0
      let updated = 0
      for (const r of validRows) {
        const payload = {
          customer_code: r.customer_code || null,
          name: r.name,
          normalized_name: r.name.trim().toLowerCase(),
          phone: r.phone || null,
          phone_normalized: r.phone_normalized || null,
          phone2: r.phone2 || null,
          address: r.address || null,
          branch_name: r.branch_name || null,
          first_invoice_date: r.first_invoice_date,
          last_invoice_date: r.last_invoice_date,
          last_invoice_number: r.last_invoice_number || null,
          total_sales: r.total_sales,
          invoices_count: r.invoices_count,
          average_invoice: r.average_invoice,
          source_batch_id: batch.id,
          updated_at: new Date().toISOString(),
        }
        const lookup = r.customer_code
          ? await supabase.from('delivery_customers').select('id').eq('customer_code', r.customer_code).limit(1).maybeSingle()
          : await supabase.from('delivery_customers').select('id').eq('phone_normalized', r.phone_normalized).limit(1).maybeSingle()
        if (lookup.error) throw lookup.error
        if (lookup.data?.id) {
          const { error } = await supabase.from('delivery_customers').update(payload).eq('id', lookup.data.id)
          if (error) throw error
          updated++
        } else {
          const { error } = await supabase.from('delivery_customers').insert({ ...payload, created_at: new Date().toISOString() })
          if (error) throw error
          inserted++
        }
      }

      if (errorRows.length) {
        await supabase.from('customer_import_errors').insert(errorRows.map(r => ({
          batch_id: batch.id,
          row_number: r.row_number,
          raw_data: r.raw_data,
          error_message: r.error,
        })))
      }
      await supabase.from('customer_import_batches').update({ status: 'completed', inserted_count: inserted, updated_count: updated, failed_count: errorRows.length, completed_at: new Date().toISOString() }).eq('id', batch.id)
      toast.success(`تم إضافة ${inserted} عميل وتحديث ${updated} عميل وتسجيل ${errorRows.length} خطأ`)
    } catch (e: any) {
      toast.error(`فشل حفظ العملاء: ${e?.message || e}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F3F7F8] p-4 text-right" dir="rtl">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <button onClick={() => navigate('/admin')} className="mb-3 inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-black text-slate-600 shadow-sm"><ArrowRight size={16}/> رجوع</button>
            <h1 className="text-3xl font-black text-[#061827]">رفع العملاء اليومي</h1>
            <p className="mt-1 text-sm font-bold text-slate-500">تحديث قاعدة العملاء يوميًا بدون تكرار، مع تنظيف أرقام الهاتف وتسجيل أخطاء الملف.</p>
          </div>
          <label className="flex cursor-pointer items-center gap-3 rounded-3xl bg-[#008E92] px-5 py-4 font-black text-white shadow-lg">
            <UploadCloud size={22}/> اختار Excel / CSV
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Metric label="إجمالي الصفوف" value={rows.length} icon={<FileSpreadsheet/>}/>
          <Metric label="صفوف صالحة" value={validRows.length} icon={<CheckCircle2/>}/>
          <Metric label="أخطاء" value={errorRows.length} icon={<XCircle/>}/>
          <button onClick={saveImport} disabled={saving || !validRows.length} className="rounded-3xl bg-emerald-600 p-5 text-lg font-black text-white shadow-sm disabled:opacity-50">{saving ? <Loader2 className="mx-auto animate-spin"/> : 'حفظ وتحديث العملاء'}</button>
        </div>

        <div className="overflow-hidden rounded-3xl border bg-white shadow-sm">
          <div className="border-b p-4 font-black text-slate-700">معاينة أول 100 صف</div>
          <div className="max-h-[65vh] overflow-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="sticky top-0 bg-slate-50 text-slate-500"><tr><th className="p-3">#</th><th className="p-3">الكود</th><th className="p-3">الاسم</th><th className="p-3">التليفون</th><th className="p-3">العنوان</th><th className="p-3">الفرع</th><th className="p-3">آخر شراء</th><th className="p-3">إجمالي</th><th className="p-3">الحالة</th></tr></thead>
              <tbody>{rows.slice(0, 100).map(r => <tr key={r.row_number} className="border-t"><td className="p-3 font-bold">{r.row_number}</td><td className="p-3">{r.customer_code || '—'}</td><td className="p-3 font-black">{r.name || '—'}</td><td className="p-3">{r.phone_normalized || r.phone || '—'}</td><td className="p-3">{r.address || '—'}</td><td className="p-3">{r.branch_name || '—'}</td><td className="p-3">{r.last_invoice_date || '—'}</td><td className="p-3">{r.total_sales}</td><td className="p-3"><span className={`rounded-full px-3 py-1 text-xs font-black ${r.error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{r.error || 'جاهز'}</span></td></tr>)}</tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <div className="rounded-3xl border bg-white p-5 shadow-sm"><div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">{icon}</div><p className="text-sm font-black text-slate-500">{label}</p><p className="mt-2 text-3xl font-black text-[#061827]">{value}</p></div>
}
