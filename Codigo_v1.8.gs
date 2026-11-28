/**
 * ============================================================================
 *  SISTEMA ADMINISTRATIVO EN GOOGLE SHEETS
 *  Cuentas por Pagar · Cuentas por Cobrar · Caja · Gastos · Proveedores ·
 *  Clientes · Proyectos / Presupuestos · Tablero · Problemas
 *
 *  Replica la estructura que se lleva en Notion y agrega controles:
 *   - Pagos sin estado: se marcan, se completan y se resaltan.
 *   - Cobros sin concepto o sin importe: se resaltan en rojo y se listan.
 *   - Tablero con trabajos esperando el pago, vencimientos y saldos.
 *   - Caja se carga sola con cada pago, cobro y gasto (sin duplicados).
 *   - Estado "Vencida" automático.
 *   - Recordatorio diario por email.
 *   - Pagos de Mercado Pago cargados solos desde Gmail (cada 15 minutos).
 *
 *  Pegar este archivo completo en Extensiones > Apps Script (Código.gs).
 * ============================================================================
 */

// ----------------------------------------------------------------------------
//  CONSTANTES
// ----------------------------------------------------------------------------

const H = {
  CONFIG: 'Config',
  PROV: 'Proveedores',
  CLI: 'Clientes',
  CXP: 'Cuentas por Pagar',
  CXC: 'Cuentas por Cobrar',
  GASTOS: 'Gastos',
  CAJA: 'Caja',
  PROY: 'Proyectos',
  TABLERO: 'Tablero',
  PROB: 'Problemas',
  PLANT: 'Plantilla Presupuesto'
};

const ESTADOS_CXP = ['Sin Pagar', 'Pagada', 'Pagada Fuera de Término', 'Vencida'];
const ESTADOS_CXP_PAGADA = ['Pagada', 'Pagada Fuera de Término'];
const ESTADOS_CXC = ['Esperando el adelanto', 'Con adelanto', 'Esperando el pago', 'Pagado 100%'];
const ESTADOS_CXC_CON_ADELANTO = ['Con adelanto', 'Esperando el pago', 'Pagado 100%'];
const ESTADOS_PROY_DEFECTO = ['Presupuestado', 'Aprobado', 'En curso', 'Terminado', 'Cancelado'];
const CATEGORIAS_DEFECTO = ['Empresa', 'Casa', 'Personal'];
const MEDIOS_DEFECTO = ['Brubank', 'Visa Galicia', 'Mercado Pago', 'BNA+', 'HSBC', 'Efectivo', 'Transferencia'];
const TIPOS_CAJA = ['Ingreso', 'Egreso'];
const ORIGENES_CAJA = ['Cuentas por Pagar', 'Cuentas por Cobrar', 'Gastos', 'Manual'];

const FMT = {
  ARS: '"$ "#,##0.00',
  USD: '"US$ "#,##0.00',
  FECHA: 'dd/MM/yyyy'
};

const EJEMPLO = 'EJEMPLO';

const PARAMS_DEFECTO = [
  ['Empresa', 'Mi empresa'],
  ['Datos de contacto', 'Dirección · Teléfono · Email'],
  ['Email para recordatorios', ''],
  ['Días de aviso de vencimiento', 7],
  ['Hora del recordatorio (0-23)', 8],
  ['IVA por defecto (%)', 21],
  ['Validez del presupuesto (días)', 15],
  ['Último N° de presupuesto', 0]
];

/**
 * Esquema de cada hoja de datos.
 *  headers: columnas (si ya existen no se tocan; si faltan se agregan al final)
 *  fmt:     formato por columna (ARS, USD, FECHA)
 *  prefijo: prefijo para el ID automático
 *  anchos:  ancho sugerido por columna
 */
const ESQUEMA = {};
ESQUEMA[H.PROV] = {
  headers: ['Nombre', 'CUIT', 'Contacto', 'Email', 'Teléfono', 'Medio de pago habitual', 'Notas'],
  fmt: {},
  anchos: { 'Nombre': 220, 'Notas': 260 }
};
ESQUEMA[H.CLI] = {
  headers: ['Nombre', 'CUIT', 'Contacto', 'Email', 'Teléfono', 'Notas'],
  fmt: {},
  anchos: { 'Nombre': 220, 'Notas': 260 }
};
ESQUEMA[H.CXP] = {
  headers: ['ID', 'Concepto', 'Proveedor', 'Proyecto', 'Fecha', 'Vencimiento', 'Importe ARS', 'Importe USD',
    'Medio de pago', 'Estado', 'Fecha de pago', 'Notas', 'ID Caja'],
  fmt: { 'Fecha': 'FECHA', 'Vencimiento': 'FECHA', 'Fecha de pago': 'FECHA', 'Importe ARS': 'ARS', 'Importe USD': 'USD' },
  prefijo: 'CXP',
  anchos: { 'Concepto': 260, 'Proveedor': 180, 'Estado': 170, 'Notas': 220 }
};
ESQUEMA[H.CXC] = {
  headers: ['ID', 'Concepto', 'Cliente', 'Proyecto', 'Fecha', 'Importe ARS', 'Importe USD', 'Adelanto ARS',
    'Adelanto USD', 'Estado', 'Fecha de cobro', 'Medio de cobro', 'Notas', 'ID Caja'],
  fmt: { 'Fecha': 'FECHA', 'Fecha de cobro': 'FECHA', 'Importe ARS': 'ARS', 'Importe USD': 'USD',
    'Adelanto ARS': 'ARS', 'Adelanto USD': 'USD' },
  prefijo: 'CXC',
  anchos: { 'Concepto': 260, 'Cliente': 180, 'Estado': 170, 'Notas': 220 }
};
ESQUEMA[H.GASTOS] = {
  headers: ['ID', 'Fecha', 'Concepto', 'Categoría', 'Proveedor', 'Importe ARS', 'Importe USD', 'Medio de pago',
    'Notas', 'ID Caja'],
  fmt: { 'Fecha': 'FECHA', 'Importe ARS': 'ARS', 'Importe USD': 'USD' },
  prefijo: 'GAS',
  anchos: { 'Concepto': 260, 'Notas': 220 }
};
ESQUEMA[H.CAJA] = {
  headers: ['ID', 'Fecha', 'Tipo', 'Concepto', 'Origen', 'Referencia', 'Medio', 'Importe ARS', 'Importe USD', 'Notas'],
  fmt: { 'Fecha': 'FECHA', 'Importe ARS': 'ARS', 'Importe USD': 'USD' },
  prefijo: 'CAJ',
  anchos: { 'Concepto': 300, 'Referencia': 170, 'Notas': 220 }
};
ESQUEMA[H.PROY] = {
  headers: ['ID', 'Proyecto', 'Cliente', 'Estado', 'Fecha', 'Presupuesto ARS', 'Presupuesto USD',
    'Hoja de presupuesto', 'Notas'],
  fmt: { 'Fecha': 'FECHA', 'Presupuesto ARS': 'ARS', 'Presupuesto USD': 'USD' },
  prefijo: 'PRY',
  anchos: { 'Proyecto': 260, 'Cliente': 180, 'Hoja de presupuesto': 170, 'Notas': 220 }
};

// Columnas que NO cuentan para decidir si una fila "tiene datos"
const COLS_AUTOMATICAS = ['ID', 'ID Caja'];

// ----------------------------------------------------------------------------
//  CONTEXTO: planilla y ventanas (funciona desde la planilla o desde el editor)
// ----------------------------------------------------------------------------

/** Devuelve la planilla. Si el script no está vinculado a una, usa el ID guardado con vincularPlanilla(). */
let LIBRO_CACHE_ = null;
let VINCULADO_ = true;
function libro_() {
  if (LIBRO_CACHE_) return LIBRO_CACHE_;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) { LIBRO_CACHE_ = ss; return ss; }
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (id) { VINCULADO_ = false; LIBRO_CACHE_ = SpreadsheetApp.openById(id); return LIBRO_CACHE_; }
  throw new Error('Este script no está dentro de una planilla. Abrí tu Google Sheet y entrá por Extensiones > Apps Script, ' +
    'o ejecutá vincularPlanilla() poniendo el ID de la planilla en la constante ID_PLANILLA.');
}

/** Si el script quedó como proyecto independiente, pegá acá el ID de la planilla (lo que va entre /d/ y /edit en la URL) y ejecutá vincularPlanilla. */
const ID_PLANILLA = '';
function vincularPlanilla() {
  if (!ID_PLANILLA) throw new Error('Completá la constante ID_PLANILLA con el ID de tu planilla y volvé a ejecutar.');
  SpreadsheetApp.openById(ID_PLANILLA); // valida acceso
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ID_PLANILLA);
  Logger.log('Planilla vinculada. Ya podés ejecutar crearEstructura desde el editor.');
}

/** Muestra un aviso en la planilla; si se ejecuta desde el editor, lo escribe en el registro. */
function toast_(msg, titulo, seg) {
  try { libro_(); if (VINCULADO_) { libro_().toast(msg, titulo, seg); return; } } catch (e) {}
  Logger.log('[' + (titulo || 'Aviso') + '] ' + msg);
}

/** Devuelve la interfaz de la planilla; si se ejecuta desde el editor o un activador, usa un reemplazo que escribe en el registro. */
function ui_() {
  try { libro_(); if (!VINCULADO_) throw new Error('sin ui'); return SpreadsheetApp.getUi(); } catch (e) {
    const Button = { OK: 'OK', YES: 'YES', NO: 'NO', CANCEL: 'CANCEL', CLOSE: 'CLOSE' };
    return {
      Button: Button,
      ButtonSet: { OK: 'OK', OK_CANCEL: 'OK_CANCEL', YES_NO: 'YES_NO', YES_NO_CANCEL: 'YES_NO_CANCEL' },
      alert: function (a, b, c) {
        Logger.log('[Aviso] ' + a + (typeof b === 'string' ? ': ' + b : ''));
        const set = typeof b === 'string' ? c : b;
        return (set === 'YES_NO' || set === 'YES_NO_CANCEL' || set === 'OK_CANCEL') ? Button.NO : Button.OK; // desde el editor no confirma nada destructivo
      },
      prompt: function (a) { Logger.log('[Pregunta sin respuesta] ' + a); return { getSelectedButton: function () { return Button.CANCEL; }, getResponseText: function () { return ''; } }; },
      showModalDialog: function () { throw new Error('Los formularios sólo se abren desde el menú Administración de la planilla.'); },
      showSidebar: function () { throw new Error('Los paneles sólo se abren desde el menú Administración de la planilla.'); }
    };
  }
}

// ----------------------------------------------------------------------------
//  MENÚ
// ----------------------------------------------------------------------------

function onOpen() {
  let ui;
  try { ui = SpreadsheetApp.getUi(); } catch (e) {
    Logger.log('El menú sólo aparece al abrir la planilla. Recargá la planilla de Google Sheets en vez de ejecutar onOpen desde el editor.');
    return;
  }
  ui
    .createMenu('Administración')
    .addItem('Crear/actualizar estructura', 'crearEstructura')
    .addSeparator()
    .addItem('Revisar datos incompletos', 'revisarDatosIncompletos')
    .addItem('Actualizar tablero', 'actualizarTablero')
    .addItem('Sincronizar Caja', 'sincronizarCaja')
    .addSeparator()
    .addItem('Nuevo pago', 'abrirNuevoPago')
    .addItem('Nuevo ingreso', 'abrirNuevoIngreso')
    .addItem('Nuevo gasto', 'abrirNuevoGasto')
    .addItem('Generar presupuesto', 'abrirGenerarPresupuesto')
    .addSeparator()
    .addItem('Activar recordatorio diario por email', 'activarRecordatorio')
    .addItem('Desactivar recordatorios', 'desactivarRecordatorios')
    .addSeparator()
    .addItem('Importar pagos de Mercado Pago ahora', 'importarMercadoPago')
    .addItem('Activar importación automática de Mercado Pago', 'activarImportacionMercadoPago')
    .addItem('Desactivar importación de Mercado Pago', 'desactivarImportacionMercadoPago')
    .addSubMenu(ui.createMenu('Notificaciones del celular (MP)')
      .addItem('Configurar / ver pasos y token', 'configurarNotificacionesMP')
      .addItem('Probar (sin cargar nada)', 'probarNotificacionMP')
      .addItem('Ver notificaciones sin leer', 'verNotificacionesNoLeidasMP')
      .addItem('Limpiar notificaciones sin leer', 'limpiarNotificacionesNoLeidasMP')
      .addItem('Regenerar token', 'regenerarTokenMP'))
    .addSeparator()
    .addSubMenu(ui.createMenu('Ejemplos')
      .addItem('Cargar filas de EJEMPLO', 'cargarEjemplos')
      .addItem('Borrar filas de EJEMPLO', 'borrarEjemplos'))
    .addToUi();
}

// ----------------------------------------------------------------------------
//  ESTRUCTURA (idempotente: nunca borra datos)
// ----------------------------------------------------------------------------

function crearEstructura() {
  const t0 = Date.now();
  const paso = function (txt) { Logger.log('[' + Math.round((Date.now() - t0) / 1000) + ' s] ' + txt); };
  const ss = libro_();
  const ui = ui_();
  const props = PropertiesService.getScriptProperties();
  const hecho = function (k) { return props.getProperty('EST_' + k) === 'ok'; };
  const marcar = function (k) { props.setProperty('EST_' + k, 'ok'); SpreadsheetApp.flush(); paso('Listo: ' + k); };
  const sinTiempo = function () { return Date.now() - t0 > 4.5 * 60 * 1000; };
  const cortar = function () {
    paso('Se acerca el límite de tiempo de Google. Volvé a ejecutar crearEstructura y sigue desde donde quedó.');
    ui.alert('Estructura a medias', 'Faltan pasos. Volvé a ejecutar Crear/actualizar estructura y continúa desde donde quedó.', ui.ButtonSet.OK);
  };

  if (!hecho('config')) { asegurarConfig_(ss); marcar('config'); }
  const hojas = [H.PROV, H.CLI, H.PROY, H.CXP, H.CXC, H.GASTOS, H.CAJA];
  for (let k = 0; k < hojas.length; k++) {
    const nombre = hojas[k];
    if (hecho('hoja_' + nombre)) continue;
    if (sinTiempo()) return cortar();
    const sh = asegurarHoja_(ss, nombre, ESQUEMA[nombre].headers);
    aplicarFormatos_(sh, ESQUEMA[nombre]);
    marcar('hoja_' + nombre);
  }
  if (!hecho('extras')) {
    asegurarHoja_(ss, H.TABLERO, null);
    asegurarHoja_(ss, H.PROB, null);
    asegurarPlantilla_(ss);
    marcar('extras');
  }
  if (!hecho('validaciones')) { if (sinTiempo()) return cortar(); aplicarValidaciones_(ss); marcar('validaciones'); }
  if (!hecho('colores')) { if (sinTiempo()) return cortar(); aplicarFormatoCondicional_(ss); marcar('colores'); }

  if (!hecho('orden')) {
    // Ordenar hojas (en una sola pasada, sin activar cada una)
    const orden = [H.TABLERO, H.CXP, H.CXC, H.CAJA, H.GASTOS, H.PROY, H.PROV, H.CLI, H.PROB, H.PLANT, H.CONFIG];
    if (VINCULADO_) {
      orden.forEach(function (nombre, i) {
        const sh = ss.getSheetByName(nombre);
        if (sh && sh.getIndex() !== i + 1) { ss.setActiveSheet(sh); ss.moveActiveSheet(i + 1); }
      });
    }
    ['Hoja 1', 'Sheet1', 'Hoja1'].forEach(function (n) {
      const sh = ss.getSheetByName(n);
      if (sh && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
    });
    marcar('orden');
  }

  if (sinTiempo()) return cortar();
  asignarIdsTodos_(); paso('IDs asignados');
  if (sinTiempo()) return cortar();
  actualizarTablero(true); paso('Tablero actualizado');

  // Terminado: se limpian las marcas para que la próxima ejecución reaplique formatos
  Object.keys(props.getProperties()).forEach(function (k) { if (k.indexOf('EST_') === 0) props.deleteProperty(k); });
  if (VINCULADO_) ss.setActiveSheet(ss.getSheetByName(H.TABLERO));
  paso('Estructura completa');

  const vacio = [H.CXP, H.CXC, H.GASTOS, H.CAJA].every(function (n) {
    return ss.getSheetByName(n).getLastRow() <= 1;
  });
  if (vacio) {
    const r = ui.alert('Estructura lista',
      'Las hojas están vacías. ¿Querés cargar algunas filas de EJEMPLO para ver cómo funciona?\n' +
      '(Después las podés borrar desde Administración > Ejemplos > Borrar filas de EJEMPLO)',
      ui.ButtonSet.YES_NO);
    if (r === ui.Button.YES) cargarEjemplos(true);
  } else {
    ui.alert('Estructura lista', 'Se crearon/actualizaron las hojas sin tocar los datos existentes.', ui.ButtonSet.OK);
  }
}

function asegurarHoja_(ss, nombre, headers) {
  let sh = ss.getSheetByName(nombre);
  if (!sh) sh = ss.insertSheet(nombre);
  if (!headers || !headers.length) return sh;

  const lastCol = Math.max(sh.getLastColumn(), 1);
  const actuales = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (v) { return String(v).trim(); });
  const vacia = actuales.every(function (v) { return v === ''; });

  if (vacia) {
    if (sh.getMaxColumns() < headers.length) sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    const faltan = headers.filter(function (h) { return actuales.indexOf(h) === -1; });
    if (faltan.length) {
      let ultima = 0;
      actuales.forEach(function (v, i) { if (v !== '') ultima = i + 1; });
      const desde = ultima + 1;
      const necesarias = desde + faltan.length - 1;
      if (sh.getMaxColumns() < necesarias) sh.insertColumnsAfter(sh.getMaxColumns(), necesarias - sh.getMaxColumns());
      sh.getRange(1, desde, 1, faltan.length).setValues([faltan]);
    }
  }
  sh.getRange(1, 1, 1, sh.getLastColumn())
    .setFontWeight('bold').setBackground('#1f4e78').setFontColor('#ffffff')
    .setVerticalAlignment('middle').setWrap(true);
  sh.setFrozenRows(1);
  return sh;
}

