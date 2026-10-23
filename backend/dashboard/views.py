from datetime import date, timedelta

from django.db.models import Count, Q
from django.db.models.functions import TruncMonth
from django.utils import timezone
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
        {
            "name": f"{u.first_name} {u.last_name}",
            "missions": Mission.objects.filter(Q(assignee=u) | Q(collaborators=u)).distinct().count(),
        }
        for u in User.objects.filter(role=Role.COLLABORATEUR)
    ]
    return Response(data)


MONTH_LABELS = [
    "janv.", "févr.", "mars", "avr.", "mai", "juin",
    "juil.", "août", "sept.", "oct.", "nov.", "déc.",
]


@api_view(["GET"])
@permission_classes([IsAdminOrChefProjet])
def monthly(request):
    """Missions créées et livrables déposés par mois, depuis le mois de la
    première mission de la plateforme jusqu'au mois en cours, calculés depuis
    leur date de création. Pas de mois vides avant le démarrage ; les creux
    d'activité ensuite valent 0 pour garder une courbe continue."""
    today = timezone.localdate()
    first = Mission.objects.order_by("created_at").values_list("created_at", flat=True).first()
    start = timezone.localtime(first).date() if first else today
    months = []
    year, month = start.year, start.month
    while (year, month) <= (today.year, today.month):
        months.append((year, month))
        year, month = (year, month + 1) if month < 12 else (year + 1, 1)
    since = timezone.make_aware(
        timezone.datetime(months[0][0], months[0][1], 1), timezone.get_current_timezone()
    )

    def per_month(queryset):
        rows = (
            queryset.filter(created_at__gte=since)
            .annotate(m=TruncMonth("created_at"))
            .values("m")
            .annotate(n=Count("id"))
        )
        return {(row["m"].year, row["m"].month): row["n"] for row in rows}

    missions = per_month(Mission.objects.all())
    deliverables = per_month(Deliverable.objects.all())
    return Response(
        [
            {
                "month": f"{MONTH_LABELS[m - 1]} {y % 100:02d}",
                "missions": missions.get((y, m), 0),
                "livrables": deliverables.get((y, m), 0),
            }
            for y, m in months
        ]
    )



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
    # Publications à risque : prévues dans les 48 h et pas prêtes (validation
    # agence ou client manquante), ou dont la date est passée sans
    # publication.
    now = timezone.now()
    ready = Q(status=DeliverableStatus.VALIDE, client_status=DeliverableStatus.VALIDE)
    at_risk_qs = (
        Deliverable.objects.filter(
            published_at__isnull=True,
            scheduled_at__isnull=False,
            scheduled_at__lte=now + timedelta(hours=48),
        )
        .filter(~ready | Q(scheduled_at__lt=now))
        .order_by("scheduled_at")
    )
    # À valider par l'agence (avant envoi au client) : sans lien, rien à revoir.
    pending_qs = Deliverable.objects.filter(status=DeliverableStatus.EN_ATTENTE).exclude(url="")

    return Response(
        {
            "in24h": MissionSerializer(in_24h_qs, many=True).data,
            "in48h": MissionSerializer(in_48h_qs, many=True).data,
            "blocked": MissionSerializer(blocked_qs, many=True).data,
            "pendingDeliverables": DeliverableSerializer(pending_qs, many=True).data,
            "publicationsAtRisk": DeliverableSerializer(at_risk_qs, many=True).data,
        }
    )
