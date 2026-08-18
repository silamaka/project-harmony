from rest_framework import viewsets

from accounts.models import Role

from .models import Project
from .permissions import ProjectPermission
from .serializers import ProjectSerializer


class ProjectViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectSerializer
    permission_classes = [ProjectPermission]

    def get_queryset(self):
        queryset = Project.objects.all()
        user = self.request.user
        client_id = self.request.query_params.get("client")
        if client_id:
            queryset = queryset.filter(client_id=client_id)
        if user.role == Role.CLIENT:
            queryset = queryset.filter(client_id=user.client_id)
        return queryset
