from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import Role
from deliverables.models import Deliverable, DeliverableStatus
from deliverables.views import client_visible_q
from missions.models import TaskType
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
    is_client = request.user.role == Role.CLIENT
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
        # Le client ne voit que les descentes (tournage, visite chez lui) :
        # les échéances internes sont les délais de l'équipe, pas les siens.
        for m in (missions.filter(task_type=TaskType.DESCENTE) if is_client else missions)
    ]

    deliverables = Deliverable.objects.filter(mission__in=missions).select_related("mission")
    if is_client:
        # Même règle que DeliverableViewSet : pas de brouillon interne.
        deliverables = deliverables.filter(client_visible_q(request.user))
    # Équipe : date de dépôt. Client : date à laquelle l'agence le lui a
    # envoyé, c'est-à-dire quand il est devenu disponible pour lui.
    if is_client:
        deliverable_events = [
            available_event(d) for d in deliverables.filter(sent_at__isnull=False)
        ]
    else:
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
                "description": publication_readiness(d, for_client=is_client),
                # Le client doit encore valider : mis en avant dans son calendrier.
                "awaiting_client": d.status == DeliverableStatus.VALIDE
                and d.client_status == DeliverableStatus.EN_ATTENTE
                and not d.published_at,
            }
        )

    # Les réunions (modèle Meeting) ne sont plus affichées au calendrier :
    # les déplacements passent par les missions de type "Descente".
    return Response([*mission_events, *deliverable_events, *publication_events])


def available_event(deliverable) -> dict:
    """Livrable disponible pour le client, à la date où l'agence l'a envoyé."""
    when = timezone.localtime(deliverable.sent_at)
    awaiting = deliverable.client_status == DeliverableStatus.EN_ATTENTE
    return {
        "id": f"liv-{deliverable.id}",
        "title": deliverable.name,
        "date": when.date().isoformat(),
        "time": f"{when:%H:%M}",
        "type": "livrable",
        # Date et heure complètes : affichées dans le fuseau du navigateur.
        "available_at": deliverable.sent_at.isoformat(),
        "mission_id": str(deliverable.mission_id),
        "client_id": str(deliverable.mission.client_id),
        "project_id": str(deliverable.mission.project_id),
        "deliverable_id": str(deliverable.id),
        "awaiting_client": awaiting,
        "description": (
            "Disponible : il attend votre validation."
            if awaiting
            else "Vous l'avez validé."
            if deliverable.client_status == DeliverableStatus.VALIDE
            else "Vous avez demandé des corrections : l'agence prépare une nouvelle version."
        ),
    }


def publication_readiness(deliverable, *, for_client=False) -> str:
    if deliverable.published_at:
        return "Publiée."
    if deliverable.status != DeliverableStatus.VALIDE:
        return "En revue chez l'agence."
    if deliverable.client_status == DeliverableStatus.VALIDE:
        return "Validé, prêt à publier." if for_client else "Prêt à publier."
    if deliverable.client_status == DeliverableStatus.CORRECTIONS:
        return (
            "Vous avez demandé des corrections : l'agence prépare une nouvelle version."
            if for_client
            else "Corrections demandées par le client."
        )
    return "En attente de votre validation." if for_client else "En attente de la validation du client."



class MeetingViewSet(viewsets.ModelViewSet):
    queryset = Meeting.objects.all()
    serializer_class = MeetingSerializer
    permission_classes = [MeetingPermission]
