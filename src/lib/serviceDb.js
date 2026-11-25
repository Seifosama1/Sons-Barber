/**
 * Direct DB operations using service role key via raw fetch.
 * Bypasses RLS for portfolio_photos and profiles tables.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SERVICE_KEY = import.meta.env.VITE_SUPABASE_SERVICE_KEY

function headers(extra = {}) {
  return {
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'apikey': SERVICE_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
    ...extra,
  }
}

/**
 * Insert a row into a table, bypassing RLS.
 * Returns { data, error }
 */
export async function serviceInsert(table, row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(row),
  })
  if (!res.ok) {
    const body = await res.text()
    return { data: null, error: { message: `HTTP ${res.status}: ${body}` } }
  }
  const data = await res.json()
  return { data, error: null }
}

/**
 * Update rows in a table where column = value.
 * Returns { error }
 */
export async function serviceUpdate(table, updates, column, value) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${column}=eq.${encodeURIComponent(value)}`, {
    method: 'PATCH',
    headers: headers({ 'Prefer': 'return=minimal' }),
    body: JSON.stringify(updates),
  })
  if (!res.ok) {
    const body = await res.text()
    return { error: { message: `HTTP ${res.status}: ${body}` } }
  }
  return { error: null }
}

/**
 * Delete rows in a table where column = value.
 */
export async function serviceDeleteRow(table, column, value) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${column}=eq.${encodeURIComponent(value)}`, {
    method: 'DELETE',
    headers: headers({ 'Prefer': 'return=minimal' }),
  })
  if (!res.ok) {
    const body = await res.text()
    return { error: { message: `HTTP ${res.status}: ${body}` } }
  }
  return { error: null }
}

/**
 * Fetch rows from a table using service role key (bypasses RLS).
 * @param {string} tableWithQuery - e.g. 'waitlist?select=id,status,profiles:client_id(name,phone)&barber_id=eq.xxx'
 */
export async function serviceSelect(tableWithQuery) {
  const url = `${SUPABASE_URL}/rest/v1/${tableWithQuery}`
  const res = await fetch(url, {
    method: 'GET',
    headers: headers(),
  })
  if (!res.ok) {
    const body = await res.text()
    return { data: null, error: { message: `HTTP ${res.status}: ${body}` } }
  }
  const data = await res.json()
  return { data, error: null }
}
