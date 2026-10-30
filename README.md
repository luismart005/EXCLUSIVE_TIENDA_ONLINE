# Exclusive — Comercio electrónico y gestión de ventas de ropa

Proyecto final de **Desarrollo Web** · Universidad Mariano Gálvez de Guatemala · Ingeniería en Sistemas.

Tienda en línea pública (catálogo, carrito, cupones, compra, pagos simulados, seguimiento y posventa) y panel de
administración (pedidos, pagos, envíos, inventario con kardex, compras a proveedores, promociones, reportes con
gráficas, inteligencia artificial, auditoría, usuarios y roles).

| Capa | Tecnología |
|---|---|
| Frontend | React 19 + Vite, React Router, Framer Motion (animaciones y transiciones), Sonner y SweetAlert2 (alertas), Chart.js (gráficas) |
| Backend | Node.js + Express 5 en **microservicios**: gateway, auth, catalog, inventory, sales y analytics |
| Seguridad | **OAuth 2.0 + OpenID Connect** (Authorization Code + PKCE), JWT RS256, roles y permisos, bcrypt |
| Base de datos | **PostgreSQL** con el ORM **Prisma** |
| IA | TensorFlow.js (estimación semanal de ventas por categoría) |
| Pruebas | node:test + node:assert |
| API | OpenAPI (documentación en `/api/docs`) |

> Pagos, facturación y envíos son **simulados** ("SIMULACIÓN — SIN VALIDEZ FISCAL"). Los datos son ficticios.

![Arquitectura web de Exclusive](docs/img/arquitectura-web.svg)

Explicación completa de cada capa: [docs/arquitectura-web.md](docs/arquitectura-web.md).

---

## Contenido

