# Sistema administrativo en Google Sheets: instrucciones

## Instalación (5 minutos)

1. Creá una planilla nueva en Google Sheets (o abrí la que quieras usar).
2. Andá a **Extensiones > Apps Script**.
3. Borrá lo que haya en `Código.gs` y **pegá todo el contenido de `Codigo_v1.8.gs`**. En el editor de Apps Script el archivo puede seguir llamándose `Código.gs`; el nombre del archivo en el editor no importa.
4. Opcional, recomendado: en **Configuración del proyecto** (el ícono del engranaje) elegí la zona horaria `(GMT-03:00) Mendoza` / `America/Argentina/Mendoza`. Hacé lo mismo en la planilla, desde **Archivo > Configuración**.
5. **Guardá** (ícono del disquete o Ctrl+S).
6. Volvé a la planilla y **recargá la página**. Aparece el menú **Administración**.
7. Andá a **Administración > Crear/actualizar estructura**.
8. La primera vez Google te pide **autorizar** el script: elegí tu cuenta y tocá *Avanzado > Ir a (proyecto) > Permitir*. Después volvé a ejecutar *Crear/actualizar estructura*.
9. Si la planilla está vacía, te pregunta si querés cargar filas de **EJEMPLO**. Son datos inventados y marcados como tales; después los podés borrar.

> La estructura se puede volver a ejecutar las veces que quieras. **No borra datos.** Sólo crea las hojas o columnas que falten y vuelve a aplicar formatos, listas desplegables y colores.

## Hojas que se crean

| Hoja | Para qué sirve |
|---|---|
| **Tablero** | Resumen: pendiente de cobro y de pago (ARS/USD), saldo de Caja, trabajos esperando el pago con días de espera, pagos vencidos, pagos que vencen en los próximos 7 días y gastos del mes por categoría. |
| **Cuentas por Pagar** | Pagos y compras. Tiene proveedor, vencimiento, importes en ARS y USD, medio de pago y estado (*Sin Pagar, Pagada, Pagada Fuera de Término, Vencida*). |
| **Cuentas por Cobrar** | Ingresos y trabajos a cobrar. Tiene cliente, importes, adelantos y estado (*Esperando el adelanto, Con adelanto, Esperando el pago, Pagado 100%*). |
| **Caja** | Movimientos reales de plata. Se carga **sola** (ver abajo). También podés cargar movimientos a mano con Origen = *Manual*. |
| **Gastos** | Gastos del día a día, con categoría *Empresa / Casa / Personal*. |
| **Proyectos** | Proyectos y presupuestos generados, con un link a la hoja de cada presupuesto. |
| **Proveedores / Clientes** | Listas que alimentan los desplegables. |
| **Problemas** | Se regenera con *Revisar datos incompletos*. Tiene un link "Ir" a cada fila con problemas. |
| **Plantilla Presupuesto** | Diseño base de los presupuestos. Podés cambiar el nombre de la empresa, los datos y el logo en las filas 1 a 3. |
| **Config** | Medios de pago (Brubank, Visa Galicia, Mercado Pago, BNA+, HSBC, Efectivo, Transferencia), categorías de gasto, estados de proyecto y parámetros: empresa, email del recordatorio, días de aviso, hora del recordatorio, IVA por defecto y validez del presupuesto. |

## Qué hace cada opción del menú *Administración*

- **Crear/actualizar estructura**: crea o completa las hojas con encabezados, primera fila fija, formato de moneda `$` y `US$`, fechas `dd/mm/aaaa`, desplegables y colores. No borra nada.
- **Revisar datos incompletos**:
  - Los **pagos sin estado** se completan con *Sin Pagar*, o con *Vencida* si ya pasó el vencimiento. La celda queda en amarillo con una nota para que la revises.
  - Las filas de **Cuentas por Cobrar sin concepto o sin importe** quedan **en rojo** y aparecen listadas.
  - También detecta pagos sin importe, sin vencimiento o sin proveedor, gastos sin categoría, adelantos mayores al importe, proveedores o clientes que faltan en su lista y nombres duplicados.
  - Regenera la hoja **Problemas**, ordenada por gravedad (Alta / Media / Baja).
