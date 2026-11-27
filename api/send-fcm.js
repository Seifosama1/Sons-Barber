// Serverless endpoint on Vercel to dispatch FCM Push Notifications
// Works when called by admin/barber or Supabase webhook

export default async function handler(req, res) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Credentials', true)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { targetUserId, title, body, data, tokens } = req.body

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
    const serviceKey = process.env.VITE_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY

    let targetTokens = tokens || []

    // If targetUserId provided, fetch user's FCM tokens from Supabase auth
    if (targetUserId && targetTokens.length === 0 && supabaseUrl && serviceKey) {
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
      return res.status(200).json({ success: true, message: 'No registered FCM device tokens for user' })
    }

    // Server-to-server FCM push notification using Google OAuth / legacy or service account
    // For Vercel, if GOOGLE_SERVICE_ACCOUNT or FIREBASE_SERVER_KEY is set:
    const serverKey = process.env.FIREBASE_SERVER_KEY

    const results = []
    if (serverKey) {
      for (const token of targetTokens) {
        const fcmRes = await fetch('https://fcm.googleapis.com/fcm/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `key=${serverKey}`
          },
          body: JSON.stringify({
            to: token,
            notification: {
              title: title || 'Sons Barber',
              body: body || '',
              sound: 'default'
            },
            data: data || {},
            priority: 'high'
          })
        })
        const fcmData = await fcmRes.json()
        results.push(fcmData)
      }
    }

    return res.status(200).json({ success: true, count: targetTokens.length, results })
  } catch (err) {
    console.error('FCM Dispatch error:', err)
    return res.status(500).json({ error: err.message })
  }
}
