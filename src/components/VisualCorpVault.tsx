import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useWorkspace, formatDate } from '../app/workspace';
import { useAuth } from '../auth/AuthProvider';
import { supabase, supabaseConfigured } from '../lib/supabaseClient';
import './VisualCorpVault.css';
import {
  FileText,
  Image as ImageIcon,
  FolderOpen,
  Upload,
  Download,
  ExternalLink,
  MessageSquare,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  ArrowRight,
  RefreshCw,
  ShieldCheck,
  Layers,
  Package,
  Truck,
  User,
  Send,
  Eye,
  Trash2,
  Copy,
  Tag,
  Activity,
  Settings2,
  SlidersHorizontal,
  History,
  Bell,
  Link2,
  FileCheck2,
  PenTool,
  Printer,
  LayoutGrid,
  List,
  Plus,
  Check,
  X,
  Search,
  Filter,
  Maximize2,
  CheckSquare
} from 'lucide-react';

/* ==========================================================================
   TYPES & SCHEMAS
   ========================================================================== */

export type VaultCategory =
  | 'arte_impresion'
  | 'prueba_cliente'
  | 'logo_vector'
  | 'evidencia_instalacion'
  | 'comprobante_pago'
  | 'plantilla_troquel';

export type VaultApprovalStatus =
  | 'aprobado'
  | 'en_revision'
  | 'cambios_solicitados'
  | 'interno';

export type VaultColorProfile =
  | 'CMYK 300 DPI'
  | 'Escala 1:1 Gran Formato'
  | 'Vector Curvas PDF/SVG/CDR/AFDESIGN'
  | 'RGB Web';

export interface VaultVersionHistory {
  version: string;
  updatedAt: string;
  notes: string;
  author?: string;
  fileUrl?: string;
  fileSizeFormatted?: string;
}

export interface VaultPrepressChecklist {
  fontsCurved: boolean;
  bleedConfirmed: boolean;
  resolutionVerified: boolean;
  colorProfileCMYK: boolean;
  safeMarginVerified: boolean;
}

export interface VaultAsset {
  id: string;
  title: string;
  fileName: string;
  fileSizeFormatted: string;
  fileSizeBytes: number;
  mimeType: string;
  fileUrl: string;
  thumbnailUrl?: string;
  category: VaultCategory;
  approvalStatus: VaultApprovalStatus;
  colorProfile: VaultColorProfile;
  dimensionsNote?: string;
  version: string;
  versionHistory: VaultVersionHistory[];
  prepressChecklist: VaultPrepressChecklist;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  orderCode?: string;
  skuRef?: string;
  tags: string[];
  notes?: string;
  isExternalLink?: boolean;
  externalUrl?: string;
  storageProvider: 'local' | 'supabase' | 'external';
  storagePath?: string;
  isSeedDemo?: boolean;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  approvedBy?: string;
}

const VAULT_STORAGE_KEY = 'vc-enterprise-vault-v1';

export const VAULT_CATEGORY_LABELS: Record<VaultCategory, { label: string; icon: any; color: string }> = {
  arte_impresion: { label: 'Arte final / Preprensa CMYK', icon: Printer, color: '#0284c7' },
  prueba_cliente: { label: 'Boceto / Prueba de aprobación', icon: PenTool, color: '#8b5cf6' },
  logo_vector: { label: 'Logo / Identidad de marca', icon: Sparkles, color: '#f59e0b' },
  evidencia_instalacion: { label: 'Foto de entrega / Instalación', icon: Truck, color: '#10b981' },
  comprobante_pago: { label: 'Factura / Comprobante de abono', icon: FileCheck2, color: '#06b6d4' },
  plantilla_troquel: { label: 'Guía de corte láser / Troquel', icon: Layers, color: '#ec4899' },
};

export const VAULT_STATUS_LABELS: Record<VaultApprovalStatus, { label: string; icon: any; class: string }> = {
  aprobado: { label: 'Aprobado para producción', icon: CheckCircle2, class: 'is-aprobado' },
  en_revision: { label: 'En revisión del cliente', icon: Clock, class: 'is-en_revision' },
  cambios_solicitados: { label: 'Cambios solicitados', icon: AlertTriangle, class: 'is-cambios_solicitados' },
  interno: { label: 'Archivo técnico interno', icon: ShieldCheck, class: 'is-interno' },
};

/* ==========================================================================
   HELPER: High-Fidelity Vector SVG Seed Thumbnails
   ========================================================================== */

function generateSvgThumbnail(type: VaultCategory, title: string, subtitle: string, dims: string): string {
  const bgColors: Record<VaultCategory, [string, string]> = {
    arte_impresion: ['#091b2c', '#043454'],
    prueba_cliente: ['#1c102a', '#3b1c5c'],
    logo_vector: ['#1c1404', '#422806'],
    evidencia_instalacion: ['#072418', '#0c4a32'],
    comprobante_pago: ['#0a1f2b', '#113b52'],
    plantilla_troquel: ['#28081a', '#541038'],
  };
  const [c1, c2] = bgColors[type] || ['#101420', '#1c2338'];
  const catLabel = VAULT_CATEGORY_LABELS[type]?.label || 'Visual Corp';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400" width="640" height="400">
    <defs>
      <linearGradient id="g_${type}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${c1}" />
        <stop offset="100%" stop-color="${c2}" />
      </linearGradient>
      <pattern id="grid_${type}" width="24" height="24" patternUnits="userSpaceOnUse">
        <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
      </pattern>
    </defs>
    <rect width="640" height="400" fill="url(#g_${type})" />
    <rect width="640" height="400" fill="url(#grid_${type})" />
    
    <!-- Outer Safe Frame & CMYK Mark -->
    <rect x="24" y="24" width="592" height="352" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="1.5" stroke-dasharray="6,4" rx="10" />
    <circle cx="48" cy="48" r="8" fill="#00ffff" opacity="0.8" />
    <circle cx="68" cy="48" r="8" fill="#ff00ff" opacity="0.8" />
    <circle cx="88" cy="48" r="8" fill="#ffff00" opacity="0.8" />
    <circle cx="108" cy="48" r="8" fill="#000000" stroke="#fff" stroke-width="1" opacity="0.8" />

    <!-- Visual Corp Header Pill -->
    <rect x="440" y="38" width="160" height="26" rx="6" fill="rgba(255,255,255,0.12)" />
    <text x="520" y="55" fill="#f8fafc" font-family="system-ui, sans-serif" font-size="11" font-weight="700" text-anchor="middle" letter-spacing="1">VISUAL CORP</text>

    <!-- Center Vector Graphic -->
    <g transform="translate(320, 180)">
      <circle cx="0" cy="0" r="64" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.2)" stroke-width="2" />
      <polygon points="0,-42 36,22 -36,22" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="2.5" />
      <circle cx="0" cy="0" r="16" fill="rgba(255,255,255,0.15)" />
      <line x1="-70" y1="0" x2="70" y2="0" stroke="rgba(255,255,255,0.2)" stroke-width="1" stroke-dasharray="3,3" />
      <line x1="0" y1="-70" x2="0" y2="70" stroke="rgba(255,255,255,0.2)" stroke-width="1" stroke-dasharray="3,3" />
    </g>

    <!-- Bottom Metadata Panel -->
    <rect x="40" y="278" width="560" height="84" rx="8" fill="rgba(15,23,42,0.85)" stroke="rgba(255,255,255,0.15)" stroke-width="1" />
    <text x="60" y="306" fill="#a78bfa" font-family="system-ui, sans-serif" font-size="11" font-weight="750" letter-spacing="0.5">${catLabel.toUpperCase()}</text>
    <text x="60" y="330" fill="#ffffff" font-family="system-ui, sans-serif" font-size="15" font-weight="800">${title.slice(0, 48)}</text>
    <text x="60" y="348" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="11">${subtitle} · ${dims}</text>
    
    <!-- Watermark Stamp -->
    <text x="575" y="338" fill="rgba(255,255,255,0.3)" font-family="system-ui, sans-serif" font-size="10" font-weight="700" text-anchor="end">MILAGRO, EC</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/* ==========================================================================
   SEED DATA GENERATION (Operational Visual Corp Assets)
   ========================================================================== */

