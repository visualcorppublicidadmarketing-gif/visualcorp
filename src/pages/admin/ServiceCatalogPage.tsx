import { useAuth } from '../../auth/AuthProvider';
import { AppFrame, PageHeading } from '../../app/layout';
import { ServiceCatalog } from './ServiceCatalog';

export function ServiceCatalogPage() {
  const { roles } = useAuth();
  const canManage = roles.includes('owner') || roles.includes('admin');

  return <AppFrame area="operations">
    <div className="catalog-page service-catalog-page">
      <PageHeading
        eyebrow="CATÁLOGO COMERCIAL · SERVICIOS"
        title="Servicios para cotizar y vender"
        description="Define paquetes, tarifas y condiciones desde un solo lugar. Los servicios publicados aparecen en Cotizador y POS; los borradores permanecen solo para administración."
      />
      <ServiceCatalog canManage={canManage}/>
    </div>
  </AppFrame>;
}
