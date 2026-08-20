from django.conf import settings
from django.db import models


class Priority(models.TextChoices):
    FAIBLE = "faible", "Faible"
    NORMALE = "normale", "Normale"
    HAUTE = "haute", "Haute"
    URGENTE = "urgente", "Urgente"


class MissionStatus(models.TextChoices):
    A_FAIRE = "a_faire", "À faire"
    EN_COURS = "en_cours", "En cours"
    LIVRABLE_DEPOSE = "livrable_depose", "Livrable déposé"
    VALIDATION_INTERNE = "validation_interne", "Validation interne"
    ENVOYE_CLIENT = "envoye_client", "Envoyé au client"
    VALIDE = "valide", "Validé"
    CORRECTIONS = "corrections", "Corrections demandées"
    PUBLIE = "publie", "Publié"
    TERMINE = "termine", "Terminé"


# Une mission "Publiée" a déjà été validée par le client (elle vient après
# "Validé" dans le workflow) : elle compte comme terminée au même titre que
# "Validé"/"Terminé" pour les taux d'achèvement et le calcul des retards.
DONE_STATUSES = (MissionStatus.VALIDE, MissionStatus.PUBLIE, MissionStatus.TERMINE)


class Mission(models.Model):
    """Correspond au type `Mission` du frontend (src/types/index.ts)."""

    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    objective = models.TextField(blank=True)
    strategy = models.TextField(blank=True)
    resources = models.TextField(blank=True)
    priority = models.CharField(max_length=20, choices=Priority.choices, default=Priority.NORMALE)
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="assigned_missions", on_delete=models.PROTECT
    )
    project = models.ForeignKey("projects.Project", related_name="missions", on_delete=models.CASCADE)
    # Dénormalisé comme côté frontend (Mission.client_id) : évite de traverser
    # project.client à chaque lecture, et reste cohérent puisqu'une mission
    # peut exceptionnellement être créée sans projet (voir Mission.project
    # nullable côté futures évolutions — pour l'instant aligné sur le
    # frontend actuel où project est obligatoire).
    client = models.ForeignKey("clients.Client", related_name="missions", on_delete=models.CASCADE)
    deadline = models.DateField()
    status = models.CharField(max_length=20, choices=MissionStatus.choices, default=MissionStatus.A_FAIRE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.title
