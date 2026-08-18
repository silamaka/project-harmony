from rest_framework.permissions import BasePermission

from accounts.models import Role


class NotificationPermission(BasePermission):
    """Lecture et marquage lu/non-lu : tout utilisateur authentifié (portée
    déjà imposée par le queryset). Suppression : admin uniquement."""

    def has_permission(self, request, view) -> bool:
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method == "DELETE":
            return request.user.role == Role.ADMIN
        return True
