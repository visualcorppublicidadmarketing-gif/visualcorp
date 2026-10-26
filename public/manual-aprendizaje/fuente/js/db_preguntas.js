// js/db_preguntas.js
// Base de datos de preguntas del Quiz VisualCorp
// Convertida a módulo JS para funcionar con protocolo file://

window.VisualCorpQuizDB = [
    {
        "category": "Pre-impresión",
        "question": "¿En qué modo de color deben enviarse los archivos para impresión en gran formato?",
        "options": ["RGB", "HSB", "CMYK", "Grayscale"],
        "correct": 2,
        "explanation": "El modo CMYK (Cian, Magenta, Amarillo, Negro) es el estándar para impresión porque representa los pigmentos reales que usan las máquinas. RGB se usa solo para pantallas."
    },
    {
        "category": "Pre-impresión",
        "question": "¿Cuál es la resolución mínima recomendada (DPI) para papelería o stickers pequeños?",
        "options": ["72 dpi", "150 dpi", "300 dpi", "600 dpi"],
        "correct": 2,
        "explanation": "Para elementos pequeños que se ven de cerca (como tarjetas o stickers), se requiere un mínimo de 300 DPI para asegurar nitidez. 72 dpi es solo para web y 150 dpi para banners lejanos."
    },
    {
        "category": "Pre-impresión",
        "question": "¿Para qué sirve convertir los textos a curvas antes de enviar a imprenta?",
        "options": [
            "Para reducir el peso del archivo",
            "Para evitar que la tipografía se desconfigure si la imprenta no tiene la fuente",
            "Para aumentar la resolución de la letra",
            "Para cambiar el color más fácil"
        ],
        "correct": 1,
        "explanation": "Convertir a curvas (Ctrl+Shift+O) transforma el texto editable en formas vectoriales, garantizando que el diseño se vea exactamente igual sin importar si la otra computadora tiene o no la fuente instalada."
    },
    {
        "category": "Pre-impresión",
        "question": "¿Cuántos milímetros de sangría (bleed) se deja normalmente en un diseño para impresión?",
        "options": ["1 mm", "3 a 5 mm", "10 mm", "Sin sangría"],
        "correct": 1,
        "explanation": "La sangría de 3 a 5 mm es el espacio adicional de fondo o imagen que se deja fuera de las líneas de corte para que al cortar el material no queden bordes blancos."
    },
    {
        "category": "Corte Láser",
        "question": "¿A cuántos milímetros de distancia debe estar el cabezal del láser respecto al material (distancia focal) en la máquina de 60W?",
        "options": ["5 mm", "7 mm", "10 mm", "3 mm"],
        "correct": 1,
        "explanation": "La distancia focal estándar para la Galaxy 60W de VisualCorp es de 7 mm. Una distancia incorrecta desenfoca el láser, quemando el material sin cortarlo."
    },
    {
        "category": "Corte Láser",
        "question": "¿Qué material está ESTRICTAMENTE PROHIBIDO cortar en la máquina láser porque daña los espejos y es tóxico?",
        "options": ["Acrílico", "MDF", "PVC (Cintra/Sintra)", "Cartón Prensado"],
        "correct": 2,
        "explanation": "Cortar PVC (Cintra) genera gas cloro, que corroe los espejos focales de la máquina, oxida las partes metálicas y es altamente tóxico para los pulmones."
    },
    {
        "category": "Corte Láser",
        "question": "¿Cuál es la potencia máxima permitida en la máquina de 50W para no desgastar el tubo láser?",
        "options": ["100%", "90%", "65%", "80%"],
        "correct": 2,
        "explanation": "Nunca se debe pasar del 65% de potencia en la máquina pequeña para preservar la vida útil del tubo de vidrio CO2."
    },
    {
        "category": "Materiales",
        "question": "¿Cuál es la diferencia principal entre Lona Frontlight y Lona Backlight?",
        "options": [
            "La Frontlight es para uso interior, la Backlight es exterior",
            "La Frontlight es mate, la Backlight brillante",
            "La Frontlight recibe luz frontal, la Backlight permite que la luz pase desde atrás (cajas de luz)",
            "No hay diferencia, son nombres comerciales"
        ],
        "correct": 2,
        "explanation": "La lona Backlight (translúcida/panaflex) está diseñada para difuminar la luz trasera, ideal para rótulos luminosos. La Frontlight es totalmente opaca y requiere iluminación externa."
    },
    {
        "category": "Materiales",
        "question": "¿Qué material rígido es más frágil y cristalino (se quiebra más): Acrílico o Poliestireno?",
        "options": ["Poliestireno", "Acrílico", "Ambos son irrompibles", "Depende del grosor"],
        "correct": 0,
        "explanation": "El Poliestireno se cristaliza rápido con el clima y se quiebra con facilidad (ideal para cosas baratas en interior). El Acrílico es resistente y se usa en exteriores o premios."
    },
    {
        "category": "Ventas y Atención",
        "question": "¿Qué debes hacer SIEMPRE que envíes un archivo final o diseño a un cliente por WhatsApp para aprobación?",
        "options": [
            "Preguntarle si le parece bonito",
            "Avisarle que tiene que depositar",
            "Pedirle amablemente que verifique y apruebe todos los textos y datos antes de autorizar",
            "Enviarlo en PDF de alta resolución"
        ],
        "correct": 2,
        "explanation": "La responsabilidad de revisar fallas ortográficas o números de teléfono erróneos es del cliente ANTES de la producción. Siempre se le debe pedir una aprobación explícita de los textos."
    },
    {
        "category": "Ventas y Atención",
        "question": "¿Qué dato necesita el taller para saber la orientación de un vinil vehicular recortado para pegar DESDE ADENTRO del vidrio?",
        "options": [
            "El peso del vinil",
            "Si es mate o brillante",
            "Que el corte debe estar en Modo Espejo (Reflejado)",
            "La marca del carro"
        ],
        "correct": 2,
        "explanation": "Para pegar algo desde el interior de un vidrio y que se lea correctamente desde afuera, el arte debe imprimirse o cortarse volteado (Modo Espejo)."
    },
    {
        "category": "Diseño",
        "question": "¿Qué significa la 'Regla de los Tercios' en composición visual?",
        "options": [
            "Dividir la imagen en 3 franjas horizontales para mejorar el balance",
            "Dividir en una cuadrícula 3x3 y ubicar los elementos importantes en las intersecciones",
            "Usar 3 colores máximos en una pieza",
            "Colocar el texto en el tercio inferior de la imagen"
        ],
        "correct": 1,
        "explanation": "La regla de tercios divide visualmente la imagen en una cuadrícula de 9 celdas. Los puntos de intersección son los focos naturales de atención del ojo humano."
    },
    {
        "category": "Diseño",
        "question": "¿Cuál es la diferencia fundamental entre un archivo Vectorial y un archivo Raster (Pixel)?",
        "options": [
            "Los vectores son más pesados en megas",
            "Los raster se pueden escalar infinitamente sin perder calidad, los vectores no",
            "Los vectores se basan en fórmulas matemáticas y nunca pierden calidad; los raster sí pixelan al ampliar",
            "No hay diferencia real, son lo mismo con otro nombre"
        ],
        "correct": 2,
        "explanation": "Los archivos vectoriales (AI, SVG) se generan con ecuaciones matemáticas y se pueden escalar de un sticker a un edificio sin perder calidad. Los raster (JPG, PNG) se componen de píxeles y se deterioran al ampliar."
    },
    {
        "category": "Color",
        "question": "¿Qué significa 'Pantone' en el mundo del diseño gráfico?",
        "options": [
            "Un software de edición de imágenes",
            "Un sistema de colores estandarizados con fórmulas exactas de tinta para garantizar reproducción precisa",
            "Una marca de impresoras de gran formato",
            "Un tipo de papel especial para fotografía"
        ],
        "correct": 1,
        "explanation": "Pantone (Pantone Matching System o PMS) es un sistema propietario de colores de referencia. Cada color tiene un código único (ej: Pantone 485 para rojo) que garantiza que se vea igual en cualquier parte del mundo."
    },
    {
        "category": "Color",
        "question": "¿Por qué los colores en pantalla a veces se ven más vibrantes que cuando se imprimen?",
        "options": [
            "Porque la impresora tiene pocas tintas",
            "Porque la pantalla usa luz (RGB) que puede mostrar más colores que los pigmentos de tinta (CMYK)",
            "Porque la resolución print es menor",
            "Porque Photoshop exagera el color automáticamente"
        ],
        "correct": 1,
        "explanation": "La pantalla es un modelo aditivo (suma luz, lo que da colores más brillantes y saturados). La impresión es sustractiva (absorbe luz mediante tinta). El gamut o gama de colores imprimibles es mucho más pequeño que el visible en pantalla."
    }
];
