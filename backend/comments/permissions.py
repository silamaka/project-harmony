from rest_framework.permissions import BasePermission, SAFE_METHODS

from accounts.models import Role


class CommentPermission(BasePermission):
    """Lecture/publication : tout utilisateur authentifié pouvant voir la
    mission (portée imposée par le queryset et MissionPKField). Modification
    et suppression : réservées à l'auteur du commentaire, ou à l'admin pour
    la suppression (modération)."""

    def has_permission(self, request, view) -> bool:
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method == "PUT":
            return False
        return True

    def has_object_permission(self, request, view, obj) -> bool:
        if request.method in SAFE_METHODS:
            return True
        if request.method == "PATCH":
            return obj.author_id == request.user.id
        if request.method == "DELETE":
            return obj.author_id == request.user.id or request.user.role == Role.ADMIN
        return False
