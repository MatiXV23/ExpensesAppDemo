import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Loader2, ShieldCheck, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { demoApi } from '../mocks/services/demo';
import { Avatar } from '../components/common';

/** Tarjetas de usuarios de prueba: "Entrar como…" inicia sesión en un clic. */
export function DemoLoginCards() {
  const users = useQuery({ queryKey: ['demo-users'], queryFn: demoApi.users });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const login = useMutation({ mutationFn: demoApi.loginAs, onSuccess: user => { qc.clear(); navigate('/'); toast.success(`Hola, ${user.name}. Estás en la demo como ${user.role === 'admin' ? 'administrador' : 'miembro'}.`); }, onError: e => toast.error(e.message) });
  return <section className="demo-users" aria-labelledby="demo-users-title">
    <div className="demo-users-heading"><h2 id="demo-users-title">Elige con quién entrar</h2></div>
    <p className="demo-users-intro">Un hogar de ejemplo en Montevideo, con cuatro meses de gastos. Todo lo que hagas queda en este navegador.</p>
    {users.isLoading ? <div className="demo-user-card is-loading"><Loader2 className="animate-spin" size={18}/>Preparando el hogar de ejemplo…</div> : users.data?.map(user => <article className="demo-user-card" key={user.id}>
      <Avatar user={user}/>
      <div className="demo-user-info">
        <div className="demo-user-name"><strong>{user.name}</strong><span className={`demo-role ${user.role}`}>{user.role === 'admin' ? <><ShieldCheck size={11}/>Administrador</> : <><UserRound size={11}/>Miembro</>}</span></div>
        <p>{user.pitch}</p>
        <button type="button" className="demo-enter" onClick={() => login.mutate(user.id)} disabled={login.isPending} aria-label={`Entrar como ${user.name}`}>{login.isPending && login.variables === user.id ? <Loader2 className="animate-spin" size={14}/> : null}Entrar como {user.name}<ArrowRight size={14}/></button>
      </div>
    </article>)}
  </section>;
}
