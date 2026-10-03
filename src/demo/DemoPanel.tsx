import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Check, ChevronRight, FlaskConical, House, RotateCcw, ShieldCheck, UserRound, X } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '../lib/context';
import { dateLabel } from '../lib/format';
import { DEMO_TODAY } from '../mocks/clock';
import { setConfig } from '../mocks/config';
import { resetProgress } from '../mocks/events';
import { demoApi } from '../mocks/services/demo';
import { Avatar } from '../components/common';
import { Button } from '../components/ui/button';
import { Confirm } from '../components/ui/dialog';
import { Switch } from '../components/ui/switch';
import { CHECKLIST, type ChecklistItem } from './checklist';
import { useDemoConfig, useDemoProgress } from './hooks';

const RATES = [0.1, 0.25, 0.5];

/** Botón flotante con el panel de la demo: usuario actual, cambio rápido, errores simulados, reinicio y recorrido sugerido. */
export function DemoPanel() {
  const { me, openExpense, openQuickText } = useApp();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<'reset' | 'empty'>();
  const config = useDemoConfig();
  const progress = useDemoProgress();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const users = useQuery({ queryKey: ['demo-users'], queryFn: demoApi.users });

  const switchUser = useMutation({
    mutationFn: async (id: number) => { const user = await demoApi.loginAs(id); setOpen(false); navigate('/'); await qc.resetQueries(); return user; },
    onSuccess: user => toast.success(`Ahora estás como ${user.name} (${user.role === 'admin' ? 'administrador' : 'miembro'})`),
    onError: e => toast.error(e.message),
  });
  const reset = useMutation({
    mutationFn: async () => { await demoApi.reset(); await qc.resetQueries(); },
    onSuccess: () => { setConfirm(undefined); toast.success('Listo: volvieron los datos de ejemplo.'); },
    onError: e => toast.error(e.message),
  });
  const empty = useMutation({
    mutationFn: async () => { await demoApi.emptyHousehold(); setConfirm(undefined); qc.clear(); navigate('/setup'); },
    onError: e => toast.error(e.message),
  });

  function go(item: ChecklistItem) {
    setOpen(false);
    if (item.to) navigate(item.to);
    if (item.open === 'expense') openExpense();
    if (item.open === 'quick') openQuickText();
  }
  const done = CHECKLIST.filter(i => progress.includes(i.key)).length;
  const others = users.data?.filter(u => u.id !== me.id) ?? [];

  return <>
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="demo-fab" aria-label="Abrir el panel de la demo"><FlaskConical size={15}/><span>Demo</span><Avatar user={me} small/></Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="demo-panel" side="top" align="end" sideOffset={10} collisionPadding={12}>
          <div className="demo-panel-header">
            <div><strong>Panel de la demo</strong><small><CalendarDays size={12}/>Hoy en la demo: {dateLabel(DEMO_TODAY, "d 'de' MMMM 'de' yyyy")}</small></div>
            <Popover.Close asChild><Button variant="ghost" size="icon" aria-label="Cerrar panel"><X size={17}/></Button></Popover.Close>
          </div>
          <div className="demo-panel-body">
            <section>
              <h3>Estás como</h3>
              <div className="demo-current"><Avatar user={me}/><div><strong>{me.name}</strong><span className={`demo-role ${me.role}`}>{me.role === 'admin' ? <><ShieldCheck size={11}/>Administrador</> : <><UserRound size={11}/>Miembro</>}</span></div></div>
              {others.length > 0 && <div className="demo-switch" role="group" aria-label="Cambiar de usuario">{others.map(u => <button key={u.id} type="button" aria-label={`Entrar como ${u.name} (${u.role === 'admin' ? 'administrador' : 'miembro'})`} onClick={() => switchUser.mutate(u.id)} disabled={switchUser.isPending}><Avatar user={u} small/><span><strong>{u.name}</strong><small>{u.role === 'admin' ? 'Admin' : 'Miembro'}</small></span></button>)}</div>}
            </section>
            <section>
              <div className="demo-row"><div><h3>Errores simulados</h3><p>Algunas llamadas fallan a propósito para ver cómo responde la app.</p></div><Switch label="Activar errores simulados" checked={config.errors} onCheckedChange={errors => { setConfig({ errors }); toast(errors ? 'Errores simulados activados' : 'Errores simulados desactivados'); }}/></div>
              {config.errors && <div className="demo-segmented" role="radiogroup" aria-label="Probabilidad de error">{RATES.map(r => <button key={r} type="button" role="radio" aria-checked={config.errorRate === r} className={config.errorRate === r ? 'active' : ''} onClick={() => setConfig({ errorRate: r })}>{r * 100}% de las llamadas</button>)}</div>}
            </section>
            <section>
              <div className="demo-row"><h3>Para probar <span className="demo-count">{done}/{CHECKLIST.length}</span></h3>{done > 0 && <button type="button" className="demo-link" onClick={resetProgress}>Reiniciar lista</button>}</div>
              <div className="demo-progress" aria-hidden><i style={{ width: `${(done / CHECKLIST.length) * 100}%` }}/></div>
              <ul className="demo-checklist">{CHECKLIST.map(item => { const ok = progress.includes(item.key); return <li key={item.key}>
                <button type="button" className={ok ? 'done' : ''} onClick={() => go(item)}><span className="demo-check">{ok && <Check size={12} strokeWidth={3}/>}</span><span><strong>{item.title}</strong><small>{item.hint}</small></span>{(item.to || item.open) && <ChevronRight size={15}/>}</button>
              </li>; })}</ul>
            </section>
          </div>
          <div className="demo-panel-footer">
            <Button variant="outline" size="sm" onClick={() => { setOpen(false); setConfirm('reset'); }}><RotateCcw size={14}/>Reiniciar demo</Button>
            <Button variant="ghost" size="sm" onClick={() => { setOpen(false); setConfirm('empty'); }}><House size={14}/>Empezar con un hogar vacío</Button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
    <Confirm open={confirm === 'reset'} title="¿Reiniciar la demo?" description="Se borran los cambios que hiciste y vuelven los datos de ejemplo. La lista de cosas para probar se conserva." label="Reiniciar" busy={reset.isPending} onCancel={() => setConfirm(undefined)} onConfirm={() => reset.mutate()}/>
    <Confirm open={confirm === 'empty'} title="¿Empezar con un hogar vacío?" description="Se borran todos los datos de la demo y vas al asistente de primer arranque, como si instalaras la app por primera vez. Puedes volver a los datos de ejemplo con “Reiniciar demo”." label="Empezar de cero" busy={empty.isPending} onCancel={() => setConfirm(undefined)} onConfirm={() => empty.mutate()}/>
  </>;
}
