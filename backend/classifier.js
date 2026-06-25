// backend/classifier.js
// Clasificador local por palabras clave — sin API, sin límites, 100% offline

const DERIVATION_RULES = {
  'Consulta General': 'Atención al Cliente',
  'Reclamo':          'Atención al Cliente',
  'Soporte Técnico':  'Mesa de Ayuda',
  'Ventas':           'Área Comercial',
  'Facturación':      'Administración',
  'Recursos Humanos': 'RRHH',
  'Otros':            'Revisión Manual',
};

const KEYWORDS = {
  'Facturación': [
    'factura', 'facturación', 'cobro', 'cobraron', 'pago', 'pagar',
    'monto', 'importe', 'recibo', 'comprobante', 'iva', 'impuesto',
    'reembolso', 'devolución', 'tarjeta', 'débito', 'crédito',
    'saldo', 'deuda', 'vencimiento', 'cuota', 'cargo', 'cargaron',
  ],
  'Soporte Técnico': [
    'sistema', 'error', 'falla', 'no funciona', 'caído', 'caída',
    'bug', 'no anda', 'lento', 'lentitud', 'contraseña', 'acceso',
    'login', 'no puedo entrar', 'pantalla', 'aplicación', 'app',
    'servidor', 'conexión', 'instalar', 'actualizar', 'soporte',
    'técnico', 'configuración', 'reiniciar', 'colgado',
  ],
  'Ventas': [
    'comprar', 'compra', 'precio', 'cotización', 'presupuesto',
    'plan', 'planes', 'producto', 'contratar', 'contrato',
    'ampliar', 'upgrade', 'oferta', 'promoción', 'interesado',
    'demo', 'vendedor', 'comercial', 'adquirir', 'adquisición',
  ],
  'Recursos Humanos': [
    'vacaciones', 'licencia', 'sueldo', 'salario', 'recibo de sueldo',
    'empleado', 'rrhh', 'recursos humanos', 'contratación',
    'renuncia', 'despido', 'horas extra', 'turno', 'capacitación',
    'beneficios', 'aguinaldo', 'permiso', 'ausencia', 'baja médica',
  ],
  'Reclamo': [
    'reclamo', 'queja', 'inconforme', 'insatisfecho', 'mal servicio',
    'pésimo', 'terrible', 'decepcionado', 'indignado', 'exijo',
    'no estoy conforme', 'muy mal', 'inaceptable', 'denuncia',
    'vergüenza', 'demanda', 'abogado', 'incumplimiento',
  ],
  'Consulta General': [
    'consulta', 'pregunta', 'información', 'quisiera saber',
    'me podrían decir', 'horario', 'dirección', 'sucursal',
    'cómo hago', 'quiero saber', 'duda', 'orientación', 'ayuda',
    'me pueden informar', 'quisiera conocer',
  ],
};

const URGENCIA_ALTA = [
  'urgente', 'urgencia', 'inmediato', 'ya mismo', 'ahora mismo',
  'crítico', 'crisis', 'emergencia', 'sin servicio', 'no funciona nada',
  'horas sin', 'días sin', 'grave', 'imposible', 'pérdida de dinero',
  'caída total', 'no puedo trabajar', 'bloqueado', 'bloqueada',
];

const URGENCIA_MEDIA = [
  'pronto', 'a la brevedad', 'necesito respuesta', 'importante',
  'esperando', 'hace días', 'sin respuesta', 'pendiente',
  'todavía no', 'siguen sin', 'falta de respuesta',
];

function classifyEmail(asunto, contenido) {
  const texto = `${asunto} ${contenido}`.toLowerCase();

  // Calcular puntaje por categoría
  const puntajes = {};
  for (const [categoria, palabras] of Object.entries(KEYWORDS)) {
    puntajes[categoria] = palabras.filter(p => texto.includes(p)).length;
  }

  // Elegir categoría con mayor puntaje
  let categoria = 'Otros';
  let maxPuntaje = 0;
  for (const [cat, puntaje] of Object.entries(puntajes)) {
    if (puntaje > maxPuntaje) {
      maxPuntaje = puntaje;
      categoria  = cat;
    }
  }

  // Calcular prioridad
  let prioridad = 'Baja';
  if (URGENCIA_ALTA.some(p  => texto.includes(p))) prioridad = 'Alta';
  else if (URGENCIA_MEDIA.some(p => texto.includes(p))) prioridad = 'Media';

  // Reclamos son mínimo Media
  if (categoria === 'Reclamo' && prioridad === 'Baja') prioridad = 'Media';

  return { categoria, area_responsable: DERIVATION_RULES[categoria], prioridad };
}

module.exports = { classifyEmail };