function createInitialSeedAssets(): VaultAsset[] {
  return [
    {
      id: 'VC-VLT-001',
      title: 'Rótulo Neón LED Fachada Los Portales',
      fileName: 'rotulo-neon-fachada-los-portales-milagro-v2.pdf',
      fileSizeFormatted: '18.4 MB',
      fileSizeBytes: 19293798,
      mimeType: 'application/pdf',
      fileUrl: generateSvgThumbnail('arte_impresion', 'Rótulo Neón LED Los Portales', 'Restaurante Los Portales Milagro', '300x120 cm'),
      thumbnailUrl: generateSvgThumbnail('arte_impresion', 'Rótulo Neón LED Los Portales', 'Restaurante Los Portales Milagro', '300x120 cm'),
      category: 'arte_impresion',
      approvalStatus: 'aprobado',
      colorProfile: 'Escala 1:1 Gran Formato',
      dimensionsNote: '300 x 120 cm · Acrílico 5mm + Neón Flex 12V',
      version: 'v2',
      versionHistory: [
        { version: 'v1', updatedAt: '2026-10-24T14:20:00Z', notes: 'Boceto inicial de curvatura neón enviado al cliente', author: 'diseño@visualcorp.ec' },
        { version: 'v2', updatedAt: '2026-10-26T10:15:00Z', notes: 'Ajuste de cables de alimentación ocultos aprobado por gerencia', author: 'taller@visualcorp.ec' },
      ],
      prepressChecklist: {
        fontsCurved: true,
        bleedConfirmed: true,
        resolutionVerified: true,
        colorProfileCMYK: true,
        safeMarginVerified: true,
      },
      customerId: 'CUST-001',
      customerName: 'Restaurante Los Portales Milagro',
      customerPhone: '0967872396',
      customerEmail: 'contacto@losportalesmilagro.ec',
      orderCode: 'ORD-2026-4412',
      skuRef: 'VC-INV-NEO-001',
      tags: ['Neón LED', 'Acrílico', 'Fachada', 'Milagro'],
      notes: 'Arte final aprobado con anticipo pagado. Listo para router CNC y curvado en taller.',
      storageProvider: 'local',
      isSeedDemo: true,
      createdAt: '2026-10-24T14:20:00Z',
      updatedAt: '2026-10-26T10:15:00Z',
      approvedAt: '2026-10-26T11:00:00Z',
      approvedBy: 'Ing. Carlos Mendoza (Cliente)',
    },
    {
      id: 'VC-VLT-002',
      title: 'Lona Frontlit 13oz Gran Formato Distribuidora El Rosado',
      fileName: 'lona-gran-formato-distribuidora-el-rosado-6x3m.tif',
      fileSizeFormatted: '142.8 MB',
      fileSizeBytes: 149736448,
      mimeType: 'image/tiff',
      fileUrl: generateSvgThumbnail('arte_impresion', 'Lona Frontlit 13oz Gran Formato', 'Distribuidora El Rosado', '600x300 cm'),
      thumbnailUrl: generateSvgThumbnail('arte_impresion', 'Lona Frontlit 13oz Gran Formato', 'Distribuidora El Rosado', '600x300 cm'),
      category: 'arte_impresion',
      approvalStatus: 'en_revision',
      colorProfile: 'CMYK 300 DPI',
      dimensionsNote: '600 x 300 cm · Escala 1:10 a 300 DPI (150 DPI salida)',
      version: 'v1',
      versionHistory: [
        { version: 'v1', updatedAt: '2026-11-02T16:45:00Z', notes: 'Montaje con dobladillo perimetral de 4cm y ojales cada 50cm', author: 'preprensa@visualcorp.ec' },
      ],
      prepressChecklist: {
        fontsCurved: true,
        bleedConfirmed: true,
        resolutionVerified: true,
        colorProfileCMYK: true,
        safeMarginVerified: false,
      },
      customerId: 'CUST-002',
      customerName: 'Distribuidora El Rosado Milagro',
      customerPhone: '0997078212',
      orderCode: 'ORD-2026-4418',
      skuRef: 'VC-INV-IMP-007',
      tags: ['Lona Frontlit', 'Gran Formato', 'Valla', 'Promoción'],
      notes: 'Boceto enviado por WhatsApp al supervisor de marketing. Pendiente confirmación de fecha de evento.',
      storageProvider: 'local',
      isSeedDemo: true,
      createdAt: '2026-11-02T16:45:00Z',
      updatedAt: '2026-11-02T16:45:00Z',
    },
    {
      id: 'VC-VLT-003',
      title: 'Manual de Marca & Logotipos Vectoriales Cruz Azul',
      fileName: 'pack-vectores-curvas-farmacias-cruz-azul-milagro.svg',
      fileSizeFormatted: '4.2 MB',
      fileSizeBytes: 4404019,
      mimeType: 'image/svg+xml',
      fileUrl: generateSvgThumbnail('logo_vector', 'Pack Vectorial Oficial Cruz Azul', 'Farmacias Cruz Azul Milagro', 'Vectores Infinitos'),
      thumbnailUrl: generateSvgThumbnail('logo_vector', 'Pack Vectorial Oficial Cruz Azul', 'Farmacias Cruz Azul Milagro', 'Vectores Infinitos'),
      category: 'logo_vector',
      approvalStatus: 'aprobado',
      colorProfile: 'Vector Curvas PDF/SVG/CDR/AFDESIGN',
      dimensionsNote: 'Vectorial escalable infinito · Pantone 286C y 186C',
      version: 'v3',
      versionHistory: [
        { version: 'v1', updatedAt: '2026-09-12T09:00:00Z', notes: 'Recepción de logo antiguo en baja resolución', author: 'diseño@visualcorp.ec' },
        { version: 'v2', updatedAt: '2026-09-15T11:30:00Z', notes: 'Vectorización punto por punto en Affinity Designer', author: 'diseño@visualcorp.ec' },
        { version: 'v3', updatedAt: '2026-09-18T15:20:00Z', notes: 'Versión corporativa con tipografía homologada en curvas', author: 'gerencia@visualcorp.ec' },
      ],
      prepressChecklist: {
        fontsCurved: true,
        bleedConfirmed: true,
        resolutionVerified: true,
        colorProfileCMYK: true,
        safeMarginVerified: true,
      },
      customerId: 'CUST-003',
      customerName: 'Farmacias Cruz Azul Suc. Milagro',
      customerPhone: '0984512390',
      orderCode: 'ORD-2026-4390',
      skuRef: 'VC-INV-TRO-001',
      tags: ['Logo Oficial', 'Curvas', 'Vector', 'Identidad'],
      notes: 'Archivo maestro de curvas usado para corte vinil plotter Roland y rotulación de vitrinas.',
      storageProvider: 'local',
      isSeedDemo: true,
      createdAt: '2026-09-12T09:00:00Z',
      updatedAt: '2026-09-18T15:20:00Z',
      approvedAt: '2026-09-18T16:00:00Z',
      approvedBy: 'Dra. Miriam Alarcón (Cruz Azul)',
    },
    {
      id: 'VC-VLT-004',
      title: 'Evidencia Fotográfica Instalación Rótulo Heladería Pingüino',
      fileName: 'evidencia-instalacion-heladeria-pinguino-milagro-fachada.jpg',
      fileSizeFormatted: '3.6 MB',
      fileSizeBytes: 3774873,
      mimeType: 'image/jpeg',
      fileUrl: generateSvgThumbnail('evidencia_instalacion', 'Evidencia Entrega e Instalación', 'Heladería Pingüino Milagro', 'Foto de Sitio'),
      thumbnailUrl: generateSvgThumbnail('evidencia_instalacion', 'Evidencia Entrega e Instalación', 'Heladería Pingüino Milagro', 'Foto de Sitio'),
      category: 'evidencia_instalacion',
      approvalStatus: 'aprobado',
      colorProfile: 'RGB Web',
      dimensionsNote: 'Fotografía 4032 x 3024 px · Av. 17 de Septiembre',
      version: 'v1',
      versionHistory: [
        { version: 'v1', updatedAt: '2026-10-30T17:10:00Z', notes: 'Foto tomada por el equipo de instalación tras conectar iluminación LED', author: 'instalacion@visualcorp.ec' },
      ],
      prepressChecklist: {
        fontsCurved: true,
        bleedConfirmed: true,
        resolutionVerified: true,
        colorProfileCMYK: true,
        safeMarginVerified: true,
      },
      customerId: 'CUST-004',
      customerName: 'Heladería y Frutería El Pingüino',
      customerPhone: '0978123456',
      orderCode: 'ORD-2026-4355',
      skuRef: 'VC-INV-TAL-001',
      tags: ['Instalación', 'Fachada', 'Entrega', 'Garantía'],
      notes: 'Instalación finalizada sin novedades. Se entregó transformador 12V 10A con 1 año de garantía.',
      storageProvider: 'local',
      isSeedDemo: true,
      createdAt: '2026-10-30T17:10:00Z',
      updatedAt: '2026-10-30T17:10:00Z',
      approvedAt: '2026-10-30T17:30:00Z',
      approvedBy: 'Don Vicente Parra (Propietario)',
    },
    {
      id: 'VC-VLT-005',
      title: 'Guía de Corte Láser Trofeos Acrílico Colegio Velasco Ibarra',
      fileName: 'guia-corte-laser-trofeos-acrilico-6mm-velasco-ibarra.dxf',
      fileSizeFormatted: '1.8 MB',
      fileSizeBytes: 1887436,
      mimeType: 'application/dxf',
      fileUrl: generateSvgThumbnail('plantilla_troquel', 'Guía Corte Láser Trofeos Acrílico', 'U.E. Velasco Ibarra', '25x18 cm'),
      thumbnailUrl: generateSvgThumbnail('plantilla_troquel', 'Guía Corte Láser Trofeos Acrílico', 'U.E. Velasco Ibarra', '25x18 cm'),
      category: 'plantilla_troquel',
      approvalStatus: 'aprobado',
      colorProfile: 'Vector Curvas PDF/SVG/CDR/AFDESIGN',
      dimensionsNote: '25 x 18 cm · Línea de corte rojo 0.01mm, grabado negro',
      version: 'v2',
      versionHistory: [
        { version: 'v1', updatedAt: '2026-11-01T11:00:00Z', notes: 'Trazado inicial de base encastrable', author: 'laser@visualcorp.ec' },
        { version: 'v2', updatedAt: '2026-11-03T09:40:00Z', notes: 'Ajuste de tolerancia de encastre a 5.8mm para acrílico colado', author: 'laser@visualcorp.ec' },
      ],
      prepressChecklist: {
        fontsCurved: true,
        bleedConfirmed: true,
        resolutionVerified: true,
        colorProfileCMYK: true,
        safeMarginVerified: true,
      },
      customerId: 'CUST-005',
      customerName: 'Unidad Educativa Dr. José María Velasco Ibarra',
      customerPhone: '0991234876',
      orderCode: 'ORD-2026-4401',
      skuRef: 'VC-INV-LAS-002',
      tags: ['Corte Láser', 'Acrílico 6mm', 'Grabado', 'Trofeos'],
      notes: 'Lote de 25 trofeos de aniversario. Trazado optimizado para no quemar las puntas del acrílico.',
      storageProvider: 'local',
      isSeedDemo: true,
      createdAt: '2026-11-01T11:00:00Z',
      updatedAt: '2026-11-03T09:40:00Z',
      approvedAt: '2026-11-03T10:00:00Z',
      approvedBy: 'Lcdo. Ramiro Gómez (Rector)',
    },
    {
      id: 'VC-VLT-006',
      title: 'Comprobante Transferencia 50% Anticipo Banco Guayaquil',
      fileName: 'comprobante-abono-banco-guayaquil-transf-778129.jpg',
      fileSizeFormatted: '890 KB',
      fileSizeBytes: 911360,
      mimeType: 'image/jpeg',
      fileUrl: generateSvgThumbnail('comprobante_pago', 'Comprobante Abono 50% Banco Guayaquil', 'Distribuidora El Rosado', 'Transf #778129'),
      thumbnailUrl: generateSvgThumbnail('comprobante_pago', 'Comprobante Abono 50% Banco Guayaquil', 'Distribuidora El Rosado', 'Transf #778129'),
      category: 'comprobante_pago',
      approvalStatus: 'aprobado',
      colorProfile: 'RGB Web',
      dimensionsNote: 'Comprobante digital #778129 · Banco Guayaquil',
      version: 'v1',
      versionHistory: [
        { version: 'v1', updatedAt: '2026-11-02T17:00:00Z', notes: 'Validado en banca en línea cuenta corriente Visual Corp', author: 'administracion@visualcorp.ec' },
      ],
      prepressChecklist: {
        fontsCurved: true,
        bleedConfirmed: true,
        resolutionVerified: true,
        colorProfileCMYK: true,
        safeMarginVerified: true,
      },
      customerId: 'CUST-002',
      customerName: 'Distribuidora El Rosado Milagro',
      customerPhone: '0997078212',
      orderCode: 'ORD-2026-4418',
      tags: ['Abono', 'Transferencia', 'Contabilidad', 'Validado'],
      notes: 'Anticipo acreditado para compra de bastidor metálico de la lona frontlit.',
      storageProvider: 'local',
      isSeedDemo: true,
      createdAt: '2026-11-02T17:00:00Z',
      updatedAt: '2026-11-02T17:00:00Z',
    },
    {
      id: 'VC-VLT-007',
      title: 'Boceto Rotulación Vehicular Camioneta D-Max Agroservicios',
      fileName: 'boceto-rotulacion-isuzu-dmax-agroservicios-san-francisco.png',
      fileSizeFormatted: '12.1 MB',
      fileSizeBytes: 12687769,
      mimeType: 'image/png',
      fileUrl: generateSvgThumbnail('prueba_cliente', 'Boceto Rotulación Vehicular D-Max', 'Agroservicios San Francisco', 'Plantilla 1:1'),
      thumbnailUrl: generateSvgThumbnail('prueba_cliente', 'Boceto Rotulación Vehicular D-Max', 'Agroservicios San Francisco', 'Plantilla 1:1'),
      category: 'prueba_cliente',
      approvalStatus: 'cambios_solicitados',
      colorProfile: 'CMYK 300 DPI',
      dimensionsNote: 'Montaje sobre plantilla Isuzu D-Max 2024 · Puertas y compuerta',
      version: 'v1',
      versionHistory: [
        { version: 'v1', updatedAt: '2026-11-04T15:30:00Z', notes: 'Primer boceto enviado por el portal de aprobación', author: 'diseño@visualcorp.ec' },
      ],
      prepressChecklist: {
        fontsCurved: true,
        bleedConfirmed: false,
        resolutionVerified: true,
        colorProfileCMYK: true,
        safeMarginVerified: false,
      },
      customerId: 'CUST-007',
      customerName: 'Agroservicios San Francisco Milagro',
      customerPhone: '0994112233',
      orderCode: 'ORD-2026-4425',
      skuRef: 'VC-INV-TRO-002',
      tags: ['Rotulación Vehicular', 'Vinil Fundido', 'D-Max', 'Flota'],
      notes: 'El cliente solicitó agrandar el logo en las puertas laterales y colocar el celular en la compuerta trasera.',
      storageProvider: 'local',
      isSeedDemo: true,
      createdAt: '2026-11-04T15:30:00Z',
      updatedAt: '2026-11-04T15:30:00Z',
    },
    {
      id: 'VC-VLT-008',
      title: 'Plantilla Sublimación Tazas Cerámica 11oz Cooperativa Milagro',
      fileName: 'plantilla-sublimacion-taza-11oz-cooperativa-milagro.pdf',
      fileSizeFormatted: '8.4 MB',
      fileSizeBytes: 8808038,
      mimeType: 'application/pdf',
      fileUrl: generateSvgThumbnail('arte_impresion', 'Plantilla Sublimación Tazas 11oz', 'Coop. de Ahorro y Crédito Milagro', '20x9.5 cm'),
      thumbnailUrl: generateSvgThumbnail('arte_impresion', 'Plantilla Sublimación Tazas 11oz', 'Coop. de Ahorro y Crédito Milagro', '20x9.5 cm'),
      category: 'arte_impresion',
      approvalStatus: 'interno',
      colorProfile: 'CMYK 300 DPI',
      dimensionsNote: '20 x 9.5 cm · Perfil Sublimación Epson F170 con sangrado 3mm',
      version: 'v1',
      versionHistory: [
        { version: 'v1', updatedAt: '2026-11-05T10:00:00Z', notes: 'Montaje de 3 poses por hoja A4 para impresión en serie', author: 'sublimacion@visualcorp.ec' },
      ],
      prepressChecklist: {
        fontsCurved: true,
        bleedConfirmed: true,
        resolutionVerified: true,
        colorProfileCMYK: true,
        safeMarginVerified: true,
      },
      customerId: 'CUST-008',
      customerName: 'Cooperativa de Ahorro y Crédito Milagro',
      customerPhone: '0981992288',
      orderCode: 'ORD-2026-4430',
      skuRef: 'VC-INV-SUB-001',
      tags: ['Sublimación', 'Tazas 11oz', 'Corporativo', 'Fin de Año'],
      notes: 'Lote de 100 tazas blancas personalizadas con logo institucional y nombres de colaboradores.',
      storageProvider: 'local',
      isSeedDemo: true,
      createdAt: '2026-11-05T10:00:00Z',
      updatedAt: '2026-11-05T10:00:00Z',
    },
  ];
}

