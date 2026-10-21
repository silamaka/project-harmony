from django.db.models.signals import post_save
from django.dispatch import receiver

from missions.models import Mission

from .models import Notification, NotificationType


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
