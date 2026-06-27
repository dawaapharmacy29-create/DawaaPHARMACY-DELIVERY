import { ChangeEvent, useMemo, useState, type ReactNode } from 'react'
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
  address: string
  branch_name: string
  first_invoice_date: string | null
  last_invoice_date: string | null
  total_sales: number
  invoices_count: number
  average_invoice: number
  raw_data: RawRow
  error?: string
}

const FIELD_KEYS = {
  customer_code: ['customer_code', 'customer code', 'code', 'كود العميل', 'كود', 'الكود', 'رقم العميل'],
  name: ['name', 'customer_name', 'customer name', 'اسم العميل', 'الاسم', 'اسم', 'العميل'],
  phone: ['phone', 'mobile', 'customer_phone', 'customer phone', 'رقم التليفون', 'رقم الهاتف', 'التليفون', 'تليفون', 'موبايل', 'الموبايل', 'هاتف'],
  address: ['address', 'customer_address', 'customer address', 'العنوان', 'عنوان', 'المنطقة', 'العنوان/المنطقة'],
  branch_name: ['branch', 'branch_name', 'branch name', 'الفرع', 'فرع'],
  first_invoice_date: ['first_invoice_date', 'first purchase', 'أول شراء', 'اول شراء', 'تاريخ أول شراء'],
  last_invoice_date: ['last_invoice_date', 'last purchase', 'آخر شراء', 'اخر شراء', 'تاريخ آخر شراء'],
  total_sales: ['total_sales', 'total sales', 'إجمالي المبيعات', 'اجمالي المبيعات', 'إجمالي', 'اجمالي', 'total'],
  invoices_count: ['invoices_count', 'invoices count', 'عدد الفواتير', 'فواتير', 'عدد فواتير'],
  average_invoice: ['average_invoice', 'average invoice', 'متوسط الفاتورة', 'متوسط'],
}

const ALL_HEADER_ALIASES = Object.values(FIELD_KEYS).flat()

function normalizeKey(value: string) {
  return String(value || '')
    .replace(/[\u200E\u200F\u202A-\u202E]/g, '')
    .replace(/[\s_\-\/\\:؛،,.()\[\]{}]+/g, '')
    .trim()
    .toLowerCase()
}

function first(row: RawRow, keys: string[]) {
  const normalizedRowKeys = Object.keys(row).map(k => ({ key: k, normalized: normalizeKey(k) }))
  for (const key of keys) {
    const direct = row[key]
    if (direct !== undefined && direct !== null && String(direct).trim() !== '') return String(direct).trim()
    const target = normalizeKey(key)
    const foundKey = normalizedRowKeys.find(k => k.normalized === target || k.normalized.includes(target) || target.includes(k.normalized))?.key
    if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && String(row[foundKey]).trim() !== '') return String(row[foundKey]).trim()
  }
  return ''
}

function normalizePhone(value: string) {
  let digits = String(value || '')
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/\D+/g, '')
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
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  const d = new Date(value)
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return null
}

function rowIsEmpty(row: unknown[]) {
  return !row.some(cell => String(cell ?? '').trim() !== '')
}

function headerScore(row: unknown[]) {
  const normalizedAliases = ALL_HEADER_ALIASES.map(normalizeKey)
  return row.reduce((score, cell) => {
    const key = normalizeKey(String(cell ?? ''))
    if (!key) return score
    return score + (normalizedAliases.some(alias => key === alias || key.includes(alias) || alias.includes(key)) ? 1 : 0)
  }, 0)
}

function rowsFromWorksheet(sheet: any): RawRow[] {
  const matrix = utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false, blankrows: false })
  const headerIndex = matrix.findIndex(row => headerScore(row) >= 2)
  if (headerIndex >= 0) {
    const headers = matrix[headerIndex].map((cell, index) => String(cell || `column_${index + 1}`).trim() || `column_${index + 1}`)
    return matrix.slice(headerIndex + 1)
      .filter(row => !rowIsEmpty(row))
      .map((row, rowIndex) => {
        const obj: RawRow = { __excel_row_number: headerIndex + rowIndex + 2 }
        headers.forEach((header, index) => { obj[header] = row[index] ?? '' })
        return obj
      })
  }
  return utils.sheet_to_json<RawRow>(sheet, { defval: '', raw: false }).map((row, index) => ({ ...row, __excel_row_number: index + 2 }))
}

