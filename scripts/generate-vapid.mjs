/**
 * Generate VAPID keys for Web Push notifications.
 * Run once: node scripts/generate-vapid.mjs
 * Then add the keys to your .env and Supabase Edge Function secrets.
 */

import { webcrypto } from 'node:crypto'

const { subtle } = webcrypto

const keyPair = await subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign', 'verify']
)

const publicKeyBuffer  = await subtle.exportKey('raw', keyPair.publicKey)
const privateKeyBuffer = await subtle.exportKey('pkcs8', keyPair.privateKey)

function toBase64Url(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

const publicKey  = toBase64Url(publicKeyBuffer)
const privateKey = toBase64Url(privateKeyBuffer)

console.log('\n✅ VAPID Keys Generated\n')
console.log('Add to your .env file:')
console.log(`VITE_VAPID_PUBLIC_KEY=${publicKey}`)
console.log('\nAdd to Supabase Edge Function secrets (Dashboard → Edge Functions → Secrets):')
console.log(`VAPID_PUBLIC_KEY=${publicKey}`)
console.log(`VAPID_PRIVATE_KEY=${privateKey}`)
console.log(`VAPID_SUBJECT=mailto:admin@sonsbarber.app`)
console.log('\n⚠️  Keep VAPID_PRIVATE_KEY secret — never commit it to git.\n')
