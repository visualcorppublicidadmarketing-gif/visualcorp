import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AppFrame, PageHeading } from '../../app/layout';
import { useAuth } from '../../auth/AuthProvider';
import { PurchasingSourcing } from '../../components/PurchasingSourcing';

export function PurchaseRequestsPage() {
  const { organizationId } = useAuth();
  const navigate = useNavigate();
  return <AppFrame area="operations">
    <PageHeading eyebrow="PRODUCCIÓN · ABASTECIMIENTO" title="Solicitudes de materiales" description="Vincula una necesidad de diseño, asesoría o producción con sus materiales y su trabajo para que Compras la revise."/>
    <PurchasingSourcing organizationId={organizationId} onOpenOrder={(orderNumber) => navigate(`/operaciones/compras?order=${encodeURIComponent(orderNumber)}`)}/>
  </AppFrame>;
}
