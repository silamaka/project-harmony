from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from deliverables.models import Deliverable, DeliverableStatus
from notifications.services import (
    notify_client_validation_reminder,
    notify_late_missions,
    notify_publication_team,
)

# Rappel de la veille : dans les 24 h qui précèdent la date prévue.
REMINDER_WINDOW = timedelta(hours=24)


def send_publication_reminders(now=None) -> int:
    """Envoie les rappels de publication dus et renvoie leur nombre.

    Pour chaque livrable programmé et pas encore publié :
    - la veille (moins de 24 h avant) : si prêt (validé par l'agence et le
      client) "À publier demain" pour l'équipe ; sinon "pas encore validé"
      pour l'équipe, plus un rappel au client si c'est lui qui bloque ;
    - une fois la date passée : "Publication en retard" pour l'équipe.
    Chaque rappel ne part qu'une fois par date (publication_reminders)."""
    now = now or timezone.now()
    sent = 0
    candidates = Deliverable.objects.filter(
        scheduled_at__isnull=False,
        published_at__isnull=True,
        scheduled_at__lte=now + REMINDER_WINDOW,
    ).select_related("mission")
    for deliverable in candidates:
        with transaction.atomic():
            d = Deliverable.objects.select_for_update().get(pk=deliverable.pk)
            if d.published_at or not d.scheduled_at:
                continue
            stamp = d.scheduled_at.isoformat()
            done = set(d.publication_reminders or [])
            new = []
            ready = (
                d.status == DeliverableStatus.VALIDE
                and d.client_status == DeliverableStatus.VALIDE
            )
            if d.scheduled_at <= now:
                key = f"retard:{stamp}"
                if key not in done:
                    notify_publication_team(
                        d,
                        "Publication en retard",
                        "La date est passée et le livrable n'est pas encore publié.",
                    )
                    new.append(key)
            else:
                key = f"veille:{stamp}"
                if key not in done:
                    if ready:
                        notify_publication_team(
                            d, "À publier bientôt", "Il est prêt : validé par l'agence et le client."
                        )
                    else:
                        client_blocks = (
                            d.status == DeliverableStatus.VALIDE
                            and d.client_status == DeliverableStatus.EN_ATTENTE
                        )
                        notify_publication_team(
                            d,
                            "Publication prévue, pas encore validée",
                            "En attente de la validation du client."
                            if client_blocks
                            else "Il n'est pas encore prêt (revue agence ou corrections).",
                        )
                        if client_blocks:
                            notify_client_validation_reminder(d)
                    new.append(key)
            if new:
                # Seules les clés de la date en cours sont gardées.
                d.publication_reminders = [k for k in done if k.endswith(stamp)] + new
                d.save(update_fields=["publication_reminders"])
                sent += len(new)
    return sent


class Command(BaseCommand):
    help = (
        "Envoie les rappels de publication (veille, retard) et signale les missions "
        "en retard. À lancer toutes les heures par le planificateur du serveur (cron)."
    )

    def handle(self, *args, **options):
        sent = send_publication_reminders()
        late = notify_late_missions()
        self.stdout.write(
            f"{sent} rappel(s) de publication, {late} mission(s) en retard signalée(s)."
        )
