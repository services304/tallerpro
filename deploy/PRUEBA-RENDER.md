# Probar TallerPro gratis en internet (Render + Neon)

Para **probar** la app desde tu celular sin pagar y sin tarjeta. Usa solo **datos inventados**: estos servidores no están en Quebec. Para trabajar con clientes reales, instálala en Oracle Montreal (`GRATIS-ORACLE.md`).

| Pieza | Servicio gratuito |
| --- | --- |
| Código | GitHub (repositorio privado) |
| Base de datos (incluye las fotos) | Neon, plan Free (permanente, sin tarjeta) |
| App | Render, plan Free |

Lo que debes saber de la prueba:

- Si nadie la usa durante 15 minutos se «duerme»; la primera apertura después tarda alrededor de un minuto.
- Arriba aparece una franja amarilla: «Versión de prueba: usa solo datos inventados».
- Los avisos funcionan en modo «Desde mi celular» (WhatsApp / SMS desde tu teléfono).

---

## 1. GitHub: guardar el código

1. Crea tu cuenta en <https://github.com/signup>.
2. Pulsa **New repository**: nombre `tallerpro`, marca **Private**, y no agregues README ni nada más. **Create repository**.
3. Pasa a Claude tu nombre de usuario de GitHub para subir el código.

Si prefieres subirlo tú: descomprime `tallerpro-fase1.zip` en tu computador, en GitHub pulsa **uploading an existing file** y arrastra el **contenido** de la carpeta `tallerpro` (no la carpeta misma). GitHub acepta 100 archivos por vez: arrastra primero la carpeta `server`, confirma con **Commit changes**, y luego el resto.

## 2. Neon: la base de datos

1. Entra a <https://neon.com> › **Sign up** (puedes usar tu cuenta de GitHub).
2. Crea un proyecto: nombre `tallerpro`, región **AWS US East (N. Virginia)** (la más cercana a Render Virginia).
3. En **Connect** copia la **connection string**. Se ve así:
   `postgresql://usuario:clave@ep-algo-123.us-east-1.aws.neon.tech/neondb?sslmode=require`
   Guárdala: la necesitas en el paso 3. Es una contraseña; no la compartas.

## 3. Render: la app

1. Entra a <https://render.com> › **Get Started** › entra con tu cuenta de GitHub y autoriza el acceso al repositorio `tallerpro`.
2. Pulsa **New +** › **Blueprint** › elige el repositorio `tallerpro`. Render lee el archivo `render.yaml` y propone un servicio web gratuito llamado `tallerpro`.
3. Te pide **DATABASE_URL**: pega la connection string de Neon. **Apply**.
4. Espera la primera construcción (5–10 minutos). Cuando diga **Live**, abre la dirección que aparece arriba, del tipo `https://tallerpro-xxxx.onrender.com`.
5. Crea la cuenta del dueño y prueba.

Si Render pide una tarjeta en algún paso, detente y avísale a Claude: hay otras opciones.

## 4. En tu celular

- **Android (Chrome):** menú ⋮ › «Agregar a la pantalla principal».
- **iPhone (Safari):** Compartir › «Agregar a inicio».

## Qué probar

1. Más › Ajustes: tus precios, el cargo de visita, impuestos.
2. Más › Tipos de trabajo y Proveedores: dos o tres de cada uno.
3. Clientes › Cliente nuevo: ponte a ti mismo como cliente, con tu número.
4. Agenda › Agendar visita → envíate el aviso por WhatsApp.
5. Hoy › Empezar recepción: fotos, daños, firma.
6. En la orden: cotizar un repuesto, elegir la oferta, agregar mano de obra, enviar la cotización.
7. Abre en tu celular el enlace que te llegó: así ve el cliente su portal. Aprueba y firma.
8. Termina la orden: reparación, listo, factura, pago, entregar.

## Cuando termines la prueba

Los datos de prueba no se pasan a la instalación definitiva: allá empiezas limpio. Para borrar todo, elimina el servicio en Render (Settings › Delete) y el proyecto en Neon (Settings › Delete project).
