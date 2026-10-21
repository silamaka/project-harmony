from accounts.models import Role
from missions.models import MissionStatus

from .models import DeliverableStatus

# Une mission publiée ou terminée est close : plus aucun évènement sur ses
# livrables ne la fait reculer.
CLOSED_MISSION_STATUSES = (MissionStatus.PUBLIE, MissionStatus.TERMINE)
CLIENT_SIDE_MISSION_STATUSES = (
    MissionStatus.ENVOYE_CLIENT,
    MissionStatus.VALIDE,
    MissionStatus.CORRECTIONS,
)


def sync_mission_status(mission) -> None:
    """Le statut d'une mission suit ses livrables (ceux de l'agence, avec un
    lien) ; le client ne le change jamais directement :
    - un livrable envoyé avec des corrections demandées → "Corrections" ;
    - sinon un livrable envoyé qui attend le client → "Envoyé au client" ;
    - tout est envoyé et validé (ou publié) par le client → "Validé" ;
    - le client a traité ce qu'il a reçu mais le reste est encore en revue
      chez l'agence → "Validation interne".
    Rien d'envoyé : la mission reste dans le circuit interne, où l'agence la
    pilote à la main, sauf si elle était côté client (envoi retiré, nouveau
    lien en revue) : elle revient en "Validation interne"."""
    if mission.status in CLOSED_MISSION_STATUSES:
        return
    agency = list(mission.deliverables.exclude(url="").exclude(uploaded_by__role=Role.CLIENT))
    sent = [d for d in agency if d.status == DeliverableStatus.VALIDE]
    awaiting = [d for d in sent if d.published_at is None]

    if not sent:
        if not agency or mission.status not in CLIENT_SIDE_MISSION_STATUSES:
            return
        target = MissionStatus.VALIDATION_INTERNE
    elif any(d.client_status == DeliverableStatus.CORRECTIONS for d in awaiting):
        target = MissionStatus.CORRECTIONS
    elif any(d.client_status != DeliverableStatus.VALIDE for d in awaiting):
        target = MissionStatus.ENVOYE_CLIENT
    elif len(sent) == len(agency):
        target = MissionStatus.VALIDE
    else:
        target = MissionStatus.VALIDATION_INTERNE

    if mission.status != target:
        mission.status = target
        mission.save()
