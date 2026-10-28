from django.db.models import Q

from accounts.models import Role
from missions.scoping import missions_visible_to

from .models import Notification, NotificationType
from .services import CORRECTIONS_REQUESTED_TITLE


def notifications_visible_to(user):
    """Notifications qu'un utilisateur voit dans sa cloche, hors celles de
    ses propres actions (ce n'est pas une nouveauté pour lui).

    Source unique de vérité : la liste (NotificationViewSet) et l'envoi push
    (notifications/push.py) s'appuient dessus, pour qu'un appareil ne reçoive
    jamais une alerte que son propriétaire ne verrait pas dans OLYMPE.
    """
    return _by_role(user).exclude(actor=user)


def _by_role(user):
    # Une mention est personnelle : seule la personne mentionnée la voit.
    my_mentions = Q(type=NotificationType.MENTION, recipient=user)
    if user.role in (Role.ADMIN, Role.CHEF_PROJET):
        return Notification.objects.exclude(
            Q(type=NotificationType.MENTION) & ~Q(recipient=user)
        )
    if user.role == Role.CLIENT:
        # Le client n'est alerté que de ce qui l'attend : un livrable à
        # valider, ou un message de l'équipe qui lui est adressé — jamais des
        # évènements internes à l'agence (création de mission, etc.).
        return Notification.objects.filter(mission__in=missions_visible_to(user)).filter(
            Q(type=NotificationType.VALIDATION)
            | Q(type=NotificationType.COMMENTAIRE, client_visible=True)
            | my_mentions
        )
    # Collaborateur : seulement ce qui le concerne sur ses missions — une
    # nouvelle mission, une assignation qui le vise lui, des corrections
    # demandées par le client (version corrigée à préparer), un rappel de
    # publication, un commentaire, un retard. Le reste (livrables à revoir,
    # validations, envois au client) reste à l'admin et au chef de projet.
    return Notification.objects.filter(mission__in=missions_visible_to(user)).filter(
        Q(type=NotificationType.MISSION_CREEE)
        | Q(type=NotificationType.MISSION_ASSIGNEE, recipient=user)
        | Q(type=NotificationType.DECISION_CLIENT, title=CORRECTIONS_REQUESTED_TITLE)
        # Rappels de publication : ce sont eux qui publient.
        | Q(type=NotificationType.PUBLICATION)
        | Q(type=NotificationType.COMMENTAIRE)
        | Q(type=NotificationType.RETARD)
        | my_mentions
    )
