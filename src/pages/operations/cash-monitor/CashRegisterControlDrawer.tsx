import React, { useCallback, useEffect, useState } from 'react';
import { Check, Edit3, Loader2, Plus, Store, Trash2, UserCheck, X } from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';
import { normalizePersonName } from '../../../lib/personName';
import {
  formatAdminControlError,
  formatMoneyUsd,
  updateCashRegisterControl,
} from '../../../lib/adminCashSalesControl';
import { AdminDeleteRecordModal, type AdminDeleteTarget } from '../../../components/AdminDeleteRecordModal';
import { Dialog, DialogCallout } from '../../../components/ui/DialogSystem';

export interface CashRegisterRow {
  id: string;
  branch_id: string;
  name: string;
  assigned_advisor_id: string | null;
  active: boolean;
  goal_amount?: number | null;
}

export interface CashRegisterControlDrawerProps {
  open: boolean;
  organizationId: string;
  branches: Array<{ id: string; name: string }>;
  team: Array<{ user_id: string; full_name?: string | null; email?: string | null }>;
  openRegisterIds: Set<string>;
  canManageRegisters: boolean;
  canDeleteCash: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: (message: string) => void | Promise<void>;
}

const getCurrentWeekStart = () => {
  const now = new Date();
  const ecu = new Date(now.toLocaleString('en-US', { timeZone: 'America/Guayaquil' }));
  const day = ecu.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  ecu.setDate(ecu.getDate() + diff);
  const y = ecu.getFullYear();
  const m = String(ecu.getMonth() + 1).padStart(2, '0');
  const d = String(ecu.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export function CashRegisterControlDrawer({
  open,
  organizationId,
  branches,
  team,
  openRegisterIds,
  canManageRegisters,
  canDeleteCash,
  onOpenChange,
  onChanged,
}: CashRegisterControlDrawerProps) {
  const weekStart = getCurrentWeekStart();
  const [registers, setRegisters] = useState<CashRegisterRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // New register state
  const [newBranchId, setNewBranchId] = useState('');
  const [newName, setNewName] = useState('');
  const [newAdvisorId, setNewAdvisorId] = useState('');
  const [newGoal, setNewGoal] = useState('0');

  // Editing row state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBranchId, setEditBranchId] = useState('');
  const [editName, setEditName] = useState('');
  const [editAdvisorId, setEditAdvisorId] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [editGoal, setEditGoal] = useState('0');

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState<AdminDeleteTarget | null>(null);

  const loadRegisters = useCallback(async () => {
    if (!open || !supabase || !organizationId) return;
    setLoading(true);
    setError('');
    try {
      const [regRes, goalRes] = await Promise.all([
        supabase
          .from('cash_registers')
          .select('id, branch_id, name, assigned_advisor_id, active')
          .eq('organization_id', organizationId)
          .order('name'),
        supabase
          .from('cash_register_weekly_goals')
          .select('cash_register_id, goal_amount')
          .eq('organization_id', organizationId)
          .eq('week_start', weekStart),
      ]);
      if (regRes.error) throw regRes.error;
      const goalMap = new Map(
        (goalRes.data || []).map((g: any) => [String(g.cash_register_id), Number(g.goal_amount) || 0])
      );
      setRegisters(
        ((regRes.data || []) as any[]).map((r) => ({
          ...r,
          goal_amount: goalMap.get(String(r.id)) ?? 0,
        }))
      );
    } catch (err) {
      setError(formatAdminControlError(err, 'No se pudieron cargar las cajas registradoras.'));
    } finally {
      setLoading(false);
    }
  }, [open, organizationId, weekStart]);

  useEffect(() => {
    if (!open) {
      setEditingId(null);
      setError('');
      setNotice('');
      return;
    }
    if (!newBranchId && branches[0]?.id) setNewBranchId(branches[0].id);
    void loadRegisters();
  }, [open, branches, newBranchId, loadRegisters]);

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name || 'Sucursal';
  const advisorName = (id: string | null) => {
    if (!id) return 'Sin asesor fijo (libre)';
    const m = team.find((t) => t.user_id === id);
    return normalizePersonName(m?.full_name || m?.email || id.slice(0, 8));
  };

  const handleCreateRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase || !organizationId || !canManageRegisters || saving) return;
    if (!newBranchId || !newName.trim()) {
      setError('Selecciona la sucursal e indica el nombre de la caja.');
      return;
    }
    if (!newAdvisorId) {
      setError('Selecciona el asesor o responsable asignado a la caja.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const { error: rpcErr } = await supabase.rpc('create_cash_register_with_weekly_goal', {
        p_organization_id: organizationId,
        p_branch_id: newBranchId,
        p_name: newName.trim(),
        p_assigned_advisor_id: newAdvisorId,
        p_week_start: weekStart,
        p_goal_amount: Math.max(0, Number(newGoal) || 0),
      });
      if (rpcErr) throw rpcErr;
      setNewName('');
      setNewGoal('0');
      setNotice('Caja registradora creada correctamente.');
      await loadRegisters();
      await onChanged('Caja registradora creada.');
    } catch (err) {
      setError(formatAdminControlError(err, 'No se pudo crear la caja registradora.'));
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (reg: CashRegisterRow) => {
    setEditingId(reg.id);
    setEditBranchId(reg.branch_id);
    setEditName(reg.name);
    setEditAdvisorId(reg.assigned_advisor_id || '');
    setEditActive(reg.active !== false);
    setEditGoal(String(reg.goal_amount ?? 0));
  };

  const handleSaveEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingId || saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await updateCashRegisterControl({
        registerId: editingId,
        name: editName,
        branchId: editBranchId,
        assignedAdvisorId: editAdvisorId || null,
        active: editActive,
        weekStart,
        goalAmount: Math.max(0, Number(editGoal) || 0),
      });
      setEditingId(null);
      setNotice('Caja actualizada correctamente.');
      await loadRegisters();
      await onChanged('Configuración de caja actualizada.');
    } catch (err) {
      setError(formatAdminControlError(err, 'No se pudo guardar los cambios de la caja.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        size="lg"
        eyebrow="GESTIÓN DE GAVETAS Y METAS"
        title="Control administrativo de cajas registradoras"
        description="Crea cajas, reasigna sucursales o asesores, define metas semanales y elimina cajas de prueba."
        footer={
          <button type="button" className="vc-dlg-btn variant-outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </button>
        }
      >
        <div className="ocm-reg-drawer">
          {error && (
            <DialogCallout tone="danger" role="alert">
              {error}
            </DialogCallout>
          )}
          {notice && (
            <DialogCallout tone="success" role="status">
              {notice}
            </DialogCallout>
          )}

          {canManageRegisters && (
            <form className="ocm-reg-create-form" onSubmit={handleCreateRegister}>
              <h4>
                <Plus size={14} /> Nueva caja registradora
              </h4>
              <div className="ocm-reg-form-grid">
                <label>
                  <span>Sucursal</span>
                  <select value={newBranchId} onChange={(e) => setNewBranchId(e.target.value)} required>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Nombre de caja</span>
                  <input
                    type="text"
                    required
                    placeholder="Ej.: Caja Principal / Mostrador 2"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </label>
                <label>
                  <span>Asesor responsable</span>
                  <select value={newAdvisorId} onChange={(e) => setNewAdvisorId(e.target.value)} required>
                    <option value="">Selecciona responsable…</option>
                    {team.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {normalizePersonName(m.full_name || m.email || m.user_id.slice(0, 8))}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Meta semanal ($)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newGoal}
                    onChange={(e) => setNewGoal(e.target.value)}
                  />
                </label>
              </div>
              <button type="submit" className="button button-dark" disabled={saving}>
                {saving ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Crear caja
              </button>
            </form>
          )}

          {loading ? (
            <div className="ocm-inspector-loading">
              <Loader2 size={20} className="spin" />
              <span>Consultando cajas registradoras…</span>
            </div>
          ) : registers.length === 0 ? (
            <div className="ocm-inspector-empty">No hay cajas registradoras configuradas en la organización.</div>
          ) : (
            <div className="ocm-reg-list">
              {registers.map((reg) => {
                const hasActiveShift = openRegisterIds.has(reg.id);
                const isEditing = editingId === reg.id;
                return (
                  <article key={reg.id} className={`ocm-reg-card ${!reg.active ? 'is-inactive' : ''}`}>
                    {isEditing ? (
                      <form onSubmit={handleSaveEdit} className="ocm-reg-edit-form">
                        <div className="ocm-reg-form-grid">
                          <label>
                            <span>Nombre</span>
                            <input
                              type="text"
                              required
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                            />
                          </label>
                          <label>
                            <span>Sucursal</span>
                            <select value={editBranchId} onChange={(e) => setEditBranchId(e.target.value)}>
                              {branches.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            <span>Asesor asignado</span>
                            <select value={editAdvisorId} onChange={(e) => setEditAdvisorId(e.target.value)}>
                              <option value="">Sin asesor fijo</option>
                              {team.map((m) => (
                                <option key={m.user_id} value={m.user_id}>
                                  {normalizePersonName(m.full_name || m.email || m.user_id.slice(0, 8))}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            <span>Meta semanal ($)</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={editGoal}
                              onChange={(e) => setEditGoal(e.target.value)}
                            />
                          </label>
                        </div>
                        <label className="ocm-delete-check">
                          <input
                            type="checkbox"
                            checked={editActive}
                            onChange={(e) => setEditActive(e.target.checked)}
                          />
                          <span>Caja activa para nuevos turnos</span>
                        </label>
                        <div className="ocm-row-actions">
                          <button type="submit" className="button button-dark" disabled={saving}>
                            <Check size={14} /> Guardar
                          </button>
                          <button
                            type="button"
                            className="button button-outline"
                            onClick={() => setEditingId(null)}
                          >
                            <X size={14} /> Cancelar
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <div className="ocm-reg-main">
                          <div>
                            <div className="ocm-reg-badges">
                              <span className="ocm-reg-branch">
                                <Store size={11} /> {branchName(reg.branch_id)}
                              </span>
                              <span className={`ocm-reg-status ${reg.active ? 'is-on' : 'is-off'}`}>
                                {reg.active ? 'Activa' : 'Inactiva'}
                              </span>
                              {hasActiveShift && <span className="ocm-reg-live">Turno abierto</span>}
                            </div>
                            <h4>{reg.name}</h4>
                            <small>
                              <UserCheck size={12} /> {advisorName(reg.assigned_advisor_id)} · Meta semanal:{' '}
                              <b>{formatMoneyUsd(reg.goal_amount ?? 0)}</b>
                            </small>
                          </div>
                          <div className="ocm-row-actions">
                            {canManageRegisters && (
                              <button
                                type="button"
                                className="button button-outline"
                                onClick={() => startEditing(reg)}
                              >
                                <Edit3 size={13} /> Editar
                              </button>
                            )}
                            {canDeleteCash && (
                              <button
                                type="button"
                                className="button ocm-btn-danger-outline"
                                disabled={hasActiveShift}
                                title={
                                  hasActiveShift
                                    ? 'Cierra o elimina el turno abierto de esta caja antes de eliminarla'
                                    : 'Eliminar caja registradora'
                                }
                                onClick={() =>
                                  setDeleteTarget({
                                    kind: 'register',
                                    registerId: reg.id,
                                    registerName: reg.name,
                                    branchName: branchName(reg.branch_id),
                                    active: reg.active,
                                  })
                                }
                              >
                                <Trash2 size={13} /> Eliminar
                              </button>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </Dialog>

      <AdminDeleteRecordModal
        open={Boolean(deleteTarget)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDeleteTarget(null);
        }}
        target={deleteTarget}
        onDeleted={async (msg) => {
          setNotice(msg);
          await loadRegisters();
          await onChanged(msg);
        }}
      />
    </>
  );
}
