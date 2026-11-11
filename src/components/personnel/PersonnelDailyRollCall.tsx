import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock,
  Download,
  Info,
  Laptop,
  MapPin,
  OctagonAlert,
  Search,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Avatar } from '../ui/Avatar';
import { DatePicker } from '../ui/Calendar';
import { EmptyState } from '../feedback';
import { AttendanceStatusBadge } from './personnelBadges';
import {
  ATTENDANCE_META,
  buildCsvDocument,
  computeLateMinutes,
  ecuadorNowTime,
  formatEcuadorDate,
  resolveDayScheduleForMember,
} from './personnelDomain';
import type {
  AttendanceEntry,
  AttendanceStatus,
  GoogleAccount,
  PersonnelRecord,
  TeamAreaRotation,
  TeamWorkException,
  TeamWorkHour,
} from './personnelTypes';

interface PersonnelDailyRollCallProps {
  dateIso: string;
  onChangeDate: (dateIso: string) => void;
  personnel: PersonnelRecord[];
  googleAccountByPersonnelId: Map<string, GoogleAccount>;
  attendanceEntries: AttendanceEntry[];
  workHours: TeamWorkHour[];
  workExceptions: TeamWorkException[];
  areaRotations: TeamAreaRotation[];
  canViewSchedule: boolean;
  canEdit: boolean;
  onQuickMark: (params: {
    personnelId: string;
    date: string;
    status: AttendanceStatus;
    checkIn?: string;
    lateMinutes?: number;
    note?: string;
  }) => void;
  onOpenPersonnel: (personnelId: string, tab?: 'ficha' | 'salarios' | 'asistencia' | 'metricas') => void;
}

