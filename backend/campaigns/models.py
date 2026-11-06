from decimal import Decimal

from django.conf import settings
from django.db import models


class CampaignStatus(models.TextChoices):
    PREPARATION = "preparation", "En préparation"
    EN_COURS = "en_cours", "En cours"
    PAUSE = "pause", "En pause"
    TERMINEE = "terminee", "Terminée"


class CampaignObjective(models.TextChoices):
    MESSAGES = "messages", "Messages (WhatsApp, Messenger)"
    PROSPECTS = "prospects", "Prospects"
    VENTES = "ventes", "Ventes en ligne"
    VISITES = "visites", "Visites en boutique"
    TRAFIC = "trafic", "Trafic (clics)"
    ABONNES = "abonnes", "Abonnés"
    NOTORIETE = "notoriete", "Notoriété"


class CampaignPlatform(models.TextChoices):
    META = "meta", "Meta (Facebook, Instagram)"
    TIKTOK = "tiktok", "TikTok"
    SNAPCHAT = "snapchat", "Snapchat"
    GOOGLE = "google", "Google"
    AUTRE = "autre", "Autre"


class PaidBy(models.TextChoices):
    CLIENT = "client", "Compte du client"
    AGENCE = "agence", "Compte de l'agence (refacturé)"


class Campaign(models.Model):
    """Campagne publicitaire d'un client (Meta Ads, TikTok Ads...). Une
    opération plus large (tournage, posts) reste un projet : la campagne peut
    y être rattachée, et ses visuels sont des contenus déjà déposés."""

    client = models.ForeignKey("clients.Client", related_name="campaigns", on_delete=models.CASCADE)
    project = models.ForeignKey(
        "projects.Project",
        null=True,
        blank=True,
        related_name="campaigns",
        on_delete=models.SET_NULL,
    )
    name = models.CharField(max_length=200)
    platforms = models.JSONField(default=list, blank=True)
    objective = models.CharField(max_length=20, choices=CampaignObjective.choices)
    # Cible chiffrée de l'objectif (ex. 200 messages) ; vide pour la notoriété.
    objective_target = models.PositiveIntegerField(null=True, blank=True)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    status = models.CharField(
        max_length=20, choices=CampaignStatus.choices, default=CampaignStatus.PREPARATION
    )
    budget_ht = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    # TVA du pays de l'agence (18 % au Sénégal), réglable par campagne.
    tva_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("18"))
    paid_by = models.CharField(max_length=10, choices=PaidBy.choices, default=PaidBy.CLIENT)
    targeting = models.TextField(blank=True)
    # Jamais montrées au client.
    internal_notes = models.TextField(blank=True)
    # Visuels de la campagne : contenus déjà déposés pour ce client.
    contents = models.ManyToManyField("deliverables.Deliverable", blank=True, related_name="campaigns")
    # Alertes déjà envoyées ("fin:<date>", "budget90", "releve:<date>") : une
    # seule fois chacune (voir notify_campaign_alerts).
    alerts_sent = models.JSONField(default=list, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, related_name="+", on_delete=models.SET_NULL
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-start_date", "-id"]

    def __str__(self) -> str:
        return self.name


class CampaignReport(models.Model):
    """Relevé des chiffres d'une campagne à une date : les **totaux depuis le
    début**, tels qu'Ads Manager les affiche (rien à additionner, aucun risque
    de compter deux fois). Le dernier relevé donne les totaux de la campagne,
    l'écart avec le précédent ce qui a été fait entre les deux."""

    campaign = models.ForeignKey(Campaign, related_name="reports", on_delete=models.CASCADE)
    date = models.DateField()
    spend = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    reach = models.PositiveIntegerField(null=True, blank=True)
    impressions = models.PositiveIntegerField(null=True, blank=True)
    clicks = models.PositiveIntegerField(null=True, blank=True)
    results = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, related_name="+", on_delete=models.SET_NULL
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["date"]
        constraints = [
            models.UniqueConstraint(fields=["campaign", "date"], name="one_report_per_campaign_day")
        ]
