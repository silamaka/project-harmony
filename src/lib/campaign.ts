import type { CampaignStatus } from "@/types";

/** Couleur de chaque statut de campagne (badge, sélecteur de statut). */
export const campaignStatusTone: Record<CampaignStatus, string> = {
  preparation: "bg-muted text-muted-foreground",
  en_cours: "bg-success/15 text-success",
  pause: "bg-warning/20 text-warning",
  terminee: "bg-primary/10 text-primary",
};