function aplicarFormatos_(sh, esq) {
  const m = mapa_(sh);
  const filas = Math.max(sh.getMaxRows() - 1, 1);
  Object.keys(esq.fmt || {}).forEach(function (col) {
    if (m[col]) sh.getRange(2, m[col], filas, 1).setNumberFormat(FMT[esq.fmt[col]]);
  });
  Object.keys(esq.anchos || {}).forEach(function (col) {
    if (m[col]) sh.setColumnWidth(m[col], esq.anchos[col]);
  });
  ['ID', 'ID Caja', 'Referencia'].forEach(function (col) {
    if (m[col]) sh.getRange(2, m[col], filas, 1).setFontColor('#80868b').setFontSize(9);
  });
}

function asegurarConfig_(ss) {
  let sh = ss.getSheetByName(H.CONFIG);
  if (!sh) sh = ss.insertSheet(H.CONFIG);
  if (!sh.getRange('A1').getValue()) {
    sh.getRange('A1:F1').setValues([['Medios de pago', 'Categorías de gasto', 'Estados de proyecto', '', 'Parámetro', 'Valor']]);
  }
  sh.getRange('A1:F1').setFontWeight('bold').setBackground('#1f4e78').setFontColor('#ffffff');
  sh.setFrozenRows(1);

  // Listas: sólo se completan si están vacías (no pisa lo que ya cargaste)
  [[1, MEDIOS_DEFECTO], [2, CATEGORIAS_DEFECTO], [3, ESTADOS_PROY_DEFECTO]].forEach(function (par) {
    const col = par[0], valores = par[1];
    const actuales = sh.getRange(2, col, Math.max(sh.getMaxRows() - 1, 1), 1).getValues()
      .map(function (r) { return String(r[0]).trim(); }).filter(String);
    if (!actuales.length) sh.getRange(2, col, valores.length, 1).setValues(valores.map(function (v) { return [v]; }));
  });

  // Parámetros: se agregan sólo los que falten
  const n = Math.max(sh.getLastRow() - 1, 1);
  const claves = sh.getRange(2, 5, n, 1).getValues().map(function (r) { return String(r[0]).trim(); });
  let fila = 2;
  claves.forEach(function (c, i) { if (c) fila = i + 3; });
  PARAMS_DEFECTO.forEach(function (p) {
    if (claves.indexOf(p[0]) === -1) { sh.getRange(fila, 5, 1, 2).setValues([p]); fila++; }
  });
  sh.setColumnWidth(1, 160); sh.setColumnWidth(2, 160); sh.setColumnWidth(3, 160);
  sh.setColumnWidth(5, 230); sh.setColumnWidth(6, 260);
  return sh;
}

function asegurarPlantilla_(ss) {
  let sh = ss.getSheetByName(H.PLANT);
  if (sh) return sh;
  sh = ss.insertSheet(H.PLANT);
  sh.getRange('A1').setValue(getParam_('Empresa', 'Mi empresa')).setFontSize(18).setFontWeight('bold');
  sh.getRange('A2').setValue(getParam_('Datos de contacto', '')).setFontColor('#5f6368');
  sh.getRange('D1').setValue('PRESUPUESTO').setFontSize(18).setFontWeight('bold').setFontColor('#1f4e78');
  sh.getRange('A4:A6').setValues([['N°'], ['Cliente'], ['Proyecto']]).setFontWeight('bold');
  sh.getRange('D4:D6').setValues([['Fecha'], ['Válido hasta'], ['Moneda']]).setFontWeight('bold');
  sh.getRange('E4:E5').setNumberFormat(FMT.FECHA);
  sh.getRange('A8:E8').setValues([['Ítem', 'Descripción', 'Cantidad', 'Precio unitario', 'Subtotal']])
    .setFontWeight('bold').setBackground('#1f4e78').setFontColor('#ffffff');
  sh.setColumnWidth(1, 60); sh.setColumnWidth(2, 340); sh.setColumnWidth(3, 90);
  sh.setColumnWidth(4, 130); sh.setColumnWidth(5, 140);
  sh.getRange('A10').setValue('Esta hoja es la plantilla: podés cambiar el nombre de la empresa, los datos de contacto, ' +
    'colores y logo (filas 1 a 3). No muevas las celdas de las filas 4 a 8.').setFontColor('#9aa0a6').setFontStyle('italic');
  sh.setHiddenGridlines(true);
  return sh;
}

function aplicarValidaciones_(ss) {
  const cfg = ss.getSheetByName(H.CONFIG);
  const medios = cfg.getRange('A2:A');
  const categorias = cfg.getRange('B2:B');
  const estadosProy = cfg.getRange('C2:C');
  const proveedores = ss.getSheetByName(H.PROV).getRange('A2:A');
  const clientes = ss.getSheetByName(H.CLI).getRange('A2:A');
  const shProy = ss.getSheetByName(H.PROY);
  const proyectos = shProy.getRange(2, mapa_(shProy)['Proyecto'] || 2, Math.max(shProy.getMaxRows() - 1, 1), 1);

  const cxp = ss.getSheetByName(H.CXP);
  validarLista_(cxp, 'Estado', ESTADOS_CXP, true);
  validarRango_(cxp, 'Medio de pago', medios);
  validarRango_(cxp, 'Proveedor', proveedores);
  validarRango_(cxp, 'Proyecto', proyectos);
  validarFecha_(cxp, ['Fecha', 'Vencimiento', 'Fecha de pago']);

  const cxc = ss.getSheetByName(H.CXC);
  validarLista_(cxc, 'Estado', ESTADOS_CXC, true);
  validarRango_(cxc, 'Medio de cobro', medios);
  validarRango_(cxc, 'Cliente', clientes);
  validarRango_(cxc, 'Proyecto', proyectos);
  validarFecha_(cxc, ['Fecha', 'Fecha de cobro']);

  const gas = ss.getSheetByName(H.GASTOS);
  validarRango_(gas, 'Categoría', categorias, true);
  validarRango_(gas, 'Medio de pago', medios);
  validarRango_(gas, 'Proveedor', proveedores);
  validarFecha_(gas, ['Fecha']);

  const caja = ss.getSheetByName(H.CAJA);
  validarLista_(caja, 'Tipo', TIPOS_CAJA, true);
  validarLista_(caja, 'Origen', ORIGENES_CAJA, false);
  validarRango_(caja, 'Medio', medios);
  validarFecha_(caja, ['Fecha']);

  validarRango_(shProy, 'Estado', estadosProy);
  validarRango_(shProy, 'Cliente', clientes);
  validarFecha_(shProy, ['Fecha']);

  validarRango_(ss.getSheetByName(H.PROV), 'Medio de pago habitual', medios);
}

function rangoColumna_(sh, header) {
  const m = mapa_(sh);
  if (!m[header]) return null;
  return sh.getRange(2, m[header], Math.max(sh.getMaxRows() - 1, 1), 1);
}

function validarLista_(sh, header, lista, estricto) {
  const r = rangoColumna_(sh, header);
  if (!r) return;
  r.setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(lista, true).setAllowInvalid(!estricto).build());
}

function validarRango_(sh, header, fuente, estricto) {
  const r = rangoColumna_(sh, header);
  if (!r) return;
  r.setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInRange(fuente, true).setAllowInvalid(!estricto).build());
}

function validarFecha_(sh, headers) {
  headers.forEach(function (h) {
    const r = rangoColumna_(sh, h);
    if (!r) return;
    r.setDataValidation(SpreadsheetApp.newDataValidation()
      .requireDate().setAllowInvalid(true).setHelpText('Ingresá una fecha (dd/mm/aaaa)').build());
  });
}

function aplicarFormatoCondicional_(ss) {
  const dias = parseInt(getParam_('Días de aviso de vencimiento', 7), 10) || 7;
  const rangoDatos = function (sh) { return sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), sh.getLastColumn()); };

  // --- Cuentas por Pagar ---
  const cxp = ss.getSheetByName(H.CXP);
  let m = mapa_(cxp);
  let rango = rangoDatos(cxp);
  const E = '$' + colLetra_(m['Estado']) + '2', V = '$' + colLetra_(m['Vencimiento']) + '2', C = '$' + colLetra_(m['Concepto']) + '2';
  const noPagada = 'OR(' + E + '="Sin Pagar",' + E + '="Vencida",' + E + '="")';
  cxp.setConditionalFormatRules([
    regla_(rango, '=' + E + '="Vencida"', '#f4c7c3', '#a50e0e'),
    regla_(rango, '=AND(' + noPagada + ',ISNUMBER(' + V + '),' + V + '<TODAY())', '#f4c7c3', '#a50e0e'),
    regla_(rango, '=AND(' + C + '<>"",' + E + '="")', '#fff2cc', null),
    regla_(rango, '=AND(' + noPagada + ',ISNUMBER(' + V + '),' + V + '>=TODAY(),' + V + '<=TODAY()+' + dias + ')', '#fce8b2', null),
    regla_(rango, '=OR(' + E + '="Pagada",' + E + '="Pagada Fuera de Término")', '#e6f4ea', null)
  ]);

  // --- Cuentas por Cobrar: sin concepto o sin importe → ROJO ---
  const cxc = ss.getSheetByName(H.CXC);
  m = mapa_(cxc);
  rango = rangoDatos(cxc);
  const L = function (h) { return '$' + colLetra_(m[h]) + '2'; };
  const conDatos = 'COUNTA(' + ['Concepto', 'Cliente', 'Proyecto', 'Fecha', 'Importe ARS', 'Importe USD', 'Estado']
    .filter(function (h) { return m[h]; }).map(L).join(',') + ')>0';
  const incompleta = 'OR(' + L('Concepto') + '="",AND(N(' + L('Importe ARS') + ')=0,N(' + L('Importe USD') + ')=0))';
  cxc.setConditionalFormatRules([
    regla_(rango, '=AND(' + conDatos + ',' + incompleta + ')', '#f4c7c3', '#a50e0e'),
    regla_(rango, '=' + L('Estado') + '="Esperando el pago"', '#fce8b2', null),
    regla_(rango, '=' + L('Estado') + '="Pagado 100%"', '#e6f4ea', null)
  ]);

  // --- Gastos: sin categoría o sin importe → amarillo ---
  const gas = ss.getSheetByName(H.GASTOS);
  m = mapa_(gas);
  rango = rangoDatos(gas);
  const G = function (h) { return '$' + colLetra_(m[h]) + '2'; };
  gas.setConditionalFormatRules([
    regla_(rango, '=AND(' + G('Concepto') + '<>"",OR(' + G('Categoría') + '="",AND(N(' + G('Importe ARS') + ')=0,N(' +
      G('Importe USD') + ')=0)))', '#fff2cc', null)
  ]);

  // --- Caja: ingresos verdes, egresos rojos ---
  const caja = ss.getSheetByName(H.CAJA);
  m = mapa_(caja);
  rango = rangoDatos(caja);
  const T = '$' + colLetra_(m['Tipo']) + '2';
  caja.setConditionalFormatRules([
    regla_(rango, '=' + T + '="Ingreso"', '#e6f4ea', null),
    regla_(rango, '=' + T + '="Egreso"', '#fce8e6', null)
  ]);
}

function regla_(rango, formula, fondo, texto) {
  const b = SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(formula).setRanges([rango]);
  if (fondo) b.setBackground(fondo);
  if (texto) b.setFontColor(texto);
  return b.build();
}

// ----------------------------------------------------------------------------
//  TRIGGER onEdit: IDs, "Vencida" automática y alta en Caja
// ----------------------------------------------------------------------------

function onEdit(e) {
  try {
    if (!e || !e.range) return;
    const sh = e.range.getSheet();
    const nombre = sh.getName();
    if ([H.CXP, H.CXC, H.GASTOS, H.CAJA, H.PROY].indexOf(nombre) === -1) return;
    const r0 = Math.max(e.range.getRow(), 2);
    const r1 = e.range.getLastRow();
    if (r1 < r0) return;
    procesarFilas_(sh, r0, r1);
  } catch (err) {
    console.error('onEdit: ' + err);
  }
}

/**
 * Procesa un bloque de filas: asigna ID, aplica reglas de estado y crea los
 * movimientos de Caja que falten. Sólo reescribe las columnas que cambian.
 * Devuelve la cantidad de movimientos nuevos en Caja.
 */
function procesarFilas_(sh, r0, r1) {
  const nombre = sh.getName();
  const esq = ESQUEMA[nombre];
  if (!esq) return 0;
  const m = mapa_(sh);
  const nCols = sh.getLastColumn();
  if (r1 < r0 || nCols < 1) return 0;
  const datos = sh.getRange(r0, 1, r1 - r0 + 1, nCols).getValues();
  const hoy = hoy_();
  const tocadas = {};
  const nuevosCaja = [];
  let refs = null;

  datos.forEach(function (fila) {
    if (!filaConDatos_(fila, m)) return;
    const g = function (k) { return m[k] ? fila[m[k] - 1] : ''; };
    const s = function (k, v) { if (m[k]) { fila[m[k] - 1] = v; tocadas[m[k]] = true; } };

    if (m['ID'] && !g('ID') && esq.prefijo) s('ID', nuevoId_(esq.prefijo));

    if (nombre === H.CXP) reglasCxp_(g, s, hoy);
    if (nombre === H.CXC && String(g('Estado')).trim() === 'Pagado 100%' && !asFecha_(g('Fecha de cobro'))) s('Fecha de cobro', hoy);

    if (nombre === H.CXP || nombre === H.CXC || nombre === H.GASTOS) {
      if (!refs) refs = refsCaja_();
      const movs = movimientosPendientes_(nombre, g, refs, hoy);
      if (movs.length) {
        const ids = movs.map(function (mv) { refs[mv.ref] = true; nuevosCaja.push(mv); return mv.id; });
        const prev = String(g('ID Caja') || '').trim();
        s('ID Caja', (prev ? prev + ', ' : '') + ids.join(', '));
      }
    }
  });

  Object.keys(tocadas).forEach(function (c) {
    const col = parseInt(c, 10);
    sh.getRange(r0, col, datos.length, 1).setValues(datos.map(function (f) { return [f[col - 1]]; }));
  });
  if (nuevosCaja.length) agregarACaja_(nuevosCaja);
  return nuevosCaja.length;
}

/** Reglas de estado de Cuentas por Pagar. */
function reglasCxp_(g, s, hoy) {
  const est = String(g('Estado')).trim();
  const venc = asFecha_(g('Vencimiento'));
  const fpago = asFecha_(g('Fecha de pago'));
  if (ESTADOS_CXP_PAGADA.indexOf(est) !== -1) {
    if (!fpago) s('Fecha de pago', hoy);
    const fp = fpago || hoy;
    if (est === 'Pagada' && venc && fp.getTime() > venc.getTime()) s('Estado', 'Pagada Fuera de Término');
  } else if (venc) {
    if (est === 'Sin Pagar' && venc.getTime() < hoy.getTime()) s('Estado', 'Vencida');
    else if (est === 'Vencida' && venc.getTime() >= hoy.getTime()) s('Estado', 'Sin Pagar');
  }
}

