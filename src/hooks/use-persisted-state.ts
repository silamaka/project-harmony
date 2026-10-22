import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";

/**
 * État persisté en localStorage. La valeur initiale (identique client/serveur)
 * est toujours utilisée au premier rendu pour éviter un mismatch d'hydratation ;
 * la valeur stockée est appliquée juste après, côté client uniquement.
 * L'enregistrement se fait quand la valeur change (setter), jamais au
 * montage : un effet d'écriture au montage écrasait le choix enregistré par
 * la valeur initiale (perdu au rechargement en développement).
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
  }, [key]);

  const setPersisted: Dispatch<SetStateAction<T>> = useCallback(
    (next) => {
      setValue((previous) => {
        const resolved = typeof next === "function" ? (next as (prev: T) => T)(previous) : next;
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          /* stockage indisponible (mode privé, quota...) : on continue sans persister */
        }
        return resolved;
      });
    },
    [key],
  );

  return [value, setPersisted] as const;
}
