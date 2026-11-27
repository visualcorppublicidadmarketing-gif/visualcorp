import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowUpRight,
  Check,
  Eye,
  Image as ImageIcon,
  Layers,
  Plus,
  RotateCcw,
  Save,
  Search,
  ShoppingBag,
  Sparkles,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppFrame, PageHeading } from '../../app/layout';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabaseClient';
import { usePersistentDraft } from '../../lib/usePersistentDraft';
import { DraftRecoveryBanner, PublishConfirmBar } from '../../components/ui/PublishConfirmBar';
import { Dialog, useConfirm } from '../../components/ui/OperationalKit';
import { catalogImagesForProduct } from '../../data/catalogProductImages';
import {
  consolidateStorefrontQuantityTiers,
  getStorefrontProductGroup,
  type PublicQuantityTier,
} from '../../public-site/storefrontCatalog';
import { SiteAdminNav } from './SiteAdminNav';

type BaseProductInfo = {
  name: string;
  description: string;
  category: string | null;
  image: string | null;
  sort_order: number;
};

type StoreProduct = {
  id: string;
  slug: string;
  sku?: string | null;
  name: string;
  description: string;
  category: string | null;
  calc_type?: string | null;
  sort_order: number;
  image: string | null;
  images?: string[] | null;
  features?: string[] | null;
  quantity_tiers?: PublicQuantityTier[] | null;
  quantityTiers?: string[];
  is_published: boolean;
  hasOverride: boolean;
  baseProduct: BaseProductInfo;
};

type StoreOverride = {
  product_id: string;
  display_name: string | null;
  display_description: string | null;
  display_category: string | null;
  display_image_url: string | null;
  sort_order: number | null;
};

type ProductDraft = {
  name: string;
  description: string;
  category: string;
  image: string;
  order: string;
};

type StatusFilter = 'all' | 'custom' | 'with-image' | 'no-image';

const toDraft = (product: StoreProduct): ProductDraft => ({
  name: product.name || '',
  description: product.description || '',
  category: product.category || '',
  image: product.image || '',
  order: String(product.sort_order ?? 0),
});

