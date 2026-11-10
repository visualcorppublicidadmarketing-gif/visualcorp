export type LearningSection = {
  id: string;
  title: string;
  intro: string;
  points: string[];
  note?: string;
};

export type LearningGuide = {
  id: string;
  areaId: string;
  title: string;
  subtitle: string;
  duration: string;
  outcome: string;
  sections: LearningSection[];
  checklist: string[];
  source: string;
};

export type LearningArea = {
  id: string;
  title: string;
  eyebrow: string;
  description: string;
  accent: string;
  icon: string;
  guideIds: string[];
};

export const learningAreas: LearningArea[] = [
  { id: 'inicio', title: 'Primeros pasos', eyebrow: 'INTEGRACIÓN', description: 'Conoce el equipo, los espacios y las rutinas compartidas.', accent: 'mint', icon: 'Compass', guideIds: ['induccion'] },
  { id: 'seguridad', title: 'Seguridad', eyebrow: 'CUIDADO Y PREVENCIÓN', description: 'Prepara el trabajo con criterio, equipo adecuado y comunicación clara.', accent: 'coral', icon: 'ShieldCheck', guideIds: ['seguridad'] },
  { id: 'ventas', title: 'Ventas y atención', eyebrow: 'EXPERIENCIA DEL CLIENTE', description: 'Escucha, verifica datos y deja cada solicitud lista para seguimiento.', accent: 'amber', icon: 'MessagesSquare', guideIds: ['asesores'] },
  { id: 'diseno-produccion', title: 'Diseño y producción', eyebrow: 'DEL ARTE AL ACABADO', description: 'Prepara archivos, materiales, equipos y entregas entre áreas.', accent: 'violet', icon: 'PanelsTopLeft', guideIds: ['fundamentos', 'disenadores', 'impresores', 'laser', 'taller'] },
  { id: 'marketing', title: 'Marketing', eyebrow: 'COMUNICACIÓN DE MARCA', description: 'Cuenta el trabajo con intención, cuidado y autorización.', accent: 'cyan', icon: 'Megaphone', guideIds: ['marketing'] },
  { id: 'practicas', title: 'Prácticas y herramientas', eyebrow: 'APRENDER HACIENDO', description: 'Calcula, consulta color, repasa conceptos y usa listas de apoyo.', accent: 'pink', icon: 'Activity', guideIds: [] },
];

export const learningPractices = [
  { id: 'calculadora', title: 'Calculadora de áreas', description: 'Calcula el metraje por pieza y por cantidad.', icon: 'Calculator', category: 'Medidas', duration: '2 min' },
  { id: 'distancia', title: 'Distancia visual', description: 'Explora cómo influye el tamaño de letra en la lectura.', icon: 'Ruler', category: 'Medidas', duration: '3 min' },
  { id: 'pantone', title: 'Catálogo de color', description: 'Busca referencias por nombre, número o valor HEX.', icon: 'SwatchBook', category: 'Color', duration: 'Libre' },
  { id: 'colormatch', title: 'Color Match', description: 'Entrena el ojo con una ronda breve de color.', icon: 'Palette', category: 'Color', duration: '3 min' },
  { id: 'quiz', title: 'Trivia de Visual Corp', description: 'Repasa criterios de seguridad, atención y producción.', icon: 'Brain', category: 'Repaso', duration: '4 min' },
  { id: 'checklist', title: 'Listas de apoyo', description: 'Haz una revisión personal antes de un traspaso.', icon: 'CheckCircle2', category: 'Flujo', duration: 'Libre' },
];

