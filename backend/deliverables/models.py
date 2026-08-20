from django.conf import settings
from django.db import models


class DeliverableType(models.TextChoices):
    PDF = "pdf", "PDF"
    IMAGE = "image", "Image"
    ZIP = "zip", "ZIP"
    VIDEO = "video", "Vidéo"
    LIEN = "lien", "Lien"


class DeliverableStatus(models.TextChoices):
    EN_ATTENTE = "en_attente", "En attente"
    VALIDE = "valide", "Validé"
    CORRECTIONS = "corrections", "Corrections"


class Deliverable(models.Model):
    """Correspond au type `Deliverable` du frontend (src/types/index.ts)."""

    mission = models.ForeignKey("missions.Mission", related_name="deliverables", on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    type = models.CharField(max_length=10, choices=DeliverableType.choices)
    # TextField (pas URLField) : les liens Drive/Figma/S3 réels dépassent
    # souvent les 200 caractères par défaut d'un URLField (paramètres de
    # partage, node-id...), comme constaté pour User.avatar_url.
    url = models.TextField()
    version = models.PositiveSmallIntegerField(default=1)
    size_kb = models.PositiveIntegerField(null=True, blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="uploaded_deliverables", on_delete=models.PROTECT
    )
    status = models.CharField(
        max_length=20, choices=DeliverableStatus.choices, default=DeliverableStatus.EN_ATTENTE
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.name} v{self.version}"
