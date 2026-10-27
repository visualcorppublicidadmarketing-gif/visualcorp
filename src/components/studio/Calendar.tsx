import { useState } from 'react';
import { Calendar } from '../ui/Calendar';

type ModernCalendarProps = {
  value?: string;
  onChange?: (date: string) => void;
  compact?: boolean;
};

/** Small wrapper retained for the editor tab; all calendar behavior is shared. */
export function ModernCalendar({ value = '', onChange, compact = false }: ModernCalendarProps) {
  const [range, setRange] = useState<{ from?: string; to?: string }>({});
  const [selected, setSelected] = useState(value);
  return <div className={compact ? 'studio-calendar compact' : 'studio-calendar'}>
    <Calendar
      mode="range"
      value={range}
      onChange={(next) => {
        setRange(next);
        const nextSelected = next.to || next.from || '';
        setSelected(nextSelected);
        if (nextSelected) onChange?.(nextSelected);
      }}
      label="Rango de fechas"
    />
    {selected && <p className="studio-calendar-selection">Rango seleccionado: {range.from || selected}{range.to ? ` – ${range.to}` : ''}</p>}
  </div>;
}
