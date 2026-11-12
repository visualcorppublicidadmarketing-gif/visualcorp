import { useEffect, useId, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Link2, Shield, UserPlus, Users } from 'lucide-react';
import { Dialog, DialogCallout, DialogSection } from '../ui/DialogSystem';
import { SelectDropdown, type SelectDropdownOption } from '../ui/SelectDropdown';
import { Button } from '../ui/OperationalKit';
import { GoogleMapsLocationFields, type LocationDraft } from '../GoogleMapsLocationFields';
import { normalizeGoogleMapsUrl } from '../../lib/maps';
import { ecuadorTodayIso, DEPARTMENT_PRESETS } from './personnelDomain';
import type { AccessProfile, GoogleAccount, PersonnelRecord } from './personnelTypes';

export interface PersonnelFormValues {
  fullName: string;
  email: string;
  phone: string;
  documentReference: string;
  homeCity: string;
  homeLocation: LocationDraft;
  department: string;
  jobTitle: string;
  startDate: string;
  googleUserId: string;
  accessProfileId: string;
}

interface PersonnelCreateEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  editingRecord: PersonnelRecord | null;
  availableGoogleAccounts: GoogleAccount[];
  accessProfiles: AccessProfile[];
  isOwner: boolean;
  canManageTeam: boolean;
  saving: boolean;
  errorMessage: string;
  onSubmit: (values: PersonnelFormValues) => Promise<void>;
}

const ADMIN_PROFILE_KEYS = new Set(['owner', 'admin', 'website_admin']);

