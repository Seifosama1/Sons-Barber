# Checkpoint — Nov 19, 2026

## To restore this checkpoint manually:

If the other agent breaks something, you can ask me (Kiro) to restore any specific file.
The checkpoint is this conversation — all current file contents are known here.

## Key files and their state at this checkpoint:

### Source files (src/):
- src/App.jsx — LanguageProvider wrapping, AppWithLangCheck, language picker on first visit
- src/context/AuthContext.jsx — profile fetch with loyalty fields, error keys as translation keys, live profile realtime
- src/context/LanguageContext.jsx — t(), ta(), setLang(), syncLangFromProfile()
- src/lib/translations.js — all AR + EN strings
- src/lib/supabase.js — anon client
- src/lib/adminApi.js — service role admin operations
- src/lib/useRealtime.js — realtime hook
- src/pages/AdminPage.jsx — 4-tab admin shell
- src/pages/ClientPage.jsx — 5-tab client shell with notification badge
- src/pages/AuthPage.jsx — login/signup with i18n
- src/pages/BarberPage.jsx — placeholder
- src/pages/LanguagePicker.jsx — language selection screen
- src/admin/DashTab.jsx — redesigned dash (toggle card, inline requests, stats reordered)
- src/admin/CrewTab.jsx — redesigned crew (new barber card, queue+schedule buttons, live queue sheet)
- src/admin/ClientsTab.jsx — redesigned clients (filter pills, visit count, add client button)
- src/admin/ServicesSection.jsx — last service + view more sheet, discount notifications
- src/client/ClientHome.jsx — sessions from appointments+transactions, loyalty bar, show more
- src/client/ClientWaitlist.jsx — badge logic, toast logic, in_service detection
- src/client/ClientBarbers.jsx — realtime rating updates
- src/client/ClientProfile.jsx — language switcher, i18n
- src/client/ClientNotifications.jsx — rating per notification, persist rated state from DB
- src/client/BookingSheet.jsx — 5-step booking, realtime services
- src/components/Toast.jsx — gold prop for next-in-queue toast
- src/styles/admin.css — full admin styles + new crew/clients/dash redesign CSS
- src/styles/client.css — full client styles + nav top bar animation
- src/styles/auth.css — auth page styles
- src/styles/langpicker.css — language picker styles
- src/styles/spinner.css — spinner
- src/styles/toast.css — toast + gold variant

### Migrations applied to Supabase (in order):
1. supabase_schema.sql — base schema
2. 002_reservations.sql — instapay, shop_settings
3. 003_ratings.sql — barber_ratings + trigger
4. 004_realtime.sql — realtime publications
5. 005_services_discount.sql — discount_pct on services
6. 006_safe.sql — client_code, loyalty, waitlist, portfolio
7. 007_fixes.sql — get_my_role(), role constraint, shop_settings RLS
8. 008_notification_read_policy.sql — clients can mark own notifs read
9. 009_fix_barber_fk.sql — appointments.barber_id → profiles
10. 010_fix_status_constraint.sql — add 'rejected' to status check
11. 011_transactions.sql — transactions table (may be covered by 012)
12. 012_notification_types.sql — rating_request type, walk-in columns, transactions table
13. 013_loyalty_policy.sql — admin can update profiles, backfill loyalty
14. 014_fix_appointment_status.sql — revert wrongly completed appointments
15. 015_reset_loyalty.sql — clean duplicate test transactions
16. 016_fix_ratings.sql — barber_ratings UPDATE policy, unique constraint fix
17. 017_add_language.sql — lang column on profiles
18. 018_rating_per_session.sql — drop unique(client_id,barber_id), add notification_id column
