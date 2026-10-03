import type { Category, PaymentMethod, Settings } from '../../api/types';

/** Mismas categorías por defecto que crea el backend (server/src/services/settings.ts). */
export const DEFAULT_CATEGORIES: Omit<Category, 'id' | 'archived' | 'sortOrder'>[] = [
  { name: 'Supermercado', icon: 'ShoppingBasket', color: '#65896b' },
  { name: 'Alquiler y gastos comunes', icon: 'House', color: '#8d9cbd' },
  { name: 'Servicios (luz, gas, agua)', icon: 'Zap', color: '#d4ae66' },
  { name: 'Internet y telefonía', icon: 'Wifi', color: '#79a5ad' },
  { name: 'Transporte', icon: 'Bus', color: '#ad95ba' },
  { name: 'Salud', icon: 'HeartPulse', color: '#ca8d91' },
  { name: 'Educación', icon: 'GraduationCap', color: '#8ea8ba' },
  { name: 'Delivery y restaurantes', icon: 'Utensils', color: '#d49271' },
  { name: 'Hogar y mantenimiento', icon: 'Armchair', color: '#ab9a72' },
  { name: 'Mascotas', icon: 'PawPrint', color: '#b6a085' },
  { name: 'Suscripciones', icon: 'Play', color: '#9686ad' },
  { name: 'Ocio', icon: 'Ticket', color: '#90a58b' },
  { name: 'Otros', icon: 'Shapes', color: '#9da5a7' },
];
export const createCategories = (): Category[] => DEFAULT_CATEGORIES.map((c, i) => ({ ...c, id: i + 1, archived: false, sortOrder: i }));

/** Medios de pago por defecto de un hogar nuevo (asistente de primer arranque). */
export const DEFAULT_PAYMENT_METHODS: Omit<PaymentMethod, 'id'>[] = [
  { name: 'Efectivo', type: 'cash', ownerId: null, archived: false },
  { name: 'Tarjeta de débito', type: 'debit', ownerId: null, archived: false },
  { name: 'Tarjeta de crédito', type: 'credit', ownerId: null, archived: false },
  { name: 'Transferencia', type: 'transfer', ownerId: null, archived: false },
  { name: 'Billetera virtual', type: 'wallet', ownerId: null, archived: false },
];

/** Medios de pago del hogar de ejemplo, con su titular. */
export const SEED_PAYMENT_METHODS: PaymentMethod[] = [
  { id: 1, name: 'Efectivo', type: 'cash', ownerId: null, archived: false },
  { id: 2, name: 'Débito BROU', type: 'debit', ownerId: 1, archived: false },
  { id: 3, name: 'Visa Itaú', type: 'credit', ownerId: 1, archived: false },
  { id: 4, name: 'OCA', type: 'credit', ownerId: 2, archived: false },
  { id: 5, name: 'Débito Santander', type: 'debit', ownerId: 2, archived: false },
  { id: 6, name: 'Prex', type: 'wallet', ownerId: 3, archived: false },
  { id: 7, name: 'Mercado Pago', type: 'wallet', ownerId: null, archived: false },
  { id: 8, name: 'Transferencia', type: 'transfer', ownerId: null, archived: false },
];

export const SEED_SETTINGS: Settings = {
  householdName: 'Casa en Pocitos', baseCurrency: 'UYU', quotedCurrency: 'UYU', usdRate: 40.25, usdRateSource: 'auto',
  usdRateUpdatedAt: '2026-10-18T12:05:00.000Z', aiEnabled: true, aiModel: 'Claude (simulado)',
};
