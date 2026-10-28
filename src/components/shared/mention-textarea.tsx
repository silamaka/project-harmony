import { useMemo, useRef, useState, type ComponentProps } from "react";
import { UserAvatar } from "@/components/shared/avatar";
import { Textarea } from "@/components/ui/textarea";
import { fullName } from "@/lib/mentions";
import { cn } from "@/lib/utils";
import { ROLE_LABELS, type User } from "@/types";

/** Comparaison sans accents ni majuscules : "@fat" trouve "Fatou", "@eli" trouve "Élise". */
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Texte d'un commentaire, avec les "@Prénom Nom" des personnes mentionnées en couleur. */
export function MentionText({ body, mentioned }: { body: string; mentioned: User[] }) {
  const names = mentioned
    .map((u) => `@${fullName(u)}`)
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (names.length === 0) return <>{body}</>;
  const parts = body.split(new RegExp(`(${names.join("|")})`, "g"));
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="rounded bg-primary/10 px-0.5 font-medium text-primary">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

/**
 * Zone de saisie avec suggestions de mention : taper "@" propose les
 * personnes qui peuvent lire le message (`candidates`) ; le choix insère
 * "@Prénom Nom". Le serveur revérifie les droits de chaque mention.
 */
export function MentionTextarea({
  value,
  onChange,
  candidates,
  className,
  ...props
}: Omit<ComponentProps<typeof Textarea>, "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
  candidates: User[];
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // Mot en cours après "@" (null : pas de suggestion ouverte).
  const [query, setQuery] = useState<{ text: string; start: number } | null>(null);
  const [active, setActive] = useState(0);

  const matches = useMemo(() => {
    if (!query) return [];
    const q = fold(query.text);
    return candidates
      .filter((u) => fold(fullName(u)).startsWith(q) || fold(fullName(u)).includes(` ${q}`))
      .slice(0, 6);
  }, [query, candidates]);

  const detect = (text: string, caret: number) => {
    // "@" en début de texte ou après un espace, suivi d'un mot en cours.
    const before = text.slice(0, caret);
    const m = /(^|\s)@([\p{L}\p{N}.'-]*)$/u.exec(before);
    if (m) {
      setQuery({ text: m[2] ?? "", start: caret - (m[2]?.length ?? 0) - 1 });
      setActive(0);
    } else {
      setQuery(null);
    }
  };

  const pick = (u: User) => {
    if (!query) return;
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const insert = `@${fullName(u)} `;
    const next = value.slice(0, query.start) + insert + value.slice(caret);
    onChange(next);
    setQuery(null);
    const pos = query.start + insert.length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className="relative min-w-0 flex-1">
      <Textarea
        {...props}
        ref={ref}
        value={value}
        className={className}
        onChange={(e) => {
          onChange(e.target.value);
          detect(e.target.value, e.target.selectionStart ?? e.target.value.length);
        }}
        onKeyDown={(e) => {
          if (query && matches.length > 0) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => (i + 1) % matches.length);
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => (i - 1 + matches.length) % matches.length);
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              pick(matches[active]!);
              return;
            }
          }
          if (e.key === "Escape") setQuery(null);
          props.onKeyDown?.(e);
        }}
        onBlur={(e) => {
          // Laisse le temps au clic sur une suggestion.
          window.setTimeout(() => setQuery(null), 150);
          props.onBlur?.(e);
        }}
      />
      {query && matches.length > 0 && (
        <ul
          role="listbox"
          className="absolute bottom-full left-0 z-20 mb-1 w-72 max-w-full overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-lg"
        >
          {matches.map((u, i) => (
            <li key={u.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(u)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                  i === active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                )}
              >
                <UserAvatar user={u} className="h-6 w-6 text-[10px]" />
                <span className="min-w-0 flex-1 truncate">{fullName(u)}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {ROLE_LABELS[u.role]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
