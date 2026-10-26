"""Utilisateur à l'origine de la requête en cours, pour les notifications.

Une notification naît souvent loin de la vue (signal, service) : plutôt que
de faire passer l'utilisateur partout, on le retient le temps de la requête.
Sa propre action n'apparaît ni dans sa cloche ni en push (voir
Notification.actor).
"""

from contextvars import ContextVar

from rest_framework_simplejwt.authentication import JWTAuthentication

_current_actor: ContextVar = ContextVar("notification_actor", default=None)


def current_actor():
    return _current_actor.get()


class ActorJWTAuthentication(JWTAuthentication):
    """JWT standard, qui retient en plus l'utilisateur authentifié."""

    def authenticate(self, request):
        result = super().authenticate(request)
        if result is not None:
            _current_actor.set(result[0])
        return result


class ResetActorMiddleware:
    """Repart de zéro à chaque requête : un même thread du serveur enchaîne
    des requêtes de personnes différentes."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        token = _current_actor.set(None)
        try:
            return self.get_response(request)
        finally:
            _current_actor.reset(token)
