import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authService } from "@/services";

export const Route = createFileRoute("/reinitialiser-mot-de-passe")({
  validateSearch: z.object({
    uid: z.string().catch(""),
    token: z.string().catch(""),
  }),
  head: () => ({
    meta: [
      { title: "Réinitialiser le mot de passe — BEBA EMPIRE" },
      { name: "description", content: "Choisissez un nouveau mot de passe sécurisé." },
      { property: "og:title", content: "Réinitialiser le mot de passe — BEBA EMPIRE" },
      {
        property: "og:description",
        content: "Définissez un nouveau mot de passe pour votre compte.",
      },
    ],
  }),
  component: ResetPasswordPage,
});

const schema = z
  .object({
    password: z
      .string()
      .min(8, { message: "8 caractères minimum" })
      .max(128)
      .regex(/[A-Z]/, { message: "Au moins une majuscule" })
      .regex(/[0-9]/, { message: "Au moins un chiffre" }),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Les mots de passe ne correspondent pas",
    path: ["confirm"],
  });

function ResetPasswordPage() {
  const navigate = useNavigate();
  const { uid, token } = Route.useSearch();
  const [pending, setPending] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm: "" },
  });

  const linkMissing = !uid || !token;

  const onSubmit = async (values: z.infer<typeof schema>) => {
    setPending(true);
    try {
      await authService.resetPassword(uid, token, values.password);
      toast.success("Mot de passe mis à jour.");
      void navigate({ to: "/login" });
    } catch {
      setInvalid(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <img src="/beba-logo.png" alt="Logo BEBA EMPIRE" className="h-12 w-12 rounded-full" />
        <h1 className="mt-6 text-2xl font-extrabold tracking-tight">Nouveau mot de passe</h1>

        {linkMissing || invalid ? (
          <p className="mt-4 text-sm text-destructive">
            Ce lien de réinitialisation est invalide ou a expiré. Redemandez-en un depuis la page
            "Mot de passe oublié".
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              Il doit contenir au moins 8 caractères, une majuscule et un chiffre.
            </p>
            <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Mot de passe</Label>
                <Input id="password" type="password" {...form.register("password")} />
                {form.formState.errors.password && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.password.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirmation</Label>
                <Input id="confirm" type="password" {...form.register("confirm")} />
                {form.formState.errors.confirm && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.confirm.message}
                  </p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? "Mise à jour..." : "Mettre à jour"}
              </Button>
            </form>
          </>
        )}

        <Link
          to="/login"
          className="mt-6 inline-block text-xs font-medium text-primary hover:underline"
        >
          Retour à la connexion
        </Link>
      </div>
    </div>
  );
}
