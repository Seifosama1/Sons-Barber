// Run with: node scripts/gen-vapid.js
import { webcrypto } from 'crypto'
const { subtle } = webcrypto

async function main() {
  const keyPair = await subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  )
  const pub  = await subtle.exportKey('raw',   keyPair.publicKey)
  const priv = await subtle.exportKey('pkcs8', keyPair.privateKey)

  const toB64 = buf => Buffer.from(buf).toString('base64')
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')

  console.log('\n✅ VAPID Keys\n')
  console.log('VITE_VAPID_PUBLIC_KEY=' + toB64(pub))
  console.log('VAPID_PUBLIC_KEY='      + toB64(pub))
  console.log('VAPID_PRIVATE_KEY='     + toB64(priv))
  console.log('VAPID_SUBJECT=mailto:admin@sonsbarber.app\n')
}
main()