/** Arma los movimientos de Caja que corresponden a una fila y que todavía no existen. */
function movimientosPendientes_(nombre, g, refs, hoy) {
  const id = String(g('ID')).trim();
  if (!id) return [];
  const movs = [];
  const ars = num_(g('Importe ARS')), usd = num_(g('Importe USD'));
  const est = String(g('Estado')).trim();
  const concepto = String(g('Concepto') || '(sin concepto)');

  if (nombre === H.CXP) {
    if (ESTADOS_CXP_PAGADA.indexOf(est) !== -1 && (ars || usd) && !refs[id]) {
      const prov = String(g('Proveedor') || '');
      movs.push(mov_(id, asFecha_(g('Fecha de pago')) || hoy, 'Egreso',
        'Pago: ' + concepto + (prov ? ' — ' + prov : ''), H.CXP, g('Medio de pago'), ars, usd));
    }
  } else if (nombre === H.GASTOS) {
    if ((ars || usd) && !refs[id]) {
      const cat = String(g('Categoría') || '');
      movs.push(mov_(id, asFecha_(g('Fecha')) || hoy, 'Egreso',
        'Gasto' + (cat ? ' [' + cat + ']' : '') + ': ' + concepto, H.GASTOS, g('Medio de pago'), ars, usd));
    }
  } else if (nombre === H.CXC) {
    const cli = String(g('Cliente') || '');
    const aars = num_(g('Adelanto ARS')), ausd = num_(g('Adelanto USD'));
    if (ESTADOS_CXC_CON_ADELANTO.indexOf(est) !== -1 && (aars || ausd) && !refs[id + '#ADELANTO']) {
      movs.push(mov_(id + '#ADELANTO', hoy, 'Ingreso',
        'Adelanto: ' + concepto + (cli ? ' — ' + cli : ''), H.CXC, g('Medio de cobro'), aars, ausd));
    }
    if (est === 'Pagado 100%' && !refs[id + '#SALDO']) {
      const sa = Math.max(ars - aars, 0), su = Math.max(usd - ausd, 0);
      if (sa || su) {
        movs.push(mov_(id + '#SALDO', asFecha_(g('Fecha de cobro')) || hoy, 'Ingreso',
          'Cobro: ' + concepto + (cli ? ' — ' + cli : ''), H.CXC, g('Medio de cobro'), sa, su));
      }
    }
  }
  return movs;
}

function mov_(ref, fecha, tipo, concepto, origen, medio, ars, usd) {
  return {
    id: nuevoId_('CAJ'), ref: ref, fecha: fecha, tipo: tipo, concepto: concepto, origen: origen,
    medio: medio || '', ars: ars || '', usd: usd || ''
  };
}

/** Referencias ya cargadas en Caja (para no duplicar). */
function refsCaja_() {
  const sh = libro_().getSheetByName(H.CAJA);
  const refs = {};
  if (!sh || sh.getLastRow() < 2) return refs;
  const m = mapa_(sh);
  if (!m['Referencia']) return refs;
  sh.getRange(2, m['Referencia'], sh.getLastRow() - 1, 1).getValues().forEach(function (r) {
    const v = String(r[0]).trim();
    if (v) refs[v] = true;
  });
  return refs;
}

function agregarACaja_(movs) {
  const sh = libro_().getSheetByName(H.CAJA);
  const m = mapa_(sh);
  const nCols = sh.getLastColumn();
  const filas = movs.map(function (mv) {
    const f = new Array(nCols).fill('');
    const put = function (k, v) { if (m[k]) f[m[k] - 1] = v; };
    put('ID', mv.id); put('Fecha', mv.fecha); put('Tipo', mv.tipo); put('Concepto', mv.concepto);
    put('Origen', mv.origen); put('Referencia', mv.ref); put('Medio', mv.medio);
    put('Importe ARS', mv.ars); put('Importe USD', mv.usd);
    put('Notas', 'Generado automáticamente');
    return f;
  });
  const desde = sh.getLastRow() + 1;
  const hasta = desde + filas.length - 1;
  if (hasta > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), hasta - sh.getMaxRows() + 100);
  sh.getRange(desde, 1, filas.length, nCols).setValues(filas);
  if (m['Fecha']) sh.getRange(desde, m['Fecha'], filas.length, 1).setNumberFormat(FMT.FECHA);
  if (m['Importe ARS']) sh.getRange(desde, m['Importe ARS'], filas.length, 1).setNumberFormat(FMT.ARS);
  if (m['Importe USD']) sh.getRange(desde, m['Importe USD'], filas.length, 1).setNumberFormat(FMT.USD);
}

/** Menú: recorre pagos, cobros y gastos y crea en Caja lo que falte (sin duplicar). */
function sincronizarCaja(silencioso) {
  verificarEstructura_();
  const ss = libro_();
  let total = 0;
  [H.CXP, H.CXC, H.GASTOS].forEach(function (n) {
    const sh = ss.getSheetByName(n);
    if (sh.getLastRow() >= 2) total += procesarFilas_(sh, 2, sh.getLastRow());
  });
  if (silencioso !== true) {
    toast_(total ? 'Se agregaron ' + total + ' movimientos a Caja.' : 'Caja ya estaba al día.', 'Caja', 5);
  }
  return total;
}

/** Pasa a "Vencida" lo que corresponda en Cuentas por Pagar. */
function actualizarVencidas_() {
  const sh = libro_().getSheetByName(H.CXP);
  if (sh && sh.getLastRow() >= 2) procesarFilas_(sh, 2, sh.getLastRow());
}

function asignarIdsTodos_() {
  const ss = libro_();
  [H.CXP, H.CXC, H.GASTOS, H.CAJA, H.PROY].forEach(function (n) {
    const sh = ss.getSheetByName(n);
    if (!sh || sh.getLastRow() < 2) return;
    const m = mapa_(sh);
    if (!m['ID']) return;
    const datos = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
    let cambio = false;
    const ids = datos.map(function (f) {
      let id = f[m['ID'] - 1];
      if (!id && filaConDatos_(f, m)) { id = nuevoId_(ESQUEMA[n].prefijo); cambio = true; }
      return [id];
    });
    if (cambio) sh.getRange(2, m['ID'], ids.length, 1).setValues(ids);
  });
}

// ----------------------------------------------------------------------------
//  REVISAR DATOS INCOMPLETOS  →  hoja "Problemas"
// ----------------------------------------------------------------------------

function revisarDatosIncompletos() {
  verificarEstructura_();
  const ss = libro_();
  const hoy = hoy_();
  const hoyTxt = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'dd/MM/yyyy');
  asignarIdsTodos_();
  actualizarVencidas_();

  const problemas = []; // [Hoja, Fila, ID, Concepto, Problema, Gravedad]
  const add = function (hoja, fila, id, concepto, problema, grav) {
    problemas.push([hoja, fila, id || '', concepto || '', problema, grav]);
  };
  const vacio = function (v) { return !String(v === null || v === undefined ? '' : v).trim(); };

  const provs = listaColumna_(ss.getSheetByName(H.PROV), 'Nombre');
  const clis = listaColumna_(ss.getSheetByName(H.CLI), 'Nombre');

  // ---- Cuentas por Pagar ----
  let sinEstado = 0;
  leerFilas_(H.CXP).forEach(function (r) {
    const g = r.g, est = String(g('Estado')).trim(), venc = asFecha_(g('Vencimiento'));
    const pagada = ESTADOS_CXP_PAGADA.indexOf(est) !== -1;
    if (!est) {
      const def = (venc && venc.getTime() < hoy.getTime()) ? 'Vencida' : 'Sin Pagar';
      r.sh.getRange(r.fila, r.m['Estado']).setValue(def).setBackground('#fff2cc')
        .setNote('Estado vacío: se completó automáticamente con "' + def + '" el ' + hoyTxt + '. Revisalo.');
      sinEstado++;
      add(H.CXP, r.fila, g('ID'), g('Concepto'), 'Sin estado → se completó con "' + def + '" (celda resaltada)', 'Alta');
    }
    if (vacio(g('Concepto'))) add(H.CXP, r.fila, g('ID'), '', 'Sin concepto', 'Alta');
    if (!num_(g('Importe ARS')) && !num_(g('Importe USD'))) add(H.CXP, r.fila, g('ID'), g('Concepto'), 'Sin importe (ARS ni USD)', 'Alta');
    if (!venc && !pagada) add(H.CXP, r.fila, g('ID'), g('Concepto'), 'Sin fecha de vencimiento', 'Media');
    if (vacio(g('Proveedor'))) add(H.CXP, r.fila, g('ID'), g('Concepto'), 'Sin proveedor', 'Media');
    else if (provs.indexOf(String(g('Proveedor')).trim()) === -1)
      add(H.CXP, r.fila, g('ID'), g('Concepto'), 'El proveedor "' + g('Proveedor') + '" no está en la hoja Proveedores', 'Baja');
    if (pagada && vacio(g('Medio de pago'))) add(H.CXP, r.fila, g('ID'), g('Concepto'), 'Pagada sin medio de pago', 'Media');
    if (!vacio(g('ID Caja')) && !pagada)
      add(H.CXP, r.fila, g('ID'), g('Concepto'), 'Tiene movimiento en Caja pero ya no figura como pagada: revisá Caja', 'Media');
  });

  // ---- Cuentas por Cobrar ----
  const cxcIncompletas = [];
  leerFilas_(H.CXC).forEach(function (r) {
    const g = r.g;
    const sinConcepto = vacio(g('Concepto'));
    const sinImporte = !num_(g('Importe ARS')) && !num_(g('Importe USD'));
    if (sinConcepto) add(H.CXC, r.fila, g('ID'), '', 'Sin concepto / título (fila resaltada en rojo)', 'Alta');
    if (sinImporte) add(H.CXC, r.fila, g('ID'), g('Concepto'), 'Sin importe (fila resaltada en rojo)', 'Alta');
    if (sinConcepto || sinImporte) {
      cxcIncompletas.push('Fila ' + r.fila + (sinConcepto ? ' (sin concepto)' : ' "' + g('Concepto') + '"') + (sinImporte ? ' sin importe' : ''));
    }
    if (vacio(g('Estado'))) add(H.CXC, r.fila, g('ID'), g('Concepto'), 'Sin estado', 'Media');
    if (vacio(g('Cliente'))) add(H.CXC, r.fila, g('ID'), g('Concepto'), 'Sin cliente', 'Media');
    else if (clis.indexOf(String(g('Cliente')).trim()) === -1)
      add(H.CXC, r.fila, g('ID'), g('Concepto'), 'El cliente "' + g('Cliente') + '" no está en la hoja Clientes', 'Baja');
    if (!asFecha_(g('Fecha'))) add(H.CXC, r.fila, g('ID'), g('Concepto'), 'Sin fecha (no se pueden calcular los días de espera)', 'Media');
    if (num_(g('Adelanto ARS')) > num_(g('Importe ARS')) || num_(g('Adelanto USD')) > num_(g('Importe USD')))
      add(H.CXC, r.fila, g('ID'), g('Concepto'), 'El adelanto es mayor que el importe', 'Media');
    if (String(g('Estado')).trim() === 'Con adelanto' && !num_(g('Adelanto ARS')) && !num_(g('Adelanto USD')))
      add(H.CXC, r.fila, g('ID'), g('Concepto'), 'Estado "Con adelanto" pero sin importe de adelanto', 'Media');
  });

  // ---- Gastos ----
  const filasGastos = leerFilas_(H.GASTOS);
  filasGastos.forEach(function (r) {
    const g = r.g;
    if (vacio(g('Categoría'))) add(H.GASTOS, r.fila, g('ID'), g('Concepto'), 'Sin categoría (Empresa / Casa / Personal)', 'Media');
    if (!num_(g('Importe ARS')) && !num_(g('Importe USD'))) add(H.GASTOS, r.fila, g('ID'), g('Concepto'), 'Sin importe', 'Alta');
    if (vacio(g('Medio de pago'))) add(H.GASTOS, r.fila, g('ID'), g('Concepto'), 'Sin medio de pago', 'Baja');
    if (!asFecha_(g('Fecha'))) add(H.GASTOS, r.fila, g('ID'), g('Concepto'), 'Sin fecha', 'Media');
  });
  if (!filasGastos.length) add(H.GASTOS, '', '', '', 'Gastos está vacía: cargá los gastos con "Nuevo gasto"', 'Baja');

  // ---- Caja ----
  const filasCaja = leerFilas_(H.CAJA);
  filasCaja.forEach(function (r) {
    const g = r.g;
    if (vacio(g('Tipo'))) add(H.CAJA, r.fila, g('ID'), g('Concepto'), 'Sin tipo (Ingreso / Egreso)', 'Alta');
    if (!num_(g('Importe ARS')) && !num_(g('Importe USD'))) add(H.CAJA, r.fila, g('ID'), g('Concepto'), 'Sin importe', 'Alta');
    if (!asFecha_(g('Fecha'))) add(H.CAJA, r.fila, g('ID'), g('Concepto'), 'Sin fecha', 'Media');
  });

  // ---- Duplicados en Proveedores / Clientes ----
  [[H.PROV, provs], [H.CLI, clis]].forEach(function (par) {
    const vistos = {};
    par[1].forEach(function (n) {
      const k = n.toLowerCase();
      if (vistos[k]) add(par[0], '', '', n, 'Nombre duplicado', 'Baja');
      vistos[k] = true;
    });
  });

  const nuevosCaja = sincronizarCaja(true);
  if (!leerFilas_(H.CAJA).length) add(H.CAJA, '', '', '', 'Caja está vacía: todavía no hay pagos, cobros ni gastos registrados', 'Media');
  problemasNotifMP_().forEach(function (f) { problemas.push(f); });
  escribirProblemas_(problemas);

  const ui = ui_();
  let msg = 'Se encontraron ' + problemas.length + ' problemas (detalle en la hoja "Problemas").\n\n';
  msg += '• Pagos sin estado completados: ' + sinEstado + '\n';
  msg += '• Cobros sin concepto o importe: ' + cxcIncompletas.length + '\n';
  if (cxcIncompletas.length) msg += '   ' + cxcIncompletas.slice(0, 10).join('\n   ') + (cxcIncompletas.length > 10 ? '\n   …' : '') + '\n';
  msg += '• Movimientos nuevos en Caja: ' + nuevosCaja;
  ss.setActiveSheet(ss.getSheetByName(H.PROB));
  ui.alert('Revisión de datos', msg, ui.ButtonSet.OK);
}

function escribirProblemas_(problemas) {
  const ss = libro_();
  const sh = asegurarHoja_(ss, H.PROB, null);
  sh.clear();
  sh.clearConditionalFormatRules();
  const enc = ['Hoja', 'Fila', 'ID', 'Concepto', 'Problema', 'Gravedad', 'Ir'];
  sh.getRange(1, 1, 1, enc.length).setValues([enc])
    .setFontWeight('bold').setBackground('#1f4e78').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  sh.getRange('I1').setValue('Última revisión:').setFontWeight('bold');
  sh.getRange('J1').setValue(new Date()).setNumberFormat('dd/MM/yyyy HH:mm');

  if (!problemas.length) {
    sh.getRange('A2').setValue('¡Sin problemas! Todo está completo.').setFontColor('#188038').setFontWeight('bold');
    return;
  }
  const orden = { 'Alta': 0, 'Media': 1, 'Baja': 2 };
  problemas.sort(function (a, b) { return orden[a[5]] - orden[b[5]]; });
  const gids = {};
  ss.getSheets().forEach(function (s) { gids[s.getName()] = s.getSheetId(); });
  // setFormula usa siempre la sintaxis en inglés (separador ","), sin importar la configuración regional
  const filas = problemas.map(function (p) {
    const link = (p[1] && gids[p[0]] !== undefined) ? '=HYPERLINK("#gid=' + gids[p[0]] + '&range=A' + p[1] + '","Ir")' : '';
    return p.concat([link]);
  });
  sh.getRange(2, 1, filas.length, enc.length).setValues(filas);
  const colG = sh.getRange(2, 6, filas.length, 1);
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Alta').setBackground('#f4c7c3').setRanges([colG]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Media').setBackground('#fce8b2').setRanges([colG]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Baja').setBackground('#e8f0fe').setRanges([colG]).build()
  ]);
  sh.setColumnWidth(1, 150); sh.setColumnWidth(4, 260); sh.setColumnWidth(5, 420);
}

