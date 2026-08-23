from django.db import transaction
from rest_framework.permissions import SAFE_METHODS
from rest_framework import viewsets

from .permissions import MissionPermission
from .scoping import missions_visible_to
from .serializers import MissionSerializer


class MissionViewSet(viewsets.ModelViewSet):
    """La portée en lecture est restreinte par rôle avant tout filtre de
    requête : un collaborateur ne reçoit jamais les missions d'un·e autre,
    un client jamais celles d'une autre entreprise — ce filtrage vit dans
    missions_visible_to (scoping.py), réutilisé par DeliverableViewSet et
    CommentViewSet, plutôt que d'être appliqué après coup côté frontend
    (voir la note dans services/index.ts, notificationService.list).

    Verrouillage en écriture : sans lui, deux décisions concurrentes sur la
    même mission (ex. l'admin qui la valide pendant que le client demande
    des corrections) s'écrasent silencieusement l'une l'autre — la
    dernière requête gagne sans qu'aucune des deux ne le sache, laissant
    un statut incohérent avec ce que chacun croit avoir fait. `SELECT ...
    FOR UPDATE` sérialise ces requêtes : la seconde attend que la première
    ait fini, puis relit le statut à jour — ce qui fait retomber sur elle
    la même règle de permission que d'habitude (ex. le client ne peut
    valider/demander des corrections que si le statut est encore
    "envoyé au client"), au lieu d'écraser aveuglément."""

    serializer_class = MissionSerializer
    permission_classes = [MissionPermission]

    def get_queryset(self):
        queryset = missions_visible_to(self.request.user)
        if self.request.method not in SAFE_METHODS:
            queryset = queryset.select_for_update()
        assignee_id = self.request.query_params.get("assignee")
        if assignee_id:
            queryset = queryset.filter(assignee_id=assignee_id)
        project_id = self.request.query_params.get("project")
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        return queryset

    def update(self, request, *args, **kwargs):
        with transaction.atomic():
            return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        with transaction.atomic():
            return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        with transaction.atomic():
            return super().destroy(request, *args, **kwargs)
