import fs from 'node:fs'

const file = 'src/pages/admin/PenaltyIncentiveManagement.tsx'
let source = fs.readFileSync(file, 'utf8')

source = source.replace(
  "import { getCurrentSession } from '../../lib/auth'",
  "import { getCurrentSession, restoreRiderSession } from '../../lib/auth'",
)

const oldBlock = `      const session = await getCurrentSession()
      if (!session) {
        navigate('/login')
        return
      }

      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()

      setProfile(userProfile as UserProfile)`

const newBlock = `      const session = await getCurrentSession()
      const localManagerSession = restoreRiderSession()

      if (!session && !localManagerSession?.account_id) {
        navigate('/login')
        return
      }

      if (session) {
        const { data: userProfile } = await supabase
          .from('user_profiles')
          .select('*')
          .or(\`auth_user_id.eq.\${session.user.id},id.eq.\${session.user.id}\`)
          .maybeSingle()

        setProfile(userProfile as UserProfile)
      } else if (localManagerSession) {
        setProfile({
          id: localManagerSession.account_id || localManagerSession.rider_id || '',
          auth_user_id: '',
          email: '',
          full_name: localManagerSession.rider_name || localManagerSession.username || 'مدير الفرع',
          role: localManagerSession.role || 'branch_manager',
          branch_id: localManagerSession.branch_id || undefined,
          status: 'active',
        } as UserProfile)
      }`

if (source.includes(oldBlock)) {
  source = source.replace(oldBlock, newBlock)
} else if (!source.includes('const localManagerSession = restoreRiderSession()')) {
  throw new Error('Penalty incentive session block was not found')
}

fs.writeFileSync(file, source)
console.log('Patched penalty/incentive page to support local manager sessions')