// ----------------------------------------------------------------------------
//  TABLERO
// ----------------------------------------------------------------------------

/** Junta todo lo que se muestra en el tablero y en el email diario. */
function calcularResumen_() {
  const hoy = hoy_();
  const dias = parseInt(getParam_('Días de aviso de vencimiento', 7), 10) || 7;
  const limite = new Date(hoy.getTime() + dias * 864e5);
  const R = {
    dias: dias, cobros: [], vencidas: [], proximas: [],
    cobrarARS: 0, cobrarUSD: 0, pagarARS: 0, pagarUSD: 0,
    cajaARS: 0, cajaUSD: 0, mesIngARS: 0, mesIngUSD: 0, mesEgrARS: 0, mesEgrUSD: 0,
    gastosMes: {}
  };

  leerFilas_(H.CXC).forEach(function (r) {
    const g = r.g, est = String(g('Estado')).trim();
    if (est === 'Pagado 100%') return;
    const pa = Math.max(num_(g('Importe ARS')) - num_(g('Adelanto ARS')), 0);
    const pu = Math.max(num_(g('Importe USD')) - num_(g('Adelanto USD')), 0);
    R.cobrarARS += pa; R.cobrarUSD += pu;
    const f = asFecha_(g('Fecha'));
    R.cobros.push({
      concepto: String(g('Concepto') || '(sin concepto)'), cliente: String(g('Cliente') || ''),
      estado: est || '(sin estado)', fecha: f, dias: f ? Math.round((hoy - f) / 864e5) : '', ars: pa, usd: pu
    });
  });
  // Primero los que esperan el pago, después por días de espera (mayor a menor)
  R.cobros.sort(function (a, b) {
    const pa = a.estado === 'Esperando el pago' ? 0 : 1, pb = b.estado === 'Esperando el pago' ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return (Number(b.dias) || 0) - (Number(a.dias) || 0);
  });

  leerFilas_(H.CXP).forEach(function (r) {
    const g = r.g, est = String(g('Estado')).trim();
    if (ESTADOS_CXP_PAGADA.indexOf(est) !== -1) return;
    const ars = num_(g('Importe ARS')), usd = num_(g('Importe USD'));
    R.pagarARS += ars; R.pagarUSD += usd;
    const v = asFecha_(g('Vencimiento'));
    const item = {
      concepto: String(g('Concepto') || '(sin concepto)'), proveedor: String(g('Proveedor') || ''),
      vencimiento: v, dias: v ? Math.round((v - hoy) / 864e5) : '', medio: String(g('Medio de pago') || ''),
      ars: ars, usd: usd
    };
    if (est === 'Vencida' || (v && v.getTime() < hoy.getTime())) R.vencidas.push(item);
    else if (v && v.getTime() <= limite.getTime()) R.proximas.push(item);
  });
  R.vencidas.sort(function (a, b) { return (a.vencimiento ? a.vencimiento.getTime() : 0) - (b.vencimiento ? b.vencimiento.getTime() : 0); });
  R.proximas.sort(function (a, b) { return a.vencimiento.getTime() - b.vencimiento.getTime(); });

  const mes = hoy.getMonth(), anio = hoy.getFullYear();
  leerFilas_(H.CAJA).forEach(function (r) {
    const g = r.g, tipo = String(g('Tipo')).trim();
    const ars = num_(g('Importe ARS')), usd = num_(g('Importe USD'));
    const signo = tipo === 'Ingreso' ? 1 : (tipo === 'Egreso' ? -1 : 0);
    R.cajaARS += signo * ars; R.cajaUSD += signo * usd;
    const f = asFecha_(g('Fecha'));
    if (f && f.getMonth() === mes && f.getFullYear() === anio) {
      if (signo > 0) { R.mesIngARS += ars; R.mesIngUSD += usd; }
      if (signo < 0) { R.mesEgrARS += ars; R.mesEgrUSD += usd; }
    }
  });

  leerFilas_(H.GASTOS).forEach(function (r) {
    const g = r.g, f = asFecha_(g('Fecha'));
    if (!f || f.getMonth() !== mes || f.getFullYear() !== anio) return;
    const cat = String(g('Categoría') || 'Sin categoría');
    if (!R.gastosMes[cat]) R.gastosMes[cat] = { ars: 0, usd: 0 };
    R.gastosMes[cat].ars += num_(g('Importe ARS'));
    R.gastosMes[cat].usd += num_(g('Importe USD'));
  });
  return R;
}

function actualizarTablero(silencioso) {
  verificarEstructura_();
  const ss = libro_();
  actualizarVencidas_();
  sincronizarCaja(true);
  const R = calcularResumen_();
  const sh = asegurarHoja_(ss, H.TABLERO, null);
  sh.clear();
  sh.clearConditionalFormatRules();
  let fila = 1;

  sh.getRange(fila, 1).setValue('Tablero de administración').setFontSize(18).setFontWeight('bold').setFontColor('#1f4e78');
  sh.getRange(fila, 5).setValue('Actualizado: ' + Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'dd/MM/yyyy HH:mm'))
    .setFontColor('#80868b');
  fila += 2;

  // Resumen
  fila = titulo_(sh, fila, 'Resumen');
  const resumen = [
    ['', 'ARS', 'USD'],
    ['Pendiente de cobro', R.cobrarARS, R.cobrarUSD],
    ['Pendiente de pago', R.pagarARS, R.pagarUSD],
    ['Saldo de Caja', R.cajaARS, R.cajaUSD],
    ['Ingresos del mes (Caja)', R.mesIngARS, R.mesIngUSD],
    ['Egresos del mes (Caja)', R.mesEgrARS, R.mesEgrUSD]
  ];
  sh.getRange(fila, 1, resumen.length, 3).setValues(resumen);
  sh.getRange(fila, 1, 1, 3).setFontWeight('bold').setBackground('#e8f0fe');
  sh.getRange(fila + 1, 1, resumen.length - 1, 1).setFontWeight('bold');
  sh.getRange(fila + 1, 2, resumen.length - 1, 1).setNumberFormat(FMT.ARS);
  sh.getRange(fila + 1, 3, resumen.length - 1, 1).setNumberFormat(FMT.USD);
  sh.getRange(fila + 3, 1, 1, 3).setBackground('#fff8e1');
  fila += resumen.length + 1;

  // Cobros pendientes
  fila = titulo_(sh, fila, 'Trabajos esperando el pago / cobros pendientes (' + R.cobros.length + ')');
  fila = tabla_(sh, fila,
    ['Concepto', 'Cliente', 'Estado', 'Fecha', 'Días de espera', 'Pendiente ARS', 'Pendiente USD'],
    R.cobros.map(function (c) { return [c.concepto, c.cliente, c.estado, c.fecha || '', c.dias, c.ars || '', c.usd || '']; }),
    [null, null, null, FMT.FECHA, '0', FMT.ARS, FMT.USD], 'No hay cobros pendientes.');

  // CxP vencidas
  fila = titulo_(sh, fila, 'Pagos vencidos (' + R.vencidas.length + ')', '#a50e0e');
  fila = tabla_(sh, fila,
    ['Concepto', 'Proveedor', 'Vencimiento', 'Días de atraso', 'Medio de pago', 'Importe ARS', 'Importe USD'],
    R.vencidas.map(function (c) { return [c.concepto, c.proveedor, c.vencimiento || '', c.dias === '' ? '' : -c.dias, c.medio, c.ars || '', c.usd || '']; }),
    [null, null, FMT.FECHA, '0', null, FMT.ARS, FMT.USD], 'No hay pagos vencidos.', '#fce8e6');

  // CxP próximas
  fila = titulo_(sh, fila, 'Pagos que vencen en los próximos ' + R.dias + ' días (' + R.proximas.length + ')', '#b06000');
  fila = tabla_(sh, fila,
    ['Concepto', 'Proveedor', 'Vencimiento', 'Faltan (días)', 'Medio de pago', 'Importe ARS', 'Importe USD'],
    R.proximas.map(function (c) { return [c.concepto, c.proveedor, c.vencimiento, c.dias, c.medio, c.ars || '', c.usd || '']; }),
    [null, null, FMT.FECHA, '0', null, FMT.ARS, FMT.USD], 'No hay vencimientos próximos.', '#fef7e0');

  // Gastos del mes
  const cats = Object.keys(R.gastosMes);
  fila = titulo_(sh, fila, 'Gastos del mes por categoría');
  tabla_(sh, fila, ['Categoría', 'ARS', 'USD'],
    cats.map(function (k) { return [k, R.gastosMes[k].ars, R.gastosMes[k].usd]; }),
    [null, FMT.ARS, FMT.USD], 'No hay gastos cargados este mes.');

  sh.setColumnWidth(1, 300); sh.setColumnWidth(2, 180); sh.setColumnWidth(3, 170);
  sh.setColumnWidth(4, 110); sh.setColumnWidth(5, 120); sh.setColumnWidth(6, 140); sh.setColumnWidth(7, 140);
  sh.setHiddenGridlines(true);
  if (silencioso !== true && VINCULADO_) {
    ss.setActiveSheet(sh);
    toast_('Tablero actualizado.', 'Administración', 4);
  }
}

function titulo_(sh, fila, texto, color) {
  sh.getRange(fila, 1).setValue(texto).setFontSize(13).setFontWeight('bold').setFontColor(color || '#1f4e78');
  return fila + 1;
}

function tabla_(sh, fila, enc, filas, formatos, vacio, fondo) {
  sh.getRange(fila, 1, 1, enc.length).setValues([enc])
    .setFontWeight('bold').setBackground('#1f4e78').setFontColor('#ffffff');
  fila++;
  if (!filas.length) {
    sh.getRange(fila, 1).setValue(vacio).setFontColor('#80868b').setFontStyle('italic');
    return fila + 2;
  }
  sh.getRange(fila, 1, filas.length, enc.length).setValues(filas);
  formatos.forEach(function (f, i) { if (f) sh.getRange(fila, i + 1, filas.length, 1).setNumberFormat(f); });
  if (fondo) sh.getRange(fila, 1, filas.length, enc.length).setBackground(fondo);
  return fila + filas.length + 1;
}

// ----------------------------------------------------------------------------
//  RECORDATORIO DIARIO POR EMAIL
// ----------------------------------------------------------------------------

function activarRecordatorio() {
  verificarEstructura_();
  desactivarRecordatorios(true);
  let hora = parseInt(getParam_('Hora del recordatorio (0-23)', 8), 10);
  if (isNaN(hora) || hora < 0 || hora > 23) hora = 8;
  ScriptApp.newTrigger('enviarRecordatorioDiario').timeBased().everyDays(1).atHour(hora).create();
  const ui = ui_();
  ui.alert('Recordatorio activado',
    'Todos los días alrededor de las ' + hora + ' hs vas a recibir un email a ' + emailDestino_() +
    ' con los vencimientos y cobros pendientes (sólo si hay algo para avisar).\n\n' +
    'La hora y el email se cambian en la hoja Config (después volvé a activar el recordatorio).', ui.ButtonSet.OK);
}

function desactivarRecordatorios(silencioso) {
  let n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'enviarRecordatorioDiario') { ScriptApp.deleteTrigger(t); n++; }
  });
  if (silencioso !== true) {
    const ui = ui_();
    ui.alert('Recordatorios', n ? 'Recordatorio diario desactivado.' : 'No había recordatorios activos.', ui.ButtonSet.OK);
  }
}

function emailDestino_() {
  const cfg = String(getParam_('Email para recordatorios', '') || '').trim();
  if (cfg) return cfg;
  return Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail();
}