- **Actualizar tablero**: recalcula todo el Tablero. Antes marca las vencidas y sincroniza Caja.
- **Sincronizar Caja**: recorre pagos, cobros y gastos, y crea en Caja los movimientos que falten. **Nunca duplica**, porque cada movimiento guarda la referencia al ID de origen.
- **Nuevo pago / Nuevo ingreso / Nuevo gasto**: abren un formulario y agregan la fila. Si escribís un proveedor o cliente nuevo, se agrega solo a su lista.
- **Generar presupuesto**: pedís cliente, proyecto, moneda (ARS/USD), ítems (descripción, cantidad, precio unitario), IVA opcional, validez en días y condiciones. Crea una hoja *Presupuesto 0001* con subtotal, IVA, total y fecha de validez, y lo registra en **Proyectos** como *Presupuestado*. Para mandarlo al cliente: **Archivo > Descargar > PDF** con esa hoja activa.
- **Activar recordatorio diario por email**: todos los días, a la hora que figura en Config (8 hs por defecto), te manda un email con pagos vencidos, pagos por vencer y trabajos esperando el pago. **Sólo lo manda si hay algo para avisar.** Lo recibe el email de Config o, si está vacío, tu cuenta de Google.
- **Desactivar recordatorios**: borra el activador diario.
- **Ejemplos > Cargar / Borrar filas de EJEMPLO**: carga o borra datos de prueba. Todos tienen la palabra "EJEMPLO".

## Automatismos que funcionan solos mientras editás

- **ID automático** en cada fila de pagos, cobros, gastos, Caja y proyectos.
- **Pago marcado *Pagada*** → se crea el egreso en Caja y se completa la *Fecha de pago* si estaba vacía. Si se pagó después del vencimiento, el estado pasa solo a *Pagada Fuera de Término*.
- **Cobro *Con adelanto*** con importe de adelanto → se crea el ingreso del adelanto en Caja.
- **Cobro *Pagado 100%*** → se crea en Caja el ingreso por el saldo (importe menos adelanto) y se completa la *Fecha de cobro*.
- **Cada gasto** con importe → se crea el egreso en Caja.
- **Vencida automática**: un pago *Sin Pagar* con el vencimiento ya pasado pasa a *Vencida*. Si corrés la fecha de vencimiento hacia adelante, vuelve a *Sin Pagar*.
- **Colores**:
  - Rojo: pagos vencidos.
  - Naranja: pagos que vencen en los próximos 7 días.
  - Amarillo: pagos sin estado.
  - Verde: pagos y cobros saldados.
  - Rojo en Cuentas por Cobrar: cobros sin concepto o sin importe.

> Si cambiás un pago que ya generó movimiento en Caja (por ejemplo, lo volvés a *Sin Pagar*), el movimiento **no se borra solo**. *Revisar datos incompletos* te lo marca para que lo corrijas a mano en Caja.

## Pagos de Mercado Pago automáticos (desde Gmail)

Cada vez que pagás con Mercado Pago te llega un mail **"Pago aprobado en …"** con el comercio, el importe y el medio de pago. El script lee esos mails cada 15 minutos y carga cada pago en **Gastos**, que también pasa solo a **Caja**.

**1. Que los mails lleguen a la cuenta del script.** El script lee el Gmail de la cuenta dueña del proyecto de Apps Script. Si Mercado Pago te escribe a otra casilla, reenviá esos mails con un filtro desde esa casilla:
   1. En Gmail, entrá a ⚙️ **Ver toda la configuración > Reenvío y correo POP/IMAP > Agregar una dirección de reenvío** y poné la cuenta del script. Confirmá con el código que llega a esa cuenta.
   2. En la barra de búsqueda poné `from:mercadopago subject:"Pago aprobado"`, tocá el ícono de filtros, después **Crear filtro**, marcá **Reenviar a** y elegí la cuenta del script.

**2. Activarla.** Desde la planilla usá **Administración > Activar importación automática de Mercado Pago**. Desde el editor elegí `activarImportacionMercadoPago` y tocá **Ejecutar**. La primera vez Google te pide permiso para leer y etiquetar tu Gmail. Aceptalo.