export function PersonnelDailyRollCall({
  dateIso,
  onChangeDate,
  personnel,
  googleAccountByPersonnelId,
  attendanceEntries,
  workHours,
  workExceptions,
  areaRotations,
  canViewSchedule,
  canEdit,
  onQuickMark,
  onOpenPersonnel,
}: PersonnelDailyRollCallProps) {
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');

  const activePersonnel = useMemo(
    () => personnel.filter((item) => item.status === 'active'),
    [personnel],
  );

  const departments = useMemo(
    () => [...new Set(activePersonnel.map((item) => item.department).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [activePersonnel],
  );

  const dayEntryByPersonnelId = useMemo(() => {
    const map = new Map<string, AttendanceEntry>();
    for (const entry of attendanceEntries) {
      if (entry.date !== dateIso) continue;
      if (!map.has(entry.personnelId)) {
        map.set(entry.personnelId, entry);
      }
    }
    return map;
  }, [attendanceEntries, dateIso]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return activePersonnel
      .filter((person) => {
        if (departmentFilter !== 'all' && person.department !== departmentFilter) return false;
        if (!term) return true;
        return [person.full_name, person.department, person.job_title].some((field) =>
          field.toLowerCase().includes(term),
        );
      })
      .map((person) => {
        const account = googleAccountByPersonnelId.get(person.id);
        const schedule = resolveDayScheduleForMember(
          dateIso,
          account?.user_id,
          workHours,
          workExceptions,
          areaRotations,
        );
        const todayEntry = dayEntryByPersonnelId.get(person.id);
        return { person, account, schedule, todayEntry };
      });
  }, [
    activePersonnel,
    departmentFilter,
    search,
    googleAccountByPersonnelId,
    dateIso,
    workHours,
    workExceptions,
    areaRotations,
    dayEntryByPersonnelId,
  ]);

  const summary = useMemo(() => {
    let checkedIn = 0;
    let inField = 0;
    let late = 0;
    let issues = 0;
    let unmarked = 0;

    for (const row of rows) {
      const status = row.todayEntry?.status;
      if (!status) {
        if (!canViewSchedule || row.schedule.isWorkingDay) unmarked += 1;
      } else if (status === 'presente' || status === 'remoto') {
        checkedIn += 1;
      } else if (status === 'en_campo') {
        checkedIn += 1;
        inField += 1;
      } else if (status === 'tardanza') {
        checkedIn += 1;
        late += 1;
      } else {
        issues += 1;
      }
    }
    return { checkedIn, inField, late, issues, unmarked };
  }, [rows, canViewSchedule]);

  const handleExportCsv = () => {
    const csv = buildCsvDocument(
      ['Fecha', 'Colaborador', 'Área', 'Cargo', 'Horario programado', 'Estado asistencia', 'Entrada', 'Salida', 'Minutos atraso', 'Observación'],
      rows.map(({ person, schedule, todayEntry }) => [
        dateIso,
        person.full_name,
        person.department,
        person.job_title,
        canViewSchedule
          ? schedule.isWorkingDay
            ? `${schedule.opensAt || ''} - ${schedule.closesAt || ''}`
            : schedule.note
          : 'Sin permiso team_schedule',
        todayEntry ? ATTENDANCE_META[todayEntry.status].label : 'Sin marcación',
        todayEntry?.checkIn || '',
        todayEntry?.checkOut || '',
        todayEntry?.lateMinutes ?? 0,
        todayEntry?.note || '',
      ]),
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `visualcorp-pase-de-lista-${dateIso}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="personnel-rollcall-panel" aria-label="Pase de lista diario">
      <div className="personnel-rollcall-banner">
        <div className="personnel-banner-copy">
          <Info size={16} aria-hidden="true" />
          <div>
            <b>Asistencia en sesión local (pendiente de sincronización en Supabase)</b>
            <p>
              Las marcaciones de pase de lista se guardan en este navegador (<code className="personnel-inline-code">localStorage</code>) hasta crear la tabla compartida de asistencia. Exporta el respaldo CSV al cierre del turno.
            </p>
          </div>
        </div>
        <div className="personnel-banner-actions">
          {canViewSchedule && (
            <Link className="site-secondary-button" to="/operaciones/equipo/horarios">
              <CalendarClock size={14} /> Configurar turnos y rotaciones
            </Link>
          )}
          <button type="button" className="site-secondary-button" onClick={handleExportCsv}>
            <Download size={14} /> Exportar CSV del día
          </button>
        </div>
      </div>

      <div className="personnel-rollcall-toolbar">
        <div className="personnel-rollcall-filters">
          <div className="personnel-date-field">
            <span>Fecha operativa (Ecuador)</span>
            <DatePicker value={dateIso} onChange={onChangeDate} label="Fecha de pase de lista" />
          </div>

          <label className="personnel-search">
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              placeholder="Buscar colaborador o área…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <select
            aria-label="Filtrar por área en pase de lista"
            value={departmentFilter}
            onChange={(event) => setDepartmentFilter(event.target.value)}
          >
            <option value="all">Todas las áreas</option>
            {departments.map((dep) => (
              <option key={dep} value={dep}>
                {dep}
              </option>
            ))}
          </select>
        </div>

        <div className="personnel-rollcall-summary" aria-label="Resumen de cobertura del día">
          <span>
            <b>{summary.checkedIn}</b> en jornada
          </span>
          <span>
            <b>{summary.inField}</b> en campo
          </span>
          <span>
            <b>{summary.late}</b> con atraso
          </span>
          <span>
            <b>{summary.issues}</b> permisos/faltas
          </span>
          <span>
            <b>{summary.unmarked}</b> sin marcar
          </span>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No hay colaboradores activos con ese filtro"
          text="Ajusta la búsqueda o activa una ficha en el directorio para pasar lista."
        />
      ) : (
        <div className="table-wrap">
          <table className="personnel-rollcall-table">
            <thead>
              <tr>
                <th scope="col">Colaborador y área</th>
                <th scope="col">Horario y rotación ({formatEcuadorDate(dateIso, 'short')})</th>
                <th scope="col">Estado del día</th>
                <th scope="col">Marcación rápida (1 clic)</th>
                <th scope="col" className="is-right">
                  Ficha
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ person, account, schedule, todayEntry }) => {
                const nowHm = ecuadorNowTime();
                const expectedStart = schedule.opensAt || '08:00';
                const inferredLate = computeLateMinutes(nowHm, expectedStart);

                return (
                  <tr key={person.id}>
                    <td data-label="Colaborador">
                      <div className="personnel-rollcall-person">
                        <Avatar name={person.full_name} src={account?.avatar_url} size="sm" />
                        <div>
                          <b>{person.full_name}</b>
                          <small>
                            {person.job_title || 'Cargo sin definir'} · {person.department || 'Sin área'}
                          </small>
                        </div>
                      </div>
                    </td>

                    <td data-label="Horario">
                      {!canViewSchedule ? (
                        <span className="personnel-muted-note">Requiere permiso de Horarios</span>
                      ) : schedule.isWorkingDay ? (
                        <div className="personnel-schedule-cell">
                          <strong>
                            <CalendarClock size={13} aria-hidden="true" /> {schedule.opensAt} – {schedule.closesAt}
                          </strong>
                          <small>{schedule.note}</small>
                          {schedule.rotations.map((rot, idx) => (
                            <span key={`${rot.areaName}-${idx}`} className="personnel-rotation-pill">
                              <Building2 size={11} aria-hidden="true" />
                              {rot.areaName}: {rot.taskName} ({rot.startsAt}–{rot.endsAt})
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="personnel-schedule-cell">
                          <AttendanceStatusBadge status="descanso" />
                          <small>{schedule.note}</small>
                        </div>
                      )}
                    </td>

                    <td data-label="Estado">
                      <div className="personnel-rollcall-status-cell">
                        {todayEntry ? (
                          <>
                            <AttendanceStatusBadge status={todayEntry.status} compact />
                            <small>
                              {todayEntry.checkIn ? `Ent. ${todayEntry.checkIn}` : 'Sin hora'}
                              {todayEntry.checkOut ? ` · Sal. ${todayEntry.checkOut}` : ''}
                              {todayEntry.lateMinutes ? ` · ${todayEntry.lateMinutes} min atraso` : ''}
                            </small>
                          </>
                        ) : (
                          <AttendanceStatusBadge status={canViewSchedule && !schedule.isWorkingDay ? 'descanso' : 'sin_marcar'} />
                        )}
                      </div>
                    </td>

                    <td data-label="Marcación rápida">
                      {canEdit ? (
                        <div className="personnel-rollcall-actions">
                          <button
                            type="button"
                            className={`personnel-chip-btn ${todayEntry?.status === 'presente' ? 'is-selected' : ''}`}
                            onClick={() =>
                              onQuickMark({
                                personnelId: person.id,
                                date: dateIso,
                                status: 'presente',
                                checkIn: nowHm,
                                note: 'Confirmado en pase de lista diario',
                              })
                            }
                          >
                            <CheckCircle2 size={13} /> Presente
                          </button>
                          <button
                            type="button"
                            className={`personnel-chip-btn ${todayEntry?.status === 'en_campo' ? 'is-selected' : ''}`}
                            onClick={() =>
                              onQuickMark({
                                personnelId: person.id,
                                date: dateIso,
                                status: 'en_campo',
                                checkIn: nowHm,
                                note: 'Salida a instalación / visita en campo',
                              })
                            }
                          >
                            <MapPin size={13} /> En campo
                          </button>
                          <button
                            type="button"
                            className={`personnel-chip-btn ${todayEntry?.status === 'remoto' ? 'is-selected' : ''}`}
                            onClick={() =>
                              onQuickMark({
                                personnelId: person.id,
                                date: dateIso,
                                status: 'remoto',
                                checkIn: nowHm,
                                note: 'Jornada remota confirmada',
                              })
                            }
                          >
                            <Laptop size={13} /> Remoto
                          </button>
                          <button
                            type="button"
                            className={`personnel-chip-btn ${todayEntry?.status === 'tardanza' ? 'is-selected' : ''}`}
                            onClick={() =>
                              onQuickMark({
                                personnelId: person.id,
                                date: dateIso,
                                status: 'tardanza',
                                checkIn: nowHm,
                                lateMinutes: Math.max(5, inferredLate),
                                note: `Atraso frente a ingreso ${expectedStart}`,
                              })
                            }
                          >
                            <Clock size={13} /> Atraso
                          </button>
                          <button
                            type="button"
                            className={`personnel-chip-btn ${todayEntry?.status === 'permiso' ? 'is-selected' : ''}`}
                            onClick={() =>
                              onQuickMark({
                                personnelId: person.id,
                                date: dateIso,
                                status: 'permiso',
                                note: 'Permiso registrado en pase de lista',
                              })
                            }
                          >
                            <CalendarClock size={13} /> Permiso
                          </button>
                          <button
                            type="button"
                            className={`personnel-chip-btn is-danger ${todayEntry?.status === 'falta' ? 'is-selected' : ''}`}
                            onClick={() =>
                              onQuickMark({
                                personnelId: person.id,
                                date: dateIso,
                                status: 'falta',
                                note: 'Ausencia registrada en pase de lista',
                              })
                            }
                          >
                            <OctagonAlert size={13} /> Falta
                          </button>
                        </div>
                      ) : (
                        <span className="personnel-muted-note">Solo lectura (requiere permiso de edición)</span>
                      )}
                    </td>

                    <td data-label="Detalle" className="is-right">
                      <button
                        type="button"
                        className="site-secondary-button"
                        onClick={() => onOpenPersonnel(person.id, 'asistencia')}
                      >
                        Ver ficha <ArrowUpRight size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
