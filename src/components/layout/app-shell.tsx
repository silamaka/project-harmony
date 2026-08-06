import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  BarChart3,
  Bell,
  CalendarDays,
  FolderKanban,
  Users,
  Building2,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Moon,
  Package,
  Settings,
  Sun,
  UserCircle,
  Menu,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import logo from "@/assets/beba-logo.png.asset.json";
import { useAuth } from "@/context/auth-context";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";
import { notificationService } from "@/services";
import { ROLE_LABELS, type Role } from "@/types";
import { Button } from "@/components/ui/button";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: Role[];
}

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "chef_projet"] },
  { to: "/clients", label: "Clients", icon: Building2, roles: ["admin", "chef_projet"] },
  { to: "/collaborateurs", label: "Collaborateurs", icon: Users, roles: ["admin", "chef_projet"] },
  { to: "/projets", label: "Projets", icon: FolderKanban, roles: ["admin", "chef_projet"] },
  { to: "/missions", label: "Missions", icon: ListChecks, roles: ["admin", "chef_projet"] },
  {
    to: "/mes-missions",
    label: "Mes missions",
    icon: ListChecks,
    roles: ["collaborateur"],
  },
  {
    to: "/livrables",
    label: "Livrables",
    icon: Package,
    roles: ["admin", "chef_projet", "collaborateur"],
  },
  {
    to: "/calendrier",
    label: "Calendrier",
    icon: CalendarDays,
    roles: ["admin", "chef_projet", "collaborateur"],
  },
  { to: "/portail", label: "Portail client", icon: UserCircle, roles: ["client"] },
  {
    to: "/statistiques",
    label: "Statistiques",
    icon: BarChart3,
    roles: ["admin", "chef_projet"],
  },
  {
    to: "/notifications",
    label: "Notifications",
    icon: Bell,
    roles: ["admin", "chef_projet", "collaborateur", "client"],
  },
  {
    to: "/profil",
    label: "Mon profil",
    icon: UserCircle,
    roles: ["admin", "chef_projet", "collaborateur", "client"],
  },
  { to: "/parametres", label: "Paramètres", icon: Settings, roles: ["admin"] },
];

/**
 * Coquille applicative : sidebar, topbar, garde d'accès par rôle.
 */
export function AppShell({
  children,
  title,
  subtitle,
  actions,
  allow,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string | undefined;
  actions?: ReactNode | undefined;
  allow?: Role[] | undefined;
}) {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const { data: notifs } = useQuery({
    queryKey: ["notifications"],
    queryFn: notificationService.list,
  });
  const unread = (notifs ?? []).filter((n) => !n.read).length;

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (allow && !allow.includes(user.role)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <h1 className="text-2xl font-bold">Accès refusé</h1>
        <p className="text-sm text-muted-foreground">
          Votre rôle ({ROLE_LABELS[user.role]}) ne permet pas d'accéder à cette page.
        </p>
        <Button onClick={() => navigate({ to: "/" })}>Retour à l'accueil</Button>
      </div>
    );
  }

  const items = NAV.filter((i) => i.roles.includes(user.role));

  return (
    <div className="min-h-screen bg-background md:flex">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-200 md:sticky md:top-0 md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center gap-3 px-5 py-5">
          <img src={logo.url} alt="Logo BEBA EMPIRE" className="h-10 w-10 rounded-full" />
          <div className="leading-tight">
            <p className="text-sm font-extrabold tracking-tight text-sidebar-foreground">
              BEBA EMPIRE
            </p>
            <p className="text-[11px] text-muted-foreground">Agence 360°</p>
          </div>
          <button
            className="ml-auto md:hidden"
            onClick={() => setOpen(false)}
            aria-label="Fermer le menu"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {items.map((item) => {
            const active =
              location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {user.first_name[0]}
              {user.last_name[0]}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-semibold">
                {user.first_name} {user.last_name}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">{ROLE_LABELS[user.role]}</p>
            </div>
            <button
              onClick={() => {
                logout();
                navigate({ to: "/login" });
              }}
              aria-label="Se déconnecter"
              className="text-muted-foreground transition-colors hover:text-destructive"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-foreground/30 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Contenu */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-border bg-background/80 px-4 py-4 backdrop-blur lg:px-8">
          <button className="md:hidden" onClick={() => setOpen(true)} aria-label="Ouvrir le menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold tracking-tight lg:text-xl">{title}</h1>
            {subtitle && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2">
            {actions}
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Changer de thème">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Link to="/notifications" aria-label="Notifications" className="relative">
              <Button variant="ghost" size="icon">
                <Bell className="h-4 w-4" />
              </Button>
              {unread > 0 && (
                <span className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
