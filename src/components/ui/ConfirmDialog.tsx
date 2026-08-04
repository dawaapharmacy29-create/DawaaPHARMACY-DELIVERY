import Modal from '../Modal'

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'تأكيد',
  cancelLabel = 'إلغاء',
  tone = 'default',
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal open={open} title={title} subtitle={description} onClose={onCancel} size="sm">
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="rounded-xl border bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className={`rounded-xl px-4 py-2.5 text-sm font-black text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${
            tone === 'danger' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-[#008E92] hover:bg-[#05777B]'
          }`}
        >
          {loading ? 'جارٍ التنفيذ...' : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
