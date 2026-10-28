from django.conf import settings
from django.db import models


class Comment(models.Model):
    """Correspond au type `Comment` du frontend (src/types/index.ts)."""

    mission = models.ForeignKey("missions.Mission", related_name="comments", on_delete=models.CASCADE)
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="authored_comments", on_delete=models.PROTECT
    )
    body = models.TextField()
    parent = models.ForeignKey(
        "self", null=True, blank=True, related_name="replies", on_delete=models.CASCADE
    )
    # TextField (pas URLField) : même raison que Deliverable.url / User.avatar_url.
    attachment_url = models.TextField(blank=True)
    # Interne par défaut : un échange entre membres de l'équipe ne doit jamais
    # être lu par le client. Seuls les commentaires marqués visibles (et tous
    # ceux écrits par le client lui-même) apparaissent dans son portail.
    client_visible = models.BooleanField(default=False)
    # Personnes mentionnées (@Prénom Nom), choisies dans les suggestions et
    # vérifiées par le serveur : seulement celles qui peuvent lire ce message
    # (voir comments.mentions.mentionable_users).
    mentioned_users = models.ManyToManyField(
        settings.AUTH_USER_MODEL, blank=True, related_name="mentioned_in_comments"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"{self.author} — {self.body[:40]}"
