import crypto from 'crypto'

/**
 * High-priority Google FCM HTTP v1 Push Notification Dispatcher
 * Sends real system-level native notifications waking up Android devices even when app is killed/locked.
 */

const SERVICE_ACCOUNT = {
  project_id: "sonsbarber",
  client_email: "firebase-adminsdk-fbsvc@sonsbarber.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCf+1EUb3ljvZue\n/HsDYwhH9DCJEK5HoIppLAxqanspe4S/2lQeFz7BOa+3TrwuvfMjfflOjPn+Qo8f\nfDRNZ06UbPkmelnOW+wfkqj66vyWSGUKHOoyJkrmPV4akQmzsOHr5tyBV1cDPwg4\ns2VWv/uI5bfEbPP2pVFd2fUpLQr1gjuiY1LK/m4VycT4dCoDIcVddluaypVnfKd+\nyaRqe0zH6dtgyMYxigfmaXVnl6sDJZzr7cKzxh1ejWxmXgzE33xt20EaqmUu3Qh/\n/e4sK3G8rfULI2d/IXc+mi9h8Y2bhgFOFEBUmGz97rfEQdIW8pGhS+ZBi2XshrJG\nPMevCnjlAgMBAAECggEADbYrh9XaEJtiqCi5nluxjQE327eLSGZRFpyI3+IKdk64\n3Pyocv/JCCSak9pytIrhOOyGHp5kms83lxo9HVk6WexRGmQoKFCmlzops3/KcFL6\nHfjGdc/kYYFm/F3r9/O0GVTrF0bWFVgkqz9s8xd3Ro9xxasU6dHXfHS+122d39bL\n7KTPodwVFvBgSxx98TJdTV+3yd064G7FhGGaAEkKEYuLM+qRdWdUqK4qgzyEJE2i\nAYZFNPmu3qxSzDtJCYD1t6sleU6ju73dxlZA115t7CUMiUGUnxwlruR/3S2W9zGY\nAcwhRsT0lEorti5ELTgN1LxYprI3bXU/S04iGT1EDQKBgQDUWC83/kM2orImiy7z\nBj3zP4lXKAf3LCa5W9aOaCAoMXcE5HyNdI0CvQarKQHPlS4ZRqbVGMPOlLKrHlnU\nLYR2upPSKP1igW1PhZXEO8O/uhb5AhL1w9+u+2xBfOiwIqhsIXUWomC5dKBNzrBe\nhQM3Vdd2hmGx9E6iD6RB+q+gWwKBgQDA3z+2xovGPO1EqmXA6jCX7aj3EWjBETGn\ncPha+IKBIDJcAIYhrZfiYwB5VC/i9TNuuBZbP/+3jSN5BKbHNTsQPssM2A6WMHxH\nKnFRA87dsPbvt0uy0/g7blTcuiwuD2xFlLX+OKfwXnnwWL4N0o0WtxjbVX0xRc3W\nToDw7X2PvwKBgGTCe5V8R3STeymi/eI/4gGc8pSy4CS/hJiMJaFpc2jfH/ToXtnY\npljYTWPGj59q0HcZ+WxA1hkeojFks4dlGegk3KPq42FsvOvxHYICQf6mVORPwaNx\nEKE9mL7ygI+jwnuc3Kyi3HbkCnUhULtpLn+Bcj5BwfXpUa7A8VaFl/TlAoGAWynq\n0ri8HoJz3+3u1KWdPGKwZ7/J1OAMqUljipRGE0SlqQjyXX7Q+Me01KRvUgZ2PhIz\nNwRkGV1T9AK31hcaCM61aSfClUjrpTOxhgqXv//CaIIp/KfmgCjhYcd51HejxKvK\n7hPXhW0SlAFOK/hmieMXk6yv1RdaeL54geivXb8CgYEAmosqJjInLzzWI4HoF+1q\nBMI0GKBQlgFIPbcVCuhcfWgCqYncGUvWynhGyRb5bDVmbguOkQy6a1zUXS01tG6i\nXSyUQH7YArb7gcOdqVCj+2BwGbCORawUAtBsGET/1h3llSMOqXRhwOezAYGlfAcU\nW9Cvd0L8QZc78fJAj3PfXHU=\n-----END PRIVATE KEY-----\n"
}