**Qué se carga en cada fila de Gastos:**
- **Fecha:** la del pago, o la del mail si el comprobante no la trae.
- **Concepto y Proveedor:** el comercio.
- **Importe ARS o USD**, según la moneda.
- **Medio de pago:** *Tarjeta Mercado Pago Crédito* va como **Master Elio Mercado Pago**, *Dinero disponible* como **Elio Mercado Pago** y *Banco Galicia* como **Visa Elio Galicia**.
- **Categoría:** GNC, YPF, Shell, Axion o nafta van como **Combustible**. Edemsa, AySAM o Ecogas van como **Casa**. Si la categoría no existe en Config, se agrega sola. Si no coincide ninguna regla, queda vacía y la vas a ver en **Problemas**.
- **Notas:** "Importado de Mercado Pago", el medio con los últimos 4 dígitos, el N° de operación y el ID del mail. Esto evita que un pago se cargue dos veces.

Los mails ya cargados quedan con la etiqueta **ERP-procesado**. Si un mail no se puede leer, queda con la etiqueta **ERP-revisar** y lo cargás a mano.

**Ajustes:** los nombres de los medios y las reglas de categoría están al principio de la sección *IMPORTACIÓN AUTOMÁTICA DE PAGOS DE MERCADO PAGO* de `Codigo_v1.8.gs`, en las constantes `MP_MEDIOS` y `MP_CATEGORIAS`. Para importar en el momento usá **Administración > Importar pagos de Mercado Pago ahora**. Para apagarla, **Desactivar importación de Mercado Pago**.

> Mercado Pago no siempre manda mail por los pagos con QR en un local. Si un pago no aparece, fijate en tu Gmail si llegó el comprobante. Si no llegó, cargalo con **Nuevo gasto**.

## Pagos de Mercado Pago al instante desde el celular (Android + MacroDroid)

Mercado Pago no manda mail por cada pago con QR, pero sí te muestra una notificación en el celular, del tipo *"Pagaste $ 15.000 en YPF"*. La app **MacroDroid** lee esa notificación y se la manda al script, que la carga en **Gastos** y en **Caja** en unos segundos. Sólo funciona en **Android**.

### 1. Crear el token y ver los pasos

1. En el editor de Apps Script elegí `configurarNotificacionesMP` en el desplegable y tocá **Ejecutar**.
2. En el **Registro de ejecución** aparece el **token secreto**, que es una clave larga, y los pasos con tus datos ya completos. No compartas el token: quien lo tenga puede cargarte gastos.
3. Si en algún momento lo necesitás de nuevo, ejecutá `verNotificacionesMP_token`. Si creés que se filtró, ejecutá `regenerarTokenMP` y pegá el nuevo en MacroDroid.

### 2. Publicar el script como Aplicación web (una sola vez)

1. En el editor, arriba a la derecha: **Implementar > Nueva implementación**.
2. Tocá el engranaje de **Seleccionar tipo** y elegí **Aplicación web**.
3. Completá así:
   - **Descripción:** ERP notificaciones
   - **Ejecutar como:** **Yo** (tu cuenta)
   - **Quién tiene acceso:** **Cualquier usuario**. No elijas "Cualquier usuario con cuenta de Google", porque MacroDroid no inicia sesión en Google.
4. Tocá **Implementar**, aceptá los permisos y copiá la **URL de la aplicación web**. Termina en `/exec`.
5. Volvé a ejecutar `configurarNotificacionesMP`: ahora el registro te muestra los pasos con la URL ya puesta.

> **Importante, cada vez que cambies el código:** la aplicación web sigue usando la versión vieja hasta que la actualices. Entrá a **Implementar > Gestionar implementaciones**, tocá el **lápiz** de la implementación, en **Versión** elegí **Nueva versión** y tocá **Implementar**. Así la URL no cambia y no hay que tocar MacroDroid. No uses "Nueva implementación", porque eso crea otra URL.

### 3. Probar la URL desde el navegador, sin cargar nada

Pegá esto en el navegador, cambiando la URL y el token por los tuyos:

```
https://script.google.com/macros/s/XXXX/exec?token=TU_TOKEN&prueba=1&texto=Pagaste%20%24%2025.000%20en%20YPF
```

