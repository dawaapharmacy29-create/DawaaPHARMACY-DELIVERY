// Supabase Edge Function: extract-receipt-ocr
// Requires secrets:
//   supabase secrets set OPENAI_API_KEY=sk-...
// Optional:
//   supabase secrets set OCR_MODEL=gpt-4o-mini

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type ExtractedReceipt = {
  invoice_number: string | null
  customer_code: string | null
  customer_name: string | null
  customer_phone: string | null
  customer_address: string | null
  doctor_name: string | null
  invoice_amount: number | null
  invoice_date: string | null
  confidence: number
  warnings: string[]
  raw_text: string | null
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function extractJson(text: string): ExtractedReceipt {
  const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1))
    throw new Error('OCR response was not valid JSON')
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const apiKey = Deno.env.get('OPENAI_API_KEY')
    if (!apiKey) {
      return jsonResponse({
        error: 'OPENAI_API_KEY is not configured in Supabase Edge Function secrets',
        setup: 'Run: supabase secrets set OPENAI_API_KEY=sk-...'
      }, 500)
    }

    const { imageUrl, manualNote } = await req.json()
    if (!imageUrl || typeof imageUrl !== 'string') {
      return jsonResponse({ error: 'imageUrl is required' }, 400)
    }

    const model = Deno.env.get('OCR_MODEL') || 'gpt-4o-mini'
    const prompt = `
أنت نظام قراءة فواتير صيدلية دواء. اقرأ صورة الفاتورة واستخرج البيانات التالية فقط بصيغة JSON صالحة بدون أي شرح.

المطلوب:
- invoice_number: رقم الفاتورة/رقم الريسيت، نص أو null
- customer_code: كود العميل، نص أو null
- customer_name: اسم العميل، نص أو null
- customer_phone: رقم هاتف العميل، نص أو null
- customer_address: عنوان العميل، نص أو null
- doctor_name: اسم الدكتور/البائع/الكاشير/من حضّر الأوردر إن ظهر، نص أو null
- invoice_amount: قيمة الفاتورة كرقم أو null
- invoice_date: تاريخ الفاتورة بصيغة YYYY-MM-DD إن أمكن أو null
- confidence: رقم بين 0 و 1 يعبر عن ثقتك العامة
- warnings: مصفوفة نصوص قصيرة لأي مشكلة مثل صورة غير واضحة أو خانة غير موجودة
- raw_text: أهم النص المقروء مختصرًا

قواعد مهمة:
- لا تخترع بيانات غير ظاهرة.
- لو غير متأكد، ضع null واكتب السبب في warnings.
- أرقام التليفون والفواتير تُرجع كما تظهر قدر الإمكان.
- لو توجد ملاحظة يدوية من المستخدم استخدمها كمساعدة فقط، ولا تعتبرها مؤكدة إن خالفت الصورة.

ملاحظة يدوية من المستخدم: ${manualNote || 'لا يوجد'}
`;

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: prompt },
              { type: 'input_image', image_url: imageUrl },
            ],
          },
        ],
        temperature: 0,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      return jsonResponse({ error: 'OpenAI OCR request failed', details: errText }, 500)
    }

    const result = await response.json()
    const outputText = result.output_text
      || result.output?.flatMap((o: any) => o.content ?? []).map((c: any) => c.text ?? '').join('\n')
      || ''

    const extracted = extractJson(outputText)
    return jsonResponse({ extracted, model })
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500)
  }
})
