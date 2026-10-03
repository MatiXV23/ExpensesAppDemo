export const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

/** Mismos colores de avatar que asigna el backend (server/src/lib/colors.ts). */
const MEMBER_COLORS = ['#5b7ea6', '#bc8c75', '#8992b8', '#c58b93', '#b29c63', '#81a6ab', '#a38cbd', '#cd9572'];
export const pickMemberColor = (used: string[]) => MEMBER_COLORS.find(c => !used.includes(c)) ?? MEMBER_COLORS[used.length % MEMBER_COLORS.length];

export const isColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value);
