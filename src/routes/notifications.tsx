import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  MessageSquare,
  Package,
  RefreshCcw,
  UserPlus,
} from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { notificationService } from "@/services";
import type { Notification } from "@/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — BEBA EMPIRE" },
      {
        name: "description",
        content: "Alertes missions, commentaires, livrables et validations en temps réel.",
      },
      { property: "og:title", content: "Notifications — BEBA EMPIRE" },
      { property: "og:description", content: "Centre de notifications de la plateforme." },
    ],
  }),
  component: NotificationsPage,
});

const ICONS: Record<Notification["type"], typeof Bell> = {
  mission_creee: Bell,
  mission_assignee: UserPlus,
  commentaire: MessageSquare,
  livrable: Package,
  validation: CheckCircle2,
  correction: RefreshCcw,
  retard: AlertTriangle,
};

function NotificationsPage() {
  const { data } = useQuery({ queryKey: ["notifications"], queryFn: notificationService.list });
  const [items, setItems] = useState<Notification[]>([]);

  useEffect(() => {
    if (data) setItems(data);
  }, [data]);

  const unread = items.filter((n) => !n.read).length;

  return (
    <AppShell
      title="Notifications"
      subtitle={`${unread} non lue(s)`}
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => setItems((prev) => prev.map((n) => ({ ...n, read: true })))}
        >
          Tout marquer comme lu
        </Button>
      }
    >
      <div className="space-y-2">
        {items.map((n) => {
          const Icon = ICONS[n.type];
          return (
            <button
              key={n.id}
              onClick={() =>
                setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)))
              }
              className={cn(
                "surface-card flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-accent/30",
                !n.read && "border-l-4 border-l-primary",
              )}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm", n.read ? "font-medium" : "font-bold")}>{n.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{n.body}</p>
              </div>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {new Date(n.created_at).toLocaleDateString("fr-FR")}
              </span>
            </button>
          );
        })}
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucune notification.</p>
        )}
      </div>
    </AppShell>
  );
}
