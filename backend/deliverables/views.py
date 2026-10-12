from rest_framework import viewsets

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
        # Un collaborateur voit tous les livrables de ses missions, qui que
        # soit le déposant ; DeliverablePermission limite ce qu'il peut en
        # faire (supprimer seulement ses dépôts, jamais valider).
        return queryset

    def perform_create(self, serializer):
        serializer.save(uploaded_by=self.request.user)
