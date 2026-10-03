import { useEffect, useState } from 'react';
import { Archive, Bot, CalendarClock, Landmark, Sparkles, UserRoundCheck, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { onNotice, type IntegrationKind, type SimulationNotice } from '../mocks/events';
import { Modal } from '../components/ui/dialog';
import { Button } from '../components/ui/button';

const ICONS: Record<IntegrationKind, LucideIcon> = { ai: Bot, exchange: Landmark, backup: Archive, scheduler: CalendarClock, account: UserRoundCheck };
const LABELS: Record<IntegrationKind, string> = { ai: 'IA · Claude', exchange: 'Cotización del dólar', backup: 'Backups', scheduler: 'Tareas del servidor', account: 'Cuentas' };

/** Muestra lo que haría cada integración externa en la app real (IA, cotización, backups, tareas programadas). */
export function SimulationHost() {
  const [queue, setQueue] = useState<SimulationNotice[]>([]);
  useEffect(() => onNotice(notice => {
    if (notice.level === 'toast') toast.info(notice.title, { description: notice.description });
    else setQueue(q => [...q, notice]);
  }), []);
  const current = queue[0];
  const close = () => setQueue(q => q.slice(1));
  const Icon = current ? ICONS[current.kind] : Sparkles;
  return <Modal open={!!current} onClose={close} title={current?.title ?? ''} description={current ? `Simulación · ${LABELS[current.kind]}` : undefined}>
    {current && <div className="simulation">
      <div className="simulation-badge"><Icon size={18}/><span>Simulado en la demo</span></div>
      <p className="simulation-text">{current.description}</p>
      {current.details && <dl className="simulation-details">{current.details.map(d => <div key={d.label}><dt>{d.label}</dt><dd>{d.value}</dd></div>)}</dl>}
      {current.real && <div className="simulation-real"><strong><Sparkles size={14}/>En la app real</strong><p>{current.real}</p></div>}
      <div className="simulation-actions">{current.action && <Button variant="outline" onClick={() => { current.action!.run(); close(); }}>{current.action.label}</Button>}<Button onClick={close}>Entendido</Button></div>
    </div>}
  </Modal>;
}
