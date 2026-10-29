from rest_framework.permissions import BasePermission, SAFE_METHODS

from accounts.models import Role


class ClientPermission(BasePermission):
    """Miroir des règles déjà établies côté frontend cette session :
    - Lecture : tout utilisateur authentifié (missions, calendrier, portail
      client... résolvent tous le nom du client depuis la liste complète).
    - Création, modification, suppression : admin OU chef de projet (le
      chef de projet gère les clients comme l'admin).
    """

    def has_permission(self, request, view) -> bool:
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return request.user.role in (Role.ADMIN, Role.CHEF_PROJET)
