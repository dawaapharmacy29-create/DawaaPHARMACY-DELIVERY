import { readFile, writeFile } from 'node:fs/promises'

const file = new URL('../src/pages/Login.tsx', import.meta.url)
let source = await readFile(file, 'utf8')

function replaceOnce(before, after, label) {
  if (source.includes(after)) return
  if (!source.includes(before)) throw new Error(`General manager login anchor not found: ${label}`)
  source = source.replace(before, after)
}

if (!source.includes('const handleManagerPinLogin = async () => {')) {
  replaceOnce(
    `  const handleAdminLogin = async () => {
    const loginName = resolveAdminLogin(username) || username.trim()`,
    `  const handleManagerPinLogin = async () => {
    const pin = normalizePin(password)
    const managerUsername = username.trim() || 'dr.moaz'
    const result = await loginWithPin(managerUsername, pin)

    if (!result?.success || !result.account_id) {
      const message = friendlyRiderError(result)
      throw new Error(typeof message === 'string' ? message : 'تعذر التحقق من حساب الإدارة بالـ PIN')
    }

    const role = result.role || ''
    const managerRoles = ['branch_manager', 'operations_manager', 'branches_manager', 'admin', 'general_manager', 'shift_manager']
    if (!managerRoles.includes(role)) {
      throw new Error('الحساب ليس حساب إدارة')
    }

    await supabase.auth.signOut().catch(() => undefined)
    setRiderSession({
      account_id: result.account_id,
      rider_id: result.rider_id || '',
      username: result.username || managerUsername,
      rider_name: result.rider_name || (result as any).display_name || managerUsername,
      branch_id: result.branch_id,
      branch_name: result.branch_name,
      role,
      must_change_pin: !!result.must_change_pin,
      session_token: result.session_token,
    })

    toast.success(\`أهلاً \${result.rider_name || (result as any).display_name || managerUsername} 👋\`)
    navigate(role === 'branch_manager' ? '/admin/branch' : '/admin', { replace: true })
  }

  const handleAdminLogin = async () => {
    const loginName = resolveAdminLogin(username) || username.trim()`,
    'manager PIN handler',
  )
}

const adminFallbackAfter = `      if (looksLikeAdmin) {
         if (shouldTryPinFirst) {
           try {
             await handleAdminLogin()
           } catch (adminError: any) {
             // لو Supabase Auth رجّع خطأ فارغًا أو غير مفهوم، نجرب PIN الإدارة مباشرة.
             // هذا مهم على الأجهزة الجديدة، ومع مفاتيح publishable الحديثة، وأخطاء الشبكة الجزئية.
             await handleManagerPinLogin()
           }
         } else {
           await handleAdminLogin()
         }
       } else if (shouldTryPinFirst) {`

if (!source.includes(adminFallbackAfter)) {
  const adminFallbackPattern = /      if \(looksLikeAdmin\) \{[\s\S]*?      \} else if \(shouldTryPinFirst\) \{/
  const match = source.match(adminFallbackPattern)
  if (!match) throw new Error('General manager login anchor not found: admin PIN fallback')
  source = source.replace(adminFallbackPattern, adminFallbackAfter)
}

if (!source.includes("msg.includes('PIN غير صحيح')")) {
  replaceOnce(
    `      if (msg.includes('Invalid login') || msg.includes('invalid_credentials')) {
        setError('اسم المستخدم أو كلمة السر مش صح')`,
    `      if (msg.includes('PIN غير صحيح') || msg.includes('wrong_pin')) {
        setError('PIN غير صحيح')
      } else if (msg.includes('Invalid login') || msg.includes('invalid_credentials')) {
        setError('اسم المستخدم أو كلمة السر مش صح')`,
    'friendly PIN error',
  )
}

await writeFile(file, source, 'utf8')
console.log('General manager numeric PIN always falls back safely when Supabase Auth fails')