export function PersonnelCreateEditDialog({
  open,
  onOpenChange,
  mode,
  editingRecord,
  availableGoogleAccounts,
  accessProfiles,
  isOwner,
  canManageTeam,
  saving,
  errorMessage,
  onSubmit,
}: PersonnelCreateEditDialogProps) {
  const formId = useId();
  const departmentListId = useId();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [documentReference, setDocumentReference] = useState('');
  const [homeCity, setHomeCity] = useState('');
  const [homeLocation, setHomeLocation] = useState<LocationDraft>({ address: '', mapsUrl: '', latitude: '', longitude: '' });
  const [department, setDepartment] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [startDate, setStartDate] = useState(ecuadorTodayIso());
  const [googleUserId, setGoogleUserId] = useState('');
  const [accessProfileId, setAccessProfileId] = useState('');
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!open) return;
    setLocalError('');
    if (mode === 'edit' && editingRecord) {
      setFullName(editingRecord.full_name || '');
      setEmail(editingRecord.email || '');
      setPhone(editingRecord.phone || '');
      setDocumentReference(editingRecord.document_reference || '');
      setHomeCity(editingRecord.home_city || '');
      setHomeLocation({
        address: editingRecord.home_address || '',
        mapsUrl: editingRecord.home_maps_url || '',
        latitude: editingRecord.home_latitude == null ? '' : String(editingRecord.home_latitude),
        longitude: editingRecord.home_longitude == null ? '' : String(editingRecord.home_longitude),
      });
      setDepartment(editingRecord.department || '');
      setJobTitle(editingRecord.job_title || '');
      setStartDate(editingRecord.start_date || '');
      setGoogleUserId('');
      setAccessProfileId('');
    } else {
      setFullName('');
      setEmail('');
      setPhone('');
      setDocumentReference('');
      setHomeCity('');
      setHomeLocation({ address: '', mapsUrl: '', latitude: '', longitude: '' });
      setDepartment('');
      setJobTitle('');
      setStartDate(ecuadorTodayIso());
      setGoogleUserId('');
      setAccessProfileId('');
    }
  }, [open, mode, editingRecord]);

  const assignableProfiles = useMemo(
    () =>
      accessProfiles.filter((profile) =>
        isOwner ? profile.profile_key !== 'owner' : !ADMIN_PROFILE_KEYS.has(profile.profile_key),
      ),
    [accessProfiles, isOwner],
  );

  const googleAccountOptions: SelectDropdownOption[] = useMemo(
    () => [
      {
        value: '',
        label: 'No vincular todavía',
        description: 'La ficha laboral funciona de forma independiente hasta enlazar un usuario.',
      },
      ...availableGoogleAccounts.map((account) => ({
        value: account.user_id,
        label: account.full_name || account.email,
        description: account.email,
        badge: account.access_profiles[0] || 'Sin perfil',
      })),
    ],
    [availableGoogleAccounts],
  );

  const accessProfileOptions: SelectDropdownOption[] = useMemo(
    () => [
      {
        value: '',
        label: 'No asignar perfil todavía',
        description: 'Se puede otorgar después desde esta ficha o en Equipo y permisos.',
      },
      ...assignableProfiles.map((profile) => ({
        value: profile.id,
        label: profile.name,
        description: profile.profile_key,
      })),
    ],
    [assignableProfiles],
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLocalError('');
    if (fullName.trim().length < 2) {
      setLocalError('Ingresa el nombre completo del colaborador (mínimo 2 caracteres).');
      return;
    }
    if (mode === 'create' && !startDate) {
      setLocalError('Registra la fecha de ingreso del primer período laboral.');
      return;
    }
    if (homeLocation.mapsUrl.trim() && !normalizeGoogleMapsUrl(homeLocation.mapsUrl)) {
      setLocalError('Usa un enlace válido de Google Maps para guardar el pin.');
      return;
    }
    const latitude = homeLocation.latitude.trim() ? Number(homeLocation.latitude) : null;
    const longitude = homeLocation.longitude.trim() ? Number(homeLocation.longitude) : null;
    if ((latitude == null) !== (longitude == null)) {
      setLocalError('Ingresa latitud y longitud juntas para guardar el pin.');
      return;
    }
    if (latitude != null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) {
      setLocalError('La latitud debe estar entre −90 y 90.');
      return;
    }
    if (longitude != null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) {
      setLocalError('La longitud debe estar entre −180 y 180.');
      return;
    }
    await onSubmit({
      fullName: fullName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      documentReference: documentReference.trim(),
      homeCity: homeCity.trim(),
      homeLocation: {
        address: homeLocation.address.trim(),
        mapsUrl: normalizeGoogleMapsUrl(homeLocation.mapsUrl),
        latitude: latitude == null ? '' : String(latitude),
        longitude: longitude == null ? '' : String(longitude),
      },
      department: department.trim(),
      jobTitle: jobTitle.trim(),
      startDate,
      googleUserId,
      accessProfileId,
    });
  };

  const combinedError = localError || errorMessage;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      tone="brand"
      icon={mode === 'create' ? <UserPlus size={18} /> : <Users size={18} />}
      eyebrow={mode === 'create' ? 'ALTA DE COLABORADOR' : 'EDICIÓN DE FICHA LABORAL'}
      title={mode === 'create' ? 'Nueva ficha de personal' : `Editar ficha · ${editingRecord?.full_name || ''}`}
      description="Registra identidad, domicilio y área laboral. Las salidas y reingresos se controlan desde el historial de períodos."
      busy={saving}
      footer={
        <>
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} variant="default" disabled={saving}>
            <CheckCircle2 size={15} />
            {saving ? 'Guardando…' : mode === 'create' ? 'Crear ficha laboral' : 'Guardar cambios'}
          </Button>
        </>
      }
      footerHint="Los cambios de identidad y domicilio quedan auditados sin copiar los valores sensibles al historial."
    >
      <form id={formId} className="personnel-dialog-form" onSubmit={handleSubmit}>
        <DialogSection
          title="1. Identidad y área operativa"
          description="El departamento/área determina qué métricas operativas se muestran sin penalizar a taller o diseño con metas POS."
        >
          <div className="personnel-form-grid">
            <label className="personnel-span-2">
              <span>Nombre completo *</span>
              <input
                type="text"
                required
                minLength={2}
                maxLength={160}
                placeholder="Ej. María Fernanda Salazar"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                data-autofocus
              />
            </label>

            <label>
              <span>Cédula / documento de identidad</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                maxLength={40}
                placeholder="Número de cédula"
                value={documentReference}
                onChange={(event) => setDocumentReference(event.target.value)}
              />
            </label>

            <label>
              <span>Área o departamento</span>
              <input
                type="text"
                list={departmentListId}
                maxLength={100}
                placeholder="Ej. Impresión Gran Formato"
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
              />
              <datalist id={departmentListId}>
                {DEPARTMENT_PRESETS.map((preset) => (
                  <option key={preset} value={preset} />
                ))}
              </datalist>
            </label>

            <label>
              <span>Cargo / función principal</span>
              <input
                type="text"
                maxLength={120}
                placeholder="Ej. Operador Plotter / Instalador"
                value={jobTitle}
                onChange={(event) => setJobTitle(event.target.value)}
              />
            </label>
          </div>
        </DialogSection>

        <DialogSection title="2. Contacto y domicilio">
          <div className="personnel-form-grid">
            <label>
              <span>Correo electrónico</span>
              <input
                type="email"
                maxLength={254}
                placeholder="nombre@visualcorp.ec"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>

            <label>
              <span>Teléfono / WhatsApp</span>
              <input
                type="tel"
                maxLength={40}
                placeholder="099 123 4567"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </label>

            <label>
              <span>Ciudad o sector</span>
              <input maxLength={120} placeholder="Ciudad, barrio o sector" value={homeCity} onChange={(event) => setHomeCity(event.target.value)} />
            </label>
            <div className="personnel-span-2">
              <GoogleMapsLocationFields
                idPrefix="personnel-home"
                addressLabel="Domicilio del colaborador"
                mapSearchContext={homeCity}
                location={homeLocation}
                onChange={setHomeLocation}
              />
            </div>
          </div>
        </DialogSection>

        {mode === 'create' && (
          <DialogSection title="3. Primer período laboral" description="El ingreso inicial queda guardado como el primer período de esta ficha.">
            <div className="personnel-form-grid">
              <label>
                <span>Fecha de ingreso *</span>
                <input type="date" required value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </label>
            </div>
          </DialogSection>
        )}

        {mode === 'create' && (
          <DialogSection
            title="4. Acceso opcional a Visual Corp Suite"
            description="Si el colaborador usa el sistema, puedes vincular su cuenta Google o invitarle con un perfil operativo."
          >
            {canManageTeam ? (
              <div className="personnel-form-grid">
                <label className="personnel-span-2">
                  <span>
                    <Link2 size={13} aria-hidden="true" /> Vincular cuenta Google existente (opcional)
                  </span>
                  <SelectDropdown
                    ariaLabel="Cuenta Google a vincular"
                    value={googleUserId}
                    options={googleAccountOptions}
                    onChange={setGoogleUserId}
                    searchable={availableGoogleAccounts.length > 4}
                    size="form"
                    fullWidth
                  />
                </label>

                <label className="personnel-span-2">
                  <span>
                    <Shield size={13} aria-hidden="true" /> Asignar perfil de acceso (opcional)
                  </span>
                  <SelectDropdown
                    ariaLabel="Perfil de acceso de Visual Corp Suite"
                    value={accessProfileId}
                    options={accessProfileOptions}
                    onChange={setAccessProfileId}
                    searchable={assignableProfiles.length > 5}
                    size="form"
                    fullWidth
                  />
                  {!isOwner && (
                    <small className="personnel-field-help">
                      Solo el propietario puede asignar perfiles administrativos (`admin` o `website_admin`).
                    </small>
                  )}
                </label>
              </div>
            ) : (
              <DialogCallout tone="info">
                Necesitas el permiso <b>Equipo · Gestionar miembros</b> para vincular cuentas Google desde este diálogo.
              </DialogCallout>
            )}
          </DialogSection>
        )}

        {combinedError && (
          <div className="personnel-alert is-error" role="alert">
            <AlertCircle size={15} aria-hidden="true" />
            <span>{combinedError}</span>
          </div>
        )}
      </form>
    </Dialog>
  );
}