export function StorefrontAdminPage() {
  const { organizationId, user, hasPermission } = useAuth();
  const confirm = useConfirm();
  const canEdit = hasPermission('catalog_admin', 'edit');
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [term, setTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [previewFailed, setPreviewFailed] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selected = useMemo(
    () => products.find((product) => product.id === selectedId) || null,
    [products, selectedId]
  );

  const serverDraft = useMemo<ProductDraft>(
    () =>
      selected
        ? toDraft(selected)
        : { name: '', description: '', category: '', image: '', order: '0' },
    [selected]
  );

  const {
    draft,
    setDraft,
    isDirty,
    draftSavedAt,
    isRecovered,
    pendingRecovery,
    recoverDraft,
    dismissRecovery,
    discardDraft,
    markSaved,
  } = usePersistentDraft<ProductDraft>({
    orgId: organizationId,
    draftKey: selectedId ? `storefront:${selectedId}` : 'storefront:none',
    serverValue: serverDraft,
    enabled: Boolean(selected),
  });

  const refresh = useCallback(async () => {
    if (!supabase || !organizationId) {
      setLoading(false);
      setError('No hay una sesión conectada a la organización.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [{ data: productRows, error: productsError }, { data: overrideRows, error: overridesError }] = await Promise.all([
        supabase
          .from('public_catalog_products')
          .select('id,sku,slug,name,description,category,calc_type,sort_order,image,images,features,quantity_tiers,is_published')
          .order('sort_order')
          .limit(500),
        supabase
          .from('website_product_overrides')
          .select('product_id,display_name,display_description,display_category,display_image_url,sort_order')
          .eq('organization_id', organizationId),
      ]);
      if (productsError) throw productsError;
      if (overridesError) throw overridesError;

      const overrides = new Map<string, StoreOverride>(
        ((overrideRows as StoreOverride[] | null) || []).map((row) => [row.product_id, row])
      );

      type RawCatalogRow = {
        id: string;
        sku?: string | null;
        slug: string;
        name: string;
        description: string;
        category: string | null;
        calc_type?: string | null;
        sort_order: number;
        image: string | null;
        images?: string[] | null;
        features?: string[] | null;
        quantity_tiers?: PublicQuantityTier[] | null;
        is_published: boolean;
      };

      const consolidated = consolidateStorefrontQuantityTiers((productRows as RawCatalogRow[] | null) || []);
      const merged: StoreProduct[] = consolidated.map((product) => {
        const override = overrides.get(product.id);
        const hasOverride = Boolean(override);
        const effectiveCategory = override?.display_category || product.category;
        const effectiveName = override?.display_name || product.name;
        const effectiveImage = override?.display_image_url || product.image;
        const resolvedImages = catalogImagesForProduct({
          id: product.id,
          name: effectiveName,
          family: effectiveCategory || '',
          image: effectiveImage,
          images: product.images || [],
        });
        const baseProduct: BaseProductInfo = {
          name: product.name,
          description: product.description,
          category: product.category,
          image: product.image,
          sort_order: product.sort_order,
        };
        return {
          ...product,
          sku: product.sku?.trim() || null,
          name: effectiveName,
          description: override?.display_description || product.description,
          category: effectiveCategory,
          image: resolvedImages[0] || effectiveImage,
          images: resolvedImages.length ? resolvedImages : product.images || [],
          sort_order: override?.sort_order ?? product.sort_order,
          hasOverride,
          baseProduct,
        };
      });

      setProducts(merged);
      setSelectedId((current) => (merged.some((product) => product.id === current) ? current : merged[0]?.id || ''));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar el catálogo público.');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setPreviewFailed(false);
  }, [selectedId, draft.image]);

  const selectProduct = async (nextId: string) => {
    if (nextId === selectedId) return;
    if (isDirty || isRecovered) {
      const accepted = await confirm({
        eyebrow: 'CAMBIOS SIN PUBLICAR',
        title: `¿Cambiar de producto sin publicar "${selected?.name || ''}"?`,
        description:
          'Los cambios sin guardar permanecerán respaldados localmente en este navegador para este producto hasta que vuelvas.',
        tone: 'warning',
        confirmLabel: 'Cambiar de producto',
        cancelLabel: 'Seguir editando',
      });
      if (!accepted) return;
    }
    setSelectedId(nextId);
    setPreviewFailed(false);
    setNotice('');
    setError('');
  };

  const uniqueCategories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach((p) => {
      if (p.category && p.category.trim()) {
        cats.add(p.category.trim());
      }
    });
    return Array.from(cats).sort((a, b) => a.localeCompare(b, 'es'));
  }, [products]);

  // Executive KPI Strip Computations
  const customizedCount = useMemo(() => products.filter((p) => p.hasOverride).length, [products]);
  const categoriesCount = useMemo(() => uniqueCategories.length, [uniqueCategories]);
  const withValidImageCount = useMemo(
    () => products.filter((p) => Boolean(p.image) && !failedImages[p.id]).length,
    [products, failedImages]
  );
  const withoutImageCount = useMemo(
    () => products.filter((p) => !p.image || Boolean(failedImages[p.id])).length,
    [products, failedImages]
  );

  // Left Column Filters
  const filtered = useMemo(() => {
    const normalizedTerm = term.trim().toLocaleLowerCase('es');
    return products.filter((product) => {
      if (normalizedTerm) {
        const haystack = `${product.name} ${product.sku || ''} ${product.category || ''} ${product.description || ''}`.toLocaleLowerCase('es');
        if (!haystack.includes(normalizedTerm)) return false;
      }
      if (statusFilter === 'custom' && !product.hasOverride) return false;
      if (statusFilter === 'with-image') {
        const hasValid = Boolean(product.image) && !failedImages[product.id];
        if (!hasValid) return false;
      }
      if (statusFilter === 'no-image') {
        const hasValid = Boolean(product.image) && !failedImages[product.id];
        if (hasValid) return false;
      }
      if (categoryFilter !== 'all' && product.category !== categoryFilter) {
        return false;
      }
      return true;
    });
  }, [products, term, statusFilter, categoryFilter, failedImages]);

  const publishPresentation = async () => {
    if (!supabase || !organizationId || !selected || !draft || !canEdit || saving || restoring) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const order = Number(draft.order);
      if (!Number.isInteger(order) || order < 0) {
        throw new Error('El orden debe ser un número entero igual o mayor que cero.');
      }
      const values = {
        organization_id: organizationId,
        product_id: selected.id,
        display_name: draft.name.trim() || null,
        display_description: draft.description.trim() || null,
        display_category: draft.category.trim() || null,
        display_image_url: draft.image.trim() || null,
        sort_order: order,
        updated_by: user?.id || null,
        updated_at: new Date().toISOString(),
      };
      const { error: saveError } = await supabase
        .from('website_product_overrides')
        .upsert(values, { onConflict: 'organization_id,product_id' });
      if (saveError) throw saveError;

      const nextName = values.display_name || selected.baseProduct.name;
      const nextDescription = values.display_description || selected.baseProduct.description;
      const nextCategory = values.display_category || selected.baseProduct.category;
      const nextImage = values.display_image_url || selected.baseProduct.image;
      const savedDraft: ProductDraft = {
        name: nextName,
        description: nextDescription,
        category: nextCategory || '',
        image: nextImage || '',
        order: String(order),
      };

      setProducts((current) =>
        current.map((product) =>
          product.id === selected.id
            ? {
                ...product,
                name: nextName,
                description: nextDescription,
                category: nextCategory,
                image: nextImage,
                sort_order: order,
                hasOverride: true,
              }
            : product
        )
      );
      markSaved(savedDraft);
      setFailedImages((prev) => {
        const next = { ...prev };
        delete next[selected.id];
        return next;
      });
      setPreviewFailed(false);
      setNotice('Presentación publicada en /tienda. Las tarifas y escalas internas no se modificaron.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar la presentación del producto.');
    } finally {
      setSaving(false);
    }
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || !canEdit || (!isDirty && !isRecovered) || saving || restoring) return;
    const accepted = await confirm({
      eyebrow: 'CONFIRMAR PUBLICACIÓN EN /TIENDA',
      title: `¿Publicar cambios en "${draft.name.trim() || selected.name}"?`,
      description:
        'La ficha pública de este producto en /tienda actualizará de inmediato nombre, descripción, categoría, imagen y orden.',
      summaryItems: [
        { label: 'Nombre visible', value: draft.name.trim() || selected.baseProduct.name },
        { label: 'Categoría', value: draft.category.trim() || selected.baseProduct.category || 'Sin categoría' },
        { label: 'Orden', value: `#${draft.order}` },
      ],
      consequences: [
        'Los precios internos y rangos de cantidad del catálogo no se alteran.',
        'La tarjeta de /tienda reflejará esta presentación inmediatamente.',
      ],
      tone: 'brand',
      confirmLabel: 'Publicar en /tienda',
      cancelLabel: 'Revisar antes',
    });
    if (accepted) {
      await publishPresentation();
    }
  };

  const handleRestoreOriginal = async () => {
    if (!supabase || !organizationId || !selected || !canEdit || saving || restoring) return;
    const confirmed = await confirm({
      eyebrow: 'RESTAURAR CATÁLOGO BASE',
      title: `¿Restaurar "${selected.name}" a los valores originales?`,
      description:
        'Se eliminará la personalización web actual y el producto volverá a mostrar los datos base del catálogo.',
      tone: 'danger',
      destructive: true,
      confirmLabel: 'Sí, restaurar original',
      cancelLabel: 'Cancelar',
    });
    if (!confirmed) return;
    setRestoring(true);
    setError('');
    setNotice('');
    try {
      const { error: deleteError } = await supabase
        .from('website_product_overrides')
        .delete()
        .eq('organization_id', organizationId)
        .eq('product_id', selected.id);
      if (deleteError) throw deleteError;

      const restoredProduct: StoreProduct = {
        ...selected,
        name: selected.baseProduct.name,
        description: selected.baseProduct.description,
        category: selected.baseProduct.category,
        image: selected.baseProduct.image,
        sort_order: selected.baseProduct.sort_order,
        hasOverride: false,
      };

      setProducts((current) => current.map((item) => (item.id === selected.id ? restoredProduct : item)));
      markSaved(toDraft(restoredProduct));
      setFailedImages((prev) => {
        const next = { ...prev };
        delete next[selected.id];
        return next;
      });
      setPreviewFailed(false);
      setNotice(`Se restauró "${selected.baseProduct.name}" con los valores originales del catálogo.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo restaurar el producto original.');
    } finally {
      setRestoring(false);
    }
  };

  const handleClearImage = async () => {
    if (!canEdit || !draft.image) return;
    const accepted = await confirm({
      eyebrow: 'LIMPIAR IMAGEN EN BORRADOR',
      title: '¿Quitar la URL de imagen del borrador?',
      description: 'El producto mostrará el marcador de posición en vista previa hasta que definas o restaures una imagen.',
      tone: 'warning',
      confirmLabel: 'Sí, limpiar imagen',
      cancelLabel: 'Cancelar',
    });
    if (!accepted) return;
    setDraft({ ...draft, image: '' });
    setPreviewFailed(false);
  };

  const handleRestoreBaseImage = async () => {
    if (!canEdit || !selected?.baseProduct.image) return;
    const accepted = await confirm({
      eyebrow: 'RESTAURAR IMAGEN BASE',
      title: '¿Cargar la imagen original del catálogo en el borrador?',
      description: 'Se reemplazará la URL actual del borrador con la imagen original sincronizada del producto.',
      tone: 'info',
      confirmLabel: 'Restaurar imagen',
      cancelLabel: 'Cancelar',
    });
    if (!accepted) return;
    setDraft({ ...draft, image: selected.baseProduct.image || '' });
    setPreviewFailed(false);
  };

  return (
    <AppFrame area="admin">
      <style>{`
        .store-admin-page-wrap {
          box-sizing: border-box;
          width: 100%;
          max-width: 100%;
          min-width: 0;
        }
        .site-admin-kpi-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
          margin: 0 0 18px 0;
        }
        @media (max-width: 1260px) {
          .site-admin-kpi-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 580px) {
          .site-admin-kpi-grid {
            grid-template-columns: 1fr;
            gap: 9px;
          }
        }
        .site-admin-kpi-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 13px 15px;
          background: var(--admin-frosted-bg, #ffffff);
          border: 1px solid var(--admin-frosted-border, #e7e6ec);
          border-radius: 14px;
          backdrop-filter: blur(var(--admin-frosted-blur, 16px));
          -webkit-backdrop-filter: blur(var(--admin-frosted-blur, 16px));
          box-shadow: var(--admin-frosted-shadow, 0 1px 3px rgba(32, 33, 41, 0.04));
          transition: transform 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
          min-width: 0;
          max-width: 100%;
          box-sizing: border-box;
        }
        .site-admin-kpi-card:hover {
          border-color: rgba(165, 16, 145, 0.36);
          box-shadow: 0 3px 12px rgba(116, 19, 111, 0.1);
        }
        .site-admin-kpi-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: rgba(165, 16, 145, 0.11);
          color: #a51091;
          flex-shrink: 0;
        }
        .site-admin-kpi-body {
          display: flex;
          flex-direction: column;
          gap: 1px;
          min-width: 0;
        }
        .site-admin-kpi-label {
          font-size: 9px;
          font-weight: 750;
          color: var(--admin-glass-muted, #656673);
          letter-spacing: 0.06em;
          text-transform: uppercase;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .site-admin-kpi-val {
          font-size: 21px;
          font-weight: 850;
          color: var(--admin-glass-ink, #1f2028);
          line-height: 1.2;
        }
        .site-admin-kpi-hint {
          font-size: 9.5px;
          color: var(--admin-glass-muted, #8c8d98);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .store-admin-search-wrap {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 10px;
        }
        .search-box {
          position: relative;
          display: flex;
          align-items: center;
          width: 100%;
        }
        .search-box svg {
          position: absolute;
          left: 11px;
          color: #888995;
          pointer-events: none;
        }
        .search-box input {
          width: 100%;
          min-height: 37px;
          padding: 8px 32px 8px 34px;
          border: 1px solid #e4e4e9;
          border-radius: 8px;
          background: #fff;
          color: #252630;
          font: inherit;
          font-size: 11px;
        }
        .search-box input:focus {
          outline: 3px solid #a5109126;
          border-color: #a51091;
        }
        .search-clear-btn {
          position: absolute;
          right: 7px;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
          border: 0;
          border-radius: 50%;
          background: #eae9ef;
          color: #5c5d68;
          cursor: pointer;
          font-size: 14px;
          line-height: 1;
          padding: 0;
          transition: background 0.14s ease, color 0.14s ease;
        }
        .search-clear-btn:hover {
          background: #dcdbe4;
          color: #1a1a20;
        }

        .site-admin-filter-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
        }
        .site-admin-filter-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 9px;
          border: 1px solid #e3e2e8;
          border-radius: 999px;
          background: #f7f7f9;
          color: #555662;
          font-size: 9.5px;
          font-weight: 650;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .site-admin-filter-pill:hover {
          background: #f1eff5;
          color: #202128;
          border-color: #d1cfdb;
        }
        .site-admin-filter-pill.is-active {
          background: #74136f;
          color: #ffffff;
          border-color: #74136f;
          box-shadow: 0 1px 4px rgba(116, 19, 111, 0.22);
        }
        .site-admin-filter-pill span.pill-count {
          font-size: 8.5px;
          opacity: 0.85;
        }

        .store-admin-category-selector {
          display: flex;
          align-items: center;
          gap: 6px;
          width: 100%;
        }
        .store-admin-category-selector label {
          font-size: 9px;
          font-weight: 700;
          color: #656673;
          white-space: nowrap;
        }
        .store-admin-category-select {
          width: 100%;
          min-height: 32px;
          padding: 4px 8px;
          border: 1px solid #e3e2e8;
          border-radius: 7px;
          background: #fff;
          color: #2b2c36;
          font-size: 10px;
          font-weight: 600;
        }

        .store-admin-item-text {
          display: grid;
          gap: 3px;
          min-width: 0;
          width: 100%;
        }
        .store-admin-item-meta {
          display: flex;
          align-items: center;
          gap: 5px;
          margin-top: 1px;
        }
        .store-admin-order-badge {
          display: inline-flex;
          align-items: center;
          padding: 1px 5px;
          border-radius: 4px;
          background: #ecebf1;
          color: #555662;
          font-size: 8.5px;
          font-weight: 700;
        }
        .store-admin-edited-badge {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          padding: 1px 6px;
          border-radius: 4px;
          background: #faf2fb;
          color: #74136f;
          border: 1px solid #ebd0ee;
          font-size: 8.5px;
          font-weight: 750;
        }

        .store-admin-header-main {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }
        .store-admin-header-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }
        .store-admin-header-icon {
          color: #74136f;
          flex-shrink: 0;
          margin-top: 2px;
        }
        .store-admin-status-badges {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
          margin-top: 3px;
        }
        .store-badge-override {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 8px;
          border-radius: 999px;
          background: #faf0fc;
          color: #74136f;
          border: 1px solid #ebd0ee;
          font-size: 9.5px;
          font-weight: 750;
        }
        .store-badge-original {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 8px;
          border-radius: 999px;
          background: #edf8f3;
          color: #176d49;
          border: 1px solid #c9ebd8;
          font-size: 9.5px;
          font-weight: 750;
        }
        .store-badge-order {
          display: inline-flex;
          align-items: center;
          padding: 2px 7px;
          border-radius: 999px;
          background: #f1f0f5;
          color: #555662;
          font-size: 9.5px;
          font-weight: 700;
        }
        .store-badge-category {
          display: inline-flex;
          align-items: center;
          padding: 2px 7px;
          border-radius: 999px;
          background: #f7f7f9;
          color: #72737f;
          font-size: 9.5px;
        }

        .field-top-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 2px;
        }
        .field-top-row label {
          color: #555661;
          font-size: 10px;
          font-weight: 700;
        }
        .char-counter {
          font-size: 9px;
          font-weight: 600;
          color: #8c8d98;
        }
        .char-counter.is-warning {
          color: #c94a29;
          font-weight: 750;
        }

        .store-quick-category-chips {
          display: flex;
          flex-direction: column;
          gap: 5px;
          margin-top: 4px;
        }
        .quick-chips-label {
          font-size: 8.5px;
          font-weight: 700;
          color: #7a7b86;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .quick-chips-row {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
        }
        .quick-category-chip {
          padding: 3px 8px;
          border: 1px solid #e5e4ea;
          border-radius: 6px;
          background: #fcfbfe;
          color: #595a66;
          font-size: 9px;
          font-weight: 650;
          cursor: pointer;
          transition: all 0.14s ease;
        }
        .quick-category-chip:hover:not(:disabled) {
          background: #f5eff7;
          color: #74136f;
          border-color: #d8bad6;
        }
        .quick-category-chip.is-active {
          background: #f3e5f4;
          color: #74136f;
          border-color: #74136f;
          font-weight: 750;
        }

        .store-field-inline-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 4px;
        }
        .store-inline-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 9px;
          border: 1px solid #e3e2e8;
          border-radius: 6px;
          background: #fff;
          color: #585966;
          font-size: 9.5px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.14s ease;
        }
        .store-inline-btn:hover:not(:disabled) {
          background: #f7f6fa;
          color: #202129;
        }
        .store-inline-btn.is-restore {
          color: #74136f;
          border-color: #dfbfdc;
          background: #faf4fb;
        }
        .store-inline-btn.is-restore:hover:not(:disabled) {
          background: #f3e6f5;
          border-color: #74136f;
        }

        .store-order-control-row {
          display: grid;
          grid-template-columns: 110px 1fr;
          gap: 8px;
          align-items: center;
        }
        @media (max-width: 600px) {
          .store-order-control-row {
            grid-template-columns: 1fr;
          }
        }
        .store-order-quick-steppers {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .store-step-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 35px;
          padding: 0 11px;
          border: 1px solid #e4e4e9;
          border-radius: 7px;
          background: #fff;
          color: #3f404d;
          font-size: 10px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.14s ease;
        }
        .store-step-btn:hover:not(:disabled) {
          background: #f5f4f8;
          border-color: #cfced7;
          color: #1a1a22;
        }
        .store-step-btn.is-first {
          color: #74136f;
          background: #fdf8fe;
          border-color: #e5c5e2;
        }
        .store-step-btn.is-first:hover:not(:disabled) {
          background: #faedf9;
          border-color: #74136f;
        }

        .store-admin-live-preview-wrap {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 8px;
          padding: 14px;
          border-radius: 14px;
          background: #0f1015;
          border: 1px solid #23242e;
        }
        .store-admin-live-preview-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          color: #a8a9b5;
          font-size: 9px;
          font-weight: 750;
          letter-spacing: 0.05em;
        }
        .store-admin-live-preview-head span {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          color: #e5a4db;
        }
        .store-admin-live-preview-head small {
          color: #797a87;
          font-weight: 500;
        }

        .store-admin-live-card {
          position: relative;
          display: flex;
          flex-direction: column;
          max-width: 340px;
          margin: 0 auto;
          width: 100%;
          border-radius: 14px;
          overflow: hidden;
          background: linear-gradient(145deg, #1b1a23, #131219 80%);
          border: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
        }
        .store-live-card-media {
          position: relative;
          width: 100%;
          height: 180px;
          background: #191821;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }
        .store-live-card-media img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .store-live-card-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          color: #747385;
        }
        .store-live-card-placeholder span {
          font-size: 9px;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .store-live-card-hover-tag {
          position: absolute;
          right: 8px;
          bottom: 8px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          border-radius: 999px;
          background: rgba(17, 16, 24, 0.85);
          border: 1px solid rgba(255, 255, 255, 0.22);
          color: #f7f6f9;
          font-size: 7.5px;
          font-weight: 800;
          letter-spacing: 0.07em;
          backdrop-filter: blur(6px);
        }
        .store-live-card-content {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 12px 14px 14px;
        }
        .store-live-card-category {
          display: inline-block;
          align-self: flex-start;
          padding: 2px 7px;
          border-radius: 999px;
          background: rgba(227, 60, 165, 0.15);
          border: 1px solid rgba(227, 60, 165, 0.35);
          color: #ff9ee2;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }
        .store-live-card-title {
          color: #ffffff;
          font-size: 13px;
          font-weight: 750;
          line-height: 1.3;
          margin: 0;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }
        .store-live-card-desc {
          color: #a7a6b2;
          font-size: 9.5px;
          line-height: 1.5;
          margin: 0;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          min-height: 42px;
        }
        .store-live-card-meta {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px;
        }
        .store-live-card-sku {
          display: inline-flex;
          align-items: center;
          padding: 2px 7px;
          border-radius: 999px;
          background: rgba(39, 213, 236, 0.14);
          border: 1px solid rgba(39, 213, 236, 0.34);
          color: #67e8f9;
          font-size: 8px;
          font-weight: 750;
          letter-spacing: 0.04em;
        }
        .store-live-card-tiers {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          margin-top: 2px;
        }
        .store-live-card-tier-pill {
          font-size: 8.5px;
          padding: 2px 7px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.14);
          color: #d8d9e6;
          font-weight: 650;
        }
        .store-live-card-footer {
          display: flex;
          flex-direction: column;
          gap: 7px;
          margin-top: 6px;
          padding-top: 10px;
          border-top: 1px solid rgba(255, 255, 255, 0.09);
        }
        .store-live-card-add-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          width: 100%;
          min-height: 34px;
          padding: 0 12px;
          border-radius: 999px;
          background: linear-gradient(135deg, #a51091, #74136f);
          border: 1px solid rgba(255, 255, 255, 0.18);
          color: #ffffff;
          font-size: 10px;
          font-weight: 800;
          box-shadow: 0 4px 14px rgba(165, 16, 145, 0.35);
          user-select: none;
        }
        .store-live-card-price-note {
          color: #a7a6b2;
          font-size: 9px;
          text-align: center;
        }
        .work-app.theme-dark .search-box input,
        .work-app.theme-dark .store-admin-category-select,
        .work-app.theme-dark .store-inline-btn,
        .work-app.theme-dark .store-step-btn,
        .work-app.theme-dark .site-admin-filter-pill:not(.is-active) {
          background: var(--admin-clear-bg);
          border-color: var(--admin-frosted-border);
          color: var(--admin-glass-ink);
        }

        .store-admin-editor-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
          margin-top: 6px;
        }
        .store-restore-btn {
          color: #b3261e !important;
          border-color: #f1cfcc !important;
        }
        .store-restore-btn:hover:not(:disabled) {
          background: #fdf2f2 !important;
          border-color: #b3261e !important;
          color: #931c15 !important;
        }
      `}</style>

      <PageHeading
        eyebrow="EDITOR DEL SITIO"
        title="Tienda"
        description="Ajusta cómo se presentan los productos en la tienda pública. Las tarifas se administran por separado."
        action={
          <Link className="button button-outline" to="/tienda" target="_blank" rel="noreferrer">
            Abrir tienda pública <ArrowUpRight size={16} />
          </Link>
        }
      />

      <SiteAdminNav active="/admin/tienda" />

      <DraftRecoveryBanner
        pendingRecovery={pendingRecovery}
        itemLabel={selected ? `la presentación de "${selected.name}"` : 'el producto'}
        onRecover={recoverDraft}
        onDismiss={dismissRecovery}
      />

      {selected && (
        <PublishConfirmBar
          isDirty={isDirty}
          isRecovered={isRecovered}
          draftSavedAt={draftSavedAt}
          sectionName={`Tienda · ${selected.name}`}
          canPublish={canEdit}
          publishing={saving || restoring}
          previewLabel="Vista previa de ficha"
          publishLabel="Publicar en /tienda"
          publishConfirmTitle={`¿Publicar cambios en "${draft.name.trim() || selected.name}"?`}
          publishConfirmDescription="La tarjeta de /tienda mostrará de inmediato estos textos, categoría, imagen y orden de aparición."
          publishSummaryItems={[
            { label: 'Nombre visible', value: draft.name.trim() || selected.baseProduct.name },
            { label: 'Categoría', value: draft.category.trim() || selected.baseProduct.category || 'Sin categoría' },
            { label: 'Orden', value: `#${draft.order}` },
          ]}
          publishConsequences={[
            'Las tarifas internas, costos y escalas de cálculo no se modifican.',
            'El producto seleccionado quedará sincronizado en el catálogo web.',
          ]}
          onPreview={() => setPreviewOpen(true)}
          onDiscard={discardDraft}
          onPublish={publishPresentation}
        />
      )}

      {notice && (
        <div className="site-content-notice" role="status">
          <Check size={15} />
          {notice}
        </div>
      )}

      {error && (
        <div className="op-flow-alert error" role="alert">
          {error}
        </div>
      )}

      {!canEdit && (
        <div className="notice-box">
          <span>
            <ShoppingBag size={17} />
          </span>
          <div>
            <b>Catálogo en modo de consulta</b>
            <p>Tu perfil puede revisar los productos publicados, pero no tiene el permiso independiente de edición del catálogo.</p>
          </div>
        </div>
      )}

      {/* 1. Executive KPI Strip */}
      <section className="site-admin-kpi-grid" aria-label="Métricas del catálogo de la tienda">
        <article className="site-admin-kpi-card">
          <div className="site-admin-kpi-icon" aria-hidden="true">
            <ShoppingBag size={20} />
          </div>
          <div className="site-admin-kpi-body">
            <span className="site-admin-kpi-label">Productos públicos</span>
            <b className="site-admin-kpi-val">{products.length}</b>
            <small className="site-admin-kpi-hint">Sincronizados en tienda</small>
          </div>
        </article>

        <article className="site-admin-kpi-card">
          <div className="site-admin-kpi-icon" aria-hidden="true">
            <Sparkles size={20} />
          </div>
          <div className="site-admin-kpi-body">
            <span className="site-admin-kpi-label">Personalizados en web</span>
            <b className="site-admin-kpi-val">{customizedCount}</b>
            <small className="site-admin-kpi-hint">Con override activo</small>
          </div>
        </article>

        <article className="site-admin-kpi-card">
          <div className="site-admin-kpi-icon" aria-hidden="true">
            <Layers size={20} />
          </div>
          <div className="site-admin-kpi-body">
            <span className="site-admin-kpi-label">Categorías activas</span>
            <b className="site-admin-kpi-val">{categoriesCount}</b>
            <small className="site-admin-kpi-hint">Familias en vitrina</small>
          </div>
        </article>

        <article className="site-admin-kpi-card">
          <div className="site-admin-kpi-icon" aria-hidden="true">
            <ImageIcon size={20} />
          </div>
          <div className="site-admin-kpi-body">
            <span className="site-admin-kpi-label">Con imagen válida</span>
            <b className="site-admin-kpi-val">{withValidImageCount}</b>
            <small className="site-admin-kpi-hint">
              {withoutImageCount > 0 ? `${withoutImageCount} sin imagen` : 'Todas con foto'}
            </small>
          </div>
        </article>
      </section>

      <div className="store-admin-grid">
        {/* 2. Left Column: Enhanced Product Browser */}
        <section className="panel store-admin-list">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">PRODUCTOS PÚBLICOS</span>
              <h2>Catálogo visible</h2>
            </div>
            <span className="muted-count">{filtered.length} de {products.length}</span>
          </div>

          <div className="store-admin-search-wrap">
            <div className="search-box">
              <Search size={16} aria-hidden="true" />
              <input
                type="text"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Buscar por producto, categoría o texto..."
                aria-label="Buscar producto o categoría"
              />
              {term && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setTerm('')}
                  aria-label="Limpiar búsqueda"
                  title="Limpiar búsqueda"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Filter Pills */}
            <div className="site-admin-filter-pills" role="toolbar" aria-label="Filtros de estado">
              <button
                type="button"
                className={`site-admin-filter-pill${statusFilter === 'all' ? ' is-active' : ''}`}
                onClick={() => setStatusFilter('all')}
              >
                Todos <span className="pill-count">({products.length})</span>
              </button>
              <button
                type="button"
                className={`site-admin-filter-pill${statusFilter === 'custom' ? ' is-active' : ''}`}
                onClick={() => setStatusFilter('custom')}
              >
                Personalizados <span className="pill-count">({customizedCount})</span>
              </button>
              <button
                type="button"
                className={`site-admin-filter-pill${statusFilter === 'with-image' ? ' is-active' : ''}`}
                onClick={() => setStatusFilter('with-image')}
              >
                Con imagen <span className="pill-count">({withValidImageCount})</span>
              </button>
              <button
                type="button"
                className={`site-admin-filter-pill${statusFilter === 'no-image' ? ' is-active' : ''}`}
                onClick={() => setStatusFilter('no-image')}
              >
                Sin imagen <span className="pill-count">({withoutImageCount})</span>
              </button>
            </div>

            {/* Category Select Filter */}
            {uniqueCategories.length > 0 && (
              <div className="store-admin-category-selector">
                <label htmlFor="store-category-filter">Categoría:</label>
                <select
                  id="store-category-filter"
                  className="store-admin-category-select"
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                >
                  <option value="all">Todas las categorías ({uniqueCategories.length})</option>
                  {uniqueCategories.map((cat) => {
                    const count = products.filter((p) => p.category === cat).length;
                    return (
                      <option key={cat} value={cat}>
                        {cat} ({count})
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
          </div>

          {loading ? (
            <div className="empty-state">Cargando tienda…</div>
          ) : filtered.length ? (
            <div className="store-admin-items" role="list">
              {filtered.map((product) => {
                const hasValidThumb = Boolean(product.image) && !failedImages[product.id];
                return (
                  <button
                    type="button"
                    key={product.id}
                    onClick={() => void selectProduct(product.id)}
                    className={`store-admin-item${selectedId === product.id ? ' is-selected' : ''}`}
                    aria-selected={selectedId === product.id}
                  >
                    <span className="store-admin-thumb" aria-hidden="true">
                      {hasValidThumb ? (
                        <img
                          src={product.image || ''}
                          alt=""
                          loading="lazy"
                          onError={() => setFailedImages((prev) => ({ ...prev, [product.id]: true }))}
                        />
                      ) : (
                        <ShoppingBag size={18} />
                      )}
                    </span>
                    <span className="store-admin-item-text">
                      <b>{product.name}</b>
                      <small>{product.category || 'Sin categoría'}</small>
                      <span className="store-admin-item-meta">
                        <span className="store-admin-order-badge">#{product.sort_order}</span>
                        {product.hasOverride && (
                          <span className="store-admin-edited-badge">
                            <Sparkles size={9} /> Editado
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              No hay productos que coincidan con la búsqueda o filtro activo.
            </div>
          )}
        </section>

        {/* 3. Right Column: Presentation Studio & Live Card Preview */}
        <form className="panel form-panel store-admin-editor" onSubmit={(event) => void save(event)}>
          <div className="panel-heading store-admin-header-main">
            <div className="store-admin-header-info">
              <span className="eyebrow">ESTUDIO DE PRESENTACIÓN</span>
              <h2>{selected?.name || 'Selecciona un producto'}</h2>
              {selected && (
                <div className="store-admin-status-badges">
                  {selected.hasOverride ? (
                    <span className="store-badge-override">
                      <Sparkles size={11} /> Personalizado en web
                    </span>
                  ) : (
                    <span className="store-badge-original">
                      <Check size={11} /> Valores de catálogo original
                    </span>
                  )}
                  <span className="store-badge-order">Orden #{draft.order}</span>
                  {selected.sku && <span className="store-badge-category">SKU {selected.sku}</span>}
                  {selected.baseProduct.category && selected.baseProduct.category !== draft.category && (
                    <span className="store-badge-category">
                      Original: {selected.baseProduct.category}
                    </span>
                  )}
                </div>
              )}
            </div>
            <ShoppingBag size={20} className="store-admin-header-icon" aria-hidden="true" />
          </div>

          {!selected ? (
            <div className="empty-state">Selecciona un producto para editar su presentación.</div>
          ) : (
            <>
              {/* Field: Nombre visible */}
              <div>
                <div className="field-top-row">
                  <label htmlFor="store-field-name">Nombre visible</label>
                  <span className={`char-counter${draft.name.length > 110 ? ' is-warning' : ''}`}>
                    {draft.name.length}/120
                  </span>
                </div>
                <input
                  id="store-field-name"
                  disabled={!canEdit}
                  maxLength={120}
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  placeholder="Nombre atractivo para la tienda web..."
                />
              </div>

              {/* Field: Descripción */}
              <div>
                <div className="field-top-row">
                  <label htmlFor="store-field-description">Descripción</label>
                  <span className={`char-counter${draft.description.length > 650 ? ' is-warning' : ''}`}>
                    {draft.description.length}/700
                  </span>
                </div>
                <textarea
                  id="store-field-description"
                  disabled={!canEdit}
                  rows={4}
                  maxLength={700}
                  value={draft.description}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                  placeholder="Detalles orientados al cliente, acabados, usos recomendados..."
                />
              </div>

              {/* Field: Categoría visible */}
              <div>
                <div className="field-top-row">
                  <label htmlFor="store-field-category">Categoría visible</label>
                  <span className="char-counter">{draft.category.length}/90</span>
                </div>
                <input
                  id="store-field-category"
                  list="store-category-options"
                  disabled={!canEdit}
                  maxLength={90}
                  value={draft.category}
                  onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                  placeholder="Ej. Gran formato, Rótulos, Textil..."
                />
                <datalist id="store-category-options">
                  {uniqueCategories.map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>

                {uniqueCategories.length > 0 && (
                  <div className="store-quick-category-chips">
                    <span className="quick-chips-label">Categorías sugeridas (1 clic):</span>
                    <div className="quick-chips-row">
                      {uniqueCategories.slice(0, 6).map((cat) => (
                        <button
                          type="button"
                          key={cat}
                          disabled={!canEdit}
                          className={`quick-category-chip${draft.category === cat ? ' is-active' : ''}`}
                          onClick={() => setDraft({ ...draft, category: cat })}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Field: Imagen (URL) */}
              <div>
                <div className="field-top-row">
                  <label htmlFor="store-field-image">Imagen (URL)</label>
                </div>
                <input
                  id="store-field-image"
                  disabled={!canEdit}
                  type="url"
                  value={draft.image}
                  onChange={(event) => {
                    setDraft({ ...draft, image: event.target.value });
                    setPreviewFailed(false);
                  }}
                  placeholder="https://ejemplo.com/producto.jpg"
                />
                <div className="store-field-inline-actions">
                  {draft.image && (
                    <button
                      type="button"
                      className="store-inline-btn"
                      disabled={!canEdit}
                      onClick={() => void handleClearImage()}
                    >
                      <X size={12} /> Limpiar imagen
                    </button>
                  )}
                  {selected.baseProduct.image && draft.image !== selected.baseProduct.image && (
                    <button
                      type="button"
                      className="store-inline-btn is-restore"
                      disabled={!canEdit}
                      onClick={() => void handleRestoreBaseImage()}
                    >
                      <RotateCcw size={12} /> Restaurar imagen original
                    </button>
                  )}
                </div>
              </div>

              {/* Field: Orden de aparición */}
              <div>
                <div className="field-top-row">
                  <label htmlFor="store-field-order">Orden de aparición</label>
                  <span className="char-counter">Menor número = mayor prioridad</span>
                </div>
                <div className="store-order-control-row">
                  <input
                    id="store-field-order"
                    disabled={!canEdit}
                    type="number"
                    min="0"
                    step="1"
                    value={draft.order}
                    onChange={(event) => setDraft({ ...draft, order: event.target.value })}
                  />
                  <div className="store-order-quick-steppers">
                    <button
                      type="button"
                      className="store-step-btn"
                      disabled={!canEdit || Number(draft.order) <= 0}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          order: String(Math.max(0, (parseInt(draft.order, 10) || 0) - 1)),
                        })
                      }
                      title="Disminuir orden (-1)"
                    >
                      -1
                    </button>
                    <button
                      type="button"
                      className="store-step-btn"
                      disabled={!canEdit}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          order: String((parseInt(draft.order, 10) || 0) + 1),
                        })
                      }
                      title="Aumentar orden (+1)"
                    >
                      +1
                    </button>
                    <button
                      type="button"
                      className="store-step-btn is-first"
                      disabled={!canEdit || draft.order === '0'}
                      onClick={() => setDraft({ ...draft, order: '0' })}
                      title="Fijar primero (#0)"
                    >
                      Primero #0
                    </button>
                  </div>
                </div>
              </div>

              {/* Live Storefront Card Preview aligned with /tienda */}
              <div className="store-admin-live-preview-wrap">
                <div className="store-admin-live-preview-head">
                  <span>
                    <Eye size={13} /> VISTA PREVIA REAL EN /TIENDA
                  </span>
                  <small>Tarjeta pública para lista de cotización</small>
                </div>
                <div className="store-admin-live-card">
                  <div className="store-live-card-media">
                    {draft.image && !previewFailed ? (
                      <img
                        src={draft.image}
                        alt={draft.name || selected.name}
                        loading="lazy"
                        onError={() => setPreviewFailed(true)}
                      />
                    ) : (
                      <div className="store-live-card-placeholder">
                        <ShoppingBag size={34} />
                        <span>Sin imagen publicada</span>
                      </div>
                    )}
                    <span className="store-live-card-hover-tag">
                      VER DETALLES <ArrowUpRight size={11} />
                    </span>
                  </div>
                  <div className="store-live-card-content">
                    <div className="store-live-card-meta">
                      <span className="store-live-card-category">
                        {getStorefrontProductGroup({
                          name: draft.name.trim() || selected.name,
                          category: draft.category.trim() || selected.category,
                        })}
                      </span>
                      {selected.sku && !selected.quantityTiers?.length && (
                        <span className="store-live-card-sku">Código · {selected.sku}</span>
                      )}
                    </div>
                    <h3 className="store-live-card-title">
                      {draft.name.trim() || selected.name || 'Nombre del producto'}
                    </h3>
                    <p className="store-live-card-desc">
                      {draft.description.trim() ||
                        selected.description ||
                        'Cuéntanos qué tienes en mente y revisamos los detalles contigo.'}
                    </p>
                    {selected.quantityTiers && selected.quantityTiers.length > 0 && (
                      <div className="store-live-card-tiers" aria-label="Opciones de cantidad disponibles">
                        {selected.quantityTiers.map((tierLabel) => (
                          <span key={tierLabel} className="store-live-card-tier-pill">
                            {tierLabel}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="store-live-card-footer">
                      <div className="store-live-card-add-btn" role="button" aria-disabled="true">
                        <Plus size={14} />
                        <span>Añadir a mi lista</span>
                      </div>
                      <span className="store-live-card-price-note">
                        {selected.quantityTiers?.length
                          ? `${selected.quantityTiers.length} opciones de cantidad · Precio según proyecto`
                          : 'Precio según proyecto'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <p className="field-hint">
                La tienda consume el catálogo público sincronizado. Esta pantalla solo cambia nombre, descripción,
                categoría, imagen y orden; no permite crear productos ni alterar precios o rangos internos.
              </p>

              {/* Actions */}
              <div className="store-admin-editor-actions">
                <button
                  className="button button-dark"
                  type="submit"
                  disabled={!canEdit || (!isDirty && !isRecovered) || saving || restoring}
                >
                  <Save size={16} />
                  {saving ? 'Publicando…' : 'Publicar en /tienda'}
                </button>

                {selected.hasOverride && canEdit && (
                  <button
                    type="button"
                    className="button button-outline store-restore-btn"
                    disabled={!canEdit || saving || restoring}
                    onClick={() => void handleRestoreOriginal()}
                    title="Elimina el override y restaura los datos originales del catálogo"
                  >
                    <RotateCcw size={16} />
                    {restoring ? 'Restaurando…' : 'Restaurar original del catálogo'}
                  </button>
                )}
              </div>
            </>
          )}
        </form>
      </div>

      {selected && (
        <Dialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          size="md"
          tone="brand"
          eyebrow="VISTA PREVIA EN VIVO · /TIENDA"
          title={draft.name.trim() || selected.name}
          description="Simulación de cómo se verá este artículo en la vitrina pública sin exponer tarifas internas."
          footer={
            <button type="button" className="button button-outline" onClick={() => setPreviewOpen(false)}>
              Cerrar vista previa
            </button>
          }
        >
          <div className="store-admin-live-preview-wrap" style={{ marginTop: 0 }}>
            <div className="store-admin-live-card">
              <div className="store-live-card-media">
                {draft.image && !previewFailed ? (
                  <img
                    src={draft.image}
                    alt={draft.name || selected.name}
                    onError={() => setPreviewFailed(true)}
                  />
                ) : (
                  <div className="store-live-card-placeholder">
                    <ShoppingBag size={34} />
                    <span>Sin imagen publicada</span>
                  </div>
                )}
              </div>
              <div className="store-live-card-content">
                <div className="store-live-card-meta">
                  <span className="store-live-card-category">
                    {getStorefrontProductGroup({
                      name: draft.name.trim() || selected.name,
                      category: draft.category.trim() || selected.category,
                    })}
                  </span>
                  {selected.sku && <span className="store-live-card-sku">Código · {selected.sku}</span>}
                </div>
                <h3 className="store-live-card-title">{draft.name.trim() || selected.name}</h3>
                <p className="store-live-card-desc">
                  {draft.description.trim() ||
                    selected.description ||
                    'Cuéntanos qué tienes en mente y revisamos los detalles contigo.'}
                </p>
                {selected.quantityTiers && selected.quantityTiers.length > 0 && (
                  <div className="store-live-card-tiers">
                    {selected.quantityTiers.map((tierLabel) => (
                      <span key={tierLabel} className="store-live-card-tier-pill">
                        {tierLabel}
                      </span>
                    ))}
                  </div>
                )}
                <div className="store-live-card-footer">
                  <div className="store-live-card-add-btn" role="button" aria-disabled="true">
                    <Plus size={14} />
                    <span>Añadir a mi lista</span>
                  </div>
                  <span className="store-live-card-price-note">
                    {selected.quantityTiers?.length ? 'Opciones por cantidad · Precio según proyecto' : 'Precio según proyecto'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Dialog>
      )}
    </AppFrame>
  );
}