Tendría que responder `{"ok":true,"accion":"prueba","datos":{"comercio":"YPF","importe":25000,...}}`. Con `&prueba=1` **no se escribe nada**. Si responde `{"ok":false,"error":"token inválido"}`, el token está mal copiado.

Desde el editor también podés ejecutar `probarNotificacionMP`. Es una prueba en seco: muestra en el registro cómo se interpretan algunos ejemplos y no toca la planilla.

### 4. Configurar MacroDroid en el celular

1. Instalá **MacroDroid** desde Play Store y abrilo.
2. **Agregar macro** (el botón **+**).
3. **Disparador:** tocá **+** en Disparadores, después **Eventos del dispositivo > Notificación**, y elegí:
   - **Notificación recibida**.
   - **Seleccionar aplicaciones:** **Mercado Pago** (`com.mercadopago.wallet`).
   - **Texto:** **Cualquiera**. El script descarta solo lo que no es un pago, como transferencias recibidas, promociones o rendimientos. Si preferís filtrar, poné **Contiene: Pagaste**, pero vas a perder variantes como "Tu pago de $ … fue aprobado".
   - Tildá **Ignorar notificaciones persistentes** y, si aparece, **Evitar disparos múltiples**.
   - La primera vez MacroDroid te pide el **Acceso a notificaciones**: activalo para MacroDroid.
4. **Acción:** tocá **+** en Acciones, después **Interacciones web > Solicitud HTTP**. En algunas versiones está en **Conectividad > Solicitud HTTP**.
   - **Método:** **POST**.
   - **URL:** la URL de la aplicación web, la que termina en `/exec`.
   - En **Parámetros de consulta (Query params)**, agregá estos pares clave / valor. Para insertar una variable, tocá el botón **…** al lado del campo:

     | Clave | Valor |
     |---|---|
     | `token` | tu token (copiado del registro) |
     | `titulo` | `{not_title}` |
     | `texto` | `{notification}` |
     | `app` | `{not_app_name}` |
     | `paquete` | `{not_app_package}` |
     | `fecha` | `{not_timestamp}` |

     Conviene usar parámetros de consulta y no escribirlos a mano en el cuerpo, porque así MacroDroid codifica los acentos, los `$` y los espacios. Si preferís el cuerpo, elegí **Tipo de contenido** `application/x-www-form-urlencoded` y escribí: `token=TU_TOKEN&titulo={not_title}&texto={notification}&paquete={not_app_package}&fecha={not_timestamp}`.
   - Si existe la opción **Seguir redirecciones (Follow redirects)**, dejala **activada**. Apps Script responde a los POST con una redirección (código 302) hacia `script.googleusercontent.com`. El gasto ya queda cargado antes de esa redirección, pero hay que seguirla para ver la respuesta.
   - Opcional: guardá la **respuesta** en una variable de texto y agregá una acción **Mostrar mensaje (Toast)** con esa variable, así ves en pantalla si dice `"accion":"cargada"`.
5. Ponele un nombre a la macro, por ejemplo **ERP Mercado Pago**, y guardala con el ✓.
6. **Que Android no la frene:**
   - **Ajustes del celular > Aplicaciones > MacroDroid > Batería > Sin restricciones.** En Samsung: **No optimizar** o **Sin restricciones**. En Xiaomi: **Sin restricciones** y activá **Inicio automático**.
   - En MacroDroid, **Configuración > Ignorar optimización de batería**, si aparece.
   - Mantené las **notificaciones de Mercado Pago activadas**: Mercado Pago > Ajustes > Notificaciones, con los movimientos y pagos encendidos.

**Si el POST falla** (por ejemplo, MacroDroid muestra el código 405 o 302 y no se carga nada), cambiá el **Método a GET** con los mismos parámetros de consulta. El script acepta las dos formas igual. Si escribís la URL a mano, codificá el texto, por ejemplo `texto=Pagaste%20%24%2025.000%20en%20YPF`.

### 5. Probar con el teléfono

