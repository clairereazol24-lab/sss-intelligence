import { createClient } from '@/lib/supabase-server'
import { getUserAccess, DATA_IMPORT_ALLOWED_USERNAME } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import SSSDataClient from '../SSSDataClient'

export default async function Page() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const access = user ? await getUserAccess(supabaseAdmin, user.id) : null
  const canImport = access?.username === DATA_IMPORT_ALLOWED_USERNAME

  return <SSSDataClient partner="Alpharus" canImport={canImport} />
}
