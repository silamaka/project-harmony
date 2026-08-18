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
    (voir la note dans services/index.ts, notificationService.list)."""

    serializer_class = MissionSerializer
    permission_classes = [MissionPermission]

    def get_queryset(self):
        queryset = missions_visible_to(self.request.user)
        assignee_id = self.request.query_params.get("assignee")
        if assignee_id:
            queryset = queryset.filter(assignee_id=assignee_id)
        project_id = self.request.query_params.get("project")
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        return queryset
