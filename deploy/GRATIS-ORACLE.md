# Instalar TallerPro gratis en Oracle Cloud (Montreal)

Costo mensual: **0 $** dentro de los límites «Always Free» de Oracle (2 procesadores Ampere, 12 GB de memoria, 200 GB de disco). Los datos quedan en Montreal (Loi 25). Tiempo: 1 a 2 horas la primera vez.

Lo que vas a usar, todo gratis:

| Pieza | Servicio |
| --- | --- |
| Servidor | Oracle Cloud Always Free, región Canada Southeast (Montreal) |
| Dirección web | Subdominio de DuckDNS, p. ej. `elcabo.duckdns.org` (HTTPS automático) |
| Avisos a clientes | Tu WhatsApp o tus SMS (modo «Desde mi celular», ya activado por defecto) |
| Correos (opcional) | Tu cuenta de Gmail, hasta ~500 al día |

---

## 1. Crear la cuenta de Oracle

1. Entra a <https://www.oracle.com/cloud/free/> y pulsa «Start for free».
2. **Home Region: Canada Southeast (Montreal).** Atención: no se puede cambiar después.
3. Oracle pide una tarjeta solo para verificar tu identidad (retiene 1 $ temporalmente; no cobra).
4. **Recomendado:** cuando la cuenta esté activa, ve a *Billing › Upgrade and Manage Payment* y pasa a **Pay As You Go**. Oracle no cobra los recursos Always Free después de pasar a esa cuenta, y así evitas que recupere el servidor por «inactivo» (en cuentas gratis, un servidor con menos de 20 % de uso durante 7 días puede ser reclamado; el de un taller casi siempre lo estaría).
5. En *Billing › Budgets* crea un presupuesto de **1 $** con aviso por correo: si algún día algo costara, te enteras enseguida.

## 2. Crear el servidor

1. Menú › *Compute › Instances › Create instance*.
2. Nombre: `tallerpro`.
3. *Image*: **Canonical Ubuntu 24.04** (la versión para aarch64 aparece al elegir la forma Ampere).
4. *Shape*: **Ampere › VM.Standard.A1.Flex**, **2 OCPU** y **12 GB** de memoria.
5. *Networking*: deja «Assign a public IPv4 address» activado.
6. *Add SSH keys*: «Generate a key pair» y **descarga la llave privada** (guárdala bien).
7. *Create*. Si aparece «Out of capacity», cambia de *Availability domain* o vuelve a intentar más tarde.
8. Anota la **Public IP address** del servidor.

## 3. Abrir los puertos 80 y 443

1. En la página del servidor, abre la *Subnet* › *Security List* por defecto › *Add Ingress Rules*:
   - Source CIDR `0.0.0.0/0`, protocolo TCP, puerto **80**.
   - Otra regla igual con el puerto **443**.
2. Ubuntu en Oracle también tiene su propio cortafuegos; lo abres en el paso 5.

## 4. Crear la dirección web (DuckDNS)

1. Entra a <https://www.duckdns.org> con tu cuenta de Google.
2. Crea el subdominio, por ejemplo `elcabo` → `elcabo.duckdns.org`.
3. En «current ip» pega la IP pública del servidor y pulsa *update ip*.

Más adelante puedes comprar `elcabo.ca` y solo cambiar `DOMAIN` y `PUBLIC_URL`.

## 5. Instalar la app

Desde tu computador (en Windows, usa PowerShell):

```bash
ssh -i ruta/a/la-llave.key ubuntu@IP_DEL_SERVIDOR
```

Ya dentro del servidor:

```bash
# Cortafuegos de Ubuntu en Oracle
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save

# Docker
sudo apt update && sudo apt install -y docker.io docker-compose-v2 unzip
sudo usermod -aG docker ubuntu && newgrp docker
```

Sube el archivo `tallerpro-fase1.zip` desde tu computador (otra ventana):

```bash
scp -i ruta/a/la-llave.key tallerpro-fase1.zip ubuntu@IP_DEL_SERVIDOR:~
```

Y en el servidor:

```bash
unzip tallerpro-fase1.zip && cd tallerpro
cp .env.example .env
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 24)/" .env   # clave segura al azar
nano .env
```

En `.env` cambia estas dos líneas:

```
DOMAIN=elcabo.duckdns.org
PUBLIC_URL=https://elcabo.duckdns.org
```

Arranca (la primera vez tarda 5–10 minutos):

```bash
docker compose up -d --build
docker compose logs -f app     # debe decir «TallerPro … escuchando»; sal con Ctrl+C
```

Abre `https://elcabo.duckdns.org` en tu celular y crea la cuenta del dueño.

## 6. Ponerla en tu celular como una app

- **Android (Chrome):** menú ⋮ › «Agregar a la pantalla principal».
- **iPhone (Safari):** botón Compartir › «Agregar a inicio».

## 7. Correos gratis con Gmail (opcional)

1. En tu cuenta de Google activa la **verificación en 2 pasos**.
2. Crea una **contraseña de aplicación** (Cuenta de Google › Seguridad › Contraseñas de aplicaciones).
3. En `.env`:
   ```
   EMAIL_PROVIDER=smtp
   SMTP_URL=smtps://tucorreo%40gmail.com:CONTRASENADEAPLICACION@smtp.gmail.com:465
   EMAIL_FROM=Mécanique El Cabo <tucorreo@gmail.com>
   ```
4. `docker compose up -d` para aplicar.

Sin esto, la app funciona igual: los clientes con correo simplemente no reciben correos, y tú les envías WhatsApp o SMS desde la app.

## 8. Respaldos

En el servidor:

```bash
crontab -e
# agrega esta línea: copia cada noche a las 3:15
15 3 * * * /home/ubuntu/tallerpro/deploy/backup.sh >> /home/ubuntu/backups.log 2>&1
```

Una vez por semana, descarga las copias a tu computador:

```bash
scp -i ruta/a/la-llave.key -r ubuntu@IP_DEL_SERVIDOR:~/backups ./respaldos-tallerpro
```

Una vez al mes, prueba que se pueden restaurar: `./deploy/restore-test.sh`.

## 9. Actualizar la app

Sube el nuevo `.zip`, descomprímelo encima y:

```bash
cd tallerpro && docker compose up -d --build
```

Las tablas nuevas se crean solas al arrancar.

## Cuándo pasar a algo de pago

- **Avisos automáticos** (sin tocar «enviar»): activa Twilio en `.env` y elige «Automático» en Más › Ajustes. Unos 0,05 USD por aviso.
- **Dominio propio** (`elcabo.ca`): unos 20–30 $ al año.
- **Tarjeta en el celular** (fase 2, Stripe): solo comisión por cobro.
