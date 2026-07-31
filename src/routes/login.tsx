import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import logo from "@/assets/beba-logo.png.asset.json";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/auth-context";
import { ROLE_HOME } from "@/types";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Connexion — BEBA EMPIRE" },
      { name: "description", content: "Connectez-vous à votre espace BEBA EMPIRE." },
      { property: "og:title", content: "Connexion — BEBA EMPIRE" },
      { property: "og:description", content: "Accédez à la plateforme de gestion de l'agence." },
    ],
  }),
  component: LoginPage,
});

const schema = z.object({
  email: z.string().trim().email({ message: "Adresse e-mail invalide" }).max(255),
  password: z.string().min(4, { message: "Minimum 4 caractères" }).max(128),
});

type FormValues = z.infer<typeof schema>;

const DEMO = [
  { email: "admin@bebaempire.com", label: "Administrateur" },
  { email: "sara@bebaempire.com", label: "Chef de projet" },
  { email: "yassine@bebaempire.com", label: "Collaborateur" },
  { email: "omar@atlasretail.com", label: "Client" },
];

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: FormValues) => {
    setPending(true);
    try {
      const user = await login(values.email, values.password);
      toast.success(`Bienvenue ${user.first_name} !`);
      navigate({ to: ROLE_HOME[user.role] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Connexion impossible");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex items-center justify-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="w-full max-w-sm"
        >
          <img src={logo.url} alt="Logo BEBA EMPIRE" className="h-14 w-14 rounded-full" />
          <h1 className="mt-6 text-2xl font-extrabold tracking-tight">Connexion</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Accédez à votre espace de gestion d'agence.
          </p>

          <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
              {form.formState.errors.email && (
                <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...form.register("password")}
              />
              {form.formState.errors.password && (
                <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
              )}
            </div>
            <div className="flex justify-end">
              <Link
                to="/mot-de-passe-oublie"
                className="text-xs font-medium text-primary hover:underline"
              >
                Mot de passe oublié ?
              </Link>
            </div>
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Connexion..." : "Se connecter"}
            </Button>
          </form>

          <div className="mt-8 rounded-lg border border-border bg-muted/50 p-4">
            <p className="text-xs font-semibold">Comptes de démonstration</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Mot de passe : <span className="font-mono">demo1234</span>
            </p>
            <div className="mt-3 grid gap-1.5">
              {DEMO.map((d) => (
                <button
                  key={d.email}
                  type="button"
                  onClick={() => {
                    form.setValue("email", d.email);
                    form.setValue("password", "demo1234");
                  }}
                  className="flex items-center justify-between rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-accent"
                >
                  <span className="font-medium">{d.label}</span>
                  <span className="text-muted-foreground">{d.email}</span>
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      <div className="brand-gradient hidden flex-col justify-end p-12 lg:flex">
        <blockquote className="max-w-md text-primary-foreground">
          <p className="text-3xl font-extrabold leading-tight tracking-tight">
            Toute l'agence, un seul cockpit.
          </p>
          <p className="mt-4 text-sm opacity-90">
            Clients, projets, missions, livrables, validations client et reporting — centralisés,
            fluides et temps réel.
          </p>
        </blockquote>
      </div>
    </div>
  );
}
