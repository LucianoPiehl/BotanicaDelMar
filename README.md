# Botánica del Mar

Tienda de cosmética natural con backend Node.js, panel administrativo e integración con Mercado Pago.

La aplicación está en [`sitio-web/`](sitio-web/README.md).

## Inicio local

```sh
cd sitio-web
cp .env.example .env
npm install
npm start
```

Ajustar los valores locales indicados en el README de la aplicación antes de iniciar.

## Configuración y datos privados

El repositorio excluye credenciales, archivos TXT, perfiles del navegador, dependencias y bases de datos de ejecución. La base local vacía se crea automáticamente al iniciar. Configurar las credenciales propias en `.env`; no agregarlas a Git. Para WhatsApp, definir un token de verificación propio.

Los PDF originales del catálogo y las capturas de sitios externos no se incluyen. Las herramientas de generación del catálogo esperan los PDF en la raíz del proyecto.
