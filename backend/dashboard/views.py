from datetime import date, timedelta

from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.models import Role, User
from clients.models import Client
from deliverables.models import Deliverable, DeliverableStatus
from deliverables.serializers import DeliverableSerializer
from missions.models import DONE_STATUSES, Mission, MissionStatus
from missions.serializers import MissionSerializer
from projects.models import Project

from .permissions import IsAdminOrChefProjet


def late_missions_queryset():
    return Mission.objects.filter(deadline__lt=date.today()).exclude(status__in=DONE_STATUSES)


@api_view(["GET"])
@permission_classes([IsAdminOrChefProjet])
def stats(request):
    return Response(
        {
            "clients": Client.objects.count(),
            "projects": Project.objects.count(),
            "missions": Mission.objects.count(),
            "collaborators": User.objects.filter(role=Role.COLLABORATEUR).count(),
            "deliverables": Deliverable.objects.count(),
            "late_missions": late_missions_queryset().count(),
        }
    )


@api_view(["GET"])
@permission_classes([IsAdminOrChefProjet])
def missions_by_client(request):
    data = [
        {"name": c.name, "missions": Mission.objects.filter(client=c).count()}
        for c in Client.objects.all()
    ]
    return Response(data)


@api_view(["GET"])
@permission_classes([IsAdminOrChefProjet])
def missions_by_collaborator(request):
    data = [
        {"name": f"{u.first_name} {u.last_name}", "missions": Mission.objects.filter(assignee=u).count()}
        for u in User.objects.filter(role=Role.COLLABORATEUR)
    ]
    return Response(data)


@api_view(["GET"])
@permission_classes([IsAdminOrChefProjet])
def monthly(request):
    # Pas d'historique agrégé par mois stocké pour l'instant (donnée
    # honnêtement vide plutôt que fabriquée) — à construire quand un
    # vrai besoin de reporting historique apparaît.
    return Response([])


@api_view(["GET"])
@permission_classes([IsAdminOrChefProjet])
def completion_rate(request):
    total = Mission.objects.count()
    if not total:
        return Response(0)
    done = Mission.objects.filter(status__in=DONE_STATUSES).count()
    return Response(round(done / total * 100))


@api_view(["GET"])
@permission_classes([IsAdminOrChefProjet])
def alerts(request):
    # `deadline` est un DateField (pas d'heure) : "dans 24h"/"dans 48h" se
    # traduit au niveau du jour plutôt qu'une fenêtre glissante à l'heure
    # près. "Dans 24h" couvre aujourd'hui ET demain (pas seulement demain) :
    # une mission due aujourd'hui même est la plus urgente de toutes, et ne
    # devient "en retard" (late_missions_queryset) qu'à partir de demain —
    # sans ça elle ne déclenchait aucune alerte pendant toute sa journée
    # d'échéance. Les deux exclut les missions déjà terminées, comme
    # late_missions_queryset.
    today = date.today()
    in_24h_qs = Mission.objects.filter(
        deadline__gte=today, deadline__lte=today + timedelta(days=1)
    ).exclude(status__in=DONE_STATUSES)
    in_48h_qs = Mission.objects.filter(deadline=today + timedelta(days=2)).exclude(
        status__in=DONE_STATUSES
    )
    blocked_qs = Mission.objects.filter(status=MissionStatus.CORRECTIONS)
    pending_qs = Deliverable.objects.filter(status=DeliverableStatus.EN_ATTENTE)

    return Response(
        {
            "in24h": MissionSerializer(in_24h_qs, many=True).data,
            "in48h": MissionSerializer(in_48h_qs, many=True).data,
            "blocked": MissionSerializer(blocked_qs, many=True).data,
            "pendingDeliverables": DeliverableSerializer(pending_qs, many=True).data,
        }
    )
