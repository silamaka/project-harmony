from django.conf import settings
from django.db import models


class NotificationType(models.TextChoices):
    MISSION_CREEE = "mission_creee", "Mission créée"
    MISSION_ASSIGNEE = "mission_assignee", "Mission assignée"
    COMMENTAIRE = "commentaire", "Commentaire"
    LIVRABLE = "livrable", "Livrable"
    VALIDATION = "validation", "Validation"
    CORRECTION = "correction", "Correction"
    RETARD = "retard", "Retard"
    # Le client a validé ou demandé des corrections : destinée à l'équipe,
    # jamais montrée au client (qui ne voit que le type VALIDATION).
    DECISION_CLIENT = "decision_client", "Décision du client"
    # Rappel de publication programmée (veille, retard) : destiné à l'équipe
    # de la mission, collaborateurs compris (ce sont eux qui publient).
    PUBLICATION = "publication", "Publication"


class Notification(models.Model):
    """Correspond au type `Notification` du frontend (src/types/index.ts).

    Pas de destinataire explicite : la portée (qui la voit) est dérivée de
    `mission` via missions.scoping.missions_visible_to, exactement comme
    pour les livrables et commentaires — une notification sans mission
    (aucun cas actuel) reste visible à tous.
    """

    type = models.CharField(max_length=20, choices=NotificationType.choices)
    title = models.CharField(max_length=200)
    body = models.CharField(max_length=500)
    # "Lu" est propre à chaque personne : une notification n'a pas de
    # destinataire unique (sa portée dérive de `mission`), donc un booléen
    # partagé faisait qu'un "Tout marquer comme lu" de l'équipe effaçait
    # aussi les alertes du client, et inversement.
    read_by = models.ManyToManyField(
        settings.AUTH_USER_MODEL, blank=True, related_name="read_notifications"
    )
    link = models.CharField(max_length=255, blank=True)
    mission = models.ForeignKey(
        "missions.Mission", null=True, blank=True, related_name="notifications", on_delete=models.CASCADE
    )
    # Livrable concerné (décision du client, envoi au client) : la
    # notification ouvre la fiche mission directement sur lui. Ne change pas
    # la portée, toujours dérivée de `mission`.
    deliverable = models.ForeignKey(
        "deliverables.Deliverable",
        null=True,
        blank=True,
        related_name="notifications",
        on_delete=models.SET_NULL,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.title
