from rest_framework.permissions import BasePermission, SAFE_METHODS

from accounts.models import Role

from .models import DeliverableStatus

# Décisions ouvertes au client : il valide ou demande des corrections, mais
# ne remet jamais un livrable "En attente" (c'est l'agence qui le fait, en
# changeant le lien).
CLIENT_DECISIONS = (DeliverableStatus.VALIDE, DeliverableStatus.CORRECTIONS)
CLIENT_DECISION_FIELDS = {"client_status", "comment", "categories", "reference_url"}


class DeliverablePermission(BasePermission):
    """Deux validations indépendantes (voir Deliverable) :
    - `status`, la validation de l'agence, qui vaut envoi au client : admin
      ou chef de projet ;
    - `client_status`, la décision du client (Validé ou Corrections, avec
      catégories / détail / exemple facultatifs) : le client, sur un livrable
      de son entreprise que l'agence a validé ; ou l'admin / le chef de
      projet qui l'enregistre pour lui (réponse reçue hors du portail),
      tracé dans `client_decided_by`. Jamais un collaborateur.
    Lecture/dépôt : tout utilisateur authentifié pouvant voir la mission
    (portée déjà imposée par le queryset et par MissionPKField), sauf le
    client qui ne dépose jamais. Publier / dépublier : admin, chef de projet,
    ou collaborateur de la mission. Modifier le nom / le lien : admin, chef
    de projet, ou le collaborateur auteur du dépôt.
    Suppression :
    admin, chef de projet, ou le collaborateur qui a lui-même déposé le
    livrable (jamais celui d'un autre)."""

    def has_permission(self, request, view) -> bool:
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method == "DELETE":
            return request.user.role in (Role.ADMIN, Role.CHEF_PROJET, Role.COLLABORATEUR)
        if request.method == "POST":
            # Un livrable est produit par l'agence : le client le reçoit, le
            # consulte et le valide, mais n'en dépose jamais.
            return request.user.role in (Role.ADMIN, Role.CHEF_PROJET, Role.COLLABORATEUR)
        return True

    def has_object_permission(self, request, view, obj) -> bool:
        if request.method in SAFE_METHODS:
            return True
        fields_sent = set(request.data.keys())
        if request.user.role == Role.CLIENT:
            return (
                obj.mission.client_id == request.user.client_id
                and obj.status == DeliverableStatus.VALIDE
                and fields_sent <= CLIENT_DECISION_FIELDS
                and request.data.get("client_status") in CLIENT_DECISIONS
            )
        if "client_status" in fields_sent:
            # Décision du client enregistrée par l'agence : mêmes règles que
            # pour le client, sans autre champ dans la même requête.
            return (
                request.user.role in (Role.ADMIN, Role.CHEF_PROJET)
                and obj.status == DeliverableStatus.VALIDE
                and fields_sent <= CLIENT_DECISION_FIELDS
                and request.data.get("client_status") in CLIENT_DECISIONS
            )
        if request.user.role in (Role.ADMIN, Role.CHEF_PROJET):
            return True
        if request.method == "DELETE":
            return request.user.role == Role.COLLABORATEUR and obj.uploaded_by_id == request.user.id
        if request.user.role == Role.COLLABORATEUR:
            # Publier un livrable de sa mission (portée déjà imposée par le
            # queryset), mais jamais le valider lui-même.
            if fields_sent <= {"published"}:
                return True
            # Modifier le nom / le lien : seulement son propre dépôt, comme
            # pour la suppression (ex. ajouter le lien d'un livrable annoncé).
            return obj.uploaded_by_id == request.user.id and fields_sent <= {"name", "url"}
        return False
