export const ENABLE_WHATSAPP_AFTER_ORDER_SAVE = false

export function buildSafeWhatsappOrderMessage(invoiceAmount?: string | number | null) {
  const amountText = invoiceAmount === null || invoiceAmount === undefined || String(invoiceAmount).trim() === ''
    ? 'غير محددة'
    : `${String(invoiceAmount).trim()} جنيه`

  return [
    'أهلاً بحضرتك يا فندم',
    'مع حضرتك مندوب صيدليات دواء',
    '',
    `قيمة الفاتورة الخاصة بحضرتك: ${amountText}`,
    '',
    'نتشرف بخدمة حضرتك دائمًا',
  ].join('\n')
}
