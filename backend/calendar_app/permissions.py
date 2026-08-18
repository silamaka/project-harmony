from rest_framework.permissions import BasePermission, SAFE_METHODS

from accounts.models import Role


class MeetingPermission(BasePermission):
    """CRUD des réunions : admin, chef de projet ou collaborateur — mêmes
    rôles qui ont accès à la page Calendrier côté frontend (un client n'y
    est pas exposé dans la navigation)."""

    def has_permission(self, request, view) -> bool:
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return request.user.role in (Role.ADMIN, Role.CHEF_PROJET, Role.COLLABORATEUR)
