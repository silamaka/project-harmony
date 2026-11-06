/** Montant en francs CFA, sans décimales ("250 000 FCFA"). */
export const formatMoney = (amount: number | null | undefined) =>
  amount === null || amount === undefined
    ? "—"
    : `${Math.round(amount).toLocaleString("fr-FR")} FCFA`;

/** Nombre entier avec séparateur de milliers, ou tiret s'il manque. */
export const formatCount = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : value.toLocaleString("fr-FR");
