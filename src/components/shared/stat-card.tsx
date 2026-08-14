import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Carte KPI réutilisable du dashboard. Cliquable si `onClick` est fourni. */
export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  tone = "default",
  delay = 0,
  onClick,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  hint?: string;
  tone?: "default" | "danger" | "warning" | "info" | "success";
  delay?: number;
  onClick?: () => void;
}) {
  const interactive = typeof onClick === "function";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
    >
      {(() => {
        const Tag = (interactive ? "button" : "div") as "button";
        return (
          <Tag
            {...(interactive ? { type: "button", onClick } : {})}
            className={cn(
              "surface-card w-full p-5 text-left transition",
              interactive &&
                "cursor-pointer hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {label}
                </p>
                <p className="mt-2 text-3xl font-extrabold tracking-tight">{value}</p>
                {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
                {interactive && (
                  <p className="mt-1 text-xs font-medium text-primary">Voir le détail</p>
                )}
              </div>
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-lg",
                  tone === "danger"
                    ? "bg-destructive/10 text-destructive"
                    : tone === "warning"
                      ? "bg-warning/15 text-warning"
                      : tone === "info"
                        ? "bg-info/15 text-info"
                        : tone === "success"
                          ? "bg-success/15 text-success"
                          : "bg-primary/10 text-primary",
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
            </div>
          </Tag>
        );
      })()}
    </motion.div>
  );
}
