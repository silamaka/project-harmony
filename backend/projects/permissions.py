from rest_framework.permissions import BasePermission, SAFE_METHODS

from accounts.models import Role


class ProjectPermission(BasePermission):
    """Lecture : tout utilisateur authentifié (le portail client affiche les
    projets du client). Écriture : admin ou chef de projet uniquement — seuls
    ces deux rôles atteignent la page /projets côté frontend."""

    def has_permission(self, request, view) -> bool:
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return request.user.role in (Role.ADMIN, Role.CHEF_PROJET)
