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
    # Qui a déclenché la notification (renseigné automatiquement pendant une
    # requête, voir notifications/actor.py ; vide pour les tâches planifiées).
    # Elle n'apparaît ni dans sa cloche ni en push (notifications_visible_to).
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        related_name="+",
        on_delete=models.SET_NULL,
    )
    # Notification personnelle (ex. "vous êtes assigné") : seul ce
    # collaborateur la voit, pas les autres membres de la mission. L'admin et
    # le chef de projet voient toujours tout.
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        related_name="personal_notifications",
        on_delete=models.CASCADE,
    )
    # Commentaire visible du client : il en est prévenu aussi.
    client_visible = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.title

    def save(self, *args, **kwargs):
        if self._state.adding and self.actor_id is None:
            from .actor import current_actor

            self.actor = current_actor()
        super().save(*args, **kwargs)


class PushSubscription(models.Model):
    """Un appareil (navigateur) qui a autorisé les notifications push.

    Un utilisateur peut en avoir plusieurs (ordinateur, téléphone...).
    `endpoint` est l'adresse fournie par le service push du navigateur
    (Google, Apple, Mozilla) : unique par appareil, il identifie
    l'abonnement. `p256dh` et `auth` chiffrent le message pour cet appareil.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="push_subscriptions", on_delete=models.CASCADE
    )
    endpoint = models.URLField(max_length=1000, unique=True)
    p256dh = models.CharField(max_length=255)
    auth = models.CharField(max_length=255)
    user_agent = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"{self.user} — {self.user_agent[:40]}"
