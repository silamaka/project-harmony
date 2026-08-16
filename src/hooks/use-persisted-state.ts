import { useEffect, useState } from "react";

/**
 * État persisté en localStorage. La valeur initiale (identique client/serveur)
 * est toujours utilisée au premier rendu pour éviter un mismatch d'hydratation ;
 * la valeur stockée est appliquée juste après, côté client uniquement.
 */
export function usePersistedState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) setValue(JSON.parse(raw) as T);
    } catch {
      /* stockage indisponible : on garde la valeur initiale */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* stockage indisponible (mode privé, quota...) : on continue sans persister */
    }
  }, [key, value]);

  return [value, setValue] as const;
}
