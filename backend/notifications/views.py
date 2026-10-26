from django.conf import settings
from django.db.models import Exists, OuterRef
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from . import push

from .models import Notification, PushSubscription
from .permissions import NotificationPermission
from .scoping import notifications_visible_to
from .serializers import NotificationSerializer


class NotificationViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Pas de CreateModelMixin (donc pas de POST /notifications/) : les
    notifications ne naissent que des signaux serveur (voir
    notifications/signals.py), jamais d'une requête cliente — un POST direct
    créait jusqu'ici une notification vide (tous les champs substantiels
    sont read_only, donc silencieusement ignorés au lieu d'être rejetés).
    Le POST sur mark-all-read reste inchangé : c'est une action dédiée, pas
    le create() générique."""

    http_method_names = ["get", "patch", "delete", "post", "head", "options"]
    serializer_class = NotificationSerializer
    permission_classes = [NotificationPermission]

    def get_queryset(self):
        user = self.request.user
        # "Lu" calculé pour l'utilisateur connecté, en une seule requête.
        return notifications_visible_to(user).annotate(
            is_read=Exists(
                Notification.read_by.through.objects.filter(
                    notification_id=OuterRef("pk"), user_id=user.id
                )
            )
        )

    @action(detail=False, methods=["post"], url_path="mark-all-read")
    def mark_all_read(self, request):
        # Seulement pour soi : ne touche jamais l'état "lu" des autres.
        through = Notification.read_by.through
        through.objects.bulk_create(
            [
                through(notification_id=n_id, user_id=request.user.id)
                for n_id in notifications_visible_to(request.user).values_list("id", flat=True)
            ],
            ignore_conflicts=True,
        )
        return Response(
            NotificationSerializer(self.get_queryset(), many=True, context={"request": request}).data
        )


class PushSubscriptionView(APIView):
    """Notifications push de l'appareil courant.

    GET : clé publique VAPID (le navigateur en a besoin pour s'abonner) ;
    `enabled` faux si le serveur n'a pas de clés configurées.
    POST : enregistre l'abonnement du navigateur pour l'utilisateur connecté.
    Le même appareil réutilisé par un autre compte lui est réattribué.
    DELETE : retire l'abonnement de cet appareil (`endpoint`).
    """

    def get(self, request):
        return Response(
            {"enabled": push.push_enabled(), "public_key": settings.VAPID_PUBLIC_KEY}
        )

    def post(self, request):
        endpoint = str(request.data.get("endpoint", "")).strip()
        keys = request.data.get("keys") or {}
        p256dh = str(keys.get("p256dh", "")).strip()
        auth = str(keys.get("auth", "")).strip()
        if not (endpoint.startswith("https://") and p256dh and auth):
            return Response(
                {"detail": "Abonnement push invalide."}, status=status.HTTP_400_BAD_REQUEST
            )
        PushSubscription.objects.update_or_create(
            endpoint=endpoint,
            defaults={
                "user": request.user,
                "p256dh": p256dh,
                "auth": auth,
                "user_agent": request.headers.get("User-Agent", "")[:300],
            },
        )
        return Response(status=status.HTTP_201_CREATED)

    def delete(self, request):
        endpoint = str(request.data.get("endpoint", "")).strip()
        PushSubscription.objects.filter(endpoint=endpoint, user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