/** La ejecuta el activador diario. También se puede correr a mano para probar. */
function enviarRecordatorioDiario() {
  const ss = libro_();
  actualizarVencidas_();
  sincronizarCaja(true);
  const R = calcularResumen_();
  const esperando = R.cobros.filter(function (c) { return c.estado === 'Esperando el pago'; });
  if (!R.vencidas.length && !R.proximas.length && !esperando.length) return; // nada para avisar

  const tz = ss.getSpreadsheetTimeZone();
  const f = function (d) { return d ? Utilities.formatDate(d, tz, 'dd/MM/yyyy') : '—'; };
  const imp = function (a, u) {
    const p = [];
    if (a) p.push('$ ' + formatoNumero_(a));
    if (u) p.push('US$ ' + formatoNumero_(u));
    return p.join(' + ') || '—';
  };
  const tablaHtml = function (enc, filas) {
    return '<table style="border-collapse:collapse;font-family:Arial;font-size:13px">' +
      '<tr>' + enc.map(function (h) { return '<th style="background:#1f4e78;color:#fff;padding:4px 8px;text-align:left">' + h + '</th>'; }).join('') + '</tr>' +
      filas.map(function (r) { return '<tr>' + r.map(function (c) { return '<td style="border-bottom:1px solid #ddd;padding:4px 8px">' + esc_(c) + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</table>';
  };

  let html = '<div style="font-family:Arial;font-size:14px">';
  html += '<h2 style="color:#1f4e78">Resumen administrativo — ' + f(hoy_()) + '</h2>';
  if (R.vencidas.length) {
    html += '<h3 style="color:#a50e0e">Pagos vencidos (' + R.vencidas.length + ')</h3>' +
      tablaHtml(['Concepto', 'Proveedor', 'Vencimiento', 'Importe'],
        R.vencidas.map(function (c) { return [c.concepto, c.proveedor, f(c.vencimiento), imp(c.ars, c.usd)]; }));
  }
  if (R.proximas.length) {
    html += '<h3 style="color:#b06000">Vencen en los próximos ' + R.dias + ' días (' + R.proximas.length + ')</h3>' +
      tablaHtml(['Concepto', 'Proveedor', 'Vencimiento', 'Importe'],
        R.proximas.map(function (c) { return [c.concepto, c.proveedor, f(c.vencimiento), imp(c.ars, c.usd)]; }));
  }
  if (esperando.length) {
    html += '<h3 style="color:#1f4e78">Trabajos esperando el pago (' + esperando.length + ')</h3>' +
      tablaHtml(['Concepto', 'Cliente', 'Días de espera', 'Pendiente'],
        esperando.map(function (c) { return [c.concepto, c.cliente, c.dias, imp(c.ars, c.usd)]; }));
  }
  html += '<p><b>Pendiente de cobro:</b> ' + imp(R.cobrarARS, R.cobrarUSD) +
    '<br><b>Pendiente de pago:</b> ' + imp(R.pagarARS, R.pagarUSD) +
    '<br><b>Saldo de Caja:</b> $ ' + formatoNumero_(R.cajaARS) + ' / US$ ' + formatoNumero_(R.cajaUSD) + '</p>';
  html += '<p><a href="' + ss.getUrl() + '">Abrir la planilla</a></p></div>';

  const asunto = 'Administración: ' + R.vencidas.length + ' vencidos, ' + R.proximas.length + ' por vencer, ' +
    esperando.length + ' cobros esperando el pago';
  MailApp.sendEmail({ to: emailDestino_(), subject: asunto, htmlBody: html });
}

// ----------------------------------------------------------------------------
//  IMPORTACIÓN AUTOMÁTICA DE PAGOS DE MERCADO PAGO (desde Gmail)
//
//  Lee los mails "Pago aprobado en …" que manda Mercado Pago y carga cada pago
//  como una fila en Gastos (y por lo tanto en Caja). Los mails ya leídos quedan
//  con la etiqueta ERP-procesado; los que no se pudieron leer, con ERP-revisar.
//  OJO: GmailApp lee el Gmail de la cuenta dueña del script. Si los mails de
//  Mercado Pago llegan a otra casilla, reenviálos con un filtro (ver INSTRUCCIONES.md).
// ----------------------------------------------------------------------------

/** Búsqueda de Gmail para encontrar los comprobantes (se puede ajustar). */
const MP_BUSQUEDA = 'subject:"Pago aprobado" (from:mercadopago OR "Pago procesado por Mercado Pago") newer_than:7d';
const MP_ETIQUETA_OK = 'ERP-procesado';
const MP_ETIQUETA_REVISAR = 'ERP-revisar';
const MP_NOTA = 'Importado de Mercado Pago';

/**
 * Cómo se llama en tu Config cada medio de pago que aparece en el mail.
 * Se revisa en orden: la primera expresión que coincide con el texto del medio gana.
 * Si ninguna coincide, se guarda el texto del mail tal cual (y revisarDatosIncompletos lo marca).
 */
const MP_MEDIOS = [
  [/tarjeta mercado pago|mercado pago cr[eé]dito/i, 'Master Elio Mercado Pago'],
  [/dinero (disponible|en cuenta)|saldo|mercado pago d[eé]bito/i, 'Elio Mercado Pago'],
  [/galicia/i, 'Visa Elio Galicia'],
  [/brubank/i, 'Brubank Elio'],
  [/\bbna\b|banco naci[oó]n/i, 'BNA+ Elio'],
  [/master ?card|\bmaster\b/i, 'Master Elio Mercado Pago']
];

/**
 * Categoría según el comercio (o el texto del mail). La primera regla que coincide gana.
 * Si la categoría no existe en Config (columna B), se agrega sola.
 * Si ninguna coincide, la categoría queda vacía y aparece en la hoja Problemas.
 */
const MP_CATEGORIAS = [
  [/\bgnc\b|ypf|shell|axion|puma energy|\bnafta|combustible|estaci[oó]n de servicio|servicentro|petrol/i, 'Combustible'],
  [/edemsa|aysam|agua y saneamiento|ecogas|cuyana|\bitc\b/i, 'Casa']
];

const MP_MESES = { enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6, agosto: 7,
  septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11 };

/** La ejecuta el activador cada 15 minutos. También se puede correr a mano desde el editor o el menú. */
function importarMercadoPago() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { Logger.log('Otra importación está en curso; se saltea esta.'); return 0; }
  try {
    verificarEstructura_();
    const sh = hoja_(H.GASTOS);
    const tz = libro_().getSpreadsheetTimeZone();
    const etOk = GmailApp.getUserLabelByName(MP_ETIQUETA_OK) || GmailApp.createLabel(MP_ETIQUETA_OK);
    const etRev = GmailApp.getUserLabelByName(MP_ETIQUETA_REVISAR) || GmailApp.createLabel(MP_ETIQUETA_REVISAR);
    const hilos = GmailApp.search(MP_BUSQUEDA + ' -label:' + MP_ETIQUETA_OK + ' -label:' + MP_ETIQUETA_REVISAR, 0, 50);
    if (!hilos.length) { Logger.log('Mercado Pago: no hay comprobantes nuevos.'); return 0; }

    let yaCargados = notasGastos_(); // texto de todas las notas, para no duplicar
    const categorias = listaConfig_(2);
    const filas = [];
    const errores = [];

    hilos.forEach(function (hilo) {
      let fallo = false;
      hilo.getMessages().forEach(function (msg) {
        const idMsg = msg.getId();
        if (yaCargados.indexOf(idMsg) !== -1) return;
        let p;
        try {
          p = parsearMailMercadoPago_(msg.getSubject(), cuerpoMail_(msg), msg.getDate());
        } catch (e) {
          fallo = true;
          errores.push('"' + msg.getSubject() + '" (' + Utilities.formatDate(msg.getDate(), tz, 'dd/MM/yyyy HH:mm') + '): ' + e.message);
          return;
        }
        if (p.operacion && yaCargados.indexOf('Op ' + p.operacion) !== -1) return; // mismo pago reenviado
        if (p.categoria && categorias.indexOf(p.categoria) === -1) { agregarCategoria_(p.categoria); categorias.push(p.categoria); }
        filas.push({
          'Fecha': p.fecha,
          'Concepto': p.comercio,
          'Categoría': p.categoria,
          'Proveedor': p.comercio,
          'Importe ARS': p.moneda === 'ARS' ? p.importe : '',
          'Importe USD': p.moneda === 'USD' ? p.importe : '',
          'Medio de pago': p.medio,
          'Notas': MP_NOTA + ' · ' + p.medioTexto + (p.operacion ? ' · Op ' + p.operacion : '') + ' · Gmail ' + idMsg
        });
        yaCargados += ' ' + idMsg + (p.operacion ? ' Op ' + p.operacion : '');
      });
      hilo.addLabel(fallo ? etRev : etOk);
    });

    if (filas.length) {
      const desde = sh.getLastRow() + 1;
      filas.forEach(function (f) { agregarFila_(H.GASTOS, f); });
      const m = mapa_(sh);
      if (m['Fecha']) sh.getRange(desde, m['Fecha'], filas.length, 1).setNumberFormat(FMT.FECHA);
      if (m['Importe ARS']) sh.getRange(desde, m['Importe ARS'], filas.length, 1).setNumberFormat(FMT.ARS);
      if (m['Importe USD']) sh.getRange(desde, m['Importe USD'], filas.length, 1).setNumberFormat(FMT.USD);
      procesarFilas_(sh, desde, sh.getLastRow()); // asigna ID y pasa los gastos a Caja
      sincronizarCaja(true);
      actualizarTablero(true);
    }

    const resumen = 'Mercado Pago: ' + filas.length + ' pago(s) cargado(s) en Gastos' +
      (errores.length ? ', ' + errores.length + ' mail(s) sin poder leer (etiqueta ' + MP_ETIQUETA_REVISAR + ')' : '') + '.';
    Logger.log(resumen);
    errores.forEach(function (e) { Logger.log('  No se pudo leer ' + e); });
    if (filas.length || errores.length) toast_(resumen, 'Mercado Pago', 8);
    return filas.length;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Extrae los datos de un comprobante de Mercado Pago. No usa servicios de Google (se puede probar aparte).
 * Devuelve { fecha, comercio, importe, moneda, medio, medioTexto, ultimos4, operacion, categoria }.
 * Lanza un error si no encuentra el importe o el comercio.
 */
function parsearMailMercadoPago_(asunto, cuerpo, fechaMail) {
  const txt = String(cuerpo || '').replace(/\r/g, '').replace(/\u00a0/g, ' ');
  const lineas = txt.split('\n').map(function (l) { return l.replace(/\s+/g, ' ').trim(); }).filter(String);
  const plano = lineas.join('\n');

  // Importe: "Pagaste $ 146.970,50" o "Pagaste US$ 22,39"
  const mi = plano.match(/Pagaste\s*(US\$|U\$S|\$)\s*([\d.]+(?:,\d{1,2})?)/i);
  if (!mi) throw new Error('no encontré el importe ("Pagaste $ …")');
  const moneda = /U/i.test(mi[1]) ? 'USD' : 'ARS';
  const importe = num_(mi[2]);
  if (!importe) throw new Error('importe inválido: ' + mi[2]);

  // Comercio: "Le compraste a Edemsa" (el mail lo repite pegado) o el asunto "Pago aprobado en Edemsa"
  let comercio = '';
  const mc = plano.match(/Le (?:compraste|pagaste) a\s+(.+?)(?=Le (?:compraste|pagaste) a|\n|$)/i);
  if (mc) comercio = mc[1].trim();
  if (!comercio) {
    const ma = String(asunto || '').match(/Pago aprobado (?:en|a)\s+(.+)$/i);
    if (ma) comercio = ma[1].trim();
  }
  comercio = comercio.replace(/[\s.\-]+$/, '').trim();
  if (!comercio) throw new Error('no encontré el comercio');

  // Medio: la primera línea con texto después del importe
  let medioTexto = '';
  const iImp = lineas.findIndex(function (l) { return /Pagaste\s*(US\$|U\$S|\$)/i.test(l); });
  for (let i = iImp + 1; i < lineas.length && i <= iImp + 4; i++) {
    const l = lineas[i];
    if (/cuota|Si necesit|Nombre en el resumen|operaci[oó]n|Pago procesado/i.test(l)) break;
    medioTexto = l; break;
  }
  const m4 = medioTexto.match(/\*+\s*(\d{4})/);
  const ultimos4 = m4 ? m4[1] : '';
  medioTexto = medioTexto.replace(/\*+\s*\d{4}/, ultimos4 ? '****' + ultimos4 : '').trim();
  let medio = medioTexto;
  for (let i = 0; i < MP_MEDIOS.length; i++) {
    if (MP_MEDIOS[i][0].test(medioTexto)) { medio = MP_MEDIOS[i][1]; break; }
  }

  // N° de operación: "N.° de operación 181380678755" o el link "activities?q=187981162529"
  let operacion = '';
  const mo = plano.match(/N\.?\s*[°º]?\s*de operaci[oó]n\s*\n?\s*(\d{6,})/i) || plano.match(/activities\?q=(\d{6,})/i);
  if (mo) operacion = mo[1];

  // Fecha: "Fecha y hora 4 de octubre a las 17:37 hs" (sin año) o la fecha del mail
  const base = (fechaMail && typeof fechaMail.getTime === 'function' && !isNaN(fechaMail.getTime())) ? fechaMail : new Date();
  let fecha = null;
  const mf = plano.match(/(\d{1,2}) de ([a-záéíóú]+)(?: de (\d{4}))? a las \d{1,2}:\d{2}/i);
  if (mf && MP_MESES[mf[2].toLowerCase()] !== undefined) {
    const mes = MP_MESES[mf[2].toLowerCase()];
    let anio = mf[3] ? +mf[3] : base.getFullYear();
    if (!mf[3] && mes > base.getMonth()) anio--; // pago de diciembre informado en enero
    fecha = new Date(anio, mes, +mf[1]);
  }
  if (!fecha) fecha = new Date(base.getFullYear(), base.getMonth(), base.getDate());

  let categoria = '';
  const claveCat = comercio + ' ' + String(asunto || '');
  for (let i = 0; i < MP_CATEGORIAS.length; i++) {
    if (MP_CATEGORIAS[i][0].test(claveCat)) { categoria = MP_CATEGORIAS[i][1]; break; }
  }

  return { fecha: fecha, comercio: comercio, importe: importe, moneda: moneda, medio: medio,
    medioTexto: medioTexto, ultimos4: ultimos4, operacion: operacion, categoria: categoria };
}

/** Cuerpo del mail en texto: el texto plano y, si viene vacío, el HTML sin etiquetas. */
function cuerpoMail_(msg) {
  let t = '';
  try { t = msg.getPlainBody(); } catch (e) {}
  if (t && /Pagaste/i.test(t)) return t;
  const html = msg.getBody() || '';
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|td|h\d|li|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&deg;/gi, '°').replace(/&middot;/gi, '·')
    .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(+n); });
}

/** Todas las notas de Gastos juntas en un texto (para detectar mails ya importados). */
function notasGastos_() {
  const sh = hoja_(H.GASTOS);
  const m = mapa_(sh);
  if (!m['Notas'] || sh.getLastRow() < 2) return '';
  return sh.getRange(2, m['Notas'], sh.getLastRow() - 1, 1).getValues()
    .map(function (r) { return String(r[0]); }).join(' ');
}

/** Agrega una categoría al final de la columna B de Config. */
function agregarCategoria_(nombre) {
  const sh = hoja_(H.CONFIG);
  const vals = sh.getRange(2, 2, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
  let ultima = 1;
  vals.forEach(function (r, i) { if (String(r[0]).trim()) ultima = i + 2; });
  sh.getRange(ultima + 1, 2).setValue(nombre);
  Logger.log('Se agregó la categoría "' + nombre + '" en Config.');
}

/** Crea el activador que importa los pagos de Mercado Pago cada 15 minutos (sin duplicarlo). */
function activarImportacionMercadoPago() {
  verificarEstructura_();
  desactivarImportacionMercadoPago(true);
  GmailApp.getUserLabelByName(MP_ETIQUETA_OK) || GmailApp.createLabel(MP_ETIQUETA_OK); // pide el permiso de Gmail ahora
  ScriptApp.newTrigger('importarMercadoPago').timeBased().everyMinutes(15).create();
  const n = importarMercadoPago();
  const ui = ui_();
  ui.alert('Importación de Mercado Pago activada',
    'Cada 15 minutos se van a leer los mails "Pago aprobado" de Mercado Pago de ' + Session.getEffectiveUser().getEmail() +
    ' y se van a cargar en Gastos y Caja.\n\nAhora mismo se cargaron ' + n + ' pago(s).', ui.ButtonSet.OK);
}

function desactivarImportacionMercadoPago(silencioso) {
  let n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'importarMercadoPago') { ScriptApp.deleteTrigger(t); n++; }
  });
  if (silencioso !== true) {
    const ui = ui_();
    ui.alert('Mercado Pago', n ? 'Importación automática desactivada.' : 'La importación automática no estaba activa.', ui.ButtonSet.OK);
  }
}

// ----------------------------------------------------------------------------
//  NOTIFICACIONES DE MERCADO PAGO EN EL CELULAR (Android + MacroDroid)
//
//  MacroDroid lee cada notificación de la app Mercado Pago ("Pagaste $ 15.000
//  en YPF…") y la manda por HTTP a este script publicado como Aplicación web.
//  doPost la valida con un token secreto, la interpreta y la carga en Gastos
//  (y por lo tanto en Caja). Pasos completos en INSTRUCCIONES.md.
// ----------------------------------------------------------------------------

/** Medio de pago cuando la notificación no dice con qué pagaste (se puede pisar con la propiedad del script del mismo nombre). */
const MP_MEDIO_NOTIF_DEFECTO = 'Master Elio Mercado Pago';
const MP_NOTA_NOTIF = 'Importado de notificación MP';
const MP_NOTIF_PAQUETE = 'com.mercadopago.wallet';
/** Si es true, "Transferiste $ X a Juan" también se carga como gasto (por defecto se ignora). */
const MP_NOTIF_INCLUIR_TRANSFERENCIAS = false;
/** Ventana para descartar la misma notificación repetida (mismo importe y comercio). */
const MP_NOTIF_VENTANA_SEG = 180;
/** Si es false, no se recalcula el Tablero en cada notificación (responde más rápido). */
const MP_NOTIF_ACTUALIZAR_TABLERO = true;
const MP_NOTIF_PROP_TOKEN = 'MP_WEBHOOK_TOKEN';
const MP_NOTIF_PROP_PENDIENTES = 'MP_NOTIF_PENDIENTES';

/** Medios que aparecen en las notificaciones; se revisan antes que MP_MEDIOS. */
const MP_MEDIOS_NOTIF = [
  [/d[eé]bito[^,.]*mercado ?pago|mercado ?pago[^,.]*d[eé]bito|dinero (disponible|en cuenta)|\bsaldo\b|tu cuenta de mercado ?pago/i, 'Elio Mercado Pago'],
  [/cr[eé]dito[^,.]*mercado ?pago|mercado ?pago[^,.]*cr[eé]dito|tarjeta mercado ?pago/i, 'Master Elio Mercado Pago']
];

/** No son gastos: cobros, transferencias recibidas, rechazos, devoluciones, códigos, promociones. */
const MP_NOTIF_IGNORAR = /recibiste|te (transfiri|envi|pag|devolvi|deposit|acredit|reintegr)|cobraste|ingres(ó|aron|o) (dinero|plata|\$)|rendimiento|ganaste|reintegro|devoluci[oó]n|reembols|rechaz|no se pudo|no pudimos|no fue aprobad|cancel|c[oó]digo (de )?(seguridad|verificaci[oó]n|acceso)|tu c[oó]digo|inici(a|á|aste|o|ó) (de )?sesi[oó]n|\bpag[aá]\b|\bpagalo|\bpagal[ao]s\b|\bdevolv/i;
const MP_NOTIF_TRANSFER = /transferiste|enviaste (dinero|plata|\$)/i;
/** Señales de que la notificación es un pago hecho por vos. */
const MP_NOTIF_PAGO = /pagaste|compraste|abonaste|recargaste|tu pago|tu compra|pago (con qr |con c[oó]digo qr )?aprobado|se aprob[oó] (tu|el) (pago|compra)|realizaste (un|el) pago|d[eé]bito autom[aá]tico/i;
/** Importe: "$ 15.000", "$15.000,50", "US$ 22.18", "U$S 10". */
const MP_NOTIF_IMPORTE = /(US\$|U\$S|U\$D|USD|ARS|\$)\s*(\d[\d.]*(?:,\d{1,2})?)/i;

// ---------------- Web App ----------------

function doPost(e) { return recibirNotificacionMP_(e, 'POST'); }
function doGet(e) { return recibirNotificacionMP_(e, 'GET'); }

/** Punto de entrada común. Nunca lanza errores: siempre responde JSON. */
function recibirNotificacionMP_(e, metodo) {
  let res;
  try {
    const p = paramsNotif_(e);
    const guardado = PropertiesService.getScriptProperties().getProperty(MP_NOTIF_PROP_TOKEN) || '';
    if (!guardado || !compararSeguro_(String(p.token || ''), guardado)) {
      Logger.log('[Notificación MP] Rechazada por token inválido (' + metodo + ').');
      return json_({ ok: false, error: 'token inválido' });
    }
    if (!p.titulo && !p.texto) return json_({ ok: true, accion: 'ping', mensaje: 'Conexión correcta con el ERP.' });
    res = procesarNotificacionMP_(p, String(p.prueba || '') === '1');
  } catch (err) {
    Logger.log('[Notificación MP] Error inesperado: ' + (err && err.stack || err));
    res = { ok: false, error: String(err && err.message || err) };
  }
  return json_(res);
}

