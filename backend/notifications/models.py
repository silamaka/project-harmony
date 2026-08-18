from django.db import models


class NotificationType(models.TextChoices):
    MISSION_CREEE = "mission_creee", "Mission créée"
    MISSION_ASSIGNEE = "mission_assignee", "Mission assignée"
    COMMENTAIRE = "commentaire", "Commentaire"
    LIVRABLE = "livrable", "Livrable"
    VALIDATION = "validation", "Validation"
    CORRECTION = "correction", "Correction"
    RETARD = "retard", "Retard"


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
    read = models.BooleanField(default=False)
    link = models.CharField(max_length=255, blank=True)
    mission = models.ForeignKey(
        "missions.Mission", null=True, blank=True, related_name="notifications", on_delete=models.CASCADE
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.title
