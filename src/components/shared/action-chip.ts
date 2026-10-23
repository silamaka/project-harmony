/**
 * Actions d'un livrable : icônes seules sur ordinateur (nom au survol), petits
 * boutons nommés sur téléphone, où le survol n'existe pas. `actionLabel` se
 * met sur le texte, masqué à partir de la largeur tablette.
 */
export const actionChip =
  "inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors disabled:opacity-50 sm:border-0 sm:p-0";

export const actionLabel = "truncate sm:hidden";

/** Conteneur : deux colonnes sur téléphone, une ligne d'icônes au-delà. */
export const actionBar = "grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center sm:gap-3";
