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


class CorrectionCategory(models.TextChoices):
    """Ce que le client demande de corriger : l'équipe sait d'un coup d'œil
    de quoi il s'agit, avant même de lire le détail."""

    TEXTE = "texte", "Texte / orthographe"
    VISUEL = "visuel", "Couleurs / visuel"
    MISE_EN_PAGE = "mise_en_page", "Mise en page"
    IMAGE = "image", "Image / photo"
    CONTENU = "contenu", "Contenu à ajouter ou retirer"
    AUTRE = "autre", "Autre"



class Deliverable(models.Model):
    """Correspond au type `Deliverable` du frontend (src/types/index.ts)."""

    mission = models.ForeignKey("missions.Mission", related_name="deliverables", on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    type = models.CharField(max_length=10, choices=DeliverableType.choices)
    # TextField (pas URLField) : les liens Drive/Figma/S3 réels dépassent
    # souvent les 200 caractères par défaut d'un URLField (paramètres de
    # partage, node-id...), comme constaté pour User.avatar_url.
    # Vide tant que le livrable est seulement annoncé ("Lien à venir") :
    # il ne peut alors être ni validé ni publié (voir DeliverableSerializer).
    url = models.TextField(blank=True, default="")
    version = models.PositiveSmallIntegerField(default=1)
    size_kb = models.PositiveIntegerField(null=True, blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="uploaded_deliverables", on_delete=models.PROTECT
    )
    # Deux validations indépendantes. `status` : celle de l'agence (admin /
    # chef de projet) ; un livrable validé par l'agence est envoyé au client,
    # qui ne voit rien avant. `client_status` : la décision du client sur ce
    # qu'il a reçu. Prêt à publier = validé des deux côtés. Un nouveau lien
    # remet les deux à "En attente" (voir DeliverableSerializer.update).
    status = models.CharField(
        max_length=20, choices=DeliverableStatus.choices, default=DeliverableStatus.EN_ATTENTE
    )
    client_status = models.CharField(
        max_length=20, choices=DeliverableStatus.choices, default=DeliverableStatus.EN_ATTENTE
    )
    # Dernière demande de corrections du client, affichée sur le livrable
    # lui-même : sur une mission à dix livrables, l'équipe voit tout de suite
    # lequel corriger et quoi. Effacée quand le client valide ou qu'un
    # nouveau lien arrive. Le message reste aussi dans la discussion.
    client_feedback = models.TextField(blank=True, default="")
    client_feedback_at = models.DateTimeField(null=True, blank=True)
    # Catégories (CorrectionCategory) et lien d'exemple / de capture joints à
    # cette demande ; effacés avec elle.
    client_feedback_categories = models.JSONField(default=list, blank=True)
    client_feedback_link = models.TextField(blank=True, default="")
    # Quand le client a validé (affiché à l'agence : "Validé par le client
    # le …"). Effacé s'il demande ensuite des corrections ou qu'un nouveau
    # lien arrive.
    client_validated_at = models.DateTimeField(null=True, blank=True)
    # Décision du client enregistrée par l'agence (admin / chef de projet)
    # pour un client qui a répondu hors du portail (téléphone, e-mail...) :
    # qui l'a enregistrée. Vide quand le client a décidé lui-même.
    client_decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        related_name="+",
        on_delete=models.SET_NULL,
    )
    # Indépendant de `status` : un livrable validé n'est pas forcément déjà
    # publié, et une mission à plusieurs livrables les publie un par un.
    published_at = models.DateTimeField(null=True, blank=True)
    # Date de publication prévue, programmée par l'équipe (planning
    # éditorial, échéance de validation pour le client). Distincte de
    # `published_at` (la publication réelle) : rien n'est publié
    # automatiquement, la mise en ligne se fait hors de la plateforme.
    scheduled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.name} v{self.version}"

    @property
    def label(self) -> str:
        """Nom + version, pour les messages et notifications : deux
        livrables d'une même mission peuvent porter le même nom."""
        return f"« {self.name} » v{self.version}"
