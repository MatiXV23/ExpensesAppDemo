import { ApiError } from '../api/client';

// Errores con la misma forma que devuelve el backend (status + mensaje en español).
export const badRequest = (message: string, details?: unknown) => new ApiError(message, 400, details);
export const unauthorized = (message = 'Tu sesión finalizó. Vuelve a ingresar.') => new ApiError(message, 401);
export const forbidden = (message = 'No tienes permiso para hacer esto.') => new ApiError(message, 403);
export const notFound = (what: string) => new ApiError(`${what} no encontrado`, 404);
export const conflict = (message: string) => new ApiError(message, 409);
