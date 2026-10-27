# Respaldos y recuperación (RNF-13, RNF-14)

El sistema incluye dos comandos que funcionan igual en Windows, Linux y macOS y **no necesitan pg_dump**:

| Comando | Qué hace |
|---|---|
| `npm run backup` | Copia la base de datos completa, las imágenes de productos y los comprobantes de transferencia en `backups/AAAA-MM-DD_HHMMSS/` |
| `npm run restore` | Restaura la copia más reciente (o la que indiques) y comprueba que coincidan usuarios, pedidos, inventario y archivos |

## Qué contiene cada copia

```
backups/2026-10-23_153000/
├─ manifest.json        fecha, filas por tabla, archivos y huella SHA-256 de los datos
├─ database.json.gz     todas las tablas (valores exactos, comprimidos)
└─ files/
   ├─ uploads/          imágenes de productos y categorías
   └─ storage/          comprobantes de transferencia (privados)
```

- La lectura se hace en una sola transacción de solo lectura: la copia es consistente aunque el sistema esté en uso.
- Las sesiones activas (`oidc_payloads`) no se respaldan por seguridad; tras restaurar, los usuarios vuelven a iniciar sesión.
- Las llaves de firma de tokens no se copian: se generan de nuevo al iniciar el auth-service.

## Hacer un respaldo manual (demostración)

1. Abre una terminal en la carpeta del proyecto.
2. Ejecuta:
   ```
   npm run backup
   ```
3. Al terminar verás el resumen (usuarios, pedidos, variantes, movimientos) y la carpeta creada.
4. Para guardarlo en otra ubicación (USB, disco externo, carpeta sincronizada):
   ```
   npm run backup -- "D:\Respaldos Exclusive"
   ```

## Restaurar

1. Detén el sistema (en la terminal donde corre, presiona `Ctrl + C`).
2. Ejecuta:
   ```
   npm run restore
   ```
   o, para una copia específica:
   ```
   npm run restore -- "backups\2026-10-23_153000"
   ```
3. Escribe `SI` para confirmar. El proceso:
   - verifica la huella SHA-256 (si la copia está dañada no cambia nada),
   - reemplaza todas las tablas en **una sola transacción** (si algo falla, la base queda como estaba),
   - reemplaza las carpetas de imágenes y comprobantes,
   - compara usuarios, pedidos, pagos, variantes, existencias, movimientos, bitácora y archivos contra la copia.
4. Inicia de nuevo el sistema con `npm run dev` o `npm start`.

> La restauración necesita el usuario `postgres` (superusuario), porque desactiva temporalmente las llaves foráneas
> y los triggers mientras carga los datos.

## Prueba de recuperación en una instalación limpia (RNF-14)

Procedimiento para la evidencia antes de la entrega:

1. En la instalación actual ejecuta `npm run backup` y anota los totales que muestra.
2. En pgAdmin crea una base **vacía** llamada `exclusive_restaurada` (clic derecho en *Databases* → *Create* → *Database…*).
3. En el archivo `.env` cambia temporalmente la última parte de `DATABASE_URL` a `/exclusive_restaurada`.
4. Ejecuta `npm run restore`. Como la base está vacía, primero crea la estructura con `database/schema.sql` y luego
   carga los datos. Al final debe mostrar todas las comprobaciones con ✔ y el mensaje
   **"Restauración completa y verificada"**.
5. Ejecuta `npm run dev`, inicia sesión con `admin@exclusive.gt` y revisa pedidos, usuarios, inventario e imágenes.
6. Toma captura de la terminal y del sistema funcionando como evidencia.
7. Devuelve `DATABASE_URL` a `/exclusive_db`.

## Respaldos diarios en operación comercial (Windows)

1. Presiona la tecla **Windows**, escribe **Programador de tareas** y ábrelo.
2. En el panel derecho haz clic en **Crear tarea básica…**
3. Nombre: `Respaldo Exclusive` → **Siguiente**.
4. Desencadenador: **Diariamente** → **Siguiente** → elige la hora (por ejemplo 23:00) → **Siguiente**.
5. Acción: **Iniciar un programa** → **Siguiente**.
6. En **Programa o script** escribe: `cmd`
7. En **Agregar argumentos** escribe (cambia las rutas por las tuyas):
   ```
   /c cd /d "C:\Proyectos\exclusive" && npm run backup -- "E:\Respaldos Exclusive"
   ```
8. **Siguiente** → marca **Abrir el diálogo de propiedades…** → **Finalizar**.
9. En la ventana de propiedades marca **Ejecutar tanto si el usuario inició sesión como si no** y **Aceptar**
   (pedirá tu contraseña de Windows).
10. Para probarla: clic derecho sobre la tarea → **Ejecutar** y revisa que aparezca una carpeta nueva en `E:\Respaldos Exclusive`.

Recomendaciones: guardar las copias en un disco o servicio **distinto** al equipo del sistema, conservar al menos
las últimas 30 copias diarias y una mensual, y probar una restauración cada mes.

En Linux, el equivalente es una línea en `crontab -e`:
```
0 23 * * * cd /opt/exclusive && npm run backup -- /respaldos/exclusive >> /var/log/exclusive-backup.log 2>&1
```
