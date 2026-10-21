from django.db import transaction
from django.db.models import Q
from rest_framework import viewsets

from accounts.models import Role
from comments.models import Comment
from missions.models import MissionStatus
from missions.scoping import missions_visible_to

from .decisions import apply_client_decision
from .models import Deliverable, DeliverableStatus

# Le client ne voit un livrable de l'agence qu'une fois la mission envoyée
# (ou plus loin) : les brouillons en cours de validation interne et les
# livrables encore sans lien ("Lien à venir") restent internes.
CLIENT_VISIBLE_MISSION_STATUSES = (
    MissionStatus.ENVOYE_CLIENT,
    MissionStatus.VALIDE,
    MissionStatus.CORRECTIONS,
    MissionStatus.PUBLIE,
    MissionStatus.TERMINE,
)


def client_visible_q(user):
    """Livrables montrés à un client : ceux que l'agence lui a envoyés, plus
    ceux qu'il a lui-même déposés."""
    return Q(uploaded_by=user) | (
        Q(mission__status__in=CLIENT_VISIBLE_MISSION_STATUSES) & ~Q(url="")
    )
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
        if user.role == Role.CLIENT:
            queryset = queryset.filter(client_visible_q(user))
        return queryset

    def perform_create(self, serializer):
        serializer.save(uploaded_by=self.request.user)

    @transaction.atomic
    def perform_update(self, serializer):
        previous_status = serializer.instance.status
        comment = serializer.validated_data.get("comment", "").strip()
        deliverable = serializer.save()
        user = self.request.user
        if user.role != Role.CLIENT:
            return
        # Statut et explication partent ensemble : l'équipe ne voit jamais un
        # livrable en "Corrections" sans savoir quoi corriger.
        if deliverable.status == DeliverableStatus.CORRECTIONS:
            Comment.objects.create(
                mission=deliverable.mission,
                author=user,
                body=f"Corrections demandées sur le livrable « {deliverable.name} » :\n{comment}",
                client_visible=True,
            )
        if deliverable.status != previous_status:
            apply_client_decision(deliverable, user)
