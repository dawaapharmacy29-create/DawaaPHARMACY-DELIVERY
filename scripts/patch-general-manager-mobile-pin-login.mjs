import { readFile, writeFile } from 'node:fs/promises'

const file = new URL('../src/pages/Login.tsx', import.meta.url)
let source = await readFile(file, 'utf8')

function replaceOnce(before, after, label) {
  if (source.includes(after)) return
  if (!source.includes(before)) throw new Error(`General manager login anchor not found: ${label}`)
  source = source.replace(before, after)
}

replaceOnce(
  `  const handleAdminLogin = async () => {
    const loginName = resolveAdminLogin(username) || username.trim()`,
  `  const handleManagerPinLogin = async () => {
    const pin = normalizePin(password)
    const managerUsername = username.trim() || 'dr.moaz'
    const result = await loginWithPin(managerUsername, pin)

    if (!result?.success || !result.account_id) {
      throw new Error(friendlyRiderError(result))
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

replaceOnce(
  `      if (looksLikeAdmin) {
        // لو الاسم أدمن معروف مثل د معاذ أو dr.moaz، ندخله Supabase Auth حتى لو الباسورد أرقام.
        await handleAdminLogin()
      } else if (shouldTryPinFirst) {`,
  `      if (looksLikeAdmin) {
        if (shouldTryPinFirst) {
          // الهاتف الجديد لا يملك جلسة Supabase Auth محفوظة. نجرب كلمة سر الإدارة أولاً،
          // ثم نستخدم PIN حساب general_manager لو كانت كلمة سر Auth غير صالحة.
          try {
            await handleAdminLogin()
          } catch (adminError: any) {
            const message = String(adminError?.message || '')
            if (!message.includes('Invalid login') && !message.includes('invalid_credentials')) throw adminError
            await handleManagerPinLogin()
          }
        } else {
          await handleAdminLogin()
        }
      } else if (shouldTryPinFirst) {`,
  'admin PIN fallback',
)

replaceOnce(
  `      if (msg.includes('Invalid login') || msg.includes('invalid_credentials')) {
        setError('اسم المستخدم أو كلمة السر مش صح')`,
  `      if (msg.includes('PIN غير صحيح') || msg.includes('wrong_pin')) {
        setError('PIN غير صحيح')
      } else if (msg.includes('Invalid login') || msg.includes('invalid_credentials')) {
        setError('اسم المستخدم أو كلمة السر مش صح')`,
  'friendly PIN error',
)

await writeFile(file, source, 'utf8')
console.log('General manager can now use the same PIN on a fresh mobile device')
