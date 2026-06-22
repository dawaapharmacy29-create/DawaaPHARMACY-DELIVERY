export const ENABLE_WHATSAPP_AFTER_ORDER_SAVE = false

export function buildSafeWhatsappOrderMessage(invoiceAmount?: string | number | null) {
  const amountText = invoiceAmount === null || invoiceAmount === undefined || String(invoiceAmount).trim() === ''
    ? 'not specified'
    : `${String(invoiceAmount).trim()} EGP`

  return [
    'Ahlan behadretak ya fandem',
    'Ma3 hadretak mandoob Saydalyat Dawaa',
    '',
    `Invoice amount: ${amountText}`,
    '',
    'Netsharaf bekhedmet hadretak dayman',
  ].join('\n')
}
