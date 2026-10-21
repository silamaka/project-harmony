from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import viewsets

from accounts.models import Role
from comments.models import Comment
from missions.scoping import missions_visible_to
from notifications.services import notify_client_decision, notify_deliverable_sent

from .decisions import sync_mission_status
from .models import Deliverable, DeliverableStatus
from .permissions import DeliverablePermission
from .serializers import DeliverableSerializer


def client_visible_q(user):
    """Livrables montrés à un client : ceux que l'agence a validés (sa
    validation vaut envoi) et qui ont un lien, plus ceux qu'il a lui-même
    déposés. Les dépôts encore en revue chez l'agence restent internes, quel
    que soit le statut de la mission."""
    return Q(uploaded_by=user) | (Q(status=DeliverableStatus.VALIDE) & ~Q(url=""))


def is_sent_to_client(deliverable) -> bool:
    return deliverable.status == DeliverableStatus.VALIDE and bool(deliverable.url)


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

    @transaction.atomic
    def perform_create(self, serializer):
        deliverable = serializer.save(uploaded_by=self.request.user)
        sync_mission_status(deliverable.mission)

    @transaction.atomic
    def perform_update(self, serializer):
        was_sent = is_sent_to_client(serializer.instance)
        previous_client_status = serializer.instance.client_status
        comment = serializer.validated_data.get("comment", "").strip()
        deliverable = serializer.save()
        user = self.request.user

        if user.role == Role.CLIENT:
            # Décision et explication partent ensemble : l'équipe ne voit
            # jamais un livrable en "Corrections" sans savoir quoi corriger.
            # L'explication s'affiche sur le livrable même, et reste dans la
            # discussion pour l'historique.
            if deliverable.client_status == DeliverableStatus.CORRECTIONS:
                deliverable.client_feedback = comment
                deliverable.client_feedback_at = timezone.now()
                Comment.objects.create(
                    mission=deliverable.mission,
                    author=user,
                    body=f"Corrections demandées sur le livrable {deliverable.label} :\n{comment}",
                    client_visible=True,
                )
            else:
                deliverable.client_feedback = ""
                deliverable.client_feedback_at = None
            deliverable.save(update_fields=["client_feedback", "client_feedback_at"])
            if deliverable.client_status != previous_client_status:
                notify_client_decision(
                    user,
                    deliverable.mission,
                    validated=deliverable.client_status == DeliverableStatus.VALIDE,
                    subject=f"livrable {deliverable.label} (mission « {deliverable.mission.title} »)",
                    deliverable=deliverable,
                )
        elif not was_sent and is_sent_to_client(deliverable):
            notify_deliverable_sent(deliverable)

        sync_mission_status(deliverable.mission)

    @transaction.atomic
    def perform_destroy(self, instance):
        mission = instance.mission
        instance.delete()
        sync_mission_status(mission)