/** Junta los parámetros de la URL, del formulario (x-www-form-urlencoded) o de un cuerpo JSON. */
function paramsNotif_(e) {
  const p = {};
  if (e && e.parameter) Object.keys(e.parameter).forEach(function (k) { p[k] = e.parameter[k]; });
  if (e && e.postData && e.postData.contents && /json/i.test(e.postData.type || '')) {
    try {
      const j = JSON.parse(e.postData.contents);
      Object.keys(j).forEach(function (k) { if (p[k] === undefined) p[k] = j[k]; });
    } catch (err) { Logger.log('[Notificación MP] El cuerpo no es JSON válido.'); }
  }
  ['token', 'titulo', 'texto', 'app', 'paquete', 'fecha', 'prueba'].forEach(function (k) {
    p[k] = p[k] === undefined || p[k] === null ? '' : String(p[k]);
    // Si MacroDroid no reemplazó la variable, llega literal: "{not_title}" o "[notification]"
    if (/^[\[{][a-z_]+[\]}]$/i.test(p[k].trim())) p[k] = '';
  });
  return p;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Compara sin cortar en el primer carácter distinto (no da pistas por tiempo de respuesta). */
function compararSeguro_(a, b) {
  a = String(a); b = String(b);
  let dif = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) dif |= (a.charCodeAt(i % (a.length || 1)) || 0) ^ (b.charCodeAt(i % (b.length || 1)) || 0);
  return dif === 0 && a.length > 0;
}

/**
 * Interpreta y (si no es prueba) carga la notificación. Devuelve el resultado para la respuesta JSON.
 * p: { titulo, texto, app, paquete, fecha }
 */
