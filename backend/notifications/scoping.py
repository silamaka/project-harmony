from django.db.models import Q

from accounts.models import Role
from missions.scoping import missions_visible_to

from .models import Notification, NotificationType
from .services import CORRECTIONS_REQUESTED_TITLE


def notifications_visible_to(user):
    """Notifications qu'un utilisateur voit dans sa cloche.

    Source unique de vérité : la liste (NotificationViewSet) et l'envoi push
    (notifications/push.py) s'appuient dessus, pour qu'un appareil ne reçoive
    jamais une alerte que son propriétaire ne verrait pas dans OLYMPE.
    """
    if user.role in (Role.ADMIN, Role.CHEF_PROJET):
        return Notification.objects.all()
    if user.role == Role.CLIENT:
        # Le client ne doit être alerté que quand un livrable lui est
        # envoyé et attend sa validation — jamais des évènements internes
        # à l'agence (création de mission, etc.).
        return Notification.objects.filter(
            type=NotificationType.VALIDATION, mission__in=missions_visible_to(user)
        )
    # Collaborateur : seulement ce qui lui demande d'agir sur ses
    # missions — une nouvelle mission, des corrections demandées par le
    # client (version corrigée à préparer), un rappel de publication. Le reste
    # (validations, envois, alertes écrites pour le client) reste à l'admin et
    # au chef de projet.
    return Notification.objects.filter(mission__in=missions_visible_to(user)).filter(
        Q(type=NotificationType.MISSION_CREEE)
        | Q(type=NotificationType.DECISION_CLIENT, title=CORRECTIONS_REQUESTED_TITLE)
        # Rappels de publication : ce sont eux qui publient.
        | Q(type=NotificationType.PUBLICATION)
    )
