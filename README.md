# TallerPro — fase 1

App web para un taller mecánico **móvil** en Quebec: agenda de visitas a domicilio, recepción del vehículo con fotos y firma, órdenes de reparación, cotización de repuestos con proveedores, cotización al cliente con aprobación en línea, factura (TPS/TVQ) y cobro, avisos por SMS / WhatsApp / correo y portal del cliente. Interfaz en español, francés e inglés.

Especificación aprobada: documento «TallerPro — Especificación» (claude.ai).

## Qué incluye esta entrega (fase 1)

| Área | Incluido |
| --- | --- |
| Cuenta | Cuenta del dueño (admin + mecánico), Argon2id con migración automática de parámetros, sesión que expira tras 8 h sin uso, bloqueo de 15 min tras 5 intentos, cambiar contraseña cierra las otras sesiones, recuperación por correo (30 min, misma respuesta exista o no la cuenta). Roles recepción/mecánico listos para el futuro. |
| Clientes | Dossier con vehículos, órdenes, facturas, consentimientos y avisos; detección de duplicados y fusión; exportación de datos y anonimización (Loi 25). |
| Importación | Contactos del celular / WhatsApp en `.vcf` o `.csv` (Google, Excel FR con `;`), vista previa, duplicados, todo o nada, deshacer 30 días. |
| Vehículos | VIN con dígito de control, decodificación NHTSA, escaneo con la cámara (Chrome Android), cambio de dueño conservando historial. |
| Agenda | Visitas con dirección (Google Maps), cargo de visita (90 $ configurable), recordatorio el día antes, «voy en camino» con hora de llegada. |
| Recepción | Asistente en 6 pasos: cliente, vehículo, estado (kilometraje, combustible, mapa de daños), condiciones (LPC: evaluación, piezas reemplazadas), firma en pantalla, fotos guiadas. |
| Orden | Estados según el diagrama aprobado; diagnóstico con dictado por voz; líneas por tipo de trabajo (fijo o por hora); cronómetro; historial; mensajes del cliente. |
| Repuestos | Solicitud de repuesto, texto listo para pedir precio al proveedor (correo, SMS o copiar), ofertas con costo/plazo/condición, elección con margen automático, pedido al aprobar. |
| Cotización | Versionada, válida N días, PDF, aprobación por línea con firma (portal o en persona); rechazo total → **factura de revisión automática** y orden «lista»; trabajo adicional rechazado no cancela lo aprobado. |
| Factura y cobro | Numeración consecutiva sin huecos, TPS 5 % + TVQ 9,975 % (o sin impuestos si no está inscrito), PDF en FR y en el idioma del cliente, pagos parciales (efectivo, Interac, tarjeta, débito, cheque), anulación con nota de crédito, cierre automático al entregar y pagar. |
| Avisos | SMS, WhatsApp y correo según el canal que elija cada cliente, en su idioma, con plantillas editables; horario de silencio (21 h–8 h); reintentos y cambio de canal si uno falla; «STOP» da de baja; registro de cada envío. |
| Portal del cliente | Enlace seguro sin contraseña (7 días) o código de 6 dígitos; avance, fotos compartidas, cotización con firma, facturas, mensajes al taller, idioma, canales, consentimientos, descarga de sus datos. |
| Seguridad | Validación en el servidor, cabecera anti-CSRF, CSP estricta, sin iframes (clickjacking), fotos privadas sin GPS, CSV sin fórmulas, auditoría de acciones sensibles. |
| Calidad | 57 pruebas automáticas (servidor y textos en ES/EN/FR) + prueba del flujo completo en navegador; versión visible y aviso si pantalla y servidor no coinciden; pantalla de error que dice qué parte falló. |

**Pendiente para fase 2** (según el plan aprobado): pagos con tarjeta en el celular (Stripe Tap to Pay) — hoy se registran a mano —, inventario de bodega/vehículo, gastos, reportes de rentabilidad e impuestos, QuickBooks Online, WhatsApp con plantillas aprobadas por Meta.

## Probar en tu computador

Requisitos: Node.js 22 y PostgreSQL 16.

