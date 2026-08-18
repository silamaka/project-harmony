from rest_framework.permissions import BasePermission, SAFE_METHODS

from accounts.models import Role


class CommentPermission(BasePermission):
    """Lecture/publication : tout utilisateur authentifié pouvant voir la
    mission (portée imposée par le queryset et MissionPKField). Les
    commentaires sont immuables une fois postés (pas d'édition côté
    frontend) ; seule la suppression (modération) est possible, réservée à
    l'admin."""

    def has_permission(self, request, view) -> bool:
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in ("PUT", "PATCH"):
            return False
        if request.method == "DELETE":
            return request.user.role == Role.ADMIN
        return True

    def has_object_permission(self, request, view, obj) -> bool:
        return request.method in SAFE_METHODS or (
            request.method == "DELETE" and request.user.role == Role.ADMIN
        )
