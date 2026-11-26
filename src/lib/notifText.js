/**
 * Notification text helper — returns title/body in the client's preferred language.
 * Fetches the client's lang from profiles, defaults to 'ar'.
 */
import { supabase } from './supabase'

async function getClientLang(clientId) {
  if (!clientId) return 'ar'
  const { data } = await supabase
    .from('profiles')
    .select('lang')
    .eq('id', clientId)
    .single()
  return data?.lang || 'ar'
}

export async function bookingApprovedText(clientId, barberName) {
  const lang = await getClientLang(clientId)
  return lang === 'en'
    ? { title: 'Booking Confirmed ✓', body: `Your appointment with ${barberName || 'your barber'} has been confirmed. See you soon!` }
    : { title: 'تم قبول حجزك ✓', body: `تم تأكيد موعدك مع ${barberName || 'الحلاق'}. نراك قريباً!` }
}

export async function bookingRejectedText(clientId, adminPhone) {
  const lang = await getClientLang(clientId)
  return lang === 'en'
    ? { title: 'Booking Rejected', body: `Unfortunately your booking request was rejected. Contact us: ${adminPhone}` }
    : { title: 'تم رفض حجزك', body: `للأسف تم رفض طلب الحجز. للاستفسار تواصل معنا على: ${adminPhone}` }
}

export async function queueTurnText(clientId, barberName) {
  const lang = await getClientLang(clientId)
  return lang === 'en'
    ? { title: "It's Your Turn!", body: `${barberName || 'Your barber'} is ready for you now. Head to the salon.` }
    : { title: 'حان دورك!', body: `${barberName || 'الحلاق'} جاهز لك الآن، توجه للمحل.` }
}

export async function queueUpdateText(clientId, barberName, aheadCount) {
  const lang = await getClientLang(clientId)
  return lang === 'en'
    ? { title: 'Queue Update', body: `${aheadCount} ${aheadCount === 1 ? 'person' : 'people'} ahead of you with ${barberName}. We'll notify you when it's your turn.` }
    : { title: 'تحديث طابور الانتظار', body: `يوجد ${aheadCount} عملاء قبلك في الدور عند ${barberName}. سنبلغك فور اقتراب دورك.` }
}
