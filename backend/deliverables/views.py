from rest_framework import viewsets

from accounts.models import Role
from missions.scoping import missions_visible_to

from .models import Deliverable
from .permissions import DeliverablePermission
from .serializers import DeliverableSerializer


class DeliverableViewSet(viewsets.ModelViewSet):
    serializer_class = DeliverableSerializer
    permission_classes = [DeliverablePermission]

    def get_queryset(self):
        user = self.request.user
        queryset = Deliverable.objects.filter(mission__in=missions_visible_to(user))
        mission_id = self.request.query_params.get("mission")
        if mission_id:
            queryset = queryset.filter(mission_id=mission_id)
        elif user.role == Role.COLLABORATEUR:
            # Vue "Livrables" hors détail d'une mission précise : un
            # collaborateur n'y voit que ses propres dépôts, même sur une
            # mission partagée avec d'autres.
            queryset = queryset.filter(uploaded_by=user)
        return queryset

    def perform_create(self, serializer):
        serializer.save(uploaded_by=self.request.user)
