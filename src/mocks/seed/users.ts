import type { User } from '../../api/types';

const createdAt = '2026-06-28T13:00:00.000Z';

/** Integrantes del hogar de ejemplo. Contraseña de todos: demo1234. */
export const SEED_USERS: User[] = [
  { id: 1, name: 'Matías', email: 'matias@demo.test', role: 'admin', color: '#5b7ea6', active: true, createdAt },
  { id: 2, name: 'Sofía', email: 'sofia@demo.test', role: 'member', color: '#bc8c75', active: true, createdAt },
  { id: 3, name: 'Lucas', email: 'lucas@demo.test', role: 'member', color: '#8992b8', active: true, createdAt },
];
export const DEMO_PASSWORD = 'demo1234';

/** Lo que muestra cada tarjeta de "Entrar como…" en el login. */
export const USER_PITCH: Record<number, string> = {
  1: 'Administra el hogar: integrantes, cotización del dólar y backups. Puede editar cualquier gasto.',
  2: 'Carga gastos y comprobantes. Solo edita lo que cargó o pagó. Tiene comprobantes esperando revisión.',
  3: 'El roommate: le debe plata a la casa. Ideal para registrar un pago y ver cómo se equilibran los saldos.',
};
export const ROLE_PITCH = {
  admin: 'Administra el hogar y puede editar cualquier gasto.',
  member: 'Carga gastos y edita solo lo que cargó o pagó.',
} as const;
