# Sistema administrativo en Google Sheets: instrucciones

## Instalación (5 minutos)

1. Creá una planilla nueva en Google Sheets (o abrí la que quieras usar).
2. Andá a **Extensiones > Apps Script**.
3. Borrá lo que haya en `Código.gs` y **pegá todo el contenido de `Codigo.gs`**.
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

## Pasar los datos desde Notion

1. En cada base de Notion (Cuentas por Pagar, Cuentas por Cobrar, etc.) usá **⋯ > Exportar > CSV**.
2. Pegá las columnas debajo de los encabezados equivalentes de cada hoja. Los importes van en *Importe ARS* o *Importe USD* según la moneda.
3. Ejecutá **Revisar datos incompletos**. Asigna IDs, completa los estados vacíos, marca las vencidas, lista los problemas y carga en Caja todos los pagos y cobros que ya estaban saldados.
4. Ejecutá **Actualizar tablero**.

## Notas

- Los ejemplos nunca se cargan solos: sólo si respondés *Sí* o usás el menú *Ejemplos*.
- Los medios de pago y las categorías se editan en **Config**, columnas A y B. Los desplegables se actualizan solos.
- Si cambiás los *Días de aviso de vencimiento*, volvé a ejecutar *Crear/actualizar estructura* para actualizar los colores.
