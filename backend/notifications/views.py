from django.db.models import Exists, OuterRef, Q
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.models import Role
from missions.scoping import missions_visible_to

from .models import Notification, NotificationType
from .permissions import NotificationPermission
from .serializers import NotificationSerializer
from .services import CORRECTIONS_REQUESTED_TITLE


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
        return self._scoped(user).annotate(
            is_read=Exists(
                Notification.read_by.through.objects.filter(
                    notification_id=OuterRef("pk"), user_id=user.id
                )
            )
        )

    @staticmethod
    def _scoped(user):
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
        # client (version corrigée à préparer), un rappel de publication. Le reste (validations,
        # envois, alertes écrites pour le client) reste à l'admin et au chef
        # de projet.
        return Notification.objects.filter(mission__in=missions_visible_to(user)).filter(
            Q(type=NotificationType.MISSION_CREEE)
            | Q(type=NotificationType.DECISION_CLIENT, title=CORRECTIONS_REQUESTED_TITLE)
            # Rappels de publication : ce sont eux qui publient.
            | Q(type=NotificationType.PUBLICATION)
        )

    @action(detail=False, methods=["post"], url_path="mark-all-read")
    def mark_all_read(self, request):
        # Seulement pour soi : ne touche jamais l'état "lu" des autres.
        through = Notification.read_by.through
        through.objects.bulk_create(
            [
                through(notification_id=n_id, user_id=request.user.id)
                for n_id in self._scoped(request.user).values_list("id", flat=True)
            ],
            ignore_conflicts=True,
        )
        return Response(
            NotificationSerializer(self.get_queryset(), many=True, context={"request": request}).data
        )
