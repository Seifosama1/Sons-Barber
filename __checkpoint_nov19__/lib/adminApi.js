/**
 * Admin API helpers — use the service role key to manage auth users.
 *
 * ⚠ SECURITY: The service role key is exposed in the browser bundle via
 *   VITE_SUPABASE_SERVICE_KEY. This bypasses Row Level Security.
 *   Acceptable for a private admin panel, but MUST be moved to Supabase
 *   Edge Functions before the app is publicly accessible.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SERVICE_KEY  = import.meta.env.VITE_SUPABASE_SERVICE_KEY

function adminHeaders() {
  return {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  }
}

/** Create a new auth user (barber). Returns { user, error } */
export async function adminCreateUser({ phone, password, name, role = 'barber' }) {
  const email = `${phone.replace(/\s/g, '')}@sonsbarber.app`
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, phone: phone.replace(/\s/g, ''), role },
    }),
  })
  const data = await res.json()
  if (!res.ok) return { user: null, error: data.msg || data.message || 'فشل إنشاء الحساب' }
  return { user: data, error: null }
}

/** Update a user's password */
export async function adminUpdatePassword(userId, newPassword) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    headers: adminHeaders(),
    body: JSON.stringify({ password: newPassword }),
  })
  const data = await res.json()
  if (!res.ok) return { error: data.msg || data.message || 'فشل تحديث كلمة المرور' }
  return { error: null }
}

/** Hard-delete an auth user (also cascades to profiles via FK) */
export async function adminDeleteUser(userId) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    return { error: data.msg || data.message || 'فشل حذف المستخدم' }
  }
  return { error: null }
}
