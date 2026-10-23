from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import Role
from deliverables.models import Deliverable, DeliverableStatus
from deliverables.views import client_visible_q
from missions.scoping import missions_visible_to

from .models import Meeting
from .permissions import MeetingPermission
from .serializers import MeetingSerializer


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def calendar_events(request):
    """Fusionne les échéances de missions, les dépôts de livrables et les
    réunions, comme le fait déjà calendarService.list côté frontend — mais
    ici la portée (missions/livrables visibles) est imposée côté serveur,
    pas filtrée après coup par le client."""
    missions = missions_visible_to(request.user)
    # `type` reflète Mission.task_type (Mission/Livrable/Réunion) plutôt
    # que d'être figé à "mission" : une mission taguée "Réunion" doit filtrer
    # et s'afficher comme telle sur le calendrier, au même titre qu'une vraie
    # réunion — seul le préfixe "ev-" de l'id distingue encore côté frontend
    # une échéance de mission d'un livrable/réunion réellement déposé.
    mission_events = [
        {
            "id": f"ev-{m.id}",
            "title": m.title,
            "date": m.deadline.isoformat(),
            "type": m.task_type,
            "mission_id": str(m.id),
            # Client et projet : filtres du calendrier.
            "client_id": str(m.client_id),
            "project_id": str(m.project_id),
            # Permet au calendrier de reporter sur aujourd'hui une mission
            # échue et pas encore finie (même règle que le dashboard).
            "status": m.status,
        }
        for m in missions
    ]

    deliverables = Deliverable.objects.filter(mission__in=missions).select_related("mission")
    if request.user.role == Role.CLIENT:
        # Même règle que DeliverableViewSet : pas de brouillon interne.
        deliverables = deliverables.filter(client_visible_q(request.user))
    deliverable_events = [
        {
            "id": f"liv-{d.id}",
            "title": d.name,
            "date": d.created_at.date().isoformat(),
            "type": "livrable",
            "mission_id": str(d.mission_id),
            "client_id": str(d.mission.client_id),
            "project_id": str(d.mission.project_id),
        }
        for d in deliverables
    ]

    # Publications programmées : le planning éditorial. Elles restent une
    # fois publiées (`published_at` renseigné), le calendrier les distingue
    # par la couleur ; la description dit où en est le livrable.
    publication_events = []
    for d in deliverables.filter(scheduled_at__isnull=False):
        when = timezone.localtime(d.scheduled_at)
        publication_events.append(
            {
                "id": f"pub-{d.id}",
                "title": d.name,
                "date": when.date().isoformat(),
                "time": f"{when:%H:%M}",
                "type": "publication",
                # Date et heure complètes : le navigateur les affiche dans le
                # fuseau de l'utilisateur ("date"/"time" ci-dessus sont dans
                # celui du serveur, à titre indicatif).
                "scheduled_at": d.scheduled_at.isoformat(),
                "published_at": d.published_at.isoformat() if d.published_at else None,
                "mission_id": str(d.mission_id),
                "client_id": str(d.mission.client_id),
                "project_id": str(d.mission.project_id),
                "deliverable_id": str(d.id),
                "description": publication_readiness(d),
            }
        )

    meeting_events = [
        {**MeetingSerializer(m).data, "date": m.date.isoformat(), "type": "reunion"}
        for m in Meeting.objects.all()
    ]

    return Response(
        [*mission_events, *deliverable_events, *publication_events, *meeting_events]
    )


def publication_readiness(deliverable) -> str:
    if deliverable.published_at:
        return "Publiée."
    if deliverable.status != DeliverableStatus.VALIDE:
        return "En revue chez l'agence."
    if deliverable.client_status == DeliverableStatus.VALIDE:
        return "Prêt à publier."
    if deliverable.client_status == DeliverableStatus.CORRECTIONS:
        return "Corrections demandées par le client."
    return "En attente de la validation du client."



class MeetingViewSet(viewsets.ModelViewSet):
    queryset = Meeting.objects.all()
    serializer_class = MeetingSerializer
    permission_classes = [MeetingPermission]
