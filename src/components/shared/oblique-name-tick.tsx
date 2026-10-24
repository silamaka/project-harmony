/** Nom en oblique sous une barre (axe X recharts), même disposition que
 *  « Contenus du mois » : ancré sous sa barre, raccourci au-delà de
 *  `maxChars` (le nom complet s'affiche au survol). */
export function ObliqueNameTick({
  x = 0,
  y = 0,
  payload,
  angle = -35,
  maxChars = 16,
}: {
  x?: number;
  y?: number;
  payload?: { value: string };
  angle?: number;
  maxChars?: number;
}) {
  const name = String(payload?.value ?? "");
  const short = name.length > maxChars ? `${name.slice(0, maxChars - 1).trimEnd()}…` : name;
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        dy={10}
        textAnchor="end"
        transform={`rotate(${angle})`}
        fill="var(--color-foreground)"
        fontSize={11}
        fontWeight={500}
      >
        <title>{name}</title>
        {short}
      </text>
    </g>
  );
}
