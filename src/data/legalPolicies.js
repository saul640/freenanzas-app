export const SUPPORT_EMAIL = 'soporte@freenanzas.com';
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=Soporte%20Freenanzas`;

const updatedAt = '30 de junio de 2026';

export const legalPolicies = {
  privacy: {
    path: '/privacy',
    title: 'Política de Privacidad',
    shortTitle: 'Privacidad',
    icon: 'privacy_tip',
    updatedAt,
    intro:
      'Esta Política de Privacidad explica cómo Freenanzas recopila, usa, protege y elimina información cuando usas la app de finanzas personales.',
    sections: [
      {
        heading: 'Datos que recopilamos',
        body: [
          'Datos de cuenta, como nombre, correo electrónico, identificador de usuario, foto de perfil opcional, estado de verificación y datos de suscripción.',
          'Datos financieros que decides registrar, como ingresos, gastos, categorías, presupuestos, metas, tarjetas, préstamos, pagos recurrentes, notas y recibos o imágenes que subas para escaneo.',
          'Datos técnicos necesarios para operar la app, como errores, eventos de seguridad, estado de pagos, registros de sincronización y datos básicos del dispositivo o navegador.',
          'Datos enviados a herramientas de IA cuando eliges usar funciones como escaneo de recibos, Filtro IA, insights o Asesor Financiero IA.'
        ]
      },
      {
        heading: 'Cómo usamos tus datos',
        body: [
          'Usamos tus datos para crear y proteger tu cuenta, sincronizar tu información, mostrar reportes, calcular presupuestos, generar exportaciones y habilitar funciones PRO.',
          'Usamos tus datos financieros para ofrecer análisis dentro de la app. No vendemos tus datos personales ni financieros a terceros.',
          'Podemos usar datos técnicos y reportes de error para mantener la seguridad, prevenir abuso, diagnosticar fallos y mejorar la estabilidad del servicio.'
        ]
      },
      {
        heading: 'Servicios externos',
        body: [
          'Freenanzas usa Firebase de Google para autenticación, base de datos, almacenamiento, hosting y funciones backend.',
          'Las funciones de IA pueden procesarse mediante modelos de Google Gemini. Solo enviamos la información necesaria para responder la acción que solicitas.',
          'Los pagos y suscripciones se procesan mediante PayPal. Freenanzas no almacena los datos completos de tu tarjeta o cuenta PayPal.'
        ]
      },
      {
        heading: 'Seguridad y retención',
        body: [
          'Aplicamos controles de acceso por usuario, reglas de seguridad, cifrado en tránsito y proveedores de infraestructura con medidas de seguridad reconocidas.',
          'Conservamos tus datos mientras tu cuenta esté activa o mientras sea necesario para operar la app, cumplir obligaciones legales, resolver disputas o prevenir fraude.',
          'Los respaldos, registros técnicos y comprobantes administrativos pueden conservarse por un periodo limitado aun después de una eliminación, cuando sea necesario por seguridad, facturación o cumplimiento.'
        ]
      },
      {
        heading: 'Tus derechos y control',
        body: [
          'Puedes revisar, editar, exportar o eliminar información desde la app cuando esas funciones estén disponibles.',
          'Puedes solicitar ayuda, corrección o eliminación adicional escribiendo a soporte.',
          'Si tienes una suscripción activa, eliminar tu cuenta no limita tus derechos de cancelación o reembolso según la política aplicable.'
        ]
      }
    ]
  },
  terms: {
    path: '/terms',
    title: 'Términos de Servicio',
    shortTitle: 'Términos',
    icon: 'description',
    updatedAt,
    intro:
      'Estos Términos regulan el uso de Freenanzas. Al crear una cuenta o usar la app, aceptas estas condiciones.',
    sections: [
      {
        heading: 'Servicio',
        body: [
          'Freenanzas es una app de organización financiera personal, presupuestos, registro de movimientos, recordatorios, exportaciones y herramientas educativas asistidas por IA.',
          'La app no es una entidad financiera, banco, casa de bolsa, asesor de inversiones, asesor fiscal ni asesor legal.'
        ]
      },
      {
        heading: 'Cuenta y responsabilidad del usuario',
        body: [
          'Debes mantener la seguridad de tus credenciales y la exactitud de la información que registras.',
          'Eres responsable de las decisiones financieras que tomes usando información de la app. Antes de decisiones importantes, consulta a un profesional calificado.',
          'No debes usar Freenanzas para actividades ilegales, fraude, acceso no autorizado, abuso de sistemas o almacenamiento de información de terceros sin permiso.'
        ]
      },
      {
        heading: 'Planes PRO y pagos',
        body: [
          'Las funciones PRO pueden incluir IA, escaneo de recibos, exportaciones avanzadas y otras herramientas indicadas en la app.',
          'Las suscripciones se cobran mediante PayPal según el ciclo elegido. Los precios, beneficios y ciclos se muestran antes de confirmar el pago.',
          'Puedes cancelar tu suscripción desde la sección Mi Suscripción. Mantendrás acceso PRO hasta el final del periodo ya pagado, salvo que la ley aplicable exija algo distinto.'
        ]
      },
      {
        heading: 'Disponibilidad y cambios',
        body: [
          'Trabajamos para mantener Freenanzas disponible y segura, pero el servicio puede interrumpirse por mantenimiento, fallos de terceros, cambios técnicos o causas fuera de nuestro control.',
          'Podemos modificar funciones, precios o estos Términos. Cuando un cambio sea material, intentaremos avisarte por la app, correo o medios razonables.'
        ]
      },
      {
        heading: 'Limitación de responsabilidad',
        body: [
          'Freenanzas se ofrece como herramienta de apoyo. No garantizamos resultados financieros, ahorro, aprobación de crédito, rendimiento de inversiones ni ausencia absoluta de errores.',
          'En la medida permitida por la ley, Freenanzas no será responsable por pérdidas indirectas, decisiones financieras tomadas por el usuario o fallos de proveedores externos.'
        ]
      }
    ]
  },
  dataDeletion: {
    path: '/data-deletion',
    title: 'Política de Eliminación de Cuenta y Datos',
    shortTitle: 'Eliminar datos',
    icon: 'delete_forever',
    updatedAt,
    intro:
      'Esta política explica cómo puedes eliminar tu cuenta de Freenanzas y qué ocurre con tus datos personales y financieros.',
    sections: [
      {
        heading: 'Cómo eliminar tu cuenta',
        body: [
          'Desde la app, entra a Configuración y toca Eliminar mi cuenta. Por seguridad, Firebase puede pedirte iniciar sesión de nuevo antes de completar la eliminación.',
          'También puedes escribir a soporte desde el correo asociado a tu cuenta para solicitar ayuda con la eliminación.'
        ]
      },
      {
        heading: 'Datos que se eliminan',
        body: [
          'Al confirmar la eliminación, Freenanzas intenta borrar tu perfil, cuenta de autenticación, transacciones, presupuestos, categorías, tarjetas, préstamos, pagos recurrentes y foto de perfil almacenada.',
          'Si tienes una suscripción PayPal activa registrada en la app, intentaremos cancelarla antes de eliminar la cuenta para evitar renovaciones futuras.'
        ]
      },
      {
        heading: 'Datos que pueden conservarse temporalmente',
        body: [
          'Registros técnicos, respaldos, eventos de seguridad, facturación, soporte, prevención de fraude o información que debamos conservar por ley pueden permanecer por tiempo limitado.',
          'Cuando una eliminación no pueda completarse automáticamente por un requisito de seguridad o proveedor externo, te indicaremos el paso necesario o el canal de soporte.'
        ]
      },
      {
        heading: 'Importante sobre suscripciones',
        body: [
          'Eliminar la cuenta no reemplaza tus derechos de cancelación y reembolso. Si el proveedor de pago requiere una acción adicional en PayPal, te recomendamos verificar tu cuenta PayPal.',
          'Antes de eliminar tu cuenta, descarga cualquier reporte que necesites conservar.'
        ]
      }
    ]
  },
  aiNotice: {
    path: '/ai-financial-notice',
    title: 'Aviso sobre IA Financiera',
    shortTitle: 'Aviso IA',
    icon: 'psychology',
    updatedAt,
    intro:
      'Las funciones de IA de Freenanzas ofrecen orientación educativa y organización financiera, no asesoría financiera profesional.',
    sections: [
      {
        heading: 'Uso educativo',
        body: [
          'El Asesor Financiero IA, Filtro IA, insights, estrategias de deuda y escaneo de recibos pueden generar sugerencias, clasificaciones o resúmenes basados en tus datos.',
          'Las respuestas de IA pueden contener errores, información incompleta o recomendaciones que no se ajusten a tu situación real.'
        ]
      },
      {
        heading: 'No es asesoría profesional',
        body: [
          'Freenanzas no sustituye a un asesor financiero, contador, abogado, banco, corredor de inversiones ni profesional autorizado.',
          'No tomes decisiones importantes de deuda, inversión, impuestos, crédito, seguros o patrimonio basándote solo en una respuesta de IA.'
        ]
      },
      {
        heading: 'Buenas prácticas',
        body: [
          'Revisa los datos antes de guardar transacciones escaneadas o categorías sugeridas.',
          'Evita introducir documentos de identidad, números completos de tarjetas, claves, PIN, códigos de seguridad o información de terceros que no tengas permiso de procesar.',
          'Consulta a un profesional calificado cuando una decisión pueda afectar de forma importante tus finanzas.'
        ]
      }
    ]
  },
  refunds: {
    path: '/refunds-cancellation',
    title: 'Política de Reembolsos y Cancelación',
    shortTitle: 'Reembolsos',
    icon: 'payments',
    updatedAt,
    intro:
      'Esta política explica cómo cancelar una suscripción PRO y cómo solicitar ayuda con cobros o reembolsos.',
    sections: [
      {
        heading: 'Cancelación',
        body: [
          'Puedes cancelar tu suscripción PRO desde Configuración > Mi Suscripción > Cancelar Suscripción.',
          'La cancelación evita renovaciones futuras. Normalmente mantienes acceso PRO hasta el final del periodo de facturación ya pagado.',
          'También puedes revisar o cancelar pagos recurrentes desde tu cuenta PayPal cuando PayPal lo permita.'
        ]
      },
      {
        heading: 'Reembolsos',
        body: [
          'Los cobros de suscripción no son reembolsables de forma automática una vez iniciado el periodo, salvo que la ley aplicable, PayPal o una promoción específica indiquen lo contrario.',
          'Si hubo un cobro duplicado, error técnico, acceso PRO no activado o un problema razonable con el servicio, escríbenos dentro de los 14 días posteriores al cobro para evaluarlo.',
          'Podemos solicitar datos de cuenta, comprobante de pago o ID de transacción para investigar el caso.'
        ]
      },
      {
        heading: 'Cómo solicitar soporte',
        body: [
          `Envía tu solicitud a ${SUPPORT_EMAIL} desde el correo de tu cuenta, incluyendo fecha del cobro, monto, plan y una descripción breve del problema.`,
          'Responderemos por correo y, cuando aplique, procesaremos la corrección por el proveedor de pago correspondiente.'
        ]
      }
    ]
  }
};

export const legalLinks = [
  legalPolicies.terms,
  legalPolicies.privacy,
  legalPolicies.dataDeletion,
  legalPolicies.aiNotice,
  legalPolicies.refunds,
];
