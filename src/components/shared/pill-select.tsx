import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Select natif stylé en pastille colorée, utilisé pour éditer priorité/statut en ligne dans les tableaux. */
export function PillSelect<T extends string>({
  value,
  options,
  tone,
  onChange,
}: {
  value: T;
  options: Record<T, string>;
  tone: Record<T, string>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="relative block max-w-full">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        title={options[value]}
        className={cn(
          "h-7 w-full max-w-full cursor-pointer appearance-none truncate rounded-full border-none py-0 pl-2.5 pr-6 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring",
          tone[value],
        )}
      >
        {Object.entries(options).map(([v, label]) => (
          <option key={v} value={v} className="bg-popover text-popover-foreground">
            {label as string}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 opacity-60" />
    </div>
  );
}
