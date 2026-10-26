"""Envoi des notifications push (Web Push) vers les appareils abonnés.

Chaque notification créée part, en plus de la cloche, sur les appareils des
personnes qui la voient (notifications_visible_to). L'envoi passe par le
service push du navigateur (Google, Apple, Mozilla), authentifié par la paire
de clés VAPID du serveur (settings.VAPID_*). Sans ces clés, rien n'est envoyé.
"""

import json
import logging
import threading

from django.conf import settings
from django.db import transaction

from .models import Notification, PushSubscription
from .scoping import notifications_visible_to

logger = logging.getLogger(__name__)


def push_enabled() -> bool:
    return bool(settings.VAPID_PUBLIC_KEY and settings.VAPID_PRIVATE_KEY)


def recipients_of(notification: Notification):
    """Abonnements des utilisateurs actifs qui voient cette notification."""
    subscriptions = PushSubscription.objects.filter(user__is_active=True).select_related("user")
    by_user = {}
    for sub in subscriptions:
        by_user.setdefault(sub.user, []).append(sub)
    return [
        sub
        for user, subs in by_user.items()
        if notifications_visible_to(user).filter(pk=notification.pk).exists()
        for sub in subs
    ]


def send_to(subscription: PushSubscription, payload: dict) -> None:
    from pywebpush import WebPushException, webpush

    try:
        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
            },
            data=json.dumps(payload),
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": settings.VAPID_SUBJECT},
            ttl=24 * 3600,
            timeout=10,
        )
    except WebPushException as exc:
        status = getattr(exc.response, "status_code", None)
        # 404 / 410 : l'appareil s'est désabonné (permission retirée,
        # navigateur réinstallé...). L'abonnement ne servira plus jamais.
        if status in (404, 410):
            subscription.delete()
        else:
            logger.warning("Push refusé (%s) pour %s : %s", status, subscription.user_id, exc)
    except Exception:  # réseau, service push indisponible : ne bloque jamais le reste
        logger.exception("Échec d'envoi push pour %s", subscription.user_id)


def deliver(notification_id: int) -> None:
    notification = Notification.objects.filter(pk=notification_id).first()
    if notification is None:
        return
    payload = {
        "title": notification.title,
        "body": notification.body,
        "url": notification.link or "/notifications",
        # Une notification remplace la précédente du même objet au lieu de
        # s'empiler sur l'écran (ex. plusieurs rappels du même livrable).
        "tag": f"olympe-{notification.deliverable_id or notification.mission_id or notification.pk}",
    }
    for subscription in recipients_of(notification):
        send_to(subscription, payload)


def schedule(notification: Notification) -> None:
    """Envoie après validation de la transaction, hors de la requête : les
    services push peuvent mettre plusieurs secondes à répondre, l'action de
    l'utilisateur (valider, déposer...) ne doit jamais les attendre."""
    if not push_enabled():
        return
    if getattr(settings, "PUSH_SYNC", False):
        transaction.on_commit(lambda: deliver(notification.pk))
        return
    transaction.on_commit(
        lambda: threading.Thread(target=_deliver_in_thread, args=(notification.pk,), daemon=True).start()
    )


def _deliver_in_thread(notification_id: int) -> None:
    from django.db import connection

    try:
        deliver(notification_id)
    finally:
        # Le thread a ouvert sa propre connexion : la rendre au lieu de la laisser fuir.
        connection.close()
