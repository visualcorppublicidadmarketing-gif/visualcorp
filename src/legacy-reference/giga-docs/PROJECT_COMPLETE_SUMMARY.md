# 🌟 GIGAPRINT — Resumen Completo del Proyecto y Arquitectura del Sistema

> **Versión del Sistema:** 2.5.0 Enterprise  
> **Fecha de Actualización:** 24 de Agosto de 2026  
> **Repositorio Oficial:** `https://github.com/gigaprint-ec/gigaprint-webpage`  
> **Sitio Web & Terminal en Producción:** `https://gigaprint-ec.github.io/gigaprint-webpage/`  
> **Proyecto Supabase Remoto:** `ihifnhibzlgxotywbeji.supabase.co`  

---

## 📑 Tabla de Contenidos
1. [Identidad y Visión del Proyecto](#1-identidad-y-visión-del-proyecto)
2. [Stack Tecnológico y Dependencias](#2-stack-tecnológico-y-dependencias)
3. [Arquitectura de Datos y Sincronización Local-First](#3-arquitectura-de-datos-y-sincronización-local-first)
4. [Matriz de Roles y Permisos (RBAC)](#4-matriz-de-roles-y-permisos-rbac)
5. [Módulos Principales del Sistema](#5-módulos-principales-del-sistema)
   - [5.1 Punto de Venta (POS) & Cotizador en Mostrador](#51-punto-de-venta-pos--cotizador-en-mostrador)
   - [5.2 CRM de Clientes, Cuentas por Cobrar & WhatsApp Directo](#52-crm-de-clientes-cuentas-por-cobrar--whatsapp-directo)
   - [5.3 Cartelera Semanal de Taller (Master Dispatcher)](#53-cartelera-semanal-de-taller-master-dispatcher)
   - [5.4 Estaciones de Trabajo de Producción (3 Estados Táctiles)](#54-estaciones-de-trabajo-de-producción-3-estados-táctiles)
   - [5.5 Arqueo de Caja Diario y Cuadre Semanal (Caja Chica & Auditoría)](#55-arqueo-de-caja-diario-y-cuadre-semanal-caja-chica--auditoría)
   - [5.6 Inventario de Sustratos, Consumos & Mermas](#56-inventario-de-sustratos-consumos--mermas)
   - [5.7 Facturación Electrónica SRI (Módulo 11 & RUC)](#57-facturación-electrónica-sri-módulo-11--ruc)
6. [Mapa Completo de Rutas del Sistema](#6-mapa-completo-de-rutas-del-sistema)
7. [Base de Datos & Esquema SQL Consolidado](#7-base-de-datos--esquema-sql-consolidado)
8. [Guía de Comandos y Flujo de Despliegue](#8-guía-de-comandos-y-flujo-de-despliegue)
9. [Próximos Pasos & Hoja de Ruta (Roadmap)](#9-próximos-pasos--hoja-de-ruta-roadmap)

---

## 1. Identidad y Visión del Proyecto

**Gigaprint — Tus ideas en grande** es una plataforma integral de comercio, cotización inteligente y sistema ERP/POS para la industria gráfica, publicidad exterior, gigantografías, rotulación luminosa, textil y personalización.

El sistema unifica dos frentes en una sola aplicación web progresiva y ultrarrápida:
1. **Sitio Web Público:** Catálogo comercial de servicios, cotizador inteligente por $m^2$/unidad, carrito de cotizaciones, visualizador de proyectos y seguimiento público de pedidos mediante código QR / PIN.
2. **ERP & POS de Taller:** Terminal de cobranza rápida en mostrador, gestión de arqueo de caja semanal, CRM de clientes con cuentas por cobrar, cartelera semanal de despachos para el coordinador de taller, estaciones de producción táctiles para operarios de maquinaria y facturación SRI.

---

## 2. Stack Tecnológico y Dependencias

| Capa | Tecnologías | Propósito |
| :--- | :--- | :--- |
| **Frontend Core** | React 19, Vite 8, React Router v7 | Renderizado reactivo SPA con sub-segundo HMR |
| **Diseño & Estilos** | CSS Variables nativas, Space Grotesk, Plus Jakarta Sans | Estética moderna, glassmorphism, responsive 360px–4K |
| **Iconografía** | Lucide React | Iconografía vectorial consistente |
| **Editor de Contenidos** | TipTap Core & Extensions | Edición WYSIWYG de páginas y bloques |
| **Persistencia Local** | LocalStorage con versionado de claves | Operación 100% garantizada en caso de caída de internet |
| **Backend & Base de Datos** | Supabase (PostgreSQL, Auth, RLS, Storage) | Sincronización multi-dispositivo y almacenamiento en la nube |
| **Despliegue CI/CD** | GitHub Pages & GitHub Actions (`deploy-pages.yml`) | Despliegue automático continuo ante push a `main` |

---

## 3. Arquitectura de Datos y Sincronización Local-First

El sistema adopta el paradigma **Local-First con Sincronización Remota Segura**:
- **Cero bloqueos de interfaz:** Todas las acciones de cobro, actualización de etapas de taller, cheques de ítems impresos y arqueos de caja se guardan **inmediatamente** en el almacenamiento local del navegador y emiten eventos reactivos.
- **Cola de sincronización en segundo plano (`syncEntityRemote`):** Si hay conexión a Supabase y las credenciales están configuradas, los cambios se envían a PostgreSQL. Si la conexión falla o las tablas remotas no existen (`404` / `42P01`), la función `safeQuery()` amortigua el error sin registrar fallos en consola y encola las acciones para reintento automático.
- **Sincronización en Tiempo Real (`subscribePOSRealtime`):** Escucha canales de PostgreSQL para reflejar en vivo las órdenes creadas en una caja directamente en la pantalla del taller sin necesidad de recargar.

### Claves de Almacenamiento Local:
- `gigaprint_pos_store_v1`: Base de datos completa del POS (órdenes, clientes, pagos, sustratos, movimientos).
- `gigaprint_pos_session_v1`: Sesión activa de la asesora u operario (ID, nombre, rol, turno).
- `gigaprint-site-v1`: Contenidos del CMS público (hero, servicios, configuración).
- `gigaprint-cart-v1`: Carrito de cotizaciones del cliente público.
- `gigaprint-theme`: Preferencia de tema (claro / oscuro).

---

## 4. Matriz de Roles y Permisos (RBAC)

El sistema cuenta con un control de acceso basado en roles granular para proteger los precios base y la información financiera:

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│                                 ROLES DEL SISTEMA                                 │
├──────────────────────┬────────────────────────────────────────────────────────────┤
│ Super Admin / Admin  │ Control total: finanzas, base de precios, usuarios, CMS.   │
├──────────────────────┼────────────────────────────────────────────────────────────┤
│ Encargado de Local   │ Ventas del local, caja chica, suministros, compras.        │
├──────────────────────┼────────────────────────────────────────────────────────────┤
│ Coordinador de Taller│ Cartelera semanal, despacho, asignación de máquinas y OTs. │
├──────────────────────┼────────────────────────────────────────────────────────────┤
│ Operador Impresión   │ Cola de plotters, mermas, checklist de lonas/viniles.      │
├──────────────────────┼────────────────────────────────────────────────────────────┤
│ Operador Sublimación │ Parámetros de planchas térmicas, DTF y confección/relleno. │
├──────────────────────┼────────────────────────────────────────────────────────────┤
│ Operador Corte Láser │ Mesa de corte láser CO2/CNC, acrílico, prueba Neón LED 12V.│
├──────────────────────┼────────────────────────────────────────────────────────────┤
│ Asesora / Cajera     │ Cotizador, cobro, clientes y precios personalizados puntua-│
│                      │ les sin modificar la base de datos maestra.                │
└──────────────────────┴────────────────────────────────────────────────────────────┘
```

### Reglas de Cotización de Asesoras:
- **Protección de Catálogo:** Las asesoras **no** pueden modificar precios base en la base de datos maestra ni eliminar productos.
- **Precio Personalizado por Ítem:** En mostrador, si un cliente solicita ajustes comerciales complejos, la asesora puede asignar un precio personalizado (ej. Lona $5 ➔ $8) directamente al ítem de la venta actual con desglose de ajuste comercial visible en la orden sin alterar el tarifario global.

---

## 5. Módulos Principales del Sistema

### 5.1 Punto de Venta (POS) & Cotizador en Mostrador
- **Ruta:** `/admin/pos`
- **Capacidades:**
  - Búsqueda instantánea de sustratos por categoría (Gran Formato, Rótulos, Viniles, Sublimación, Acrílico, Papelería).
  - Cálculo paramétrico automático por $m^2$ (Ancho × Alto cm) o por Unidad/Lote.
  - Selección de acabados: ojetes metálicos perimetrales, dobladillo de refuerzo, bolsillo para tubo.
  - Servicios complementarios: Diseño gráfico (Sin diseño $0, Adaptación $5, Desde cero $15) e Instalación en sitio.
  - Cobro multi-pago (Efectivo, Transferencia Banco Pichincha, Tarjeta, DeUna, Crédito con saldo pendiente).
  - Venta en espera (Park/Hold sale) para atender a otro cliente y reanudar con 1 clic.
  - Impresión de Ticket Térmico de 80mm/58mm con código QR de tracking público.

### 5.2 CRM de Clientes, Cuentas por Cobrar & WhatsApp Directo
- **Ruta:** `/admin/pos/crm` o `/admin/crm`
- **Capacidades:**
  - Búsqueda rápida por Cédula, RUC, Teléfono o Nombre.
  - Matriz de envejecimiento de cartera (Deuda Corriente, 15 días, 30 días, +60 días).
  - Enlaces de WhatsApp automáticos con mensaje preformateado de proforma, aprobación de arte o recordatorio de saldo pendiente.
  - Bitácora de actividades CRM (Llamada, Visita, WhatsApp, Envío de prueba).

### 5.3 Cartelera Semanal de Taller (Master Dispatcher)
- **Ruta:** `/admin/taller` o `/admin/pos/cartelera`
- **Capacidades:**
  - Vista semanal consolidada de Lunes a Sábado.
  - Conmutador entre **Fecha de Ejecución** (fabricación en taller) y **Fecha de Instalación** (cuadrillas en exteriores).
  - Filtros rápidos: *Hoy*, *Mañana*, *Instalaciones en Sitio*, *Urgentes*.
  - Enlace directo al Vector de Arte adjunto para descarga inmediata.
  - Botón de WhatsApp con el cliente para coordinar toma de medidas en sitio.
  - Impresión de Orden de Trabajo (OT) técnica en lote.

### 5.4 Estaciones de Trabajo de Producción (3 Estados Táctiles)
- **Ruta:** `/admin/estaciones` o `/admin/pos/estaciones`
- **Tablero de 3 Columnas por Oficio:**
  1. **⏳ Por Fabricar / En Cola:** Trabajos pendientes listos para preparar material.
  2. **▶ En Máquina / Proceso:** Trabajo activo en plotter, plancha o láser. Incluye **Checklist Táctil por Ítem** para marcar con el dedo cada producto terminado de la orden.
  3. **✅ Terminado / Acabados:** Trabajos listos en mesa de secado, ojetes o empaque individual.
- **Botón de Merma Técnica (`⚠️ Merma`):** Registro de desperdicio de material con descuento automático de inventario.

### 5.5 Arqueo de Caja Diario y Cuadre Semanal (Caja Chica & Auditoría)
- **Ruta:** `/admin/pos/dashboard` o `/admin/dashboard`
- **Capacidades:**
  - Resumen ejecutivo semanal con desglose de Ventas Brutas, Abonos, Saldos por Cobrar y Gastos de Caja Chica.
  - Arqueo de caja ciego (el cajero ingresa el dinero físico contado en billetes y monedas y el sistema calcula automáticamente sobrantes o faltantes).
  - Historial de cierres de turno por asesora.
  - Exportación de reportes a Excel / CSV.

### 5.6 Inventario de Sustratos, Consumos & Mermas
- **Ruta:** `/admin/inventario` o `/admin/pos/inventario`
- **Capacidades:**
  - Control de stock de bobinas en $m^2$, tintas en litros y unidades de roll-ups/planchas.
  - Alerta visual de stock mínimo.
  - Registro de Órdenes de Compra (OC) a proveedores con recepción y aumento automático de stock.

### 5.7 Facturación Electrónica SRI (Módulo 11 & RUC)
- **Modal:** `POSSRIInvoiceModal.jsx`
- **Capacidades:**
  - Cálculo de IVA 15% / Tarifa 0% según normativa tributaria ecuatoriana.
  - Validación de RUC (13 dígitos) y Cédula de Identidad (10 dígitos).
  - Generador de Clave de Acceso estándar de 49 dígitos con algoritmo Módulo 11.

---

## 6. Mapa Completo de Rutas del Sistema

```
GIGAPRINT RUTAS
├── 🌐 PÚBLICAS
│   ├── /                         ➔ Página de Inicio (Hero, Soluciones, Clientes)
│   ├── /gigaprint                ➔ Nosotros, Maquinaria & Taller
│   ├── /promociones              ➔ Promociones Activas de Temporada
│   ├── /tienda                   ➔ Catálogo Comercial de Productos
│   ├── /tienda/:id               ➔ Detalle del Producto & Cotizador Rápido
│   ├── /cotizador                ➔ Cotizador Inteligente Multivariable
│   ├── /rastreo/:token           ➔ Seguimiento Público de Pedido (QR / PIN)
│   ├── /contacto                 ➔ Formulario de Contacto & Ubicación
│   └── /carrito                  ➔ Carrito de Cotizaciones del Cliente
│
└── 🔒 PRIVADAS & OPERATIVAS
    ├── /admin                    ➔ Dashboard General del Administrador
    ├── /admin/login              ➔ Acceso con Supabase Auth / PIN Maestro
    ├── /admin/pos                ➔ Terminal Punto de Venta & Caja Principal
    ├── /admin/taller             ➔ Cartelera Semanal de Taller (Coordinador)
    ├── /admin/estaciones         ➔ Estaciones de Producción (Impresión, Subli, Láser)
    ├── /admin/crm                ➔ CRM de Clientes, WhatsApp & Cuentas por Cobrar
    ├── /admin/pos/dashboard      ➔ Cuadre Semanal, Arqueo de Caja & Finanzas
    ├── /admin/inventario         ➔ Inventario de Materiales & Bobinas
    ├── /admin/compras            ➔ Órdenes de Compra a Proveedores
    ├── /admin/equipo             ➔ Gestión de Asesoras, PINs Semanales & Roles
    ├── /admin/operaciones        ➔ Calidad, postventa, mantenimiento e instalaciones
    ├── /admin/productos          ➔ Catálogo de Productos y Tarifas
    ├── /admin/contenido          ➔ Editor de Textos y CMS
    └── /admin/editor             ➔ Block Builder & Studio de Edición
```

---

## 7. Base de Datos & Esquema SQL Consolidado

Todo el esquema de base de datos se encuentra listo y optimizado en:  
📁 **`supabase/schema_pos_complete.sql`**

### Tablas Principales:
1. `pos_advisors`: Asesoras y colaboradores con PIN semanal, metas y rol RBAC.
2. `pos_customers`: Ficha de clientes, RUC/Cédula, dirección y límite de crédito.
3. `pos_orders`: Órdenes de trabajo, montos, estado de pago, fechas de taller y tracking token.
4. `pos_order_items`: Ítems detallados por orden (medidas, acabados, diseño, precio unitario).
5. `pos_payments`: Registro de pagos y abonos multi-método (Efectivo, Transferencia, etc.).
6. `pos_expenses`: Egresos y gastos operativos de caja chica.
7. `pos_cash_shifts`: Turnos de caja con arqueo físico (billetes, monedas, faltantes/sobrantes).
8. `pos_products`: Catálogo maestro de productos y tarifas base.
9. `pos_materials_inventory`: Stock de sustratos, bobinas y consumibles.
10. `pos_material_usage_logs`: Bitácora de consumo y registro de mermas técnicas.
11. `pos_suppliers`: Directorio de proveedores de insumos y materiales.
12. `pos_parked_sales`: Ventas en espera / carritos pausados en mostrador.
13. `pos_customer_activity_logs`: Historial de llamadas, visitas y seguimiento comercial.
14. `pos_workstations`: Registro de maquinaria y estaciones de producción.
15. `pos_access_sessions` / `pos_auth_attempts`: sesiones seguras por PIN y control de intentos.
16. `pos_audit_log` / `pos_idempotency_keys`: auditoría y protección contra operaciones duplicadas.
17. `pos_product_recipes`: recetas de materiales, ruta y tiempos por producto.
18. `pos_quality_checks` / `pos_returns`: calidad, retrabajos, reclamos y garantías.
19. `pos_assets` / `pos_maintenance_orders`: maquinaria y mantenimiento.
20. `pos_field_visits`: mediciones, instalaciones, evidencia y firma.
21. `pos_automation_rules` / `pos_automation_outbox`: reglas y cola para integraciones externas.

---

## 8. Guía de Comandos y Flujo de Despliegue

### Instalación y Desarrollo Local
```bash
# 1. Instalar dependencias
npm install

# 2. Iniciar servidor de desarrollo con Hot Reload
npm run dev

# 3. Compilar para producción (validación de build)
npm run build
```

### Despliegue a GitHub Pages (Automático)
Cualquier cambio realizado en la rama `main` activa el workflow `.github/workflows/deploy-pages.yml` y actualiza automáticamente el sitio publicado en menos de 2 minutos:
```bash
git add .
git commit -m "feat(modulo): descripcion del cambio"
git push origin main
```

---

## 9. Próximos Pasos & Hoja de Ruta (Roadmap)

1. **Conexión Directa con WhatsApp Business API / Webhooks:**
   - Implementar un Edge Function en Supabase para enviar mensajes automáticos de WhatsApp cuando el estado de la orden cambie a *"Listo para Retiro"* o *"En Ruta de Instalación"*.
2. **Facturación SRI autorizada:**
   - Conectar un proveedor de firma electrónica, autorización y envío de XML/RIDE. La interfaz existente es preparatoria.
3. **Módulo de Compras Avanzado (Cuentas por Pagar a Proveedores):**
   - Registrar facturas de compras a crédito de proveedores de vinil y lona con fechas de vencimiento de pago.
4. **Dominio Propio & Certificado SSL:**
   - Vincular el dominio corporativo `gigaprint.ec` o `gigaprint.com.ec` a Vercel / GitHub Pages.

### Estado remoto al 24 de agosto de 2026

- Supabase `ihifnhibzlgxotywbeji`: migraciones aplicadas hasta `20260824060000`.
- `ecgigaprint@gmail.com` y `estebanico10@gmail.com`: rol `super_admin` comprobado.
- No guardar contraseñas, PIN, token de GitHub ni claves service-role en este documento. Se configuran fuera del repositorio.

---
*Documento compilado y generado automáticamente para la memoria y continuidad del proyecto Gigaprint.*