function mapRow(row: RawRow, index: number): ImportRow {
  const phone = first(row, FIELD_KEYS.phone)
  const mapped: ImportRow = {
    row_number: Number(row.__excel_row_number || index + 2),
    customer_code: first(row, FIELD_KEYS.customer_code),
    name: first(row, FIELD_KEYS.name),
    phone,
    phone_normalized: normalizePhone(phone),
    address: first(row, FIELD_KEYS.address),
    branch_name: first(row, FIELD_KEYS.branch_name),
    first_invoice_date: normalizeDate(first(row, FIELD_KEYS.first_invoice_date)),
    last_invoice_date: normalizeDate(first(row, FIELD_KEYS.last_invoice_date)),
    total_sales: num(first(row, FIELD_KEYS.total_sales)),
    invoices_count: Math.round(num(first(row, FIELD_KEYS.invoices_count))),
    average_invoice: num(first(row, FIELD_KEYS.average_invoice)),
    raw_data: row,
  }
  const errors: string[] = []
  if (!mapped.customer_code && !mapped.phone_normalized) errors.push('لا يوجد كود عميل أو رقم هاتف صالح')
  if (!mapped.name) errors.push('اسم العميل فارغ')
  if (errors.length) mapped.error = errors.join(' — ')
  return mapped
}

