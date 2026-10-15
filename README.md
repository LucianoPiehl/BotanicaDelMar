# Botanica del Mar Site

Sistema web para Botanica del Mar con tienda publica, panel interno y backend Node.js.

## Arquitectura

- `index.html`, `app.js`, `index.css`: tienda publica y checkout.
- `admin.html`, `admin.js`, `admin.css`: panel interno para pedidos, notificaciones y margen comercial.
- `server/`: API REST, integracion con Mercado Pago, email SMTP transaccional, WhatsApp Cloud API opcional, Google Maps y autenticacion.
- `data/catalog.js`: catalogo publico del frontend.
- `data/runtime/database.json`: persistencia local de pedidos, configuracion y notificaciones.
- `assets/`: imagenes e identidad visual.

## Desarrollo local

1. Copia `.env.example` como `.env`.
2. Si vas a trabajar solo en local, usa:
   - `PUBLIC_BASE_URL=http://127.0.0.1:4173`
   - `HOST=127.0.0.1`
   - `PORT=4173`
   - `BOTANICA_DB_PATH=`
   - `ADMIN_COOKIE_SECURE=false`
3. Instala dependencias con `npm.cmd install`.
4. Ejecuta `npm.cmd start` o `start_site.cmd`.
5. Abre:
   - `http://127.0.0.1:4173/`
   - `http://127.0.0.1:4173/admin.html`

## Endpoints clave

- `GET /api/health`
- `GET /api/catalog`
- `GET /api/config`
- `PUT /api/config`
- `GET /api/orders`
- `POST /api/checkout`
- `PATCH /api/orders/:orderId/status`
- `GET /api/metrics`
- `GET /api/notifications`
- `POST /api/orders/:orderId/notify`
- `GET /api/whatsapp/webhook`
- `POST /api/whatsapp/webhook`
- `POST /api/payments/mercadopago/webhook`

## Produccion recomendada

La forma mas estable para este proyecto es:

- 1 VPS Linux con Docker
- 1 dominio propio
- Caddy como proxy HTTPS automatico
- 1 volumen persistente para `database.json`

Archivos ya listos en este repo:

- `Dockerfile`
- `docker-compose.production.yml`
- `deploy/Caddyfile`
- `.env.example`

### Que debes completar tu

Solo tienes que definir valores reales en `.env`:

- `PUBLIC_BASE_URL`
- `APP_DOMAIN`
- `LETSENCRYPT_EMAIL`
- `ADMIN_SESSION_SECRET`
- `ADMIN_INITIAL_PASSWORD`
- Credenciales de Mercado Pago
- Credenciales de Google Maps
- Credenciales del email transaccional que vayas a usar
- Credenciales de WhatsApp Cloud API solo si luego quieres reactivarlo

### Paso a paso para subirlo

1. Contrata un VPS Linux Ubuntu 24.04 o Debian 12 con al menos 1 vCPU, 2 GB RAM y 40 GB SSD.
2. Apunta tu dominio al VPS con un registro `A`.
3. Sube la carpeta `sitio-web` completa al servidor.
4. Instala Docker Engine y Docker Compose Plugin.
5. Dentro de la carpeta del proyecto, crea `.env` a partir de `.env.example`.
6. En `.env`, deja estos valores de infraestructura:
   - `PUBLIC_BASE_URL=https://tu-dominio`
   - `APP_DOMAIN=tu-dominio`
   - `LETSENCRYPT_EMAIL=tu-email`
   - `HOST=0.0.0.0`
   - `PORT=8080`
   - `BOTANICA_DB_PATH=/data/database.json`
   - `ADMIN_COOKIE_SECURE=true`
7. Completa las APIs externas:
   - Mercado Pago productivo
   - Google Maps
   - SMTP Relay de tu correo operativo
   - WhatsApp productivo solo si decides reactivarlo
8. Levanta el stack:
   - `docker compose -f docker-compose.production.yml up -d --build`
9. Verifica:
   - `https://tu-dominio/api/health`
   - `https://tu-dominio/`
   - `https://tu-dominio/admin.html`
10. En Mercado Pago, configura el webhook:
   - `https://tu-dominio/api/payments/mercadopago/webhook`
11. Solo si reactivas WhatsApp: configura el webhook en Meta:
   - Callback URL: `https://tu-dominio/api/whatsapp/webhook`
   - Verify token: el valor de `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
   - Suscribe al menos el campo `messages`

### Actualizar la aplicacion

1. Sube los cambios del proyecto al VPS.
2. Desde la carpeta del proyecto ejecuta:
   - `docker compose -f docker-compose.production.yml up -d --build`

### Backup minimo recomendado

El archivo critico es el volumen `/data/database.json`.

- Haz copia periodica del volumen `botanica_data`.
- Si migras de servidor, conserva ese archivo para no perder pedidos ni configuracion.

## Notas operativas importantes

- Mercado Pago usa Checkout Pro: Botanica del Mar no almacena datos de tarjeta.
- El canal operativo por defecto ahora es email SMTP. Con solo cambiar las credenciales y casillas reales en `.env`, el aviso de pedido pagado sale por correo.
- WhatsApp queda disponible como integracion opcional y sigue soportando webhook de verificacion y webhook de estados.
- WhatsApp productivo requiere token permanente o de larga duracion. Los tokens temporales del panel de Meta no sirven como solucion final.
- Para mensajes iniciados por la empresa fuera de la ventana de 24 horas, necesitas una plantilla aprobada en `WHATSAPP_ORDER_TEMPLATE_NAME`.
- El panel administrativo queda protegido con cookie `HttpOnly` y puede forzarse a HTTPS con `ADMIN_COOKIE_SECURE=true`.

## Fuente del catalogo

El catalogo base se genera desde:

- `distribuidor_lista.pdf` (archivo externo, no incluido)
- `Vademecum_BIOCOM.pdf` (archivo externo, no incluido)

Si cambian esos PDFs:

- `python tools\build_biocom_catalog.py`


