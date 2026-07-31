import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/context/auth-context";
import { ROLE_HOME } from "@/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BEBA EMPIRE — Plateforme de gestion d'agence marketing" },
      {
        name: "description",
        content:
          "Pilotez clients, projets, missions et livrables de votre agence de communication digitale depuis une plateforme unique.",
      },
      { property: "og:title", content: "BEBA EMPIRE — Plateforme de gestion d'agence" },
      {
        property: "og:description",
        content: "Clients, projets, missions, livrables et portail client en un seul outil.",
      },
    ],
  }),
  component: IndexRedirect,
});

function IndexRedirect() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    navigate({ to: user ? ROLE_HOME[user.role] : "/login" });
  }, [user, loading, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
