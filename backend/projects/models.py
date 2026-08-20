from django.conf import settings
from django.db import models


class ProjectStatus(models.TextChoices):
    BROUILLON = "brouillon", "Brouillon"
    EN_PREPARATION = "en_preparation", "En préparation"
    EN_COURS = "en_cours", "En cours"
    EN_ATTENTE = "en_attente", "En attente"
    TERMINE = "termine", "Terminé"
    ARCHIVE = "archive", "Archivé"


class Project(models.Model):
    """Correspond au type `Project` du frontend (src/types/index.ts)."""

    name = models.CharField(max_length=200)
    client = models.ForeignKey("clients.Client", related_name="projects", on_delete=models.CASCADE)
    description = models.TextField(blank=True)
    start_date = models.DateField()
    end_date = models.DateField()
    status = models.CharField(max_length=20, choices=ProjectStatus.choices, default=ProjectStatus.BROUILLON)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="owned_projects", on_delete=models.PROTECT
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.name

    @property
    def progress(self) -> int:
        """Calculée à partir des missions du projet (pas saisie à la main) :
        pourcentage de missions au statut Validé/Publié/Terminé."""
        from missions.models import DONE_STATUSES

        total = self.missions.count()
        if not total:
            return 0
        done = self.missions.filter(status__in=DONE_STATUSES).count()
        return round(done / total * 100)
