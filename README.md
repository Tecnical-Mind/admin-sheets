# Administración en Google Sheets

Script de Google Apps Script que convierte una planilla de Google Sheets en un sistema de administración: Cuentas por Pagar, Cuentas por Cobrar, Caja, Gastos, Proyectos, Proveedores, Clientes, Tablero y Problemas, con presupuestos y un recordatorio diario por email.

## Instalación rápida

### A) Script vinculado a la planilla

1. Abrí la planilla.
2. Andá a **Extensiones > Apps Script**.
3. Pegá el contenido de `Codigo_v1.8.gs`. En el editor de Apps Script el archivo se llama `Código.gs`; cualquier nombre sirve.
4. Guardá.
5. Recargá la planilla.
6. Usá el menú **Administración**.

### B) Script independiente

1. En `Codigo_v1.8.gs`, completá la constante `ID_PLANILLA` con el ID de la planilla: la parte de la URL que está entre `/d/` y `/edit`, sin la barra final.
2. Ejecutá `vincularPlanilla`.
3. Ejecutá `crearEstructura` con **Ejecutar** (no con **Depurar**).

En el modo independiente el menú y los formularios no aparecen. Los diálogos se saltean y quedan anotados en el registro.

El detalle de las hojas, el menú y los automatismos está en [INSTRUCCIONES.md](INSTRUCCIONES.md).