1. [Instalar Node.js](#1-instalar-nodejs)
2. [Instalar PostgreSQL y pgAdmin](#2-instalar-postgresql-y-pgadmin)
3. [Copiar el proyecto](#3-copiar-el-proyecto)
4. [Crear la base de datos](#4-crear-la-base-de-datos)
5. [Importar el script SQL](#5-importar-el-script-sql)
6. [Configurar el archivo .env](#6-configurar-el-archivo-env)
7. [Instalar dependencias](#7-instalar-dependencias)
8. [Verificar la instalación](#8-verificar-la-instalación)
9. [Iniciar el sistema](#9-iniciar-el-sistema)
10. [Usuarios de prueba](#10-usuarios-de-prueba)
11. [Usarlo desde otros dispositivos de la red](#11-usarlo-desde-otros-dispositivos-de-la-red)
12. [Comandos disponibles](#12-comandos-disponibles)
13. [Subir el proyecto a GitHub](#13-subir-el-proyecto-a-github)
14. [Solución de problemas](#14-solución-de-problemas)
15. [Documentación](#15-documentación)

---

## 1. Instalar Node.js

1. Abre **https://nodejs.org** en el navegador.
2. Haz clic en el botón de descarga de la versión **LTS** (22 o superior).
3. Abre el archivo descargado (`node-v…-x64.msi`).
4. En la ventana del instalador haz clic en **Next**.
5. Marca **I accept the terms in the License Agreement** → **Next**.
6. Deja la carpeta propuesta → **Next**.
7. En *Custom Setup* deja todo como está → **Next**.
8. En *Tools for Native Modules* **no** marques la casilla → **Next**.
9. Haz clic en **Install** (acepta el permiso de administrador) y luego en **Finish**.
10. Para comprobarlo: presiona la tecla **Windows**, escribe `cmd` y presiona **Enter**. En la ventana negra escribe:
    ```
    node -v
    ```
    Debe mostrar algo como `v22.x.x`. Escribe también `npm -v` y debe mostrar un número de versión.

## 2. Instalar PostgreSQL y pgAdmin

> Si ya tienes PostgreSQL 14 o superior instalado y conoces la contraseña del usuario `postgres`, salta al paso 3.

1. Abre **https://www.postgresql.org/download/windows/** y haz clic en **Download the installer**.
2. Descarga la versión **17** (o 16/18) para **Windows x86-64**.
3. Abre el archivo descargado → **Next**.
4. Deja la carpeta de instalación → **Next**.
5. En *Select Components* deja marcados **PostgreSQL Server**, **pgAdmin 4** y **Command Line Tools** → **Next**.
6. Deja la carpeta de datos → **Next**.
7. Escribe una **contraseña** para el usuario `postgres` y repítela. **Anótala**: la usarás en el paso 6.
   (Si escribes `postgres` como contraseña no tendrás que cambiar nada en el `.env`).
8. Puerto: deja **5432** → **Next**.
9. *Locale*: deja **[Default locale]** → **Next** → **Next** → **Next**.
10. Espera a que termine y haz clic en **Finish** (desmarca *Stack Builder* si aparece marcado).

## 3. Copiar el proyecto

1. Crea la carpeta `C:\Proyectos` (en el Explorador de archivos: **Este equipo** → **Disco local (C:)** → clic derecho →
   **Nuevo** → **Carpeta** → escribe `Proyectos`).
2. Copia el archivo `exclusive.zip` dentro de `C:\Proyectos`.
3. Clic derecho sobre `exclusive.zip` → **Extraer todo…** → en el destino deja `C:\Proyectos` → **Extraer**.
4. Debe quedar la carpeta `C:\Proyectos\exclusive` con las carpetas `database`, `docs`, `frontend`, `services`, etc.
   (Si quedó `C:\Proyectos\exclusive\exclusive`, mueve la carpeta interna para que no se repita).

## 4. Crear la base de datos

1. Presiona la tecla **Windows**, escribe **pgAdmin 4** y ábrelo (la primera vez tarda un poco).
2. En el panel izquierdo haz clic en **Servers** y luego en **PostgreSQL 17**.
3. Escribe la contraseña del usuario `postgres` (la del paso 2) y marca **Save Password** → **OK**.
4. Clic derecho sobre **Databases** → **Create** → **Database…**
5. En **Database** escribe exactamente: `exclusive_db`
6. Pestaña **Definition**: verifica que **Encoding** sea **UTF8**.
7. Haz clic en **Save**. La base aparece dentro de *Databases*.

## 5. Importar el script SQL

El archivo `database/exclusive_db.sql` crea todas las tablas, las restricciones y los datos de demostración
(usuarios para iniciar sesión, 37 productos con imágenes, un año de pedidos, inventario y auditoría).
Las fechas se ajustan solas al día en que lo importes, para que los reportes y la IA muestren datos recientes.

1. En pgAdmin haz clic sobre la base **exclusive_db** para seleccionarla.
2. En el menú superior haz clic en **Tools** → **Query Tool**.
3. En la barra del Query Tool haz clic en el icono de **carpeta (Open File)**.
4. Busca `C:\Proyectos\exclusive\database\exclusive_db.sql` → **Select**.
   (Si pgAdmin pregunta por el tamaño del archivo, acepta).
5. Presiona **F5** (o el botón ▶ **Execute script**).
6. Espera unos segundos hasta que abajo aparezca *Query returned successfully*.
7. Para comprobarlo: en el panel izquierdo clic derecho en **exclusive_db** → **Refresh**, luego abre
   **Schemas** → **public** → **Tables**: deben aparecer unas 50 tablas.

**Alternativa si el Query Tool se queda congelado:** clic derecho en **exclusive_db** → **PSQL Tool** y escribe
(con barras normales `/`):
```
\i 'C:/Proyectos/exclusive/database/exclusive_db.sql'
```

> El script se puede volver a importar cuando quieras: al inicio borra las tablas de Exclusive y las crea de nuevo
> (se pierden los cambios hechos durante las pruebas).

## 6. Configurar el archivo .env

El proyecto ya trae el archivo `.env` con la configuración y secretos aleatorios. Solo debes revisar la contraseña
de PostgreSQL.

1. Abre la carpeta `C:\Proyectos\exclusive`.
2. Clic derecho sobre el archivo **.env** → **Abrir con** → **Bloc de notas** (o ábrelo en Visual Studio Code).
   Si no ves el archivo, en el Explorador haz clic en **Vista** → **Mostrar** → **Elementos ocultos**.
3. Busca la línea:
   ```
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/exclusive_db
   ```
4. Cambia el **segundo** `postgres` (el que está después de los dos puntos) por tu contraseña. Ejemplo, si tu
   contraseña es `Umg2026`:
   ```
   DATABASE_URL=postgresql://postgres:Umg2026@localhost:5432/exclusive_db
   ```
   Si tu contraseña tiene caracteres especiales (`@`, `#`, `/`, `:`), cámbialos así: `@` → `%40`, `#` → `%23`,
   `/` → `%2F`, `:` → `%3A`.
5. Guarda con **Ctrl + G** (o **Ctrl + S**) y cierra.

Si el archivo `.env` no existe, el paso 8 lo crea automáticamente a partir de `.env.example`.

## 7. Instalar dependencias

Necesitas conexión a internet (descarga unos 300 MB la primera vez).

1. Abre la carpeta `C:\Proyectos\exclusive` en el Explorador.
2. Haz clic en la **barra de dirección** (arriba, donde dice la ruta), escribe `cmd` y presiona **Enter**.
   Se abre una terminal ya ubicada en la carpeta del proyecto.
3. Escribe:
   ```
   npm install
   ```
4. Espera a que termine (2 a 5 minutos). Al final se genera el cliente de Prisma automáticamente.
   Los avisos `npm warn` son normales.

## 8. Verificar la instalación

En la misma terminal escribe:
```
npm run check
```
Debe mostrar una lista con ✔ (Node.js, `.env`, dependencias, Prisma, conexión a PostgreSQL, datos cargados,
imágenes) y al final **Todo listo**. Si aparece algún ✖, el mensaje indica cómo corregirlo
(ver también [Solución de problemas](#14-solución-de-problemas)).

## 9. Iniciar el sistema

### Modo desarrollo (recomendado para trabajar y presentar)

1. En la terminal escribe:
   ```
   npm run dev
   ```
2. Espera unos 10 segundos hasta ver la línea `Gateway listo en http://localhost:4000 …`.
3. Abre el navegador en **http://localhost:4000**
4. Deja la terminal abierta mientras uses el sistema. Para detenerlo: haz clic en la terminal y presiona
   **Ctrl + C** (si pregunta, escribe `S` y Enter).

### Modo producción (más rápido, igual a un despliegue)

```
npm run build
npm start
```
`npm run build` solo es necesario la primera vez o cuando cambies el código del frontend.

### Direcciones útiles

| Dirección | Qué es |
|---|---|
| http://localhost:4000 | Tienda pública |
| http://localhost:4000/admin | Panel de administración (requiere usuario interno) |
| http://localhost:4000/buzon | Buzón de pruebas (correos simulados: confirmaciones, recuperación de contraseña) |
| http://localhost:4000/api/docs | Documentación de la API (OpenAPI) |
| http://localhost:4000/api/health | Estado de los microservicios |

> La primera vez que inicia, el servicio de analítica entrena automáticamente el modelo de IA (alrededor de un
> minuto). La tienda funciona normalmente mientras tanto.

## 10. Usuarios de prueba

| Correo | Contraseña | Rol | Qué puede hacer |
|---|---|---|---|
| admin@exclusive.gt | Admin123! | Administrador | Todo: usuarios, roles, configuración, auditoría |
| ventas@exclusive.gt | Ventas123! | Encargado de ventas | Revisar pagos, preparar, despachar y entregar pedidos |
| inventario@exclusive.gt | Inventario123! | Encargado de inventario | Productos, imágenes, existencias, kardex, compras |
| atencion@exclusive.gt | Atencion123! | Atención al cliente | Cambios, devoluciones, reclamos y reembolsos |
| gerencia@exclusive.gt | Gerencia123! | Gerencia | Reportes, IA y auditoría |
| cliente@exclusive.gt | Cliente123! | Cliente | Comprar y ver sus pedidos (ya tiene historial) |

Los clientes del historial (`…@demo.exclusive.gt`) también usan `Cliente123!`.

**Tarjetas de prueba:** `4242 4242 4242 4242` aprobada · `4000 0000 0000 0002` rechazada ·
`4000 0000 0000 9995` pendiente (cualquier fecha futura y CVV de 3 dígitos).

**Cupones:** `BIENVENIDA10` (10 %), `EXCLUSIVE50` (Q 50 desde Q 400, no combinable), `ENVIOGRATIS`,
`VERANO2026` (vencido, para ver el rechazo).

Recorrido de demostración paso a paso: [docs/pruebas.md](docs/pruebas.md#recorrido-de-demostración-sugerido).

## 11. Usarlo desde otros dispositivos de la red

1. En la computadora donde corre el sistema abre `cmd` y escribe `ipconfig`. Anota la **Dirección IPv4** del
   adaptador Wi-Fi o Ethernet (por ejemplo `192.168.1.50`).
2. Detén el sistema (**Ctrl + C**).
3. Abre `.env` y cambia la línea `PUBLIC_URL` por tu IP:
   ```
   PUBLIC_URL=http://192.168.1.50:4000
   ```
   Guarda el archivo.
4. Inicia de nuevo con `npm run dev` (o `npm start`).
5. La primera vez Windows pregunta por el **Firewall**: marca **Redes privadas** y haz clic en **Permitir acceso**.
6. Desde el celular u otra computadora conectada a la **misma red** abre `http://192.168.1.50:4000`.
   En la computadora principal usa también esa dirección (no `localhost`), porque el inicio de sesión
   regresa a la dirección configurada en `PUBLIC_URL`.

## 12. Comandos disponibles

Ejecútalos en una terminal abierta en la carpeta del proyecto.

| Comando | Para qué sirve |
|---|---|
| `npm run dev` | Inicia todo en modo desarrollo (recarga automática) |
| `npm run build` | Compila el frontend para producción |
| `npm start` | Inicia todo en modo producción (requiere `npm run build`) |
| `npm run check` | Verifica la instalación y explica cómo corregir problemas |
| `npm run test:db` | Crea la base de datos de pruebas `exclusive_test` (solo la primera vez) |
| `npm test` | Ejecuta las pruebas unitarias y de integración |
| `npm run perf` | Prueba de rendimiento con 20 usuarios concurrentes (con el sistema iniciado) |
| `npm run backup` | Respaldo de la base de datos, imágenes y comprobantes en `backups/` |
| `npm run restore` | Restaura el respaldo más reciente y comprueba el resultado |
| `npm run db:studio` | Abre Prisma Studio para explorar las tablas |
| `npm run docs:api` | Regenera `docs/openapi.yaml` |

## 13. Subir el proyecto a GitHub

1. Instala Git desde **https://git-scm.com/download/win** (abre el instalador y haz clic en **Next** en todas las
   pantallas, luego **Install** y **Finish**).
2. Entra a **https://github.com**, inicia sesión y haz clic en **+** (arriba a la derecha) → **New repository**.
3. En **Repository name** escribe `exclusive`, elige **Private** o **Public**, **no** marques *Add a README* →
   **Create repository**. Deja abierta esa página.
4. En la carpeta `C:\Proyectos\exclusive` abre una terminal (barra de dirección → `cmd` → Enter) y escribe uno por uno:
   ```
   git init
   git config user.name "Tu Nombre"
   git config user.email "tu-correo@ejemplo.com"
   git add .
   git commit -m "Proyecto final Exclusive"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/exclusive.git
   git push -u origin main
   ```
   (Cambia `TU-USUARIO` por tu usuario de GitHub; la dirección exacta aparece en la página del paso 3).
5. La primera vez se abre una ventana para iniciar sesión en GitHub: haz clic en **Sign in with your browser** y
   autoriza.
6. Recarga la página del repositorio: deben aparecer los archivos.

El archivo `.gitignore` evita subir `node_modules`, el `.env` con contraseñas, las llaves de tokens, los registros y
los respaldos. Quien clone el repositorio debe copiar `.env.example` como `.env` (o ejecutar `npm run check`, que lo
crea) y seguir esta guía desde el paso 4.

## 14. Solución de problemas

| Mensaje o síntoma | Solución |
|---|---|
| `La contraseña del usuario "postgres" es incorrecta` / `password authentication failed` | Corrige la contraseña en `DATABASE_URL` del `.env` (paso 6) |
| `No hay un servidor PostgreSQL escuchando…` / `ECONNREFUSED` | Presiona Windows, escribe **Servicios**, busca **postgresql-x64-17**, clic derecho → **Iniciar** |
| `La base de datos "exclusive_db" no existe` | Crea la base (paso 4) con el nombre exacto |
| `La base existe pero está vacía` | Importa `database/exclusive_db.sql` (paso 5) |
| `npm` no se reconoce como comando | Cierra y abre de nuevo la terminal; si sigue, reinstala Node.js (paso 1) |
| En PowerShell: `no se puede cargar el archivo npm.ps1` | Usa `cmd` en lugar de PowerShell (paso 7), o ejecuta en PowerShell: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| `El cliente de Prisma no está generado` | Con internet, ejecuta `npm run db:generate` |
| `EADDRINUSE` / puertos en uso | El sistema ya está abierto en otra terminal. Ciérrala o reinicia la computadora |
| El inicio de sesión muestra un error de *redirect_uri* | Abre el sistema con la misma dirección que tiene `PUBLIC_URL` en el `.env` |
| `Recibimos demasiadas solicitudes desde tu equipo` | Espera 5 minutos o aumenta `API_RATE_LIMIT` en el `.env` |
| La cuenta quedó bloqueada por intentos fallidos | Espera 15 minutos o desbloquéala como administrador en **Usuarios** |
| No aparecen las imágenes de los productos | Verifica que exista `services/catalog-service/uploads/products` con archivos `.webp` |
| `npm run build` falla o la página sale en blanco con `npm start` | Ejecuta de nuevo `npm run build` y revisa que no haya errores; o usa `npm run dev` |

Los registros técnicos de cada servicio están en la carpeta `logs/`. Si un error muestra un **identificador**
(8 caracteres, por ejemplo `9F3A2C1B`), búscalo en **Panel → Auditoría → Errores técnicos**.

## 15. Documentación

| Documento | Contenido |
|---|---|
| [docs/arquitectura-web.md](docs/arquitectura-web.md) | Diagrama de la arquitectura web y explicación de cada capa, servicio y flujo |
| [docs/arquitectura.md](docs/arquitectura.md) | Microservicios, comunicación, base de datos, saga de compra, ambientes |
| [docs/oauth-openid.md](docs/oauth-openid.md) | Cómo funcionan OAuth 2.0 y OpenID Connect en el sistema: flujo PKCE, tokens, renovación, permisos, revocación y tokens entre servicios |
| [docs/seguridad.md](docs/seguridad.md) | OAuth 2.0 / OIDC, roles y permisos, protección de acceso, archivos, auditoría inmutable, HTTPS |
| [docs/reglas-de-negocio.md](docs/reglas-de-negocio.md) | Las 15 reglas, redondeo monetario, promociones, estados, pagos, inventario, posventa |
| [docs/inteligencia-artificial.md](docs/inteligencia-artificial.md) | Historial semanal, variables, modelo, evaluación y trazabilidad |
| [docs/respaldos.md](docs/respaldos.md) | Respaldo, restauración, prueba en instalación limpia y respaldos diarios |
| [docs/pruebas.md](docs/pruebas.md) | Pruebas automatizadas, rendimiento, compatibilidad y recorrido de demostración |
| [docs/requisitos.md](docs/requisitos.md) | Dónde se cumple cada RF, HU y RNF |
| [docs/openapi.yaml](docs/openapi.yaml) | Especificación OpenAPI (se ve en `/api/docs`) |
| `database/permisos-produccion.sql` | Usuario de base de datos restringido para operación comercial |

### Equipo

| Integrante | Carné |
|---|---|
| Heinz Vladimir Villafuerte Maldonado | 2790-23-22531 |
| Luis Alberto Martínez Franco | 2790-23-20498 |