function procesarNotificacionMP_(p, soloPrueba) {
  const resumenTxt = (p.titulo + ' | ' + p.texto).slice(0, 300);
  if ((p.paquete && p.paquete !== MP_NOTIF_PAQUETE && !/mercado ?pago/i.test(p.paquete)) ||
      (!p.paquete && p.app && !/mercado ?pago/i.test(p.app))) {
    Logger.log('[Notificación MP] Ignorada: no es de Mercado Pago (' + (p.paquete || p.app) + ').');
    return { ok: true, accion: 'ignorada', motivo: 'no es de Mercado Pago' };
  }
  let d;
  try {
    d = parsearNotificacionMP_(p.titulo, p.texto);
  } catch (err) {
    Logger.log('[Notificación MP][REVISAR] ' + err.message + ' → ' + resumenTxt);
    if (!soloPrueba) registrarNotifNoLeida_(p, err.message);
    return { ok: true, accion: 'revisar', motivo: err.message };
  }
  if (!d) {
    Logger.log('[Notificación MP] Ignorada (no es un pago): ' + resumenTxt);
    return { ok: true, accion: 'ignorada', motivo: 'no es un pago' };
  }
  const fecha = fechaNotif_(p.fecha);
  if (soloPrueba) {
    Logger.log('[Notificación MP][PRUEBA] ' + JSON.stringify(d));
    return { ok: true, accion: 'prueba', datos: d };
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return { ok: false, error: 'ocupado, reintentá' };
  try {
    const clave = claveNotif_(d);
    const cache = CacheService.getScriptCache();
    if (cache.get(clave)) {
      Logger.log('[Notificación MP] Duplicada (misma en menos de ' + MP_NOTIF_VENTANA_SEG + ' s): ' + resumenTxt);
      return { ok: true, accion: 'duplicada' };
    }
    verificarEstructura_();
    const tz = libro_().getSpreadsheetTimeZone();
    // Respaldo por si la caché se vació: misma clave en una nota de los últimos 3 minutos
    const marca = Utilities.formatDate(new Date(), tz, 'yyyyMMddHHmm');
    const notas = notasGastos_();
    for (let i = 0; i <= Math.ceil(MP_NOTIF_VENTANA_SEG / 60); i++) {
      const t = Utilities.formatDate(new Date(Date.now() - i * 60000), tz, 'yyyyMMddHHmm');
      if (notas.indexOf(clave + '@' + t) !== -1) { cache.put(clave, '1', MP_NOTIF_VENTANA_SEG); return { ok: true, accion: 'duplicada' }; }
    }
    if (d.categoria && listaConfig_(2).indexOf(d.categoria) === -1) agregarCategoria_(d.categoria);
    const sh = hoja_(H.GASTOS);
    const fila = agregarFila_(H.GASTOS, {
      'Fecha': fecha,
      'Concepto': d.comercio,
      'Categoría': d.categoria,
      'Proveedor': d.comercio,
      'Importe ARS': d.moneda === 'ARS' ? d.importe : '',
      'Importe USD': d.moneda === 'USD' ? d.importe : '',
      'Medio de pago': d.medio,
      'Notas': MP_NOTA_NOTIF + ' · ' + (d.medioTexto || 'medio no informado') + ' · ' +
        Utilities.formatDate(new Date(), tz, 'HH:mm') + ' · ' + clave + '@' + marca
    });
    const m = mapa_(sh);
    if (m['Fecha']) sh.getRange(fila, m['Fecha']).setNumberFormat(FMT.FECHA);
    if (m['Importe ARS']) sh.getRange(fila, m['Importe ARS']).setNumberFormat(FMT.ARS);
    if (m['Importe USD']) sh.getRange(fila, m['Importe USD']).setNumberFormat(FMT.USD);
    cache.put(clave, '1', MP_NOTIF_VENTANA_SEG);
    procesarFilas_(sh, fila, fila); // asigna ID y pasa el gasto a Caja
    try {
      sincronizarCaja(true);
      if (MP_NOTIF_ACTUALIZAR_TABLERO) actualizarTablero(true);
    } catch (err) { Logger.log('[Notificación MP] Gasto cargado, pero falló Caja/Tablero: ' + err.message); }
    Logger.log('[Notificación MP] Cargado en Gastos fila ' + fila + ': ' + d.comercio + ' ' + d.moneda + ' ' + d.importe + ' (' + d.medio + ')');
    return { ok: true, accion: 'cargada', fila: fila, comercio: d.comercio, importe: d.importe, moneda: d.moneda, medio: d.medio, categoria: d.categoria };
  } finally {
    lock.releaseLock();
  }
}

/** Clave para detectar repetidas: moneda + importe + comercio normalizado. */
function claveNotif_(d) {
  const com = String(d.comercio).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  return 'MPN-' + d.moneda + Math.round(d.importe * 100) + '-' + com.slice(0, 30);
}

/** Fecha opcional: milisegundos ({not_timestamp}), "dd/mm/aaaa", "aaaa-mm-dd" o ISO. Si no hay, hoy. */
function fechaNotif_(v) {
  v = String(v || '').trim();
  let d = null;
  if (/^\d{12,14}$/.test(v)) d = new Date(+v);
  else if (v) d = asFecha_(v.slice(0, 10)) || asFecha_(v) || (isNaN(new Date(v).getTime()) ? null : new Date(v));
  if (!d || isNaN(d.getTime())) d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// ---------------- Parser (sin servicios de Google: se prueba con node) ----------------

/**
 * Interpreta una notificación de Mercado Pago.
 * Devuelve { comercio, importe, moneda, medio, medioTexto, categoria } si es un pago,
 * null si no es un gasto (cobros, transferencias recibidas, promociones…),
 * y lanza un error si parece un pago pero no se puede leer.
 */
function parsearNotificacionMP_(titulo, texto) {
  const limpiar = function (s) { return String(s || '').replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').trim(); };
  titulo = limpiar(titulo); texto = limpiar(texto);
  const todo = (titulo && texto && texto.indexOf(titulo) === -1 ? titulo + '. ' + texto : (texto || titulo));
  if (!todo) return null;

  const esTransfer = MP_NOTIF_TRANSFER.test(todo);
  if (MP_NOTIF_IGNORAR.test(todo)) return null;
  if (esTransfer && !MP_NOTIF_INCLUIR_TRANSFERENCIAS) return null;
  const pareceAprobado = /aprob/i.test(todo);
  const mi = todo.match(MP_NOTIF_IMPORTE);
  if (!MP_NOTIF_PAGO.test(todo) && !esTransfer) return null;
  if (!mi) {
    if (pareceAprobado) throw new Error('parece un pago pero no trae el importe');
    return null; // "¿Ya pagaste tus servicios?" y similares
  }

  const moneda = /U/i.test(mi[1]) ? 'USD' : 'ARS';
  const importe = importeAR_(mi[2]);
  if (!importe) throw new Error('importe inválido: ' + mi[2]);

  // Comercio: se prueba en el texto y después en el título
  const IMP = '(?:US\\$|U\\$S|U\\$D|USD|ARS|\\$)\\s*\\d[\\d.]*(?:,\\d{1,2})?';
  const FIN = '(?=\\s+con\\s|\\s+en\\s+\\d+\\s+cuotas?|\\s+por\\s+' + IMP + '|\\s+(?:fue|se|ha sido|est[aá])\\s+aprob|,\\s*' + IMP + '|\\s*[!¡?|]|\\.\\s*$|\\.\\s+[A-ZÁÉÍÓÚÑ¿¡]|\\s+-\\s|$)';
  const patrones = [
    new RegExp('(?:le\\s+)?pagaste\\s+a\\s+(.+?),?\\s*' + IMP, 'i'),                         // Pagaste a MCD- Kaosanroad 2, US$ 22.18
    new RegExp('(?:pagaste|abonaste|transferiste|enviaste)\\s+' + IMP + '\\s+(?:con\\s+(?:c[oó]digo\\s+)?qr\\s+)?(?:a|en)\\s+(.+?)' + FIN, 'i'), // Pagaste $ 15.000 a YPF
    new RegExp('(?:tu\\s+)?(?:pago|compra)\\s+(?:con\\s+(?:c[oó]digo\\s+)?qr\\s+)?de\\s+' + IMP + '\\s+(?:a|en)\\s+(.+?)' + FIN, 'i'), // Tu pago de $ 1.234 a X fue aprobado
    new RegExp('compraste\\s+en\\s+(.+?)\\s+por\\s+' + IMP, 'i'),                           // Compraste en X por $ …
    new RegExp('(?:le\\s+)?(?:compraste|pagaste|abonaste)\\s+(?:a|en)\\s+(.+?)' + FIN, 'i'),  // Le compraste a X / Pagaste en X
    new RegExp('pagaste\\s+(?:tu\\s+|la\\s+|el\\s+)?(?:factura|servicio|boleta|cuota|impuesto)\\s+(?:de\\s+)?(.+?)\\s+(?:por|de)\\s+' + IMP, 'i'), // Pagaste tu factura de Edemsa por $ X
    new RegExp('recargaste\\s+' + IMP + '\\s+(?:a|en)\\s+(?:tu\\s+)?(.+?)' + FIN, 'i'),       // Recargaste $ 2.000 a tu SUBE
    new RegExp('pago\\s+(?:con\\s+(?:c[oó]digo\\s+)?qr\\s+)?aprobado\\s+(?:en|a)\\s+(.+?)' + FIN, 'i'), // Pago aprobado en X
    new RegExp('(?:pagaste|abonaste)\\s+' + IMP + '\\s+(?:a|en)\\s+(.+)$', 'i')
  ];
  let comercio = '';
  const fuentes = [texto, titulo, todo, (titulo + ' ' + texto).trim()]; // el último: título "Pagaste $ X" + texto "a COMERCIO…"
  for (let f = 0; f < fuentes.length && !comercio; f++) {
    if (!fuentes[f]) continue;
    for (let i = 0; i < patrones.length; i++) {
      const mc = fuentes[f].match(patrones[i]);
      if (mc && mc[1] && limpiarComercio_(mc[1])) { comercio = limpiarComercio_(mc[1]); break; }
    }
  }
  if (!comercio) throw new Error('no encontré el comercio');

  // Medio: "con tu Tarjeta de Crédito Mercado Pago", "con dinero disponible", "Mastercard **** 1234"…
  let medioTexto = '';
  const mm = todo.match(/\bcon\s+(?:tu|tus|el|la|su)?\s*((?:tarjeta|dinero|saldo|master ?card|visa|amex|american|cabal|naranja|d[eé]bito|cr[eé]dito|cuotas sin tarjeta|mercado ?cr[eé]dito|qr)[^.,!|]*)/i) ||
    todo.match(/((?:tarjeta|master ?card|visa)\s[^.,!|]*|dinero disponible|dinero en cuenta)/i);
  if (mm) medioTexto = limpiar(mm[1]).replace(/\s+(en\s+\d+\s+cuotas?.*)$/i, '');
  if (/^qr\b/i.test(medioTexto)) medioTexto = '';
  let medio = '';
  if (medioTexto) {
    const reglas = MP_MEDIOS_NOTIF.concat(MP_MEDIOS);
    for (let i = 0; i < reglas.length; i++) {
      if (reglas[i][0].test(medioTexto)) { medio = reglas[i][1]; break; }
    }
    // "con tu tarjeta de crédito" sin banco: es tu Mastercard de Mercado Pago (medio por defecto)
    if (!medio && /^(tarjeta( de)? cr[eé]dito|cr[eé]dito)\s*$/i.test(medioTexto)) medio = medioNotifDefecto_();
    if (!medio) medio = medioTexto;
  }
  if (!medio && esTransfer) medio = 'Elio Mercado Pago';
  if (!medio) medio = medioNotifDefecto_();

  let categoria = '';
  for (let i = 0; i < MP_CATEGORIAS.length; i++) {
    if (MP_CATEGORIAS[i][0].test(comercio + ' ' + todo)) { categoria = MP_CATEGORIAS[i][1]; break; }
  }
  return { comercio: comercio, importe: importe, moneda: moneda, medio: medio, medioTexto: medioTexto, categoria: categoria };
}

function limpiarComercio_(s) {
  return String(s || '')
    .replace(/^\s*(?:el comercio|la tienda|el local)\s+/i, '')
    .replace(/^(?:MERPAGO|MERCADOPAGO|MP)\s*\*\s*/i, '')
    .replace(/\s+con\s+(?:tu|tus|el|la)\s.*$/i, '')
    .replace(/["“”]/g, '')
    .replace(/[\s.,;:\-–]+$/, '')
    .replace(/^[\s.,;:\-–]+/, '')
    .trim()
    .slice(0, 80);
}

/** "15.000" → 15000 · "15.000,50" → 15000.5 · "22.18" → 22.18 · "1.234.567" → 1234567. */
function importeAR_(s) {
  s = String(s || '').replace(/\s/g, '').replace(/\.+$/, '');
  if (!s) return 0;
  if (s.indexOf(',') !== -1) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

function medioNotifDefecto_() {
  try {
    const v = PropertiesService.getScriptProperties().getProperty('MP_MEDIO_NOTIF_DEFECTO');
    if (v) return v;
  } catch (e) {}
  return MP_MEDIO_NOTIF_DEFECTO;
}

// ---------------- Notificaciones que no se pudieron leer ----------------

/** Guarda la notificación para revisarla (propiedad del script + fila en Problemas). Nunca lanza errores. */
function registrarNotifNoLeida_(p, motivo) {
  try {
    const props = PropertiesService.getScriptProperties();
    let lista = [];
    try { lista = JSON.parse(props.getProperty(MP_NOTIF_PROP_PENDIENTES) || '[]'); } catch (e) {}
    const item = { cuando: new Date().toISOString(), titulo: String(p.titulo).slice(0, 120), texto: String(p.texto).slice(0, 300), motivo: motivo };
    lista.push(item);
    props.setProperty(MP_NOTIF_PROP_PENDIENTES, JSON.stringify(lista.slice(-25)));
    const sh = libro_().getSheetByName(H.PROB);
    if (sh) sh.appendRow(filaProblemaNotif_(item));
  } catch (e) {
    Logger.log('[Notificación MP][REVISAR] No se pudo guardar para revisión: ' + e.message);
  }
}

function filaProblemaNotif_(item) {
  return ['Notificaciones MP', '', '', item.titulo || '(sin título)',
    'Notificación de Mercado Pago sin leer (' + item.motivo + '): "' + item.texto + '". Cargala con Nuevo gasto y después ejecutá limpiarNotificacionesNoLeidasMP.', 'Media', ''];
}

/** Para revisarDatosIncompletos: las notificaciones sin leer siguen apareciendo en Problemas hasta que las limpies. */
function problemasNotifMP_() {
  try {
    return JSON.parse(PropertiesService.getScriptProperties().getProperty(MP_NOTIF_PROP_PENDIENTES) || '[]')
      .map(function (it) { return filaProblemaNotif_(it).slice(0, 6); });
  } catch (e) { return []; }
}

function verNotificacionesNoLeidasMP() {
  const filas = problemasNotifMP_();
  if (!filas.length) { Logger.log('No hay notificaciones de Mercado Pago sin leer.'); return; }
  filas.forEach(function (f, i) { Logger.log((i + 1) + ') ' + f[3] + ' → ' + f[4]); });
}

function limpiarNotificacionesNoLeidasMP() {
  PropertiesService.getScriptProperties().deleteProperty(MP_NOTIF_PROP_PENDIENTES);
  Logger.log('Listo: se borró la lista de notificaciones sin leer. Volvé a ejecutar revisarDatosIncompletos para limpiar Problemas.');
  toast_('Lista de notificaciones sin leer borrada.', 'Mercado Pago', 5);
}

// ---------------- Configuración y prueba ----------------

/** Crea el token (si falta) y escribe en el registro los pasos exactos para publicar y configurar MacroDroid. */
function configurarNotificacionesMP() {
  const props = PropertiesService.getScriptProperties();
  let token = props.getProperty(MP_NOTIF_PROP_TOKEN);
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
    props.setProperty(MP_NOTIF_PROP_TOKEN, token);
    Logger.log('Se creó un token nuevo.');
  }
  try { libro_(); } catch (e) { Logger.log('OJO: ' + e.message); }
  let url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (e) {}
  const urlTxt = url && /\/exec$/.test(url) ? url : 'LA_URL_DE_TU_APLICACION_WEB (termina en /exec)';
  const L = [
    '================ NOTIFICACIONES DE MERCADO PAGO ================',
    'Token secreto (no lo compartas): ' + token,
    '',
    '1) PUBLICAR (una sola vez): Implementar > Nueva implementación > engranaje "Seleccionar tipo" > Aplicación web.',
    '   Descripción: ERP notificaciones · Ejecutar como: Yo · Quién tiene acceso: Cualquier usuario > Implementar.',
    '   Autorizá los permisos y copiá la "URL de la aplicación web" (termina en /exec).',
    '   Si después cambiás el código: Implementar > Gestionar implementaciones > lápiz > Versión: Nueva versión > Implementar (la URL no cambia).',
    '',
    '2) MACRODROID > Agregar macro:',
    '   Disparador: Eventos del dispositivo > Notificación > Notificación recibida > Seleccionar aplicaciones: Mercado Pago (' + MP_NOTIF_PAQUETE + ')',
    '      > Texto: Cualquiera (el script descarta lo que no sea un pago). Tildá "Ignorar notificaciones persistentes".',
    '   Acción: Interacciones web (en algunas versiones Conectividad) > Solicitud HTTP:',
    '      Método: POST · URL: ' + urlTxt,
    '      Parámetros de consulta (Query params), clave = valor (las variables se eligen con el botón "…"):',
    '         token = ' + token,
    '         titulo = {not_title}',
    '         texto = {notification}',
    '         app = {not_app_name}',
    '         paquete = {not_app_package}',
    '         fecha = {not_timestamp}',
    '      Si existe "Seguir redirecciones (Follow redirects)", dejala activada (Apps Script responde con un 302).',
    '   Si el POST falla: cambiá el Método a GET con los mismos parámetros. El script acepta las dos formas.',
    '   Android: MacroDroid con Acceso a notificaciones y Batería "Sin restricciones".',
    '',
    '3) PROBAR sin cargar nada: abrí en el navegador',
    '   ' + urlTxt + '?token=' + token + '&prueba=1&titulo=Mercado%20Pago&texto=Pagaste%20%24%2025.000%20en%20YPF',
    '   Tiene que responder {"ok":true,"accion":"prueba",...}. Sin "&prueba=1" la carga de verdad en Gastos.',
    '================================================================'
  ];
  L.forEach(function (l) { Logger.log(l); });
  if (VINCULADO_) {
    try { const ui = ui_(); ui.alert('Notificaciones de Mercado Pago', 'Listo. Abrí Extensiones > Apps Script > Ejecuciones para ver los pasos y el token, o ejecutá configurarNotificacionesMP desde el editor.', ui.ButtonSet.OK); } catch (e) {}
  }
  return token;
}

/** Muestra el token actual en el registro (para volver a copiarlo en MacroDroid). */
function verNotificacionesMP_token() {
  const t = PropertiesService.getScriptProperties().getProperty(MP_NOTIF_PROP_TOKEN);
  Logger.log(t ? 'Token actual: ' + t : 'Todavía no hay token. Ejecutá configurarNotificacionesMP.');
  return t;
}

/** Cambia el token (por ejemplo si se filtró). Después hay que actualizarlo en MacroDroid. */
function regenerarTokenMP() {
  PropertiesService.getScriptProperties().deleteProperty(MP_NOTIF_PROP_TOKEN);
  Logger.log('Token anterior anulado: MacroDroid deja de funcionar hasta que pegues el nuevo.');
  return configurarNotificacionesMP();
}

/** Prueba en seco: interpreta notificaciones de ejemplo y muestra el resultado SIN escribir nada en la planilla. */
function probarNotificacionMP() {
  const ejemplos = [
    ['Mercado Pago', 'Pagaste $ 25.000 en YPF'],
    ['Pago con QR aprobado', 'Pagaste $ 18.450,50 a ESTACION GNC SUR con tu Tarjeta de Crédito Mercado Pago.'],
    ['Recibiste dinero', 'Te transfirieron $ 10.000']
  ];
  ejemplos.forEach(function (ej) {
    let r;
    try { r = parsearNotificacionMP_(ej[0], ej[1]); r = r ? JSON.stringify(r) : 'ignorada (no es un pago)'; }
    catch (e) { r = 'REVISAR: ' + e.message; }
    Logger.log('[PRUEBA] "' + ej[0] + ' | ' + ej[1] + '" → ' + r);
  });
  Logger.log('Prueba en seco: no se escribió nada en la planilla.');
}

// ----------------------------------------------------------------------------
//  FORMULARIOS: Nuevo pago / Nuevo ingreso / Nuevo gasto
// ----------------------------------------------------------------------------

function abrirNuevoPago() {
  verificarEstructura_();
  mostrarFormulario_('Nuevo pago (Cuentas por Pagar)', 'pago', [
    { n: 'Concepto', t: 'text', req: true },
    { n: 'Proveedor', t: 'datalist', op: listaColumna_(hoja_(H.PROV), 'Nombre') },
    { n: 'Proyecto', t: 'datalist', op: listaColumna_(hoja_(H.PROY), 'Proyecto') },
    { n: 'Fecha', t: 'date', hoy: true },
    { n: 'Vencimiento', t: 'date' },
    { n: 'Importe ARS', t: 'number' },
    { n: 'Importe USD', t: 'number' },
    { n: 'Medio de pago', t: 'select', op: listaConfig_(1) },
    { n: 'Estado', t: 'select', op: ESTADOS_CXP, def: 'Sin Pagar', req: true },
    { n: 'Fecha de pago', t: 'date' },
    { n: 'Notas', t: 'textarea' }
  ]);
}

function abrirNuevoIngreso() {
  verificarEstructura_();
  mostrarFormulario_('Nuevo ingreso (Cuentas por Cobrar)', 'ingreso', [
    { n: 'Concepto', t: 'text', req: true },
    { n: 'Cliente', t: 'datalist', op: listaColumna_(hoja_(H.CLI), 'Nombre') },
    { n: 'Proyecto', t: 'datalist', op: listaColumna_(hoja_(H.PROY), 'Proyecto') },
    { n: 'Fecha', t: 'date', hoy: true },
    { n: 'Importe ARS', t: 'number' },
    { n: 'Importe USD', t: 'number' },
    { n: 'Adelanto ARS', t: 'number' },
    { n: 'Adelanto USD', t: 'number' },
    { n: 'Estado', t: 'select', op: ESTADOS_CXC, def: 'Esperando el pago', req: true },
    { n: 'Medio de cobro', t: 'select', op: listaConfig_(1) },
    { n: 'Fecha de cobro', t: 'date' },
    { n: 'Notas', t: 'textarea' }
  ]);
}

function abrirNuevoGasto() {
  verificarEstructura_();
  mostrarFormulario_('Nuevo gasto', 'gasto', [
    { n: 'Fecha', t: 'date', hoy: true, req: true },
    { n: 'Concepto', t: 'text', req: true },
    { n: 'Categoría', t: 'select', op: listaConfig_(2), req: true },
    { n: 'Proveedor', t: 'datalist', op: listaColumna_(hoja_(H.PROV), 'Nombre') },
    { n: 'Importe ARS', t: 'number' },
    { n: 'Importe USD', t: 'number' },
    { n: 'Medio de pago', t: 'select', op: listaConfig_(1), req: true },
    { n: 'Notas', t: 'textarea' }
  ]);
}

function estiloHtml_() {
  return '<style>body{font-family:Arial,sans-serif;font-size:13px;margin:12px;color:#202124}' +
    'label{display:block;font-weight:bold;margin-top:8px}input,select,textarea{width:100%;box-sizing:border-box;' +
    'padding:6px;border:1px solid #dadce0;border-radius:4px;font-size:13px}textarea{height:54px}' +
    '.acc{margin-top:14px;display:flex;gap:8px}button{padding:8px 14px;border:0;border-radius:4px;cursor:pointer}' +
    '.pri{background:#1f4e78;color:#fff}.sec{background:#f1f3f4}#msg{margin-top:10px;color:#a50e0e}' +
    '.req{color:#a50e0e}table{width:100%;border-collapse:collapse}td{padding:2px;vertical-align:bottom}' +
    '.hint{color:#80868b;font-size:11px}</style>';
}

function mostrarFormulario_(titulo, tipo, campos) {
  const hoyIso = Utilities.formatDate(new Date(), libro_().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  let html = '<!DOCTYPE html><html><head><base target="_top">' + estiloHtml_() + '</head><body><form id="frm">';
  campos.forEach(function (c, i) {
    const id = 'f' + i;
    html += '<label for="' + id + '">' + esc_(c.n) + (c.req ? ' <span class="req">*</span>' : '') + '</label>';
    if (c.t === 'select') {
      html += '<select id="' + id + '"><option value=""></option>' + (c.op || []).map(function (o) {
        return '<option' + (o === c.def ? ' selected' : '') + '>' + esc_(o) + '</option>';
      }).join('') + '</select>';
    } else if (c.t === 'datalist') {
      html += '<input id="' + id + '" list="dl' + i + '" autocomplete="off"><datalist id="dl' + i + '">' +
        (c.op || []).map(function (o) { return '<option value="' + esc_(o) + '">'; }).join('') + '</datalist>';
    } else if (c.t === 'textarea') {
      html += '<textarea id="' + id + '"></textarea>';
    } else if (c.t === 'number') {
      html += '<input id="' + id + '" type="number" step="0.01" min="0">';
    } else if (c.t === 'date') {
      html += '<input id="' + id + '" type="date"' + (c.hoy ? ' value="' + hoyIso + '"' : '') + '>';
    } else {
      html += '<input id="' + id + '" type="text">';
    }
  });
  html += '<div class="acc"><button class="pri" id="btn" type="submit">Guardar</button>' +
    '<button class="sec" type="button" onclick="google.script.host.close()">Cancelar</button></div><div id="msg"></div></form>' +
    '<script>var CAMPOS=' + JSON.stringify(campos.map(function (c) { return { n: c.n, req: !!c.req }; })) + ';' +
    'function msg(t,ok){var m=document.getElementById("msg");m.style.color=ok?"#188038":"#a50e0e";m.textContent=t;}' +
    'document.getElementById("frm").addEventListener("submit",function(ev){ev.preventDefault();var d={};' +
    'for(var i=0;i<CAMPOS.length;i++){var el=document.getElementById("f"+i);d[CAMPOS[i].n]=el.value;' +
    'if(CAMPOS[i].req&&!el.value){msg("Completá: "+CAMPOS[i].n);el.focus();return;}}' +
    'var b=document.getElementById("btn");b.disabled=true;msg("Guardando…",true);' +
    'google.script.run.withSuccessHandler(function(r){msg(r,true);setTimeout(function(){google.script.host.close();},1200);})' +
    '.withFailureHandler(function(e){b.disabled=false;msg("Error: "+e.message);})' +
    '.guardarFormulario(' + JSON.stringify(tipo) + ',d);});</script></body></html>';
  ui_().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(420).setHeight(640), titulo);
}

/** Llamado desde los formularios HTML. */
function guardarFormulario(tipo, datos) {
  const destino = { pago: H.CXP, ingreso: H.CXC, gasto: H.GASTOS }[tipo];
  if (!destino) throw new Error('Tipo de formulario desconocido: ' + tipo);
  if (!num_(datos['Importe ARS']) && !num_(datos['Importe USD'])) throw new Error('Cargá un importe en ARS o en USD.');
  if ((tipo === 'pago' || tipo === 'gasto') && datos['Proveedor']) agregarSiFalta_(H.PROV, datos['Proveedor']);
  if (tipo === 'ingreso' && datos['Cliente']) agregarSiFalta_(H.CLI, datos['Cliente']);
  const fila = agregarFila_(destino, datos);
  procesarFilas_(hoja_(destino), fila, fila);
  return 'Guardado en "' + destino + '" (fila ' + fila + ').';
}

/** Agrega una fila mapeando por nombre de columna. Convierte fechas e importes. */
function agregarFila_(nombreHoja, datos) {
  const sh = hoja_(nombreHoja);
  const esq = ESQUEMA[nombreHoja] || { fmt: {} };
  const m = mapa_(sh);
  const fila = new Array(sh.getLastColumn()).fill('');
  Object.keys(datos).forEach(function (k) {
    if (!m[k]) return;
    let v = datos[k];
    const f = esq.fmt[k];
    if (f === 'FECHA') v = asFecha_(v) || '';
    else if (f === 'ARS' || f === 'USD') v = (v === '' || v === null || v === undefined) ? '' : num_(v);
    fila[m[k] - 1] = v;
  });
  sh.appendRow(fila);
  return sh.getLastRow();
}

function agregarSiFalta_(nombreHoja, nombre) {
  nombre = String(nombre).trim();
  if (!nombre) return;
  const lista = listaColumna_(hoja_(nombreHoja), 'Nombre').map(function (s) { return s.toLowerCase(); });
  if (lista.indexOf(nombre.toLowerCase()) === -1) agregarFila_(nombreHoja, { 'Nombre': nombre });
}

// ----------------------------------------------------------------------------
//  PRESUPUESTOS
// ----------------------------------------------------------------------------

function abrirGenerarPresupuesto() {
  verificarEstructura_();
  const clientes = listaColumna_(hoja_(H.CLI), 'Nombre');
  const iva = getParam_('IVA por defecto (%)', 21);
  const validez = getParam_('Validez del presupuesto (días)', 15);
  const html = '<!DOCTYPE html><html><head><base target="_top">' + estiloHtml_() + '</head><body><form id="frm">' +
    '<label>Cliente <span class="req">*</span></label><input id="cliente" list="dlc" autocomplete="off"><datalist id="dlc">' +
    clientes.map(function (c) { return '<option value="' + esc_(c) + '">'; }).join('') + '</datalist>' +
    '<label>Proyecto / referencia</label><input id="proyecto">' +
    '<table><tr><td><label>Moneda</label><select id="moneda"><option>ARS</option><option>USD</option></select></td>' +
    '<td><label>Validez (días)</label><input id="validez" type="number" min="1" value="' + esc_(validez) + '"></td></tr>' +
    '<tr><td><label><input id="conIva" type="checkbox" style="width:auto"> Agregar IVA</label></td>' +
    '<td><label>IVA %</label><input id="iva" type="number" step="0.5" value="' + esc_(iva) + '"></td></tr></table>' +
    '<label>Ítems <span class="req">*</span></label><div class="hint">Descripción · Cantidad · Precio unitario</div>' +
    '<table id="items"></table><button type="button" class="sec" onclick="fila()">+ Agregar ítem</button>' +
    '<label>Condiciones / notas</label><textarea id="notas" placeholder="Forma de pago, plazos de entrega, etc."></textarea>' +
    '<div class="acc"><button class="pri" id="btn" type="submit">Generar</button>' +
    '<button class="sec" type="button" onclick="google.script.host.close()">Cancelar</button></div><div id="msg"></div></form>' +
    '<script>' +
    'function fila(){var t=document.getElementById("items");var r=t.insertRow();' +
    'r.innerHTML=\'<td style="width:60%"><input class="d" placeholder="Descripción"></td>' +
    '<td><input class="c" type="number" step="0.01" value="1"></td>' +
    '<td><input class="p" type="number" step="0.01" placeholder="Precio"></td>\';}' +
    'fila();fila();fila();' +
    'function msg(t,ok){var m=document.getElementById("msg");m.style.color=ok?"#188038":"#a50e0e";m.textContent=t;}' +
    'document.getElementById("frm").addEventListener("submit",function(ev){ev.preventDefault();' +
    'var items=[];var rs=document.querySelectorAll("#items tr");for(var i=0;i<rs.length;i++){' +
    'var d=rs[i].querySelector(".d").value;if(d)items.push({desc:d,cant:rs[i].querySelector(".c").value,precio:rs[i].querySelector(".p").value});}' +
    'var datos={cliente:document.getElementById("cliente").value,proyecto:document.getElementById("proyecto").value,' +
    'moneda:document.getElementById("moneda").value,validez:document.getElementById("validez").value,' +
    'conIva:document.getElementById("conIva").checked,iva:document.getElementById("iva").value,' +
    'notas:document.getElementById("notas").value,items:items};' +
    'if(!datos.cliente){msg("Completá el cliente.");return;}if(!items.length){msg("Agregá al menos un ítem.");return;}' +
    'var b=document.getElementById("btn");b.disabled=true;msg("Generando…",true);' +
    'google.script.run.withSuccessHandler(function(r){msg("Listo: "+r,true);setTimeout(function(){google.script.host.close();},1500);})' +
    '.withFailureHandler(function(e){b.disabled=false;msg("Error: "+e.message);}).generarPresupuesto(datos);});' +
    '</script></body></html>';
  ui_().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(560).setHeight(660), 'Generar presupuesto');
}

/** Crea una hoja "Presupuesto NNNN" a partir de la plantilla y lo registra en Proyectos. */
function generarPresupuesto(d) {
  const ss = libro_();
  const plant = asegurarPlantilla_(ss);
  const items = (d.items || []).filter(function (it) { return String(it.desc || '').trim(); })
    .map(function (it) { return { desc: String(it.desc).trim(), cant: num_(it.cant) || 1, precio: num_(it.precio) }; });
  if (!String(d.cliente || '').trim()) throw new Error('Falta el cliente.');
  if (!items.length) throw new Error('Agregá al menos un ítem.');

  const moneda = d.moneda === 'USD' ? 'USD' : 'ARS';
  const fmt = FMT[moneda];
  const nro = (parseInt(getParam_('Último N° de presupuesto', 0), 10) || 0) + 1;
  const nroTxt = ('0000' + nro).slice(-4);
  let nombre = 'Presupuesto ' + nroTxt;
  let k = 2;
  while (ss.getSheetByName(nombre)) nombre = 'Presupuesto ' + nroTxt + ' (' + (k++) + ')';

  const sh = plant.copyTo(ss).setName(nombre);
  sh.getRange('A10').clearContent().setFontStyle('normal').setFontColor('#202124');
  ss.setActiveSheet(sh);
  ss.moveActiveSheet(ss.getSheets().length);

  const hoy = hoy_();
  const validez = parseInt(d.validez, 10) || parseInt(getParam_('Validez del presupuesto (días)', 15), 10) || 15;
  const hasta = new Date(hoy.getTime() + validez * 864e5);
  sh.getRange('B4').setValue(nroTxt);
  sh.getRange('B5').setValue(d.cliente);
  sh.getRange('B6').setValue(d.proyecto || '');
  sh.getRange('E4').setValue(hoy).setNumberFormat(FMT.FECHA);
  sh.getRange('E5').setValue(hasta).setNumberFormat(FMT.FECHA);
  sh.getRange('E6').setValue(moneda);

  // Ítems
  const r0 = 9;
  const filas = items.map(function (it, i) {
    return [i + 1, it.desc, it.cant, it.precio, '=C' + (r0 + i) + '*D' + (r0 + i)];
  });
  sh.getRange(r0, 1, filas.length, 5).setValues(filas);
  sh.getRange(r0, 4, filas.length, 2).setNumberFormat(fmt);
  sh.getRange(r0, 2, filas.length, 1).setWrap(true);
  sh.getRange(r0, 1, filas.length, 5).setBorder(null, null, true, null, null, true, '#dadce0', SpreadsheetApp.BorderStyle.SOLID);
  const rFin = r0 + filas.length - 1;

  // Totales
  let r = rFin + 2;
  let subtotal = 0;
  items.forEach(function (it) { subtotal += it.cant * it.precio; });
  sh.getRange(r, 4).setValue('Subtotal').setFontWeight('bold');
  sh.getRange(r, 5).setFormula('=SUM(E' + r0 + ':E' + rFin + ')').setNumberFormat(fmt);
  const filaSub = r;
  let total = subtotal;
  if (d.conIva) {
    const pct = num_(d.iva);
    r++;
    sh.getRange(r, 4).setValue('IVA ' + pct + '%').setFontWeight('bold');
    sh.getRange(r, 5).setFormula('=E' + filaSub + '*' + pct + '/100').setNumberFormat(fmt);
    total = subtotal * (1 + pct / 100);
  }
  r++;
  sh.getRange(r, 4, 1, 2).setBackground('#1f4e78').setFontColor('#ffffff').setFontWeight('bold').setFontSize(12);
  sh.getRange(r, 4).setValue('TOTAL ' + moneda);
  sh.getRange(r, 5).setFormula('=SUM(E' + filaSub + ':E' + (r - 1) + ')').setNumberFormat(fmt);
  if (!d.conIva) sh.getRange(r + 1, 4).setValue('Precios sin IVA').setFontColor('#80868b').setFontStyle('italic');

  // Validez y condiciones
  r += 3;
  sh.getRange(r, 1, 1, 5).merge().setValue('Validez de la oferta: ' + validez + ' días (hasta el ' +
    Utilities.formatDate(hasta, ss.getSpreadsheetTimeZone(), 'dd/MM/yyyy') + ').').setFontWeight('bold');
  if (d.notas) {
    r++;
    sh.getRange(r, 1, 1, 5).merge().setValue('Condiciones: ' + d.notas).setWrap(true);
  }

  // Registrar en Proyectos y Clientes
  setParam_('Último N° de presupuesto', nro);
  agregarSiFalta_(H.CLI, d.cliente);
  const datosProy = {
    'Proyecto': d.proyecto || ('Presupuesto ' + nroTxt + ' — ' + d.cliente),
    'Cliente': d.cliente, 'Estado': 'Presupuestado', 'Fecha': hoy, 'Notas': 'Presupuesto N° ' + nroTxt
  };
  datosProy[moneda === 'USD' ? 'Presupuesto USD' : 'Presupuesto ARS'] = Math.round(total * 100) / 100;
  const filaProy = agregarFila_(H.PROY, datosProy);
  const shProy = hoja_(H.PROY);
  const mp = mapa_(shProy);
  if (mp['Hoja de presupuesto']) {
    shProy.getRange(filaProy, mp['Hoja de presupuesto'])
      .setFormula('=HYPERLINK("#gid=' + sh.getSheetId() + '","' + nombre + '")');
  }
  procesarFilas_(shProy, filaProy, filaProy);
  SpreadsheetApp.flush();
  return nombre + ' (total ' + (moneda === 'USD' ? 'US$ ' : '$ ') + formatoNumero_(total) + ')';
}

// ----------------------------------------------------------------------------
//  EJEMPLOS (sólo si lo elegís; no son datos reales)
// ----------------------------------------------------------------------------

function cargarEjemplos(sinConfirmar) {
  verificarEstructura_();
  const ui = ui_();
  if (sinConfirmar !== true) {
    const r = ui.alert('Cargar ejemplos', 'Se van a agregar filas marcadas como "EJEMPLO" en varias hojas. ' +
      'No son datos reales y se pueden borrar desde Ejemplos > Borrar filas de EJEMPLO. ¿Continuar?', ui.ButtonSet.YES_NO);
    if (r !== ui.Button.YES) return;
  }
  const hoy = hoy_();
  const dia = function (n) { return new Date(hoy.getTime() + n * 864e5); };
  const P = 'EJEMPLO Proveedor', C = 'EJEMPLO Cliente', Y = 'EJEMPLO - Proyecto de prueba';

  agregarFila_(H.PROV, { 'Nombre': P, 'Notas': 'Fila de EJEMPLO' });
  agregarFila_(H.CLI, { 'Nombre': C, 'Notas': 'Fila de EJEMPLO' });

  const ejemplos = [
    [H.PROY, { 'Proyecto': Y, 'Cliente': C, 'Estado': 'En curso', 'Fecha': dia(-20), 'Presupuesto ARS': 500000, 'Notas': 'Fila de EJEMPLO' }],
    [H.CXP, { 'Concepto': 'EJEMPLO - Factura que vence pronto', 'Proveedor': P, 'Proyecto': Y, 'Fecha': dia(-5), 'Vencimiento': dia(3), 'Importe ARS': 85000, 'Medio de pago': 'Mercado Pago', 'Estado': 'Sin Pagar' }],
    [H.CXP, { 'Concepto': 'EJEMPLO - Factura vencida', 'Proveedor': P, 'Fecha': dia(-30), 'Vencimiento': dia(-2), 'Importe USD': 120, 'Medio de pago': 'Visa Galicia', 'Estado': 'Sin Pagar' }],
    [H.CXP, { 'Concepto': 'EJEMPLO - Factura pagada', 'Proveedor': P, 'Fecha': dia(-10), 'Vencimiento': dia(-1), 'Importe ARS': 40000, 'Medio de pago': 'Brubank', 'Estado': 'Pagada', 'Fecha de pago': dia(-3) }],
    [H.CXC, { 'Concepto': 'EJEMPLO - Trabajo esperando el pago', 'Cliente': C, 'Proyecto': Y, 'Fecha': dia(-12), 'Importe ARS': 300000, 'Estado': 'Esperando el pago' }],
    [H.CXC, { 'Concepto': 'EJEMPLO - Trabajo con adelanto', 'Cliente': C, 'Fecha': dia(-4), 'Importe USD': 800, 'Adelanto USD': 400, 'Estado': 'Con adelanto', 'Medio de cobro': 'HSBC' }],
    [H.GASTOS, { 'Fecha': dia(-1), 'Concepto': 'EJEMPLO - Combustible', 'Categoría': 'Empresa', 'Importe ARS': 25000, 'Medio de pago': 'BNA+' }],
    [H.GASTOS, { 'Fecha': dia(0), 'Concepto': 'EJEMPLO - Supermercado', 'Categoría': 'Casa', 'Importe ARS': 60000, 'Medio de pago': 'Visa Galicia' }]
  ];
  ejemplos.forEach(function (e) {
    const f = agregarFila_(e[0], e[1]);
    procesarFilas_(hoja_(e[0]), f, f);
  });
  actualizarTablero(true);
  toast_('Se cargaron filas de EJEMPLO.', 'Ejemplos', 5);
}

function borrarEjemplos() {
  const ui = ui_();
  const r = ui.alert('Borrar ejemplos', 'Se van a borrar todas las filas que contengan "EJEMPLO". ¿Continuar?', ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;
  const ss = libro_();
  let n = 0;
  [H.CXP, H.CXC, H.GASTOS, H.CAJA, H.PROY, H.PROV, H.CLI].forEach(function (nombre) {
    const sh = ss.getSheetByName(nombre);
    if (!sh || sh.getLastRow() < 2) return;
    const datos = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getDisplayValues();
    for (let i = datos.length - 1; i >= 0; i--) {
      if (datos[i].some(function (c) { return String(c).indexOf(EJEMPLO) !== -1; })) { sh.deleteRow(i + 2); n++; }
    }
  });
  actualizarTablero(true);
  toast_('Se borraron ' + n + ' filas de EJEMPLO.', 'Ejemplos', 5);
}

// ----------------------------------------------------------------------------
//  UTILIDADES
// ----------------------------------------------------------------------------

function hoja_(nombre) {
  const sh = libro_().getSheetByName(nombre);
  if (!sh) throw new Error('Falta la hoja "' + nombre + '". Corré Administración > Crear/actualizar estructura.');
  return sh;
}

function verificarEstructura_() {
  const ss = libro_();
  const faltan = [H.CONFIG, H.PROV, H.CLI, H.CXP, H.CXC, H.GASTOS, H.CAJA, H.PROY]
    .filter(function (n) { return !ss.getSheetByName(n); });
  if (faltan.length) throw new Error('Faltan hojas (' + faltan.join(', ') + '). Corré Administración > Crear/actualizar estructura.');
}

/** { 'Nombre de columna': númeroDeColumna } leyendo la fila 1. */
function mapa_(sh) {
  const m = {};
  const n = sh.getLastColumn();
  if (n < 1) return m;
  sh.getRange(1, 1, 1, n).getValues()[0].forEach(function (v, i) {
    const k = String(v).trim();
    if (k && !m[k]) m[k] = i + 1;
  });
  return m;
}

function filaConDatos_(fila, m) {
  const excluir = COLS_AUTOMATICAS.map(function (k) { return m[k] ? m[k] - 1 : -1; });
  return fila.some(function (v, i) { return excluir.indexOf(i) === -1 && v !== '' && v !== null; });
}

/** Filas con datos de una hoja, con un getter por nombre de columna. */
function leerFilas_(nombre) {
  const sh = libro_().getSheetByName(nombre);
  if (!sh || sh.getLastRow() < 2) return [];
  const m = mapa_(sh);
  const datos = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  const out = [];
  datos.forEach(function (f, i) {
    if (!filaConDatos_(f, m)) return;
    out.push({ sh: sh, m: m, fila: i + 2, g: function (k) { return m[k] ? f[m[k] - 1] : ''; } });
  });
  return out;
}

function listaColumna_(sh, header) {
  if (!sh || sh.getLastRow() < 2) return [];
  const m = mapa_(sh);
  if (!m[header]) return [];
  return sh.getRange(2, m[header], sh.getLastRow() - 1, 1).getValues()
    .map(function (r) { return String(r[0]).trim(); }).filter(String);
}

function listaConfig_(col) {
  const sh = hoja_(H.CONFIG);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, col, sh.getLastRow() - 1, 1).getValues()
    .map(function (r) { return String(r[0]).trim(); }).filter(String);
}

function getParam_(clave, porDefecto) {
  const sh = libro_().getSheetByName(H.CONFIG);
  if (!sh || sh.getLastRow() < 2) return porDefecto;
  const vals = sh.getRange(2, 5, sh.getLastRow() - 1, 2).getValues();
  for (let i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === clave) return vals[i][1] === '' ? porDefecto : vals[i][1];
  }
  return porDefecto;
}

function setParam_(clave, valor) {
  const sh = hoja_(H.CONFIG);
  const n = Math.max(sh.getLastRow() - 1, 1);
  const vals = sh.getRange(2, 5, n, 1).getValues();
  let ultima = 1;
  for (let i = 0; i < vals.length; i++) {
    const c = String(vals[i][0]).trim();
    if (c) ultima = i + 2;
    if (c === clave) { sh.getRange(i + 2, 6).setValue(valor); return; }
  }
  sh.getRange(ultima + 1, 5, 1, 2).setValues([[clave, valor]]);
}

function hoy_() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Acepta Date, "aaaa-mm-dd" (formularios) o "dd/mm/aaaa". Devuelve Date a las 00:00 o null. */
function asFecha_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) {
    const d = new Date(v.getTime());
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (typeof v === 'string' && v.trim()) {
    let m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  }
  return null;
}

/** Convierte importes: acepta números, "$ 1.234,56", "1234.56", "US$ 100". */
function num_(v) {
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  if (v === null || v === undefined) return 0;
  let s = String(v).replace(/US\$|\$|ARS|USD|\s/gi, '');
  if (!s) return 0;
  if (s.indexOf(',') !== -1) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function nuevoId_(prefijo) {
  const tz = libro_().getSpreadsheetTimeZone();
  return prefijo + '-' + Utilities.formatDate(new Date(), tz, 'yyMMdd') + '-' +
    Utilities.getUuid().replace(/-/g, '').slice(0, 5).toUpperCase();
}

function colLetra_(n) {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function formatoNumero_(n) {
  const neg = n < 0;
  const partes = Math.abs(n).toFixed(2).split('.');
  partes[0] = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '-' : '') + partes[0] + ',' + partes[1];
}

function esc_(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