```bash
npm install
createdb tallerpro
DATABASE_URL=postgres://localhost/tallerpro npm run dev -w server   # API en :3000 (crea las tablas sola)
npm run dev -w web                                                   # app en http://localhost:5173
```

La primera vez la app pide crear la cuenta del dueño. Sin Twilio ni SMTP configurados, los mensajes no se envían: se escriben en la consola del servidor (útil para probar los enlaces del portal).

Pruebas:

```bash
createdb tallerpro_test
npm test          # servidor (51) + interfaz (6)
```

## Poner en producción (AWS Lightsail, Montreal)

Los datos quedan en Quebec (región `ca-central-1`). Costo de referencia: plan Lightsail con 2 GB de RAM, más los mensajes.

1. **Cuenta AWS** a nombre del taller. En Lightsail › Create instance: región **Canada (Montreal)**, sistema **Ubuntu 24.04**, plan de 2 GB. Asigna una **IP estática** y abre los puertos 80 y 443 en «Networking».
2. **Dominio**: apunta un registro `A` (ej. `taller.tudominio.ca`) a esa IP.
3. En el servidor (SSH desde la consola de Lightsail):
   ```bash
   sudo apt update && sudo apt install -y docker.io docker-compose-v2 git
   sudo usermod -aG docker ubuntu && newgrp docker
   git clone <tu repositorio> tallerpro && cd tallerpro   # o sube el .zip
   cp .env.example .env && nano .env                      # DOMAIN, PUBLIC_URL, POSTGRES_PASSWORD
   docker compose up -d --build
   ```
   Caddy obtiene el certificado HTTPS solo. Abre `https://tu-dominio` y crea la cuenta del dueño.
4. **Respaldos diarios** (30 días): `crontab -e` → `15 3 * * * /home/ubuntu/tallerpro/deploy/backup.sh`. Una vez al mes: `deploy/restore-test.sh`. Para copiar los respaldos fuera del servidor, crea un bucket S3 en Montreal y define `BACKUP_S3`.
5. **SMS y WhatsApp (Twilio)**: crea la cuenta, compra un número canadiense, pon `SMS_PROVIDER=twilio` y las claves en `.env`. En el número, configura «A message comes in» → `https://tu-dominio/api/webhooks/twilio` (POST) para recibir respuestas y «STOP».
   WhatsApp: Twilio exige una cuenta WhatsApp Business verificada por Meta y **plantillas aprobadas** para mensajes que inicia el taller; mientras no estén aprobadas, deja WhatsApp desmarcado en los clientes (si falla, la app reintenta por correo o SMS).
6. **Correo (Amazon SES, Montreal)**: verifica el dominio en SES, pide salir del modo «sandbox», crea credenciales SMTP y pon `EMAIL_PROVIDER=smtp` y `SMTP_URL`.
7. **Actualizar**: `git pull && docker compose up -d --build` (las migraciones se aplican solas al arrancar).

## Antes de usarla con clientes reales

- [ ] Hacer revisar por la OPC o un abogado las reglas de la Ley de protección del consumidor aplicadas (evaluación escrita, piezas reemplazadas, garantía) y el texto de garantía.
- [ ] Completar la **evaluación de factores relativos a la privacidad** (EFVP) por los envíos a Twilio y a SES, como menciona la política de confidencialidad, y designar al responsable de los datos.
- [ ] Confirmar con el contador si el taller está inscrito en TPS/TVQ y cargar los números en Ajustes.
- [ ] Cargar los tipos de trabajo con sus precios y los proveedores habituales.
- [ ] Importar los contactos de WhatsApp (Más › Importar contactos).

## Estructura

```
server/   API (Fastify + TypeScript + PostgreSQL)
  src/migrations/001_init.sql   modelo de datos
  src/routes/                   un archivo por área
  src/services/orders.ts        estados, cotizaciones, factura de revisión
  test/                         pruebas automáticas
web/      app (React + Vite, PWA instalable)
  src/i18n/                     textos ES / EN / FR
  src/pages/                    pantallas (taller y portal del cliente)
deploy/   Caddy, respaldos
```
