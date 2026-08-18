from rest_framework import viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from deliverables.models import Deliverable
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
    mission_events = [
        {
            "id": f"ev-{m.id}",
            "title": m.title,
            "date": m.deadline.isoformat(),
            "type": "mission",
            "mission_id": str(m.id),
        }
        for m in missions
    ]

    deliverables = Deliverable.objects.filter(mission__in=missions)
    deliverable_events = [
        {
            "id": f"liv-{d.id}",
            "title": d.name,
            "date": d.created_at.date().isoformat(),
            "type": "livrable",
            "mission_id": str(d.mission_id),
        }
        for d in deliverables
    ]

    meeting_events = [
        {**MeetingSerializer(m).data, "date": m.date.isoformat(), "type": "reunion"}
        for m in Meeting.objects.all()
    ]

    return Response([*mission_events, *deliverable_events, *meeting_events])


class MeetingViewSet(viewsets.ModelViewSet):
    queryset = Meeting.objects.all()
    serializer_class = MeetingSerializer
    permission_classes = [MeetingPermission]
