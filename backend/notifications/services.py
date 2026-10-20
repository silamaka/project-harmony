from .models import Notification, NotificationType


def notify_client_decision(user, mission, *, validated: bool, subject: str) -> Notification:
    """Prévient l'équipe d'une décision du client (validation ou demande de
    corrections) sur une mission ou un de ses livrables. Sans cela, la
    réponse du client pouvait rester des jours sans être vue.

    Portée : comme toute notification, dérivée de `mission`
    (NotificationViewSet) — admin, chef de projet et collaborateurs de la
    mission la voient ; le client, lui, ne voit que le type VALIDATION."""
    who = f"{user.first_name} {user.last_name}".strip() or user.email
    company = mission.client.name if mission.client_id else ""
    author = f"{who} ({company})" if company else who
    return Notification.objects.create(
        type=NotificationType.DECISION_CLIENT,
        title="Validé par le client" if validated else "Corrections demandées par le client",
        body=f"{author} — {subject}"[:500],
        link=f"/missions/{mission.id}",
        mission=mission,
    )