export default function CustomerImport() {
  const navigate = useNavigate()
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<ImportRow[]>([])
  const [saving, setSaving] = useState(false)
  const [auditWarning, setAuditWarning] = useState('')
  const validRows = useMemo(() => rows.filter(r => !r.error), [rows])
  const errorRows = useMemo(() => rows.filter(r => r.error), [rows])

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setAuditWarning('')
    setFileName(file.name)
    const buffer = await file.arrayBuffer()
    const workbook = read(buffer, { type: 'array', cellDates: true })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const raw = rowsFromWorksheet(sheet)
    const mapped = raw.map(mapRow)
    setRows(mapped)
    const valid = mapped.filter(row => !row.error).length
    toast.success(`تم قراءة ${raw.length} صف من الملف — الصالح للحفظ ${valid}`)
  }

  async function createBatch() {
    const { data, error } = await supabase
      .from('customer_import_batches')
      .insert({
        file_name: fileName || 'customer-upload.xlsx',
        total_rows: rows.length,
        inserted_count: 0,
        updated_count: 0,
        failed_count: errorRows.length,
        status: 'processing',
      })
      .select('id')
      .single()

    if (error) {
      setAuditWarning('سجل الاستيراد غير متاح حاليًا، لكن حفظ العملاء سيستمر مباشرة.')
      return null
    }
    return data?.id || null
  }

  async function saveImport() {
    if (!validRows.length) {
      toast.error('لا توجد صفوف صالحة للحفظ')
      return
    }

    setSaving(true)
    setAuditWarning('')
    let inserted = 0
    let updated = 0
    const failed: ImportRow[] = [...errorRows]

    try {
      const batchId = await createBatch()

      for (const row of validRows) {
        try {
          const payload: Record<string, any> = {
            customer_code: row.customer_code || null,
            name: row.name,
            normalized_name: row.name.trim().toLowerCase(),
            phone: row.phone || null,
            phone_normalized: row.phone_normalized || null,
            address: row.address || null,
            branch_name: row.branch_name || null,
            first_invoice_date: row.first_invoice_date,
            last_invoice_date: row.last_invoice_date,
            total_sales: row.total_sales,
            invoices_count: row.invoices_count,
            average_invoice: row.average_invoice,
            updated_at: new Date().toISOString(),
          }
          if (batchId) payload.source_batch_id = batchId

          const lookup = row.customer_code
            ? await supabase.from('delivery_customers').select('id').eq('customer_code', row.customer_code).limit(1).maybeSingle()
            : await supabase.from('delivery_customers').select('id').eq('phone_normalized', row.phone_normalized).limit(1).maybeSingle()

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
        } catch (error: any) {
          failed.push({ ...row, error: error?.message || 'فشل حفظ الصف' })
        }
      }

      if (batchId) {
        if (failed.length) {
          const { error } = await supabase.from('customer_import_errors').insert(failed.map(row => ({
            batch_id: batchId,
            row_number: row.row_number,
            raw_data: row.raw_data,
            error_message: row.error,
          })))
          if (error) setAuditWarning('تم حفظ العملاء، لكن سجل أخطاء الاستيراد غير متاح.')
        }
        await supabase
          .from('customer_import_batches')
          .update({
            status: 'completed',
            inserted_count: inserted,
            updated_count: updated,
            failed_count: failed.length,
            completed_at: new Date().toISOString(),
          })
          .eq('id', batchId)
      }

      toast.success(`تم إضافة ${inserted} عميل. تم تحديث ${updated} عميل. يوجد ${failed.length} خطأ.`)
      if (failed.length !== errorRows.length) setRows(prev => prev.map(row => failed.find(f => f.row_number === row.row_number) || row))
    } catch (error: any) {
      toast.error(`فشل حفظ العملاء: ${error?.message || error}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="text-right" dir="rtl">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[28px] border border-white bg-white p-4 shadow-sm">
          <div>
            <button onClick={() => navigate('/admin')} className="mb-3 inline-flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-2 text-sm font-black text-slate-600">
              <ArrowRight size={16}/> رجوع
            </button>
            <h1 className="text-3xl font-black text-[#061827]">استيراد وتحديث العملاء</h1>
            <p className="mt-1 text-sm font-bold text-slate-500">اقرأ Excel/CSV بأعمدة عربية أو إنجليزية، ثم راجع العينة واحفظ بتحديث ذكي.</p>
          </div>
          <label className="flex cursor-pointer items-center gap-3 rounded-3xl bg-[#008E92] px-5 py-4 font-black text-white shadow-lg">
            <UploadCloud size={22}/> اختر Excel / CSV
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
          </label>
        </div>

        {auditWarning ? <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm font-black text-amber-800">{auditWarning}</div> : null}

        <div className="grid gap-4 md:grid-cols-4">
          <Metric label="إجمالي الصفوف" value={rows.length} icon={<FileSpreadsheet/>}/>
          <Metric label="صفوف صالحة" value={validRows.length} icon={<CheckCircle2/>}/>
          <Metric label="صفوف بها أخطاء" value={errorRows.length} icon={<XCircle/>}/>
          <button onClick={saveImport} disabled={saving || !validRows.length} className="rounded-3xl bg-emerald-600 p-5 text-lg font-black text-white shadow-sm disabled:opacity-50">
            {saving ? <Loader2 className="mx-auto animate-spin"/> : 'حفظ وتحديث العملاء'}
          </button>
        </div>

        <div className="overflow-hidden rounded-3xl border bg-white shadow-sm">
          <div className="border-b p-4 font-black text-slate-700">معاينة أول 100 صف {fileName ? `— ${fileName}` : ''}</div>
          <div className="max-h-[65vh] overflow-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="sticky top-0 bg-slate-50 text-slate-500">
                <tr>
                  <th className="p-3">#</th>
                  <th className="p-3">الكود</th>
                  <th className="p-3">الاسم</th>
                  <th className="p-3">الهاتف</th>
                  <th className="p-3">العنوان/المنطقة</th>
                  <th className="p-3">الفرع</th>
                  <th className="p-3">أول شراء</th>
                  <th className="p-3">آخر شراء</th>
                  <th className="p-3">إجمالي</th>
                  <th className="p-3">عدد الفواتير</th>
                  <th className="p-3">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 100).map(row => (
                  <tr key={row.row_number} className="border-t">
                    <td className="p-3 font-bold">{row.row_number}</td>
                    <td className="p-3">{row.customer_code || '—'}</td>
                    <td className="p-3 font-black">{row.name || '—'}</td>
                    <td className="p-3">{row.phone_normalized || row.phone || '—'}</td>
                    <td className="p-3">{row.address || '—'}</td>
                    <td className="p-3">{row.branch_name || '—'}</td>
                    <td className="p-3">{row.first_invoice_date || '—'}</td>
                    <td className="p-3">{row.last_invoice_date || '—'}</td>
                    <td className="p-3">{row.total_sales}</td>
                    <td className="p-3">{row.invoices_count}</td>
                    <td className="p-3"><span className={`rounded-full px-3 py-1 text-xs font-black ${row.error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{row.error || 'جاهز'}</span></td>
                  </tr>
                ))}
                {!rows.length ? <tr><td colSpan={11} className="p-8 text-center font-black text-slate-400">اختر ملف Excel أو CSV لعرض المعاينة</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <div className="rounded-3xl border bg-white p-5 shadow-sm">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">{icon}</div>
      <p className="text-sm font-black text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-black text-[#061827]">{value}</p>
    </div>
  )
}
