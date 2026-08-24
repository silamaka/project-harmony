import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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
    <div className="grid min-h-screen lg:h-screen lg:grid-cols-2">
      <div className="flex items-center justify-center overflow-y-auto px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="w-full max-w-sm"
        >
          <img
            src="/beba-logo.png"
            alt="Logo BEBA EMPIRE"
            className="h-20 w-20 rounded-full shadow-sm"
          />
          <h1 className="mt-7 text-3xl font-extrabold tracking-tight">Bienvenue sur BEBA</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Connectez-vous à votre espace de gestion d'agence.
          </p>

          <form onSubmit={form.handleSubmit(onSubmit)} className="mt-9 space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="vous@agence.com"
                className="h-11"
                {...form.register("email")}
              />
              {form.formState.errors.email && (
                <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Mot de passe</Label>
                <Link
                  to="/mot-de-passe-oublie"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Mot de passe oublié ?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                className="h-11"
                {...form.register("password")}
              />
              {form.formState.errors.password && (
                <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
              )}
            </div>
            <Button type="submit" size="lg" className="mt-2 h-11 w-full" disabled={pending}>
              {pending ? "Connexion..." : "Se connecter"}
            </Button>
          </form>
        </motion.div>
      </div>

      <div className="brand-gradient hidden min-h-0 items-center justify-center lg:flex">
        <img
          src="/BEBA_EMPIRE_clean.png"
          alt="BEBA EMPIRE"
          className="h-full max-h-full w-full max-w-full object-contain"
        />
      </div>
    </div>
  );
}
