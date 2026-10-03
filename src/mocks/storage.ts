/** localStorage tolerante a fallos (ventanas privadas, almacenamiento bloqueado, tests en Node). */
const memory = new Map<string, string>();
function backend(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}
export const storage = {
  get(key: string): string | null {
    try { return backend()?.getItem(key) ?? memory.get(key) ?? null; } catch { return memory.get(key) ?? null; }
  },
  /** Devuelve false si no hay espacio. */
  set(key: string, value: string): boolean {
    const b = backend();
    if (!b) { memory.set(key, value); return true; }
    try { b.setItem(key, value); return true; } catch (error) {
      // Sin espacio (QuotaExceededError) o almacenamiento bloqueado: si está bloqueado, se sigue en memoria.
      if (error instanceof DOMException && /quota/i.test(error.name)) return false;
      memory.set(key, value); return true;
    }
  },
  remove(key: string) { memory.delete(key); try { backend()?.removeItem(key); } catch { /* sin acceso */ } },
};
