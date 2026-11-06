from datetime import timedelta

from django.utils import timezone

from notifications.models import Notification, NotificationType

from .models import Campaign, CampaignStatus

ENDING_SOON_DAYS = 3
BUDGET_ALERT_PERCENT = 90
REPORT_GAP_DAYS = 8


def _alert(campaign, key, title, body):
    if key in campaign.alerts_sent:
        return 0
    # Sans mission : visible de l'admin et du chef de projet seulement
    # (notifications_visible_to), jamais du collaborateur ni du client.
    Notification.objects.create(
        type=NotificationType.CAMPAGNE,
        title=title,
        body=f"{campaign.name} ({campaign.client.name}) — {body}"[:500],
        link=f"/campagnes/{campaign.id}",
    )
    campaign.alerts_sent = [*campaign.alerts_sent, key]
    campaign.save(update_fields=["alerts_sent"])
    return 1


def notify_campaign_alerts(today=None) -> int:
    """Alertes des campagnes en cours, une seule fois chacune : fin dans
    trois jours, budget dépensé à 90 %, plus de relevé depuis huit jours.
    Renvoie le nombre d'alertes envoyées."""
    today = today or timezone.localdate()
    sent = 0
    running = Campaign.objects.filter(status=CampaignStatus.EN_COURS).select_related("client")
    for campaign in running.prefetch_related("reports"):
        reports = list(campaign.reports.all())
        last = reports[-1] if reports else None
        if campaign.end_date and 0 <= (campaign.end_date - today).days <= ENDING_SOON_DAYS:
            sent += _alert(
                campaign,
                f"fin:{campaign.end_date.isoformat()}",
                "Campagne bientôt terminée",
                f"se termine le {campaign.end_date:%d/%m/%Y}.",
            )
        if last and campaign.budget_ht and last.spend * 100 >= campaign.budget_ht * BUDGET_ALERT_PERCENT:
            sent += _alert(
                campaign,
                "budget90",
                "Budget de campagne presque dépensé",
                f"{round(float(last.spend) / float(campaign.budget_ht) * 100)} % du budget dépensé.",
            )
        reference = last.date if last else campaign.start_date
        if today - reference >= timedelta(days=REPORT_GAP_DAYS):
            sent += _alert(
                campaign,
                f"releve:{reference.isoformat()}",
                "Relevé de campagne en attente",
                f"aucun relevé depuis le {reference:%d/%m/%Y}.",
            )
    return sent
