import { useState } from 'react'
import Modal from './Modal'
import { toast } from 'sonner'
import { createRiderScheduleException } from '../lib/delivery'

interface Props {
  open: boolean
  onClose: () => void
  riderId: string
  branchId: string
}

export default function LeavePermissionModal({ open, onClose, riderId, branchId }: Props) {
  const [saving, setSaving] = useState(false)
  const [exceptionType, setExceptionType] = useState<'leave' | 'permission' | 'sick_leave' | 'absence' | 'schedule_change' | 'holiday' | 'emergency'>('leave')
  const [exceptionDate, setExceptionDate] = useState('')
  const [reason, setReason] = useState('')
  const [newShiftStart, setNewShiftStart] = useState('')
  const [newShiftEnd, setNewShiftEnd] = useState('')

  async function handleSubmit() {
    if (!exceptionDate) {
      toast.error('اختار التاريخ')
      return
    }
    if (!reason) {
      toast.error('اكتب السبب')
      return
    }

    try {
      setSaving(true)
      await createRiderScheduleException({
        rider_id: riderId,
        branch_id: branchId,
        exception_date: exceptionDate,
        exception_type: exceptionType,
        reason,
        new_shift_start: exceptionType === 'permission' || exceptionType === 'schedule_change' ? newShiftStart : null,
        new_shift_end: exceptionType === 'permission' || exceptionType === 'schedule_change' ? newShiftEnd : null,
        status: 'pending'
      })
      toast.success('تم تقديم الطلب للإدارة')
      onClose()
      // Reset form
      setExceptionType('leave')
      setExceptionDate('')
      setReason('')
      setNewShiftStart('')
      setNewShiftEnd('')
    } catch (error) {
      console.error(error)
      toast.error('معرفش أسجل الطلب')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} title="إضافة إذن أو إجازة" subtitle="تقديم طلب للإدارة" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="dawaa-label">نوع الطلب</label>
          <select
            className="dawaa-input"
            value={exceptionType}
            onChange={(e) => setExceptionType(e.target.value as any)}
          >
            <option value="leave">إجازة</option>
            <option value="permission">إذن</option>
            <option value="sick_leave">إجازة مرضية</option>
            <option value="absence">غياب</option>
            <option value="schedule_change">تغيير ميعاد</option>
            <option value="holiday">عطلة</option>
            <option value="emergency">ظرف طارئ</option>
          </select>
        </div>

        <div>
          <label className="dawaa-label">التاريخ</label>
          <input
            type="date"
            className="dawaa-input"
            value={exceptionDate}
            onChange={(e) => setExceptionDate(e.target.value)}
          />
        </div>

        {(exceptionType === 'permission' || exceptionType === 'schedule_change') && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="dawaa-label">من الساعة</label>
              <input
                type="time"
                className="dawaa-input"
                value={newShiftStart}
                onChange={(e) => setNewShiftStart(e.target.value)}
              />
            </div>
            <div>
              <label className="dawaa-label">إلى الساعة</label>
              <input
                type="time"
                className="dawaa-input"
                value={newShiftEnd}
                onChange={(e) => setNewShiftEnd(e.target.value)}
              />
            </div>
          </div>
        )}

        <div>
          <label className="dawaa-label">السبب</label>
          <textarea
            className="dawaa-input"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="اكتب سبب الطلب..."
          />
        </div>

        <button
          disabled={saving}
          onClick={handleSubmit}
          className="dawaa-btn-primary w-full bg-[#008E92] hover:bg-[#05777B]"
        >
          {saving ? 'جاري التقديم...' : 'تقديم الطلب'}
        </button>
      </div>
    </Modal>
  )
}
