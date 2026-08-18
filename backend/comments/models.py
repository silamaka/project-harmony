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
    attachment_url = models.URLField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"{self.author} — {self.body[:40]}"