1. En MacroDroid, mantené apretada la macro y elegí **Probar acciones**. Las variables van vacías, así que el script responde `"accion":"ping"`, que quiere decir que la conexión funciona.
2. Hacé un pago chico con QR y, a los pocos segundos, mirá **Gastos**. Tiene que aparecer una fila nueva con la nota **"Importado de notificación MP"**.
3. Si no aparece nada, en el editor andá a **Ejecuciones**, a la izquierda, y abrí la última `doPost`. El registro te dice si la notificación se rechazó por token, si se ignoró porque no era un pago o si quedó para revisar.

### Qué carga y qué ignora

- **Carga:** "Pagaste $ 15.000 a YPF", "Pagaste $15.000,50 en ESTACIÓN X", "Pagaste a COMERCIO, US$ 22.18 con tu Tarjeta de Crédito Mercado Pago", "Tu pago de $ 1.234 a X fue aprobado", "Se aprobó tu pago de $ … en X", "Compraste en X por $ …", "Le pagaste a X", "Pagaste tu factura de Edemsa por $ …", "Recargaste $ … a tu SUBE", y también título "Pago aprobado en X" con texto "Pagaste $ …".
- **Ignora:** "Recibiste…", "Te transfirieron…", "Cobraste…", rendimientos, devoluciones, pagos rechazados, códigos de seguridad, promociones ("Pagá con QR y…") y también "Transferiste…". Si querés que las transferencias que hacés se carguen como gasto, cambiá `MP_NOTIF_INCLUIR_TRANSFERENCIAS` a `true`.
- **Importe:** formato argentino. `$ 15.000` son quince mil, `$ 15.000,50` lleva centavos y `US$ 22.18` se lee como 22,18 dólares. `US$` o `U$S` va a **Importe USD**.
- **Medio de pago:** si la notificación dice "Tarjeta de Crédito Mercado Pago", "Tarjeta Mercado Pago" o "Mastercard", va como **Master Elio Mercado Pago**. "Dinero disponible", "dinero en cuenta" o "Tarjeta de Débito Mercado Pago" va como **Elio Mercado Pago**, y "Galicia" como **Visa Elio Galicia**. **Si no dice el medio**, usa **Master Elio Mercado Pago**. Para cambiar ese valor sin tocar el código, agregá la propiedad `MP_MEDIO_NOTIF_DEFECTO` en **Configuración del proyecto > Propiedades del script**.
- **Categoría:** las mismas reglas de `MP_CATEGORIAS`. GNC, YPF, Shell, Axion, Puma o nafta van a **Combustible**.
- **Duplicados:** si llega la misma notificación, con el mismo importe y el mismo comercio, dentro de los **3 minutos**, se descarta. Pasa cuando Android la vuelve a mostrar o MacroDroid dispara dos veces. Dos pagos iguales con más de 3 minutos de diferencia sí se cargan los dos.
- **Las que no se pueden leer**, como "Tu pago fue aprobado" sin importe, aparecen en la hoja **Problemas** con el texto de la notificación, y siguen ahí cada vez que corrés *Revisar datos incompletos*. Cargalas con **Nuevo gasto** y después ejecutá `limpiarNotificacionesNoLeidasMP`. Para verlas en el registro, ejecutá `verNotificacionesNoLeidasMP`.

## Pasar los datos desde Notion

1. En cada base de Notion (Cuentas por Pagar, Cuentas por Cobrar, etc.) usá **⋯ > Exportar > CSV**.
2. Pegá las columnas debajo de los encabezados equivalentes de cada hoja. Los importes van en *Importe ARS* o *Importe USD* según la moneda.
3. Ejecutá **Revisar datos incompletos**. Asigna IDs, completa los estados vacíos, marca las vencidas, lista los problemas y carga en Caja todos los pagos y cobros que ya estaban saldados.
4. Ejecutá **Actualizar tablero**.

## Notas

- Los ejemplos nunca se cargan solos: sólo si respondés *Sí* o usás el menú *Ejemplos*.
- Los medios de pago y las categorías se editan en **Config**, columnas A y B. Los desplegables se actualizan solos.
- Si cambiás los *Días de aviso de vencimiento*, volvé a ejecutar *Crear/actualizar estructura* para actualizar los colores.
