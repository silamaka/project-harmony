import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Adresse web complète (http/https) : même règle que le serveur pour le
 * lien d'un livrable, vérifiée dès la saisie. */
export function isWebUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return (url.protocol === "http:" || url.protocol === "https:") && !!url.hostname;
  } catch {
    return false;
  }
}

/** Paramètre d'adresse lu en texte : un identifiant "7" arrive en nombre. */
export function searchText(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return undefined;
}

export const WEB_URL_HINT = "Colle l'adresse complète du lien, commençant par https://";
