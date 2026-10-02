# Checklist de puesta en marcha

1. Crear proyecto en Supabase.
2. Ejecutar `supabase/schema.sql` completo en SQL Editor. Si el proyecto ya
   existía, ejecuta además las migraciones nuevas de `supabase/migrations/`
   (p. ej. `2026-08-30-recurring-cron.sql` y `2026-10-02-push-reunion-retos.sql`).
3. Copiar `.env.example` a `.env.local` y rellenar URL, clave publicable,
   `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` (cadena larga aleatoria) y las
   claves VAPID de notificaciones (`npx web-push generate-vapid-keys`).
4. Ejecutar `npm install` y `npm run dev`.
5. Crear dos usuarios de prueba y comprobar el código de invitación del hogar.
6. Probar CRUD, recurrentes, filtros, presupuestos y escáner.
7. Subir a GitHub y conectar el repositorio en Vercel.
8. Copiar las variables de entorno a Vercel (incluidas `CRON_SECRET` y las
   VAPID). Los crons de `vercel.json` (recurrentes diario e informe semanal) se
   activan solos al desplegar.
9. Añadir la URL de producción en Supabase Auth > URL Configuration.
10. Instalar la PWA desde Safari o Chrome.
