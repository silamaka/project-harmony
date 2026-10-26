from .models import Notification, NotificationType

# Titre des décisions "corrections" du client : la seule alerte de décision
# montrée aux collaborateurs (voir notifications_visible_to).
CORRECTIONS_REQUESTED_TITLE = "Corrections demandées par le client"


def deliverable_link(deliverable) -> str:
    return f"/missions/{deliverable.mission_id}?livrable={deliverable.id}"


def notify_client_decision(
    user, mission, *, validated: bool, subject: str, deliverable=None, on_behalf=False
) -> Notification:
    """Prévient l'équipe d'une décision du client (validation ou demande de
    corrections) sur une mission ou un de ses livrables. Sans cela, la
    réponse du client pouvait rester des jours sans être vue.

    Portée : comme toute notification, dérivée de `mission`
    (NotificationViewSet) — admin, chef de projet et collaborateurs de la
    mission la voient ; le client, lui, ne voit que le type VALIDATION.
    `on_behalf` : décision enregistrée par l'agence pour le client."""
    who = f"{user.first_name} {user.last_name}".strip() or user.email
    company = mission.client.name if mission.client_id else ""
    if on_behalf:
        author = f"{who}, pour le client" + (f" {company}" if company else "")
    else:
        author = f"{who} ({company})" if company else who
    return Notification.objects.create(
        type=NotificationType.DECISION_CLIENT,
        title="Validé par le client" if validated else CORRECTIONS_REQUESTED_TITLE,
        body=f"{author} — {subject}"[:500],
        link=deliverable_link(deliverable) if deliverable else f"/missions/{mission.id}",
        mission=mission,
        deliverable=deliverable,
    )


def notify_deliverable_sent(deliverable) -> Notification:
    """Prévient le client qu'un livrable l'attend : l'agence vient de le
    valider (première version ou nouvelle version après un changement de
    lien). Type VALIDATION : le seul que le client voit (NotificationViewSet)."""
    mission = deliverable.mission
    return Notification.objects.create(
        type=NotificationType.VALIDATION,
        title="Nouveau livrable à valider",
        body=f"{deliverable.label} (mission « {mission.title} ») attend votre validation."[:500],
        link=deliverable_link(deliverable),
        mission=mission,
        deliverable=deliverable,
    )


def _when(deliverable) -> str:
    from django.utils import timezone

    when = timezone.localtime(deliverable.scheduled_at)
    return f"{when:%d/%m/%Y} à {when:%H:%M}"


def notify_publication_team(deliverable, title: str, detail: str) -> Notification:
    """Rappel de publication pour l'équipe de la mission (admin, chef de
    projet, collaborateurs). Type PUBLICATION : jamais montré au client."""
    mission = deliverable.mission
    return Notification.objects.create(
        type=NotificationType.PUBLICATION,
        title=title,
        body=(
            f"{deliverable.label} (mission « {mission.title} ») — prévue le "
            f"{_when(deliverable)}. {detail}"
        )[:500],
        link=deliverable_link(deliverable),
        mission=mission,
        deliverable=deliverable,
    )


def notify_client_validation_reminder(deliverable) -> Notification:
    """Rappel au client : un livrable qui attend sa validation doit être
    publié bientôt. Type VALIDATION : le seul que le client voit."""
    mission = deliverable.mission
    return Notification.objects.create(
        type=NotificationType.VALIDATION,
        title="À valider avant la publication",
        body=(
            f"{deliverable.label} (mission « {mission.title} ») doit être publié le "
            f"{_when(deliverable)} : il attend votre validation."
        )[:500],
        link=deliverable_link(deliverable),
        mission=mission,
        deliverable=deliverable,
    )


def notify_client_decision_cancelled(deliverable, what: str) -> Notification:
    """Prévient le client que l'agence (l'administrateur) a annulé sa
    décision sur un livrable, qui attend de nouveau sa réponse. Type
    VALIDATION : le seul que le client voit (NotificationViewSet)."""
    mission = deliverable.mission
    return Notification.objects.create(
        type=NotificationType.VALIDATION,
        title="Votre décision a été annulée",
        body=(
            f"Votre {what} de {deliverable.label} (mission « {mission.title} ») a été "
            "annulée par l'agence : il attend de nouveau votre réponse."
        )[:500],
        link=deliverable_link(deliverable),
        mission=mission,
        deliverable=deliverable,
    )
