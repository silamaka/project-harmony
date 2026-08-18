from rest_framework.permissions import BasePermission, SAFE_METHODS

from accounts.models import Role


class DeliverablePermission(BasePermission):
    """Lecture/dépôt : tout utilisateur authentifié pouvant voir la mission
    (portée déjà imposée par le queryset et par MissionPKField). Changer le
    statut (valider / demander des corrections) : admin, chef de projet, ou
    client (sa propre décision côté portail/fiche mission). Suppression :
    admin ou chef de projet uniquement."""

    def has_permission(self, request, view) -> bool:
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method == "DELETE":
            return request.user.role in (Role.ADMIN, Role.CHEF_PROJET)
        return True

    def has_object_permission(self, request, view, obj) -> bool:
        if request.method in SAFE_METHODS or request.method == "DELETE":
            return True
        if request.user.role in (Role.ADMIN, Role.CHEF_PROJET):
            return True
        if request.user.role == Role.CLIENT:
            return obj.mission.client_id == request.user.client_id and set(request.data.keys()) <= {"status"}
        return False
