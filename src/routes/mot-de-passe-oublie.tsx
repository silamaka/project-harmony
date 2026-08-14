import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, MailCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/mot-de-passe-oublie")({
  head: () => ({
    meta: [
      { title: "Mot de passe oublié — BEBA EMPIRE" },
      { name: "description", content: "Recevez un lien de réinitialisation par e-mail." },
      { property: "og:title", content: "Mot de passe oublié — BEBA EMPIRE" },
      { property: "og:description", content: "Réinitialisez l'accès à votre compte." },
    ],
  }),
  component: ForgotPasswordPage,
});

const schema = z.object({
  email: z.string().trim().email({ message: "Adresse e-mail invalide" }).max(255),
});

function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <img src="/beba-logo.svg" alt="Logo BEBA EMPIRE" className="h-12 w-12 rounded-full" />
        {sent ? (
          <div className="mt-6">
            <MailCheck className="h-8 w-8 text-success" />
            <h1 className="mt-4 text-2xl font-extrabold tracking-tight">E-mail envoyé</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Si un compte existe pour cette adresse, un lien de réinitialisation vient d'être
              envoyé.
            </p>
          </div>
        ) : (
          <>
            <h1 className="mt-6 text-2xl font-extrabold tracking-tight">Mot de passe oublié</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Indiquez votre e-mail, nous vous enverrons un lien de réinitialisation.
            </p>
            {/* Branchement API : POST /api/v1/auth/password/forgot/ */}
            <form onSubmit={form.handleSubmit(() => setSent(true))} className="mt-8 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" {...form.register("email")} />
                {form.formState.errors.email && (
                  <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
                )}
              </div>
              <Button type="submit" className="w-full">
                Envoyer le lien
              </Button>
            </form>
          </>
        )}
        <Link
          to="/login"
          className="mt-6 inline-flex items-center gap-2 text-xs font-medium text-primary hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Retour à la connexion
        </Link>
      </div>
    </div>
  );
}
