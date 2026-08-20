from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from missions.models import Mission, MissionStatus

from .models import Notification, NotificationType


@receiver(pre_save, sender=Mission)
def stash_previous_status(sender, instance: Mission, **kwargs):
    """Retient le statut précédent sur l'instance pour que le post_save
    puisse détecter une transition (et non simplement "status == X" qui
    re-notifierait à chaque sauvegarde tant que le statut reste envoyé)."""
    if instance.pk:
        instance._previous_status = (
            Mission.objects.filter(pk=instance.pk).values_list("status", flat=True).first()
        )
    else:
        instance._previous_status = None


@receiver(post_save, sender=Mission)
def notify_mission_created(sender, instance: Mission, created: bool, **kwargs):
    """Miroir serveur de ce que missionService.create simulait côté
    frontend (services/index.ts) : une notification à chaque nouvelle
    mission, désormais un vrai effet de bord serveur."""
    if not created:
        return
    Notification.objects.create(
        type=NotificationType.MISSION_CREEE,
        title="Nouvelle mission",
        body=instance.title,
        link=f"/missions/{instance.id}",
        mission=instance,
    )


@receiver(post_save, sender=Mission)
def notify_sent_to_client(sender, instance: Mission, created: bool, **kwargs):
    """Le client n'a rien à faire tant que le pipeline interne (à faire →
    validation interne) n'est pas terminé. Dès que le statut passe à
    "envoyé au client", c'est son tour d'agir (Valider / Corrections) :
    on le notifie à ce moment précis, pas avant."""
    if created:
        return
    previous = getattr(instance, "_previous_status", None)
    if previous == instance.status or instance.status != MissionStatus.ENVOYE_CLIENT:
        return
    Notification.objects.create(
        type=NotificationType.VALIDATION,
        title="Mission prête pour validation",
        body=f'"{instance.title}" attend votre validation ou une demande de corrections.',
        link=f"/missions/{instance.id}",
        mission=instance,
    )
