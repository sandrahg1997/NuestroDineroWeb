# OurMoney

Aplicación web responsive para gastos e ingresos compartidos. Está hecha con **Next.js + TypeScript + Supabase** y preparada para desplegarse en **Vercel**.

## Incluye

- Registro e inicio de sesión.
- Sincronización entre dos móviles con cuentas distintas mediante un código de invitación.
- CRUD completo de gastos e ingresos.
- Categorías iniciales y categorías personalizadas.
- Búsqueda, filtros por tipo/categoría/fecha y ordenación.
- Gastos e ingresos recurrentes semanales, mensuales o anuales, sin duplicados.
- Presupuestos generales y por categoría.
- Dashboard con balance, gráficos y últimos movimientos.
- Escáner de tickets desde la cámara del móvil usando OCR en el navegador.
- Detección de comercio, importe, fecha y categoría sugerida.
- Aprendizaje de la categoría elegida para cada comercio.
- Exportación e importación de movimientos en Excel (.xlsx).
- PWA instalable en iPhone/Android con accesos rápidos a “Añadir gasto” y “Escanear ticket”.

## 1. Crear Supabase

1. Crea un proyecto en Supabase.
2. Abre **SQL Editor**.
3. Copia y ejecuta entero `supabase/schema.sql`.
4. En **Authentication > URL Configuration**, añade:
   - Site URL local: `http://localhost:3000`
   - Después del despliegue: tu dominio de Vercel.
5. En **Authentication > Providers > Email**, para pruebas puedes desactivar “Confirm email”. Si lo mantienes activo, el usuario tendrá que confirmar su correo antes de entrar.

## 2. Variables locales

Copia `.env.example` a `.env.local`:

```bash
cp .env.example .env.local
```

Rellena:

```env
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=TU_CLAVE_PUBLICABLE
SUPABASE_SERVICE_ROLE_KEY=TU_CLAVE_SERVICE_ROLE
```

Usa la clave **Publishable/anon** para las dos primeras, nunca `service_role` ni una clave secreta en el navegador.

`SUPABASE_SERVICE_ROLE_KEY` es la excepción: es secreta, solo se usa en el servidor (la necesita "Eliminar cuenta" en Ajustes para poder borrar el usuario) y **no** lleva el prefijo `NEXT_PUBLIC_`, así que nunca llega al navegador. Cógela de Supabase > Project Settings > API > `service_role`.

Si tu proyecto de Supabase ya existía antes de esta función, ejecuta también `supabase/migrations/2026-08-05-account-deletion.sql` en el SQL Editor; si es un proyecto nuevo, ya viene incluido en `schema.sql`.

## 3. Ejecutar

```bash
npm install
npm run dev
```

Abre `http://localhost:3000`.

## 4. Desplegar en Vercel

Desde la carpeta del proyecto:

```bash
npx vercel
```

- Crea un proyecto nuevo.
- Añade en Vercel las tres variables de `.env.local` (marca `SUPABASE_SERVICE_ROLE_KEY` como secreta).
- Ejecuta `npx vercel --prod`.
- Copia el dominio final a la configuración de URL de Supabase.

También puedes subirlo a GitHub y conectar el repositorio desde Vercel para desplegar cada commit automáticamente.

## Compartir entre dos personas

1. La primera persona crea su cuenta.
2. En **Ajustes**, copia el código de invitación.
3. La segunda crea una cuenta distinta.
4. En **Ajustes**, introduce el código.
5. Desde ese momento ambas cuentas trabajan sobre el mismo hogar y ven los mismos datos.

## Escaneo de tickets

El OCR se ejecuta en el navegador con Tesseract.js, así que la primera lectura puede tardar unos segundos. Funciona mejor con:

- Ticket completo y plano.
- Buena luz uniforme.
- Sin sombras ni reflejos.
- Imagen enfocada y tomada desde arriba.

Los datos detectados siempre se muestran para revisarlos antes de guardar.

## Nota sobre el “widget” en web

Una web no puede instalar un WidgetKit nativo de iOS. La PWA sí ofrece:

- Icono instalable en la pantalla de inicio.
- Apariencia de aplicación independiente.
- Accesos directos a añadir gasto y escanear ticket cuando la plataforma los admite.

Para un widget nativo real habría que conservar una pequeña extensión iOS conectada a esta misma base de datos.
