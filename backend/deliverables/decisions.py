from accounts.models import Role
from missions.models import MissionStatus
from notifications.services import notify_client_decision

from .models import DeliverableStatus

# Une mission n'est synchronisée que lorsqu'elle est du côté du client : on
# ne fait jamais reculer une mission déjà publiée / terminée, ni avancer une
# mission encore en préparation interne.
CLIENT_DECISION_MISSION_STATUSES = (
    MissionStatus.ENVOYE_CLIENT,
    MissionStatus.VALIDE,
    MissionStatus.CORRECTIONS,
)


def apply_client_decision(deliverable, user) -> None:
    """Le client valide les livrables, la mission suit :
    - une demande de corrections sur un livrable passe la mission en
      "Corrections" ;
    - quand tous les livrables envoyés (avec un lien, déposés par l'agence)
      sont validés ou publiés, la mission passe "Validé".
    Et l'équipe est prévenue dans tous les cas."""
    mission = deliverable.mission
    validated = deliverable.status == DeliverableStatus.VALIDE
    notify_client_decision(
        user,
        mission,
        validated=validated,
        subject=f"livrable « {deliverable.name} » (mission « {mission.title} »)",
    )

    if mission.status not in CLIENT_DECISION_MISSION_STATUSES:
        return
    if deliverable.status == DeliverableStatus.CORRECTIONS:
        target = MissionStatus.CORRECTIONS
    elif validated:
        sent = mission.deliverables.exclude(url="").exclude(uploaded_by__role=Role.CLIENT)
        all_done = all(
            d.status == DeliverableStatus.VALIDE or d.published_at is not None for d in sent
        )
        if not all_done:
            return
        target = MissionStatus.VALIDE
    else:
        return
    if mission.status != target:
        mission.status = target
        mission.save()
