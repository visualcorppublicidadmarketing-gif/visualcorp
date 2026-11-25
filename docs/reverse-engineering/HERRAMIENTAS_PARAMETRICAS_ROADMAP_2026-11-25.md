# Herramientas paramétricas 2D/3D de Visual Corp Suite

**Fecha:** 2026-11-25
**Estado:** dirección técnica de desarrollo; algunas capacidades propuestas requieren pruebas y decisiones posteriores.

## Contrato común para nuevos generadores

Cada herramienta especializada debe mantener un modelo de parámetros versionado y normalizado. El generador produce una representación geométrica en unidades explícitas; editor 2D, visor 3D y exportadores consumen esa misma representación. Las reglas de corte o impresión se habilitan solo cuando el formato tiene un validador adecuado.

```text
Entrada versionada → normalización/validación → geometría 2D común
                                               ├─ editor 2D
                                               ├─ previsualización 3D
                                               └─ exportadores por proceso
```

No se debe convertir cada producto en un archivo de malla estático, ni forzar dominios distintos a compartir un único kernel. Se comparte infraestructura después de identificar comportamiento y geometría comunes.

## Estado de los módulos

| Módulo | Estado | Salida actual | Límite conocido |
|---|---|---|---|
| Generador de cajas | Disponible en Suite; se amplía la visualización de unidades | SVG/DXF/JSON y visualización Three.js | Sin kerf/perfil de máquina ni validación física confirmada |
| Monogramas | V1 implementada en Suite | SVG de contornos y `.vcmg.json`; preview 2D/3D | Capas sin unión booleana, puentes, STL/3MF o validación de malla |
| Ancho de impresión QR | Disponible con selección mm/cm | SVG y vista de impresión | El ancho se conserva en mm internamente |
| Nuevos generadores | Candidatos | Por decidir | Elegir según demanda y geometría antes de implementar |

## Unidades y precisión

Las herramientas físicas mantienen sus magnitudes y geometría canónicas en milímetros. La unidad visible es una preferencia de interfaz: monogramas admiten mm/cm; caja admite mm/cm/in; el ancho impreso del QR admite mm/cm. Los campos de mm avanzan 0,1 mm; en cm, 0,01 cm (también 0,1 mm); en pulgadas, Caja conserva el paso de 0,01 in. Las exportaciones de fabricación mantienen escala mm para no reinterpretar los proyectos existentes.

## Secuencia propuesta

1. Revisar el preview del editor de monogramas, verificar los campos en mm/cm y corregir problemas de interacción, fuente y responsive que aparezcan.
2. Acordar el comportamiento de “pieza soldada”: unión 2D, reglas de islas, puentes y tolerancias; no inferirlo de la referencia por capturas.
3. Preparar exportación según proceso: corte 2D primero; impresión 3D después de comprobar mallas y dimensiones.
4. Investigar una biblioteca local de fuentes con procedencia y licencias claras; permitir fuentes externas solo con importación local explícita.
5. Elegir el siguiente generador entre placas/rótulos, accesorios personalizados y muebles parametrizados. Cada uno tendrá modelo y exportadores específicos.
6. Extraer el ciclo de vida del visor Three.js a un componente común cuando al menos dos generadores activos necesiten la misma cámara, controles, materiales y limpieza.

## Decisiones de producto pendientes

- Proceso prioritario por herramienta (láser, impresión 3D u otro) y sus materiales realmente disponibles.
- Catálogo inicial de fuentes y reglas para nombres con tildes, ligaduras y símbolos.
- Librería geométrica para booleanos y exactitud requerida en unidades de fabricación.
- Tolerancias, formatos de archivo de destino y software CAM/impresión donde el equipo los abrirá.
- Prioridad del próximo generador; la cola anterior es propuesta, no compromiso comercial.

## Fuentes de trabajo

- [Implementación V1 de monogramas](Monogramas-2026-11-25/IMPLEMENTACION_V1.md).
- [Investigación de monogramas](Monogramas-2026-11-25/ANALISIS_MONOGRAMAS.md).
- [Investigación de generadores paramétricos](BurroCreativo-2026-11-25/ANALISIS_ARQUITECTURA_GENERADORES.md).
