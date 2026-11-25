/**
 * Direct Storage upload using service role key via raw fetch.
 * Bypasses all RLS policies regardless of user auth state.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SERVICE_KEY = import.meta.env.VITE_SUPABASE_SERVICE_KEY

/**
 * Upload a file to Supabase Storage using the service role key.
 * @param {string} bucket - e.g. 'barber-media'
 * @param {string} path   - e.g. 'avatars/userid-timestamp.jpg'
 * @param {File|Blob} file
 * @returns {{ publicUrl: string } | { error: string }}
 */
export async function serviceUpload(bucket, path, file) {
  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'apikey': SERVICE_KEY,
      'x-upsert': 'true',
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  })

  if (!res.ok) {
    const body = await res.text()
    return { error: `HTTP ${res.status}: ${body}` }
  }

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`
  return { publicUrl }
}

/**
 * Delete a file from Supabase Storage using service role key.
 * @param {string} bucket
 * @param {string} path
 */
export async function serviceDelete(bucket, path) {
  const deleteUrl = `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`
  await fetch(deleteUrl, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'apikey': SERVICE_KEY,
    },
  })
}