/* ==========================================================================
   MAIN COMPONENT: VisualCorpVault
   ========================================================================== */

export function VisualCorpVault({
  embeddedCustomerId,
  embeddedJobCode,
  compact = false,
}: {
  embeddedCustomerId?: string;
  embeddedJobCode?: string;
  compact?: boolean;
}) {
  const { data, flash } = useWorkspace();
  const { user } = useAuth();

  // Assets State & Persistence
  const [assets, setAssets] = useState<VaultAsset[]>(() => {
    try {
      const raw = localStorage.getItem(VAULT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Fallback to initial seeds
    }
    return createInitialSeedAssets();
  });

  // Save to localStorage whenever assets change
  useEffect(() => {
    try {
      localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(assets));
    } catch (e) {
      console.warn('No se pudo guardar la bóveda en localStorage:', e);
    }
  }, [assets]);

  // Filtering & View state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedCustomerFilter, setSelectedCustomerFilter] = useState<string>(embeddedCustomerId || 'all');
  const [viewMode, setViewMode] = useState<'gallery' | 'table'>('gallery');

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Modal: Register / Upload
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadPendingFiles, setUploadPendingFiles] = useState<File[]>([]);
  const [uploadFormData, setUploadFormData] = useState<{
    title: string;
    category: VaultCategory;
    colorProfile: VaultColorProfile;
    dimensionsNote: string;
    version: string;
    customerId: string;
    customerName: string;
    customerPhone: string;
    orderCode: string;
    notes: string;
    externalUrl: string;
    fontsCurved: boolean;
    bleedConfirmed: boolean;
    resolutionVerified: boolean;
    colorProfileCMYK: boolean;
    safeMarginVerified: boolean;
  }>({
    title: '',
    category: 'arte_impresion',
    colorProfile: 'CMYK 300 DPI',
    dimensionsNote: '',
    version: 'v1',
    customerId: embeddedCustomerId || '',
    customerName: '',
    customerPhone: '',
    orderCode: embeddedJobCode || '',
    notes: '',
    externalUrl: '',
    fontsCurved: true,
    bleedConfirmed: true,
    resolutionVerified: true,
    colorProfileCMYK: true,
    safeMarginVerified: true,
  });
  const [isUploading, setIsUploading] = useState(false);

  // Modal: Lightbox / Prepress Inspector
  const [inspectedAsset, setInspectedAsset] = useState<VaultAsset | null>(null);
  const [newVersionNotes, setNewVersionNotes] = useState('');
  const [newVersionTag, setNewVersionTag] = useState('');

  // Auto-fill customer details in modal when selected
  const handleCustomerSelectChange = (customerId: string) => {
    if (!customerId) {
      setUploadFormData((prev) => ({ ...prev, customerId: '', customerName: '', customerPhone: '' }));
      return;
    }
    const found = (data?.customers || []).find((c: any) => c.id === customerId);
    if (found) {
      setUploadFormData((prev) => ({
        ...prev,
        customerId: found.id,
        customerName: found.name || '',
        customerPhone: found.phone || '',
      }));
    } else {
      setUploadFormData((prev) => ({ ...prev, customerId }));
    }
  };

  // Drag and Drop Listeners for files
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      setIsDragging(false);
      dragCounterRef.current = 0;
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFilesSelected(files);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      handleFilesSelected(files);
    }
  };

  const handleFilesSelected = (files: File[]) => {
    setUploadPendingFiles(files);
    const first = files[0];
    if (first) {
      const baseName = first.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      setUploadFormData((prev) => ({
        ...prev,
        title: prev.title || baseName,
        category: first.name.match(/\.(ai|cdr|svg|eps|dxf)$/i)
          ? 'logo_vector'
          : first.name.match(/corte|troquel/i)
          ? 'plantilla_troquel'
          : 'arte_impresion',
        colorProfile: first.name.match(/\.(ai|cdr|svg|eps|dxf)$/i)
          ? 'Vector Curvas PDF/SVG/CDR/AFDESIGN'
          : 'CMYK 300 DPI',
      }));
    }
    setIsUploadModalOpen(true);
  };

  // Execute Upload & Save
  const handleSaveAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUploading(true);

    try {
      const newAssets: VaultAsset[] = [];
      const currentAuthor = user?.email || 'Taller Visual Corp';

      if (uploadPendingFiles.length > 0) {
        for (const file of uploadPendingFiles) {
          const fileSizeFormatted = file.size > 1024 * 1024
            ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
            : `${Math.round(file.size / 1024)} KB`;

          let fileUrl = '';
          let storageProvider: 'local' | 'supabase' = 'local';
          let storagePath = '';

          // 1. Try reading local preview via DataURL
          if (file.type.startsWith('image/') || file.name.endsWith('.svg')) {
            try {
              fileUrl = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = () => resolve('');
                reader.readAsDataURL(file);
              });
            } catch {
              fileUrl = URL.createObjectURL(file);
            }
          } else {
            fileUrl = generateSvgThumbnail(uploadFormData.category, uploadFormData.title || file.name, uploadFormData.customerName || 'Visual Corp', uploadFormData.dimensionsNote || 'Preprensa');
          }

          // 2. Optional Supabase Storage upload
          if (supabaseConfigured && supabase) {
            try {
              const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
              const path = `vault/${Date.now()}-${cleanFileName}`;
              const { data: uploadResult, error: uploadError } = await supabase.storage
                .from('inventory-reference-images')
                .upload(path, file, { cacheControl: '3600', upsert: true });

              if (!uploadError && uploadResult?.path) {
                storagePath = uploadResult.path;
                storageProvider = 'supabase';
                const { data: pubData } = supabase.storage.from('inventory-reference-images').getPublicUrl(path);
                if (pubData?.publicUrl) {
                  fileUrl = pubData.publicUrl;
                }
              }
            } catch (err) {
              console.warn('Supabase storage upload fell back to local storage:', err);
            }
          }

          const assetId = `VC-VLT-${String(assets.length + newAssets.length + 1).padStart(3, '0')}`;
          const newAsset: VaultAsset = {
            id: assetId,
            title: uploadFormData.title || file.name,
            fileName: file.name,
            fileSizeFormatted,
            fileSizeBytes: file.size,
            mimeType: file.type || 'application/octet-stream',
            fileUrl: fileUrl || generateSvgThumbnail(uploadFormData.category, uploadFormData.title || file.name, uploadFormData.customerName || 'Visual Corp', uploadFormData.dimensionsNote || 'Preprensa'),
            thumbnailUrl: fileUrl,
            category: uploadFormData.category,
            approvalStatus: 'en_revision',
            colorProfile: uploadFormData.colorProfile,
            dimensionsNote: uploadFormData.dimensionsNote || 'Medida estándar de taller',
            version: uploadFormData.version || 'v1',
            versionHistory: [
              {
                version: uploadFormData.version || 'v1',
                updatedAt: new Date().toISOString(),
                notes: uploadFormData.notes || 'Archivo ingresado a la bóveda operativa',
                author: currentAuthor,
                fileSizeFormatted,
              },
            ],
            prepressChecklist: {
              fontsCurved: uploadFormData.fontsCurved,
              bleedConfirmed: uploadFormData.bleedConfirmed,
              resolutionVerified: uploadFormData.resolutionVerified,
              colorProfileCMYK: uploadFormData.colorProfileCMYK,
              safeMarginVerified: uploadFormData.safeMarginVerified,
            },
            customerId: uploadFormData.customerId || undefined,
            customerName: uploadFormData.customerName || undefined,
            customerPhone: uploadFormData.customerPhone || undefined,
            orderCode: uploadFormData.orderCode || undefined,
            tags: [uploadFormData.category, uploadFormData.colorProfile],
            notes: uploadFormData.notes,
            storageProvider,
            storagePath,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          newAssets.push(newAsset);
        }
      } else if (uploadFormData.externalUrl) {
        // Link without local file
        const assetId = `VC-VLT-${String(assets.length + 1).padStart(3, '0')}`;
        const newAsset: VaultAsset = {
          id: assetId,
          title: uploadFormData.title || 'Enlace de diseño externo',
          fileName: uploadFormData.title.toLowerCase().replace(/\s+/g, '-') + '.link',
          fileSizeFormatted: 'Nube / Enlace',
          fileSizeBytes: 0,
          mimeType: 'text/uri-list',
          fileUrl: uploadFormData.externalUrl,
          thumbnailUrl: generateSvgThumbnail(uploadFormData.category, uploadFormData.title || 'Enlace externo', uploadFormData.customerName || 'Visual Corp', 'Cloud Storage'),
          category: uploadFormData.category,
          approvalStatus: 'en_revision',
          colorProfile: uploadFormData.colorProfile,
          dimensionsNote: uploadFormData.dimensionsNote || 'Almacenado en la nube',
          version: uploadFormData.version || 'v1',
          versionHistory: [
            {
              version: uploadFormData.version || 'v1',
              updatedAt: new Date().toISOString(),
              notes: `Enlace externo: ${uploadFormData.externalUrl}`,
              author: currentAuthor,
            },
          ],
          prepressChecklist: {
            fontsCurved: uploadFormData.fontsCurved,
            bleedConfirmed: uploadFormData.bleedConfirmed,
            resolutionVerified: uploadFormData.resolutionVerified,
            colorProfileCMYK: uploadFormData.colorProfileCMYK,
            safeMarginVerified: uploadFormData.safeMarginVerified,
          },
          customerId: uploadFormData.customerId || undefined,
          customerName: uploadFormData.customerName || undefined,
          customerPhone: uploadFormData.customerPhone || undefined,
          orderCode: uploadFormData.orderCode || undefined,
          tags: [uploadFormData.category, 'Enlace Cloud'],
          notes: uploadFormData.notes,
          isExternalLink: true,
          externalUrl: uploadFormData.externalUrl,
          storageProvider: 'external',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        newAssets.push(newAsset);
      }

      setAssets((prev) => [...newAssets, ...prev]);
      flash(`Se ${newAssets.length === 1 ? 'registró el archivo' : `registraron ${newAssets.length} archivos`} correctamente en la bóveda.`);
      setIsUploadModalOpen(false);
      setUploadPendingFiles([]);
      setUploadFormData({
        title: '',
        category: 'arte_impresion',
        colorProfile: 'CMYK 300 DPI',
        dimensionsNote: '',
        version: 'v1',
        customerId: embeddedCustomerId || '',
        customerName: '',
        customerPhone: '',
        orderCode: embeddedJobCode || '',
        notes: '',
        externalUrl: '',
        fontsCurved: true,
        bleedConfirmed: true,
        resolutionVerified: true,
        colorProfileCMYK: true,
        safeMarginVerified: true,
      });
    } catch (err: any) {
      flash(`Error al guardar archivo: ${err?.message || 'Error desconocido'}`);
    } finally {
      setIsUploading(false);
    }
  };

  // 1-Click Status Update Action
  const handleUpdateStatus = (assetId: string, newStatus: VaultApprovalStatus) => {
    const currentAuthor = user?.email || 'Taller Visual Corp';
    setAssets((prev) =>
      prev.map((asset) => {
        if (asset.id !== assetId) return asset;
        const updatedHistory = [
          ...asset.versionHistory,
          {
            version: asset.version,
            updatedAt: new Date().toISOString(),
            notes: `Estado cambiado a: ${VAULT_STATUS_LABELS[newStatus].label}`,
            author: currentAuthor,
          },
        ];
        return {
          ...asset,
          approvalStatus: newStatus,
          approvedAt: newStatus === 'aprobado' ? new Date().toISOString() : asset.approvedAt,
          approvedBy: newStatus === 'aprobado' ? currentAuthor : asset.approvedBy,
          versionHistory: updatedHistory,
          updatedAt: new Date().toISOString(),
        };
      })
    );

    if (inspectedAsset && inspectedAsset.id === assetId) {
      setInspectedAsset((prev) => (prev ? { ...prev, approvalStatus: newStatus } : null));
    }

    flash(`Estado actualizado a "${VAULT_STATUS_LABELS[newStatus].label}"`);
  };

  // Toggle Prepress Checklist item
  const handleToggleChecklist = (assetId: string, itemKey: keyof VaultPrepressChecklist) => {
    setAssets((prev) =>
      prev.map((asset) => {
        if (asset.id !== assetId) return asset;
        const nextChecklist = {
          ...asset.prepressChecklist,
          [itemKey]: !asset.prepressChecklist[itemKey],
        };
        return {
          ...asset,
          prepressChecklist: nextChecklist,
          updatedAt: new Date().toISOString(),
        };
      })
    );

    if (inspectedAsset && inspectedAsset.id === assetId) {
      setInspectedAsset((prev) =>
        prev
          ? {
              ...prev,
              prepressChecklist: {
                ...prev.prepressChecklist,
                [itemKey]: !prev.prepressChecklist[itemKey],
              },
            }
          : null
      );
    }
  };

  // Add new version to an existing asset
  const handleAddVersion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inspectedAsset) return;

    const versionTag = newVersionTag.trim() || `v${inspectedAsset.versionHistory.length + 1}`;
    const versionNote = newVersionNotes.trim() || 'Nueva revisión registrada';
    const currentAuthor = user?.email || 'Taller Visual Corp';

    const newHistoryEntry: VaultVersionHistory = {
      version: versionTag,
      updatedAt: new Date().toISOString(),
      notes: versionNote,
      author: currentAuthor,
    };

    const updatedAsset: VaultAsset = {
      ...inspectedAsset,
      version: versionTag,
      versionHistory: [...inspectedAsset.versionHistory, newHistoryEntry],
      updatedAt: new Date().toISOString(),
    };

    setAssets((prev) => prev.map((a) => (a.id === inspectedAsset.id ? updatedAsset : a)));
    setInspectedAsset(updatedAsset);
    setNewVersionTag('');
    setNewVersionNotes('');
    flash(`Versión ${versionTag} registrada con éxito.`);
  };

  // Delete Asset
  const handleDeleteAsset = (assetId: string) => {
    if (window.confirm('¿Estás seguro de que deseas eliminar este archivo de la bóveda? Esta acción no se puede deshacer.')) {
      setAssets((prev) => prev.filter((a) => a.id !== assetId));
      if (inspectedAsset?.id === assetId) setInspectedAsset(null);
      flash('Archivo eliminado de la bóveda.');
    }
  };

  // Copy Public Proof URL (/seguimiento/:code)
  const handleCopyProofLink = (asset: VaultAsset) => {
    const code = asset.orderCode || asset.id;
    const url = `${window.location.origin}/seguimiento/${encodeURIComponent(code)}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        flash(`Enlace de aprobación copiado: /seguimiento/${code}`);
      })
      .catch(() => {
        flash(`Enlace: ${url}`);
      });
  };

  // Send WhatsApp Proof with Pre-filled Message
  const handleSendWhatsAppProof = (asset: VaultAsset) => {
    const rawPhone = (asset.customerPhone || '').replace(/[^0-9]/g, '');
    const cleanPhone = rawPhone.startsWith('0')
      ? '593' + rawPhone.substring(1)
      : rawPhone.startsWith('593')
      ? rawPhone
      : rawPhone
      ? '593' + rawPhone
      : '';

    const trackingUrl = `${window.location.origin}/seguimiento/${encodeURIComponent(asset.orderCode || asset.id)}`;

    let msg = `*VISUAL CORP — APROBACIÓN DE ARTE & PREPRENSA*\n`;
    msg += `================================\n`;
    msg += `Hola *${asset.customerName || 'Estimado cliente'}*, te compartimos la prueba interactiva para tu pedido: *${asset.title}*`;
    if (asset.orderCode) msg += ` (Orden #${asset.orderCode})`;
    msg += `.\n\n`;
    msg += `📱 *Portal de Aprobación en Línea:* ${trackingUrl}\n`;
    if (asset.fileUrl && !asset.fileUrl.startsWith('data:')) {
      msg += `📥 *Descarga de Arte:* ${asset.fileUrl}\n`;
    }
    msg += `\n🔍 *Detalles técnicos:* ${asset.colorProfile} · ${asset.dimensionsNote || 'Escala 1:1'}\n`;
    msg += `\nPor favor revisa la ortografía, colores y proporciones. Al dar clic en aprobar, tu trabajo pasa directo a impresión en nuestro taller en Milagro.\n\n`;
    msg += `*Visual Corp* · Hacemos visible lo que imaginas. 🚀`;

    if (cleanPhone) {
      window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    }
  };

  // Filtered Assets Computation
  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      // Embedded scopes
      if (embeddedCustomerId && asset.customerId && asset.customerId !== embeddedCustomerId) {
        return false;
      }
      if (embeddedJobCode && asset.orderCode && asset.orderCode !== embeddedJobCode) {
        return false;
      }

      // Customer filter
      if (selectedCustomerFilter !== 'all' && asset.customerId !== selectedCustomerFilter) {
        return false;
      }

      // Category filter
      if (selectedCategory !== 'all' && asset.category !== selectedCategory) {
        return false;
      }

      // Status filter
      if (selectedStatus !== 'all' && asset.approvalStatus !== selectedStatus) {
        return false;
      }

      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = asset.title.toLowerCase().includes(q);
        const matchesFile = asset.fileName.toLowerCase().includes(q);
        const matchesCustomer = (asset.customerName || '').toLowerCase().includes(q);
        const matchesOrder = (asset.orderCode || '').toLowerCase().includes(q);
        const matchesSku = (asset.skuRef || '').toLowerCase().includes(q);
        const matchesTags = asset.tags.some((t) => t.toLowerCase().includes(q));
        if (!matchesTitle && !matchesFile && !matchesCustomer && !matchesOrder && !matchesSku && !matchesTags) {
          return false;
        }
      }

      return true;
    });
  }, [assets, embeddedCustomerId, embeddedJobCode, selectedCustomerFilter, selectedCategory, selectedStatus, searchQuery]);

  // KPI Calculations
  const kpiStats = useMemo(() => {
    const total = assets.length;
    const aprobados = assets.filter((a) => a.approvalStatus === 'aprobado').length;
    const revision = assets.filter((a) => a.approvalStatus === 'en_revision').length;
    const evidencias = assets.filter((a) => a.category === 'evidencia_instalacion').length;
    const clientesSet = new Set(assets.map((a) => a.customerName || a.customerId).filter(Boolean));
    return {
      total,
      aprobados,
      revision,
      evidencias,
      clientesConExpediente: clientesSet.size,
    };
  }, [assets]);

  return (
    <div
      className={`vc-vault-root ${compact ? 'is-compact' : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Hidden file input for file pickers */}
      <input
        type="file"
        ref={fileInputRef}
        multiple
        accept="image/*,.pdf,.svg,.ai,.cdr,.eps,.psd,.afdesign,.dxf"
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />

      {/* HEADER / HERO STRIP (if not ultra compact) */}
      {!compact && (
        <div className="vc-vault-header">
          <div className="vc-vault-header-info">
            <span className="vc-vault-badge-eyebrow">
              <ShieldCheck size={14} /> Repositorio Digital de Producción
            </span>
            <h1 className="vc-vault-title">
              Visual Corp Vault <span className="vc-vault-title-badge">Milagro Preprensa</span>
            </h1>
            <p className="vc-vault-subtitle">
              Gestor inteligente de artes finales CMYK, logotipos vectoriales, pruebas de aprobación con firma de cliente y evidencias de instalación.
            </p>
          </div>
          <div className="vc-vault-header-actions">
            <button
              type="button"
              className="vc-vault-btn vc-vault-btn-primary"
              onClick={() => {
                setUploadPendingFiles([]);
                setIsUploadModalOpen(true);
              }}
            >
              <Plus size={16} /> Subir / Registrar Arte
            </button>
            <button
              type="button"
              className="vc-vault-btn vc-vault-btn-secondary"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={15} /> Seleccionar Archivos
            </button>
          </div>
        </div>
      )}

      {/* KPI STRIP */}
      <div className="vc-vault-kpi-grid">
        <div className="vc-vault-kpi-card">
          <div className="vc-vault-kpi-icon is-primary">
            <FolderOpen size={20} />
          </div>
          <div className="vc-vault-kpi-content">
            <span className="vc-vault-kpi-value">{kpiStats.total}</span>
            <span className="vc-vault-kpi-label">Total Archivos</span>
          </div>
        </div>

        <div className="vc-vault-kpi-card">
          <div className="vc-vault-kpi-icon is-success">
            <CheckCircle2 size={20} />
          </div>
          <div className="vc-vault-kpi-content">
            <span className="vc-vault-kpi-value">{kpiStats.aprobados}</span>
            <span className="vc-vault-kpi-label">Artes Aprobados</span>
          </div>
        </div>

        <div className="vc-vault-kpi-card">
          <div className="vc-vault-kpi-icon is-warning">
            <Clock size={20} />
          </div>
          <div className="vc-vault-kpi-content">
            <span className="vc-vault-kpi-value">{kpiStats.revision}</span>
            <span className="vc-vault-kpi-label">Pendientes de Firma</span>
          </div>
        </div>

        <div className="vc-vault-kpi-card">
          <div className="vc-vault-kpi-icon is-accent">
            <Truck size={20} />
          </div>
          <div className="vc-vault-kpi-content">
            <span className="vc-vault-kpi-value">{kpiStats.evidencias}</span>
            <span className="vc-vault-kpi-label">Evidencias Entrega</span>
          </div>
        </div>

        <div className="vc-vault-kpi-card">
          <div className="vc-vault-kpi-icon">
            <User size={20} />
          </div>
          <div className="vc-vault-kpi-content">
            <span className="vc-vault-kpi-value">{kpiStats.clientesConExpediente}</span>
            <span className="vc-vault-kpi-label">Clientes con Expediente</span>
          </div>
        </div>
      </div>

      {/* DRAG & DROP ZONE BANNER */}
      <div
        className={`vc-vault-dropzone ${isDragging ? 'is-dragging' : ''}`}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="vc-vault-dropzone-left">
          <div className="vc-vault-dropzone-icon">
            <Upload size={22} />
          </div>
          <div className="vc-vault-dropzone-text">
            <h4>Arrastra aquí tus archivos PDF, AI, CDR, TIFF o imágenes</h4>
            <p>Soporte de preprensa CMYK, extracción de metadatos, enlace con clientes y carga opcional en la nube.</p>
          </div>
        </div>
        <div className="vc-vault-dropzone-actions" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="vc-vault-btn vc-vault-btn-sm vc-vault-btn-secondary"
            onClick={() => fileInputRef.current?.click()}
          >
            Examinar disco
          </button>
          <button
            type="button"
            className="vc-vault-btn vc-vault-btn-sm vc-vault-btn-outline"
            onClick={() => {
              setUploadPendingFiles([]);
              setIsUploadModalOpen(true);
            }}
          >
            Pegar enlace
          </button>
        </div>
      </div>

      {/* TOOLBAR & FILTERS */}
      <div className="vc-vault-toolbar">
        <div className="vc-vault-toolbar-top">
          <div className="vc-vault-search-box">
            <Search size={16} />
            <input
              type="text"
              placeholder="Buscar por archivo, cliente, orden (#ORD), SKU o etiqueta..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="vc-vault-btn-icon"
                onClick={() => setSearchQuery('')}
                aria-label="Limpiar búsqueda"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="vc-vault-toolbar-controls">
            {/* Customer filter if not in embedded drawer */}
            {!embeddedCustomerId && (
              <select
                className="vc-vault-select"
                value={selectedCustomerFilter}
                onChange={(e) => setSelectedCustomerFilter(e.target.value)}
              >
                <option value="all">Todos los clientes</option>
                {(data?.customers || []).map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name || `Cliente ${c.id}`}
                  </option>
                ))}
              </select>
            )}

            {/* View Mode Toggle */}
            <div className="vc-vault-view-toggle">
              <button
                type="button"
                className={`vc-vault-view-btn ${viewMode === 'gallery' ? 'is-active' : ''}`}
                onClick={() => setViewMode('gallery')}
                title="Vista Galería"
              >
                <LayoutGrid size={15} />
              </button>
              <button
                type="button"
                className={`vc-vault-view-btn ${viewMode === 'table' ? 'is-active' : ''}`}
                onClick={() => setViewMode('table')}
                title="Vista Tabla Técnica"
              >
                <List size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="vc-vault-filter-pills">
          <button
            type="button"
            className={`vc-vault-pill ${selectedCategory === 'all' && selectedStatus === 'all' ? 'is-active' : ''}`}
            onClick={() => {
              setSelectedCategory('all');
              setSelectedStatus('all');
            }}
          >
            Todos <span className="vc-vault-pill-count">{assets.length}</span>
          </button>

          {/* Categories */}
          {(Object.keys(VAULT_CATEGORY_LABELS) as VaultCategory[]).map((catKey) => {
            const count = assets.filter((a) => a.category === catKey).length;
            return (
              <button
                key={catKey}
                type="button"
                className={`vc-vault-pill ${selectedCategory === catKey ? 'is-active' : ''}`}
                onClick={() => setSelectedCategory(selectedCategory === catKey ? 'all' : catKey)}
              >
                {VAULT_CATEGORY_LABELS[catKey].label}
                <span className="vc-vault-pill-count">{count}</span>
              </button>
            );
          })}

          {/* Status Pills */}
          {(Object.keys(VAULT_STATUS_LABELS) as VaultApprovalStatus[]).map((stKey) => {
            const count = assets.filter((a) => a.approvalStatus === stKey).length;
            return (
              <button
                key={stKey}
                type="button"
                className={`vc-vault-pill ${selectedStatus === stKey ? 'is-active' : ''}`}
                onClick={() => setSelectedStatus(selectedStatus === stKey ? 'all' : stKey)}
              >
                {VAULT_STATUS_LABELS[stKey].label}
                <span className="vc-vault-pill-count">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* CONTENT: GALLERY OR TABLE VIEW */}
      {filteredAssets.length === 0 ? (
        <div className="vc-vault-empty">
          <div className="vc-vault-empty-icon">
            <FolderOpen size={28} />
          </div>
          <h3>No se encontraron archivos en este filtro</h3>
          <p>Prueba con otros términos de búsqueda o sube un nuevo archivo o boceto para comenzar.</p>
          <button
            type="button"
            className="vc-vault-btn vc-vault-btn-primary"
            onClick={() => {
              setSelectedCategory('all');
              setSelectedStatus('all');
              setSearchQuery('');
            }}
          >
            Ver todos los archivos
          </button>
        </div>
      ) : viewMode === 'gallery' ? (
        /* VISTA GALERÍA */
        <div className="vc-vault-gallery">
          {filteredAssets.map((asset) => {
            const statusInfo = VAULT_STATUS_LABELS[asset.approvalStatus];
            const categoryInfo = VAULT_CATEGORY_LABELS[asset.category];
            const CategoryIcon = categoryInfo?.icon || FileText;

            return (
              <div key={asset.id} className="vc-vault-card">
                <div className="vc-vault-card-thumb-wrap">
                  <img
                    src={asset.thumbnailUrl || asset.fileUrl}
                    alt={asset.title}
                    className="vc-vault-card-img"
                    loading="lazy"
                  />
                  <div className="vc-vault-card-top-badges">
                    <span className="vc-vault-version-chip">{asset.version}</span>
                    <span className={`vc-vault-status-badge ${statusInfo.class}`}>
                      {statusInfo.label}
                    </span>
                  </div>
                  <div className="vc-vault-card-overlay">
                    <button
                      type="button"
                      className="vc-vault-btn vc-vault-btn-sm vc-vault-btn-primary"
                      onClick={() => setInspectedAsset(asset)}
                    >
                      <Eye size={14} /> Inspeccionar
                    </button>
                    <button
                      type="button"
                      className="vc-vault-btn vc-vault-btn-sm vc-vault-btn-secondary"
                      onClick={() => handleCopyProofLink(asset)}
                      title="Copiar link de aprobación"
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                </div>

                <div className="vc-vault-card-body">
                  <div className="vc-vault-card-meta-line">
                    <span className="vc-vault-card-category">{categoryInfo.label}</span>
                    <span className="vc-vault-card-filesize">{asset.fileSizeFormatted}</span>
                  </div>

                  <h3 className="vc-vault-card-title" title={asset.title}>
                    {asset.title}
                  </h3>

                  <div className="vc-vault-card-customer">
                    <User size={13} />
                    <span>{asset.customerName || 'Visual Corp Milagro'}</span>
                    {asset.orderCode && <strong>({asset.orderCode})</strong>}
                  </div>

                  <div className="vc-vault-card-specs">
                    <span className="vc-vault-spec-pill">{asset.colorProfile}</span>
                    {asset.dimensionsNote && (
                      <span className="vc-vault-spec-pill" title={asset.dimensionsNote}>
                        {asset.dimensionsNote}
                      </span>
                    )}
                    {asset.isSeedDemo && (
                      <span className="vc-vault-spec-pill" style={{ color: '#8b5cf6', borderColor: '#ddd6fe' }}>
                        Referencia / Demo
                      </span>
                    )}
                  </div>
                </div>

                <div className="vc-vault-card-footer">
                  <div className="vc-vault-card-footer-actions">
                    <button
                      type="button"
                      className="vc-vault-btn vc-vault-btn-icon vc-vault-btn-outline"
                      title="Previsualizar / Inspeccionar Preprensa"
                      onClick={() => setInspectedAsset(asset)}
                    >
                      <Eye size={15} />
                    </button>
                    {asset.approvalStatus !== 'aprobado' ? (
                      <button
                        type="button"
                        className="vc-vault-btn vc-vault-btn-icon vc-vault-btn-outline"
                        title="Marcar Aprobado"
                        onClick={() => handleUpdateStatus(asset.id, 'aprobado')}
                      >
                        <Check size={15} color="#10b981" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="vc-vault-btn vc-vault-btn-icon vc-vault-btn-outline"
                        title="Enviar a Revisión"
                        onClick={() => handleUpdateStatus(asset.id, 'en_revision')}
                      >
                        <Clock size={15} color="#f59e0b" />
                      </button>
                    )}
                    <button
                      type="button"
                      className="vc-vault-btn vc-vault-btn-icon vc-vault-btn-outline"
                      title="Copiar link de aprobación (/seguimiento/:code)"
                      onClick={() => handleCopyProofLink(asset)}
                    >
                      <Link2 size={15} />
                    </button>
                    <button
                      type="button"
                      className="vc-vault-btn vc-vault-btn-icon vc-vault-btn-outline"
                      title="Enviar prueba por WhatsApp"
                      onClick={() => handleSendWhatsAppProof(asset)}
                    >
                      <MessageSquare size={15} color="#10b981" />
                    </button>
                  </div>
                  <button
                    type="button"
                    className="vc-vault-btn vc-vault-btn-icon vc-vault-btn-outline"
                    title="Eliminar de la bóveda"
                    onClick={() => handleDeleteAsset(asset.id)}
                  >
                    <Trash2 size={14} color="#ef4444" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* VISTA TABLA TÉCNICA (.table-wrap) */
        <div className="vc-vault-table-wrap table-wrap">
          <table className="vc-vault-table">
            <thead>
              <tr>
                <th>Archivo / Preprensa</th>
                <th>Cliente & Orden</th>
                <th>Categoría</th>
                <th>Perfil de Color / Medida</th>
                <th>Versión</th>
                <th>Estado de Aprobación</th>
                <th>Fecha</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredAssets.map((asset) => {
                const statusInfo = VAULT_STATUS_LABELS[asset.approvalStatus];
                const categoryInfo = VAULT_CATEGORY_LABELS[asset.category];

                return (
                  <tr key={asset.id}>
                    <td>
                      <div className="vc-vault-table-file-cell">
                        <img
                          src={asset.thumbnailUrl || asset.fileUrl}
                          alt={asset.title}
                          className="vc-vault-table-thumb"
                        />
                        <div className="vc-vault-table-file-info">
                          <span className="vc-vault-table-filename" title={asset.fileName}>
                            {asset.title}
                          </span>
                          <span className="vc-vault-table-subtext">
                            {asset.fileName} · {asset.fileSizeFormatted}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontWeight: 650 }}>{asset.customerName || 'Visual Corp'}</span>
                        <span className="vc-vault-table-subtext">{asset.orderCode || 'Sin orden vinculada'}</span>
                      </div>
                    </td>
                    <td>
                      <span className="vc-vault-spec-pill">{categoryInfo.label}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span>{asset.colorProfile}</span>
                        <span className="vc-vault-table-subtext">{asset.dimensionsNote || '1:1'}</span>
                      </div>
                    </td>
                    <td>
                      <span className="vc-vault-version-chip">{asset.version}</span>
                    </td>
                    <td>
                      <span className={`vc-vault-status-badge ${statusInfo.class}`}>
                        {statusInfo.label}
                      </span>
                    </td>
                    <td>
                      <span className="vc-vault-table-subtext">
                        {formatDate(asset.updatedAt || asset.createdAt)}
                      </span>
                    </td>
                    <td>
                      <div className="vc-vault-table-actions" style={{ justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="vc-vault-btn vc-vault-btn-sm vc-vault-btn-outline"
                          onClick={() => setInspectedAsset(asset)}
                          title="Inspeccionar preprensa"
                        >
                          <Eye size={13} /> Ver
                        </button>
                        <button
                          type="button"
                          className="vc-vault-btn vc-vault-btn-sm vc-vault-btn-outline"
                          onClick={() => handleCopyProofLink(asset)}
                          title="Copiar link"
                        >
                          <Link2 size={13} />
                        </button>
                        <button
                          type="button"
                          className="vc-vault-btn vc-vault-btn-sm vc-vault-btn-outline"
                          onClick={() => handleSendWhatsAppProof(asset)}
                          title="Enviar por WhatsApp"
                        >
                          <MessageSquare size={13} color="#10b981" />
                        </button>
                        <button
                          type="button"
                          className="vc-vault-btn vc-vault-btn-sm vc-vault-btn-outline"
                          onClick={() => handleDeleteAsset(asset.id)}
                          title="Eliminar"
                        >
                          <Trash2 size={13} color="#ef4444" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ====================================================================
          MODAL: REGISTRAR / SUBIR ARCHIVO O ARTE
          ==================================================================== */}
      {isUploadModalOpen && (
        <div className="vc-vault-modal-overlay" onClick={() => setIsUploadModalOpen(false)}>
          <div className="vc-vault-modal" onClick={(e) => e.stopPropagation()}>
            <div className="vc-vault-modal-header">
              <h2 className="vc-vault-modal-title">
                <Upload size={18} /> Registrar / Subir Archivo a la Bóveda
              </h2>
              <button
                type="button"
                className="vc-vault-btn-icon vc-vault-btn-outline"
                onClick={() => setIsUploadModalOpen(false)}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveAsset}>
              <div className="vc-vault-modal-body">
                {uploadPendingFiles.length > 0 ? (
                  <div className="vc-vault-dropzone" style={{ padding: '12px 14px' }}>
                    <div className="vc-vault-dropzone-left">
                      <div className="vc-vault-dropzone-icon" style={{ width: 34, height: 34 }}>
                        <FileText size={16} />
                      </div>
                      <div className="vc-vault-dropzone-text">
                        <h4>{uploadPendingFiles.length} archivo(s) seleccionado(s)</h4>
                        <p>{uploadPendingFiles.map((f) => f.name).join(', ')}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="vc-vault-btn vc-vault-btn-sm vc-vault-btn-outline"
                      onClick={() => setUploadPendingFiles([])}
                    >
                      Cambiar
                    </button>
                  </div>
                ) : (
                  <div className="vc-vault-field">
                    <label className="vc-vault-label">Seleccionar desde la computadora:</label>
                    <button
                      type="button"
                      className="vc-vault-btn vc-vault-btn-secondary"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload size={15} /> Elegir archivos del disco
                    </button>
                  </div>
                )}

                <div className="vc-vault-form-grid">
                  <div className="vc-vault-field vc-vault-form-full">
                    <label className="vc-vault-label">Título descriptivo del archivo *</label>
                    <input
                      type="text"
                      className="vc-vault-input"
                      placeholder="Ej: Lona Frontlit Fachada 6x3m - El Rosado"
                      value={uploadFormData.title}
                      onChange={(e) => setUploadFormData({ ...uploadFormData, title: e.target.value })}
                      required
                    />
                  </div>

                  <div className="vc-vault-field">
                    <label className="vc-vault-label">Categoría de Archivo *</label>
                    <select
                      className="vc-vault-select"
                      value={uploadFormData.category}
                      onChange={(e) =>
                        setUploadFormData({ ...uploadFormData, category: e.target.value as VaultCategory })
                      }
                      required
                    >
                      {(Object.keys(VAULT_CATEGORY_LABELS) as VaultCategory[]).map((catKey) => (
                        <option key={catKey} value={catKey}>
                          {VAULT_CATEGORY_LABELS[catKey].label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="vc-vault-field">
                    <label className="vc-vault-label">Perfil de Color / Salida *</label>
                    <select
                      className="vc-vault-select"
                      value={uploadFormData.colorProfile}
                      onChange={(e) =>
                        setUploadFormData({ ...uploadFormData, colorProfile: e.target.value as VaultColorProfile })
                      }
                      required
                    >
                      <option value="CMYK 300 DPI">CMYK 300 DPI (Impresión digital / Offset)</option>
                      <option value="Escala 1:1 Gran Formato">Escala 1:1 Gran Formato (Lonas / Viniles)</option>
                      <option value="Vector Curvas PDF/SVG/CDR/AFDESIGN">Vector Curvas (Plotter / Láser / CNC)</option>
                      <option value="RGB Web">RGB Web (Redes / Evidencias / Comprobantes)</option>
                    </select>
                  </div>

                  <div className="vc-vault-field">
                    <label className="vc-vault-label">Cliente vinculado</label>
                    <select
                      className="vc-vault-select"
                      value={uploadFormData.customerId}
                      onChange={(e) => handleCustomerSelectChange(e.target.value)}
                    >
                      <option value="">-- Sin cliente o nuevo --</option>
                      {(data?.customers || []).map((c: any) => (
                        <option key={c.id} value={c.id}>
                          {c.name || `Cliente ${c.id}`}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="vc-vault-field">
                    <label className="vc-vault-label">Nombre del Cliente (o ingresar manual)</label>
                    <input
                      type="text"
                      className="vc-vault-input"
                      placeholder="Ej: Distribuidora El Rosado"
                      value={uploadFormData.customerName}
                      onChange={(e) => setUploadFormData({ ...uploadFormData, customerName: e.target.value })}
                    />
                  </div>

                  <div className="vc-vault-field">
                    <label className="vc-vault-label">Teléfono WhatsApp Cliente</label>
                    <input
                      type="text"
                      className="vc-vault-input"
                      placeholder="Ej: 0997078212"
                      value={uploadFormData.customerPhone}
                      onChange={(e) => setUploadFormData({ ...uploadFormData, customerPhone: e.target.value })}
                    />
                  </div>

                  <div className="vc-vault-field">
                    <label className="vc-vault-label">Código de Orden / Cotización</label>
                    <input
                      type="text"
                      className="vc-vault-input"
                      placeholder="Ej: ORD-2026-4412"
                      value={uploadFormData.orderCode}
                      onChange={(e) => setUploadFormData({ ...uploadFormData, orderCode: e.target.value })}
                    />
                  </div>

                  <div className="vc-vault-field">
                    <label className="vc-vault-label">Medidas y Material</label>
                    <input
                      type="text"
                      className="vc-vault-input"
                      placeholder="Ej: 300 x 120 cm · Acrílico 5mm"
                      value={uploadFormData.dimensionsNote}
                      onChange={(e) => setUploadFormData({ ...uploadFormData, dimensionsNote: e.target.value })}
                    />
                  </div>

                  <div className="vc-vault-field">
                    <label className="vc-vault-label">Versión Inicial</label>
                    <input
                      type="text"
                      className="vc-vault-input"
                      placeholder="v1"
                      value={uploadFormData.version}
                      onChange={(e) => setUploadFormData({ ...uploadFormData, version: e.target.value })}
                    />
                  </div>

                  {uploadPendingFiles.length === 0 && (
                    <div className="vc-vault-field vc-vault-form-full">
                      <label className="vc-vault-label">O enlace externo (Drive, WeTransfer, Canva, Figma):</label>
                      <input
                        type="url"
                        className="vc-vault-input"
                        placeholder="https://drive.google.com/... o https://canva.com/..."
                        value={uploadFormData.externalUrl}
                        onChange={(e) => setUploadFormData({ ...uploadFormData, externalUrl: e.target.value })}
                      />
                    </div>
                  )}

                  <div className="vc-vault-field vc-vault-form-full">
                    <label className="vc-vault-label">Notas técnicas de preprensa o taller</label>
                    <textarea
                      className="vc-vault-textarea"
                      placeholder="Indicaciones para el maquinista, tipo de laminado, demasías o requerimientos del cliente..."
                      value={uploadFormData.notes}
                      onChange={(e) => setUploadFormData({ ...uploadFormData, notes: e.target.value })}
                    />
                  </div>
                </div>

                {/* Prepress Checklist Initial Review */}
                <div className="vc-vault-prepress-checklist">
                  <span className="vc-vault-section-title">
                    <CheckSquare size={14} /> Verificación Inicial de Preprensa
                  </span>
                  <label className="vc-vault-check-item">
                    <input
                      type="checkbox"
                      checked={uploadFormData.fontsCurved}
                      onChange={(e) => setUploadFormData({ ...uploadFormData, fontsCurved: e.target.checked })}
                    />
                    <span>Textos convertidos a curvas / contornos vectorizados</span>
                  </label>
                  <label className="vc-vault-check-item">
                    <input
                      type="checkbox"
                      checked={uploadFormData.bleedConfirmed}
                      onChange={(e) => setUploadFormData({ ...uploadFormData, bleedConfirmed: e.target.checked })}
                    />
                    <span>Sangrado y demasías perimetrales de corte (3mm papelería / 20mm lona)</span>
                  </label>
                  <label className="vc-vault-check-item">
                    <input
                      type="checkbox"
                      checked={uploadFormData.colorProfileCMYK}
                      onChange={(e) => setUploadFormData({ ...uploadFormData, colorProfileCMYK: e.target.checked })}
                    />
                    <span>Espacio de color CMYK calibrado (sin tintas RGB no imprimibles)</span>
                  </label>
                </div>
              </div>

              <div className="vc-vault-modal-footer">
                <button
                  type="button"
                  className="vc-vault-btn vc-vault-btn-outline"
                  onClick={() => setIsUploadModalOpen(false)}
                  disabled={isUploading}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="vc-vault-btn vc-vault-btn-primary"
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <>
                      <RefreshCw size={15} className="vc-vault-spin" /> Guardando en Vault...
                    </>
                  ) : (
                    <>
                      <Check size={16} /> Registrar en Bóveda
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================================
          MODAL: LIGHTBOX & PREPRENSA INSPECTOR
          ==================================================================== */}
      {inspectedAsset && (
        <div className="vc-vault-modal-overlay" onClick={() => setInspectedAsset(null)}>
          <div className="vc-vault-modal is-lightbox" onClick={(e) => e.stopPropagation()}>
            <div className="vc-vault-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Eye size={18} />
                <h2 className="vc-vault-modal-title">{inspectedAsset.title}</h2>
                <span className="vc-vault-version-chip">{inspectedAsset.version}</span>
              </div>
              <button
                type="button"
                className="vc-vault-btn-icon vc-vault-btn-outline"
                onClick={() => setInspectedAsset(null)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="vc-vault-modal-body">
              <div className="vc-vault-inspector-grid">
                {/* Left Column: Image Canvas Preview */}
                <div className="vc-vault-preview-col">
                  <div className="vc-vault-preview-canvas">
                    <img src={inspectedAsset.fileUrl} alt={inspectedAsset.title} />
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="vc-vault-btn vc-vault-btn-sm vc-vault-btn-secondary"
                      onClick={() => handleCopyProofLink(inspectedAsset)}
                    >
                      <Copy size={14} /> Copiar Link de Aprobación
                    </button>
                    <button
                      type="button"
                      className="vc-vault-btn vc-vault-btn-sm vc-vault-btn-success"
                      onClick={() => handleSendWhatsAppProof(inspectedAsset)}
                    >
                      <MessageSquare size={14} /> Enviar por WhatsApp
                    </button>
                    {inspectedAsset.fileUrl && !inspectedAsset.fileUrl.startsWith('data:') && (
                      <a
                        href={inspectedAsset.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="vc-vault-btn vc-vault-btn-sm vc-vault-btn-outline"
                      >
                        <Download size={14} /> Descargar Arte
                      </a>
                    )}
                  </div>
                </div>

                {/* Right Column: Prepress Checklist, Technical Details & Version History */}
                <div className="vc-vault-details-col">
                  {/* Status Switcher Strip */}
                  <div className="vc-vault-field">
                    <label className="vc-vault-label">Estado de Aprobación:</label>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {(Object.keys(VAULT_STATUS_LABELS) as VaultApprovalStatus[]).map((stKey) => {
                        const isCurrent = inspectedAsset.approvalStatus === stKey;
                        return (
                          <button
                            key={stKey}
                            type="button"
                            className={`vc-vault-btn vc-vault-btn-sm ${isCurrent ? 'vc-vault-btn-primary' : 'vc-vault-btn-outline'}`}
                            onClick={() => handleUpdateStatus(inspectedAsset.id, stKey)}
                          >
                            {VAULT_STATUS_LABELS[stKey].label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Prepress Quality Checklist */}
                  <div className="vc-vault-prepress-checklist">
                    <span className="vc-vault-section-title">
                      <ShieldCheck size={15} /> Checklist Técnico de Preprensa
                    </span>
                    <label className="vc-vault-check-item">
                      <input
                        type="checkbox"
                        checked={inspectedAsset.prepressChecklist.fontsCurved}
                        onChange={() => handleToggleChecklist(inspectedAsset.id, 'fontsCurved')}
                      />
                      <span>Textos vectorizados en curvas (sin fuentes faltantes)</span>
                    </label>
                    <label className="vc-vault-check-item">
                      <input
                        type="checkbox"
                        checked={inspectedAsset.prepressChecklist.bleedConfirmed}
                        onChange={() => handleToggleChecklist(inspectedAsset.id, 'bleedConfirmed')}
                      />
                      <span>Sangrado y demasías perimetrales de corte verificadas</span>
                    </label>
                    <label className="vc-vault-check-item">
                      <input
                        type="checkbox"
                        checked={inspectedAsset.prepressChecklist.resolutionVerified}
                        onChange={() => handleToggleChecklist(inspectedAsset.id, 'resolutionVerified')}
                      />
                      <span>Resolución adecuada (300 DPI impresión / 150 DPI gran formato)</span>
                    </label>
                    <label className="vc-vault-check-item">
                      <input
                        type="checkbox"
                        checked={inspectedAsset.prepressChecklist.colorProfileCMYK}
                        onChange={() => handleToggleChecklist(inspectedAsset.id, 'colorProfileCMYK')}
                      />
                      <span>Perfil de color CMYK validado para tintas de taller</span>
                    </label>
                    <label className="vc-vault-check-item">
                      <input
                        type="checkbox"
                        checked={inspectedAsset.prepressChecklist.safeMarginVerified}
                        onChange={() => handleToggleChecklist(inspectedAsset.id, 'safeMarginVerified')}
                      />
                      <span>Margen de seguridad respetado para perforación u ojales</span>
                    </label>
                  </div>

                  {/* Technical Meta Box */}
                  <div style={{ background: 'var(--vc-vault-surface-subtle)', padding: 12, borderRadius: 10, fontSize: 11.5, display: 'grid', gap: 6 }}>
                    <div><strong>Cliente:</strong> {inspectedAsset.customerName || 'No especificado'}</div>
                    {inspectedAsset.orderCode && <div><strong>Orden vinculada:</strong> {inspectedAsset.orderCode}</div>}
                    <div><strong>Perfil de color:</strong> {inspectedAsset.colorProfile}</div>
                    <div><strong>Medidas / Especificación:</strong> {inspectedAsset.dimensionsNote || '1:1'}</div>
                    <div><strong>Almacenamiento:</strong> {inspectedAsset.storageProvider === 'supabase' ? 'Nube Supabase' : 'Bóveda Local'}</div>
                    {inspectedAsset.notes && <div><strong>Notas de taller:</strong> {inspectedAsset.notes}</div>}
                  </div>

                  {/* Version History & New Version Form */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span className="vc-vault-section-title">
                      <History size={14} /> Historial de Revisiones ({inspectedAsset.versionHistory.length})
                    </span>
                    <div className="vc-vault-version-timeline">
                      {inspectedAsset.versionHistory.map((h, i) => (
                        <div key={i} className="vc-vault-timeline-entry">
                          <span className="vc-vault-timeline-entry-badge">{h.version}</span>
                          <div className="vc-vault-timeline-entry-info">
                            <span>{h.notes}</span>
                            <span className="vc-vault-timeline-date">
                              {formatDate(h.updatedAt)} · {h.author || 'Taller'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Inline form to record new version note */}
                    <form onSubmit={handleAddVersion} style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                      <input
                        type="text"
                        className="vc-vault-input"
                        style={{ width: 70 }}
                        placeholder={`v${inspectedAsset.versionHistory.length + 1}`}
                        value={newVersionTag}
                        onChange={(e) => setNewVersionTag(e.target.value)}
                      />
                      <input
                        type="text"
                        className="vc-vault-input"
                        placeholder="Nota de nueva revisión o cambio de medidas..."
                        value={newVersionNotes}
                        onChange={(e) => setNewVersionNotes(e.target.value)}
                        required
                      />
                      <button type="submit" className="vc-vault-btn vc-vault-btn-sm vc-vault-btn-secondary">
                        <Plus size={14} />
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            </div>

            <div className="vc-vault-modal-footer">
              <button
                type="button"
                className="vc-vault-btn vc-vault-btn-outline"
                onClick={() => setInspectedAsset(null)}
              >
                Cerrar Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
