from rest_framework import viewsets

from accounts.models import Role

from .models import Mission
from .permissions import MissionPermission
from .serializers import MissionSerializer


class MissionViewSet(viewsets.ModelViewSet):
    """La portée en lecture est restreinte par rôle avant tout filtre de
    requête : un collaborateur ne reçoit jamais les missions d'un·e autre,
    un client jamais celles d'une autre entreprise — ce filtrage vit ici
    plutôt que d'être appliqué après coup côté frontend (voir la note dans
    services/index.ts, notificationService.list)."""

    serializer_class = MissionSerializer
    permission_classes = [MissionPermission]

    def get_queryset(self):
        user = self.request.user
        queryset = Mission.objects.all()
        if user.role == Role.COLLABORATEUR:
            queryset = queryset.filter(assignee=user)
        elif user.role == Role.CLIENT:
            queryset = queryset.filter(client_id=user.client_id)
        assignee_id = self.request.query_params.get("assignee")
        if assignee_id:
            queryset = queryset.filter(assignee_id=assignee_id)
        project_id = self.request.query_params.get("project")
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        return queryset
