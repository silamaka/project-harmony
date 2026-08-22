import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Texte tronqué dans un tableau ; le survol affiche le contenu complet dans une bulle. */
export function ExpandableText({ text, className }: { text: string; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "line-clamp-2 block max-h-[2lh] cursor-help break-words text-left",
            className,
          )}
        >
          {text}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        align="start"
        className="max-w-xs whitespace-pre-wrap break-words bg-popover text-left text-xs text-popover-foreground shadow-lg"
      >
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