// Generate Google OAuth 2.0 Access Token using native crypto (zero external dependencies)
async function getGoogleAccessToken() {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claimSet = {
    iss: SERVICE_ACCOUNT.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  }

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url')
  const encodedClaim = Buffer.from(JSON.stringify(claimSet)).toString('base64url')
  const unsignedToken = `${encodedHeader}.${encodedClaim}`

  const signer = crypto.createSign('RSA-SHA256')
  signer.update(unsignedToken)
  signer.end()
  const signature = signer.sign(SERVICE_ACCOUNT.private_key, 'base64url')
  const jwt = `${unsignedToken}.${signature}`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  })

  const tokenData = await tokenRes.json()
  if (!tokenRes.ok) {
    throw new Error('Google OAuth failed: ' + JSON.stringify(tokenData))
  }
  return tokenData.access_token
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { targetUserId, title, body, data, tokens } = req.body

    const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://dlbeywpyjdhynflmqvgb.supabase.co'
    const serviceKey = process.env.VITE_SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsYmV5d3B5amRoeW5mbG1xdmdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5NDc1ODM1MiwiZXhwIjoyMTEwMzM0MzUyfQ.wB_iUoXsqHFLVltAmbmBHR99LbvuRDgIeQuXlIp2fo4'

    let targetTokens = tokens || []

    if (targetUserId && targetTokens.length === 0) {
      const userRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${targetUserId}`, {
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'apikey': serviceKey
        }
      })
      if (userRes.ok) {
        const userData = await userRes.json()
        targetTokens = userData.user_metadata?.fcm_tokens || []
      }
    }

    if (!targetTokens || targetTokens.length === 0) {
      return res.status(200).json({ success: true, message: 'No registered FCM tokens found' })
    }

    const accessToken = await getGoogleAccessToken()
    const projectId = SERVICE_ACCOUNT.project_id
    const fcmEndpoint = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`

    const results = []
    for (const token of targetTokens) {
      // Merge any custom data fields (all values must be strings for FCM)
      const dataPayload = {
        title: title || 'Sons Barber',
        body: body || '',
        ...(data ? Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])) : {})
      }

      const fcmPayload = {
        message: {
          token,
          // 'notification' block: shown by FCM system tray on background/killed (Android handles it natively)
          notification: {
            title: title || 'Sons Barber',
            body: body || ''
          },
          // 'data' block: REQUIRED for background/killed delivery on many Android OEMs (Samsung, Xiaomi etc.)
          // Also used by Capacitor PushNotifications listener when app is in foreground
          data: dataPayload,
          android: {
            priority: 'high',   // Must be 'high' to wake screen / bypass Doze mode
            ttl: '86400s',      // Keep message for 24h if device is offline
            notification: {
              channel_id: 'sons_barber_default',  // Must match channel created in Android XML
              sound: 'default',
              notification_priority: 'PRIORITY_MAX',
              default_sound: true,
              default_vibrate_timings: true,
              visibility: 'PUBLIC',   // Show on lock screen
              notification_count: 1
            }
          }
        }
      }

      const fcmRes = await fetch(fcmEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(fcmPayload)
      })

      const fcmData = await fcmRes.json()
      results.push({ token: token.slice(0, 15) + '...', status: fcmRes.status, response: fcmData })
    }

    return res.status(200).json({ success: true, count: targetTokens.length, results })
  } catch (err) {
    console.error('FCM Dispatch error:', err)
    return res.status(500).json({ error: err.message })
  }
}
