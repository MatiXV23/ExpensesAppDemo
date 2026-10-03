import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { receiptsApi } from '../api/receipts';

const SAMPLES = [
  { file: 'ticket-disco.svg', title: 'Ticket del súper', text: '9 artículos · débito' },
  { file: 'factura-ute.svg', title: 'Factura de luz', text: 'Período y vencimiento' },
  { file: 'captura-tarjeta.svg', title: 'Captura de la tarjeta', text: '4 compras, una en USD' },
];
const url = (file: string) => `${import.meta.env.BASE_URL}samples/${file}`;

/** Comprobantes de ejemplo para probar la lectura con IA sin tener un ticket a mano. */
export function SampleReceipts() {
  const qc = useQueryClient();
  const upload = useMutation({
    mutationFn: async (file: string) => {
      const blob = await (await fetch(url(file))).blob();
      return receiptsApi.upload([new File([blob], `ejemplo-${file}`, { type: 'image/svg+xml' })]);
    },
    onSuccess: () => { void qc.invalidateQueries(); toast.success('Comprobante de ejemplo en proceso'); },
    onError: e => toast.error(e.message),
  });
  return <section className="sample-receipts" aria-labelledby="sample-title">
    <div className="sample-heading"><Sparkles size={15}/><h2 id="sample-title">¿No tienes un ticket a mano? Prueba con uno de ejemplo</h2></div>
    <div className="sample-grid">{SAMPLES.map(s => <button key={s.file} type="button" className="sample-card" disabled={upload.isPending} onClick={() => upload.mutate(s.file)}>
      <img src={url(s.file)} alt="" loading="lazy"/>
      <span><strong>{s.title}</strong><small>{upload.isPending && upload.variables === s.file ? <><Loader2 size={12} className="animate-spin"/>Subiendo…</> : s.text}</small></span>
    </button>)}</div>
    <p className="inline-note"><Sparkles size={14}/>En la demo la lectura es simulada: los ejemplos tienen sus datos preparados y, si subes tus propios archivos, se propone un gasto de ejemplo para revisar.</p>
  </section>;
}