export const learningChecklists = [
  { id: 'asesoria', label: 'Asesoría', tasks: ['Confirmar objetivo, medidas y cantidad', 'Verificar precio y condiciones vigentes', 'Dejar visible el dato pendiente', 'Asignar responsable y próximo paso'] },
  { id: 'diseno', label: 'Diseño', tasks: ['Confirmar proceso y material', 'Revisar dimensiones y orientación', 'Comprobar textos, vínculos y capas', 'Exportar el formato acordado y avisar a producción'] },
  { id: 'impresion', label: 'Impresión', tasks: ['Cruzar archivo con la orden', 'Confirmar material y perfil actual', 'Revisar la prueba inicial', 'Etiquetar y proteger el trabajo terminado'] },
  { id: 'taller', label: 'Taller', tasks: ['Confirmar alcance, contacto y acceso', 'Revisar piezas, herramientas y EPP', 'Evaluar las condiciones del sitio', 'Registrar resultado y pendientes'] },
];

export const learningGuides: LearningGuide[] = [
  {
    id: 'induccion', areaId: 'inicio', title: 'Tu primer día en Visual Corp', subtitle: 'Una entrada clara al equipo, sus espacios y su forma de colaborar.', duration: '6 min', outcome: 'Al terminar, sabrás dónde orientarte y cómo pedir ayuda cuando algo no esté claro.', source: 'Adaptado del manual interno de inducción.',
    sections: [
      { id: 'bienvenida', title: 'Una bienvenida común', intro: 'Visual Corp convierte ideas gráficas en piezas que ayudan a otros negocios a presentarse. Cada etapa influye en la experiencia final.', points: ['El equipo participa desde la orientación inicial hasta la producción, instalación y comunicación del trabajo.', 'Pregunta cuando falte contexto. Compartir una duda a tiempo evita retrabajo y protege los materiales.', 'Las sugerencias para mejorar un flujo se conversan con la persona responsable del área.'], note: 'El propósito descrito aquí resume el manual de referencia; los roles y responsables concretos pueden cambiar.' },
      { id: 'rutina', title: 'Empieza con orden', intro: 'La puntualidad, la comunicación y el cuidado del espacio hacen más sencillo coordinar la jornada.', points: ['Confirma tu horario vigente con quien coordina el equipo; no tomes un horario antiguo como regla actual.', 'Si detectas un error en un archivo, falta de material o una anomalía en un equipo, avisa cuanto antes.', 'Antes de cambiar una secuencia o una prioridad, valida el siguiente paso con la persona que dirige el trabajo.'] },
      { id: 'espacios', title: 'Ubícate y cuida el espacio', intro: 'Los espacios y recursos compartidos requieren señalización visible y hábitos consistentes.', points: ['Pregunta dónde están el botiquín, los extintores, los puntos de reunión y las rutas de salida.', 'Mantén libres los accesos, tableros, equipos y pasillos.', 'Devuelve las herramientas a su lugar y deja limpia tu estación al terminar.'], note: 'Las ubicaciones y las pautas de clasificación de sobrantes deben confirmarse en el taller.' },
      { id: 'comunicacion', title: 'Colaboración diaria', intro: 'Una buena entrega incluye el contexto suficiente para que otra persona pueda continuar.', points: ['Describe qué ya se hizo, qué falta y qué información necesitas.', 'Comparte cambios relevantes con el área siguiente; no supongas que el estado se entiende por el nombre del archivo.', 'Si hay un riesgo para la fecha, calidad o seguridad, escálalo en cuanto lo observes.'] },
    ],
    checklist: ['Confirmé con quién resolver dudas de mi área.', 'Identifiqué las salidas y los recursos de emergencia.', 'Conozco dónde se guarda y devuelve el equipo común.', 'Sé cómo reportar un problema o una mejora.'],
  },
  {
    id: 'seguridad', areaId: 'seguridad', title: 'Seguridad en el taller', subtitle: 'Reconoce condiciones de riesgo y detén la tarea cuando falte una condición segura.', duration: '8 min', outcome: 'Antes de operar o manipular materiales, podrás identificar qué debes confirmar y a quién avisar.', source: 'Adaptado del manual de seguridad industrial; validar siempre con procedimientos y fichas vigentes.',
    sections: [
      { id: 'antes', title: 'Antes de comenzar', intro: 'La seguridad empieza con una decisión: no iniciar una tarea si no comprendes el procedimiento o faltan controles.', points: ['Confirma que tienes capacitación para la operación asignada y que el equipo está en condiciones de uso.', 'Revisa la señalización, resguardos, ventilación y equipo de protección indicados por el procedimiento de esa máquina.', 'Mantén bebidas, objetos sueltos y obstáculos fuera de las áreas de operación.'], note: 'Esta guía organiza recordatorios generales; la instrucción del fabricante, la ficha de seguridad y el procedimiento aprobado tienen prioridad.' },
      { id: 'proteccion', title: 'Protección adecuada', intro: 'El equipo de protección depende de la tarea. Usar el elemento incorrecto puede crear un riesgo adicional.', points: ['Consulta qué protección ocular, respiratoria, auditiva, de manos y calzado requiere cada operación.', 'No uses guantes cerca de partes giratorias si el procedimiento indica que pueden engancharse.', 'Reemplaza elementos dañados y avisa si el equipo requerido no está disponible.'] },
      { id: 'sustancias', title: 'Tintas, solventes y materiales', intro: 'Lee la etiqueta y la ficha de seguridad antes de manipular cualquier sustancia.', points: ['Usa únicamente el producto identificado para la tarea y en el espacio indicado.', 'No mezcles productos ni improvises métodos de limpieza.', 'Ante contacto, derrame o exposición, detén la tarea y sigue la ficha y el protocolo interno; informa a la persona responsable.'] },
      { id: 'respuesta', title: 'Detener y reportar', intro: 'Un ruido inusual, un resguardo abierto, humo, olor intenso, derrame o malestar requieren atención inmediata.', points: ['Detén la operación desde el control previsto si puedes hacerlo sin exponerte.', 'Aléjate de la zona de riesgo y avisa a la persona responsable o al servicio de emergencia según el protocolo.', 'No reinicies el equipo hasta que la persona competente confirme que es seguro hacerlo.'], note: 'Los números, rutas de evacuación, ubicación de extintores y tratamiento de lesiones deben estar visibles en el plan de emergencia vigente.' },
    ],
    checklist: ['Leí el procedimiento específico de la tarea.', 'Tengo la protección indicada y sé usarla.', 'El área está ventilada, ordenada y sin obstáculos.', 'Sé cómo detener el trabajo y reportar una emergencia.'],
  },
  {
    id: 'asesores', areaId: 'ventas', title: 'Atención y asesoría', subtitle: 'Convierte una consulta en un pedido entendido y fácil de seguir.', duration: '10 min', outcome: 'Podrás reunir los datos esenciales, confirmar el alcance y dejar claro el siguiente paso.', source: 'Adaptado del manual de asesores; precios y estados deben consultarse en las fuentes vigentes.',
    sections: [
      { id: 'escucha', title: 'Empieza por entender', intro: 'Antes de ofrecer una alternativa, aclara qué necesita la persona y dónde se usará el producto.', points: ['Pregunta por el objetivo, el lugar de uso, las medidas, la cantidad y cuándo necesita una respuesta.', 'Aclara si la persona ya tiene arte listo o necesita ayuda de diseño.', 'Repite el pedido con tus palabras para confirmar que entendiste.'] },
      { id: 'alcance', title: 'Confirma el alcance', intro: 'Una cotización clara separa lo conocido de lo pendiente.', points: ['Registra el material o acabado confirmado, las medidas y las cantidades.', 'Señala cualquier dato que deba verificar producción antes de comprometer una solución.', 'Aclara qué incluye la propuesta y qué requiere confirmación adicional.'], note: 'No inventes precios, descuentos, disponibilidad ni fechas. Verifica cada dato en el catálogo o con la persona responsable antes de comunicarlo.' },
      { id: 'registro', title: 'Deja una solicitud útil', intro: 'El registro ayuda a que otra persona pueda retomar el trabajo sin volver a empezar la conversación.', points: ['Anota el contacto, el requerimiento, las referencias recibidas y lo que falta confirmar.', 'Usa el canal vigente de registro del equipo y revisa que el seguimiento quede asignado.', 'Comunica al cliente cuándo recibirá una actualización solo cuando el equipo haya confirmado ese plazo.'] },
      { id: 'seguimiento', title: 'Acompaña el proceso', intro: 'Un seguimiento breve y preciso genera confianza.', points: ['Consulta el estado en el sistema vigente antes de responder.', 'Si aparece un cambio, explica qué se confirmó, qué está pendiente y quién continúa.', 'Cierra el ciclo confirmando que la respuesta llegó; no marques una venta o entrega como completada sin evidencia.'] },
    ],
    checklist: ['Entendí el uso, las medidas y la cantidad.', 'Separé hechos confirmados de datos pendientes.', 'Verifiqué precios y condiciones vigentes.', 'Dejé responsable y próximo paso en el canal actual.'],
  },
  {
    id: 'fundamentos', areaId: 'diseno-produccion', title: 'Fundamentos gráficos', subtitle: 'Color, imagen y composición explicados desde el recorrido hasta producción.', duration: '12 min', outcome: 'Podrás elegir el tipo de archivo y revisar los aspectos básicos antes de entregarlo.', source: 'Adaptado del manual de fundamentos gráficos.',
    sections: [
      { id: 'color', title: 'Color en pantalla e impresión', intro: 'RGB mezcla luz y se usa principalmente en pantallas; CMYK describe una mezcla de tintas de impresión.', points: ['Un mismo color puede cambiar entre monitor y material impreso.', 'El resultado también depende del material, la tinta, el perfil y la condición de la máquina.', 'Una muestra visual o HEX sirve como referencia; no garantiza una coincidencia física exacta.'], note: 'Confirma el modo de color y el perfil pedido con el equipo que producirá el trabajo.' },
      { id: 'imagen', title: 'Vectores, píxeles y resolución', intro: 'Cada formato responde a una necesidad distinta.', points: ['Un vector conserva contornos al escalar y es útil para logos, texto y trazos de corte.', 'Una imagen raster está compuesta por píxeles; al ampliarla puede perder nitidez.', 'Revisa dimensiones finales y resolución efectiva a tamaño de impresión, no solo el valor que muestra el archivo.'] },
      { id: 'composicion', title: 'Composición y lectura', intro: 'La jerarquía dirige la mirada y ayuda a entender el mensaje en pocos segundos.', points: ['Define primero qué debe leerse a mayor distancia y qué puede quedar como detalle.', 'Usa contraste suficiente entre texto y fondo, y limita el número de estilos tipográficos.', 'Comprueba la pieza a tamaño real o con una simulación que represente su distancia de lectura.'] },
      { id: 'preparacion', title: 'Sangría, margen y formatos', intro: 'El formato final depende del material y el método de producción.', points: ['Mantén textos y elementos importantes dentro de la zona segura.', 'Extiende fondos hasta la sangría solo cuando el método de corte lo requiera.', 'Entrega fuentes, vínculos e imágenes según el flujo acordado; convierte textos a curvas cuando lo exija el operador.'], note: 'Los milímetros de sangría y la resolución mínima no son universales: confirma las especificaciones del pedido.' },
    ],
    checklist: ['Confirmé dimensiones y orientación.', 'Revisé contraste, jerarquía y ortografía.', 'Verifiqué vínculos e imágenes a tamaño final.', 'Acordé el perfil, formato y sangría con producción.'],
  },
  {
    id: 'disenadores', areaId: 'diseno-produccion', title: 'Diseño y preparación de archivos', subtitle: 'Entrega archivos claros para impresión, corte y continuidad entre áreas.', duration: '10 min', outcome: 'Podrás preparar un arte con nombre y estructura comprensibles para quien lo recibe.', source: 'Adaptado del manual de diseñadores; las reglas de máquinas se deben confirmar con su operador.',
    sections: [
      { id: 'flujo', title: 'Elige el formato según el proceso', intro: 'Una imagen lista para redes no necesariamente está lista para una máquina.', points: ['Conserva un editable y exporta una versión final para el proceso solicitado.', 'Identifica si se necesita impresión, corte, grabado, instalación o una combinación.', 'Canva y Photoshop pueden ser útiles para piezas raster; confirma con producción si hacen falta trazos vectoriales.'] },
      { id: 'nombres', title: 'Nombres que cuentan el trabajo', intro: 'La nomenclatura heredada combina material, concepto, medidas, contacto y cantidad.', points: ['Describe el trabajo con palabras fáciles de buscar.', 'Escribe ancho × alto en el orden acordado para ese flujo.', 'Antes de usar abreviaturas o nombres de persona, confirma que el equipo los reconoce.'], note: 'Los ejemplos del manual reflejan un flujo anterior; evita datos personales innecesarios en nombres compartidos.' },
      { id: 'laser', title: 'Archivos para corte', intro: 'Los colores de línea, rellenos y capas pueden tener un significado operativo para la máquina.', points: ['No reutilices parámetros de un archivo distinto sin confirmar material, espesor y proceso.', 'Convierte texto a contornos si el operador lo requiere y revisa formas duplicadas o abiertas.', 'Exporta en el formato y versión que acepte el controlador actual.'], note: 'La convención de colores y la versión AI 8 mencionadas por el manual deben confirmarse con el operador del equipo antes de producir.' },
      { id: 'entrega', title: 'Entrega final y traspaso', intro: 'Un archivo final necesita contexto suficiente para salir bien a la primera.', points: ['Incluye una vista previa y notas sobre medidas, material, caras visibles y acabados.', 'Indica qué archivo es el editable y cuál se puede enviar a producción.', 'Comunica cambios y evita reemplazar silenciosamente un archivo que ya está en cola.'] },
    ],
    checklist: ['El archivo corresponde al proceso confirmado.', 'Medidas, orientación, cantidad y nombre están claros.', 'Verifiqué capas, vínculos, fuentes y trazos.', 'El operador recibió formato, versión y notas necesarias.'],
  },
  {
    id: 'impresores', areaId: 'diseno-produccion', title: 'Impresión de gran formato', subtitle: 'Prepara el material, verifica el archivo y registra la calidad del resultado.', duration: '10 min', outcome: 'Podrás hacer un control antes, durante y después de una impresión.', source: 'Adaptado del manual de impresores. Las especificaciones de equipos citadas por el original requieren actualización técnica.',
    sections: [
      { id: 'recepcion', title: 'Recibe el trabajo completo', intro: 'Antes de cargar material, comprueba que el archivo y las instrucciones correspondan al mismo trabajo.', points: ['Verifica nombre, dimensiones, material, cantidad y sentido de lectura.', 'Confirma el archivo aprobado y revisa que los vínculos estén disponibles.', 'Pregunta por perfil, pasadas, temperatura y acabado según la ficha vigente del material y de la máquina.'] },
      { id: 'material', title: 'Cuida la carga y el equipo', intro: 'Una carga incorrecta puede afectar el avance, los bordes o los cabezales.', points: ['Inspecciona el rollo y mantén el área despejada antes de alimentar el material.', 'No fuerces ni retires el material mientras el mecanismo está en movimiento.', 'Si observas roce, banda, ruido o calentamiento inusual, pausa y comunica el hallazgo.'] },
      { id: 'control', title: 'Revisa el resultado', intro: 'La calidad se controla durante el proceso, no solo al final.', points: ['Revisa el inicio y los primeros metros antes de dejar avanzar una tirada larga.', 'Compara color, registro, bandas y acabado con la referencia aprobada.', 'Documenta el defecto y detén el trabajo si continuar desperdiciará más material.'] },
      { id: 'cierre', title: 'Entrega y mantenimiento', intro: 'El material terminado debe quedar identificable y protegido.', points: ['Etiqueta la pieza con la referencia del trabajo y la indicación que acordó el equipo.', 'Manipula, corta y enrolla con cuidado para proteger la superficie.', 'Sigue la rutina de mantenimiento del fabricante y registra la tarea; no improvises limpiezas ni químicos.'], note: 'El manual fuente menciona modelos de máquina, tintas y cabezales concretos. Confirma el inventario técnico actual antes de aplicar esos datos.' },
    ],
    checklist: ['Coinciden archivo, medidas, material y pedido.', 'Confirmé perfil y parámetros con la referencia vigente.', 'Revisé prueba inicial y avance.', 'Etiqueté y dejé registro de cualquier incidencia.'],
  },
  {
    id: 'laser', areaId: 'diseno-produccion', title: 'Corte láser CO₂', subtitle: 'Un flujo seguro empieza por el material, la extracción y la revisión del archivo.', duration: '12 min', outcome: 'Identificarás las verificaciones que deben preceder a cualquier corte.', source: 'Adaptado del manual de corte láser; confirmar equipo, lente y parámetros en la documentación vigente.',
    sections: [
      { id: 'seguridad', title: 'Comprueba antes de operar', intro: 'Nunca inicies una operación si falta capacitación, supervisión requerida o una condición segura.', points: ['Confirma que la tapa y los resguardos estén en la posición prevista.', 'Verifica que extracción y refrigeración estén activas según el procedimiento del equipo.', 'Mantén vigilancia continua del material durante el corte; no dejes la máquina operando sin supervisión.'], note: 'El láser es invisible y puede causar lesiones. No retires protecciones ni accedas al tubo o componentes eléctricos.' },
      { id: 'material', title: 'Confirma material y parámetros', intro: 'El material, su espesor y su composición determinan si se puede procesar y cómo.', points: ['Identifica el material con certeza antes de colocarlo en la cama.', 'No cortes PVC ni materiales desconocidos; algunos liberan gases peligrosos o corrosivos.', 'Usa una prueba y parámetros confirmados por el operador para ese equipo y lote.'] },
      { id: 'archivo', title: 'Prepara el diseño', intro: 'Una geometría ordenada evita recorridos duplicados o cortes no previstos.', points: ['Revisa escala, dimensiones, unidades y orientación.', 'Comprueba que las líneas de corte y las áreas de grabado estén separadas y reconocibles.', 'Elimina duplicados, contornos abiertos y objetos ocultos antes de enviar el trabajo.'], note: 'El manual de origen menciona Galaxy CO₂ 60 W, distancia de foco de 7 mm y colores de RDWorks. Confirma que esos valores correspondan a la máquina y configuración actuales.' },
      { id: 'cierre', title: 'Termina y deja constancia', intro: 'El final de la operación también forma parte del control de calidad.', points: ['Espera el tiempo y la condición de ventilación que indique el procedimiento.', 'Revisa bordes, dimensiones y cantidad antes de pasar al acabado.', 'Registra incidencias y devuelve el archivo a la carpeta acordada.'] },
    ],
    checklist: ['Identifiqué el material y su espesor.', 'Verifiqué tapa, extracción y refrigeración.', 'El archivo no tiene duplicados y está a escala.', 'Tengo parámetros confirmados y mantendré supervisión.'],
  },
  {
    id: 'taller', areaId: 'diseno-produccion', title: 'Taller, acabados e instalación', subtitle: 'Prepara el trabajo, coordina el sitio y entrega con atención al detalle.', duration: '10 min', outcome: 'Podrás organizar una instalación sin dejar cabos sueltos entre taller y cliente.', source: 'Adaptado del manual del personal de taller.',
    sections: [
      { id: 'preparar', title: 'Prepara antes de salir', intro: 'Una revisión breve del trabajo reduce viajes y reprogramaciones evitables.', points: ['Confirma dirección, acceso, contacto, alcance y condiciones del sitio.', 'Revisa piezas, herrajes, herramientas y protección personal requeridos.', 'Asegura que el equipo entiende quién instala, quién supervisa y cómo escalar un problema.'] },
      { id: 'instalar', title: 'Trabaja con método', intro: 'La instalación debe seguir el alcance acordado y las condiciones reales del lugar.', points: ['Revisa el soporte y las condiciones del sitio antes de fijar o perforar.', 'Detén la tarea si cambió el alcance, hay un riesgo o la estructura no parece adecuada.', 'Protege el espacio, ordena cables y materiales y coordina cualquier ajuste con la persona responsable.'] },
      { id: 'cliente', title: 'Representa al equipo', intro: 'La atención en sitio es parte del producto que recibe el cliente.', points: ['Explica de forma cordial qué se va a realizar y confirma el área de trabajo.', 'Avisa si aparece un imprevisto y no prometas una solución que el equipo no confirmó.', 'Recoge residuos y herramientas al terminar y presenta el resultado para revisión.'] },
      { id: 'evidencia', title: 'Cierra el trabajo', intro: 'Una entrega completa deja constancia del estado real.', points: ['Registra qué se instaló, qué quedó pendiente y quién continúa.', 'Fotografía el resultado solo cuando el cliente haya autorizado esa captura y su uso.', 'Resguarda materiales sobrantes según la pauta vigente del taller.'] },
    ],
    checklist: ['Revisé alcance, acceso y contacto.', 'Llevo piezas, herramientas y EPP adecuados.', 'El sitio y soporte son seguros para continuar.', 'Registré resultado, pendiente y autorización de fotografías.'],
  },
  {
    id: 'marketing', areaId: 'marketing', title: 'Marketing con criterio', subtitle: 'Muestra el trabajo real, cuida la identidad y responde con información confirmada.', duration: '8 min', outcome: 'Podrás preparar una publicación útil sin exponer al cliente ni prometer algo no validado.', source: 'Adaptado del manual de marketing. Las claves, cuentas y métricas se consultan en sus fuentes vigentes.',
    sections: [
      { id: 'proposito', title: 'Cuenta el valor del trabajo', intro: 'Una publicación útil explica qué necesidad resolvía el trabajo y qué se hizo, con evidencia real.', points: ['Prioriza una idea central, una imagen clara y un llamado a la acción apropiado.', 'Usa fotografías reales solo si el proyecto y el material pueden mostrarse.', 'Distingue el trabajo terminado de un mockup, referencia o propuesta.'] },
      { id: 'permiso', title: 'Cuida la autorización', intro: 'La privacidad del cliente se confirma antes de publicar.', points: ['Solicita autorización para fotografiar y, por separado, para publicar el material.', 'Evita mostrar documentos, personas, direcciones, placas o datos no necesarios.', 'Guarda el permiso y la referencia del activo en el flujo de contenidos.'], note: 'La solicitud de permiso no se presume por haber ejecutado el trabajo.' },
      { id: 'identidad', title: 'Mantén coherencia visual', intro: 'La identidad debe ayudar a reconocer a Visual Corp sin competir con el trabajo mostrado.', points: ['Usa los archivos de marca confirmados, con espacio y contraste suficientes.', 'Aplica tipografías y colores de la guía digital vigente.', 'No inventes promociones, servicios, precios, horarios ni condiciones.'] },
      { id: 'respuesta', title: 'Responde y aprende', intro: 'La atención digital también necesita claridad y seguimiento.', points: ['Responde con tono amable y pide solo los datos necesarios para orientar la consulta.', 'Confirma disponibilidad, precio y fecha con la fuente interna antes de afirmarlos.', 'Revisa alcance, consultas y resultados con métricas definidas por el equipo; no conviertas una variación en una conclusión de ventas.'] },
    ],
    checklist: ['El material muestra un trabajo o propuesta correctamente identificado.', 'Tengo autorización para la imagen y la publicación.', 'Marca y texto coinciden con guías y datos confirmados.', 'La respuesta evita precios y plazos sin verificar.'],
  },
];

export const findGuide = (id: string) => learningGuides.find((guide) => guide.id === id);
export const findArea = (id: string) => learningAreas.find((area) => area.id === id);
