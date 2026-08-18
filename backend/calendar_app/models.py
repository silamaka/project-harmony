from django.db import models


class Meeting(models.Model):
    """Seul type d'événement de calendrier réellement stocké — les
    échéances de missions et dépôts de livrables sont dérivés à la volée
    par la vue d'agrégation (voir calendar_app/views.py), comme déjà fait
    côté frontend (services/index.ts, calendarService.list)."""

    title = models.CharField(max_length=200)
    date = models.DateField()
    time = models.CharField(max_length=5, blank=True)
    description = models.TextField(blank=True)

    class Meta:
        ordering = ["date", "time"]

    def __str__(self) -> str:
        return self.title
