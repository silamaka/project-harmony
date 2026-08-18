from rest_framework.permissions import BasePermission

from accounts.models import Role


class IsAdminOrChefProjet(BasePermission):
    """Le Dashboard et les Statistiques ne sont accessibles côté frontend
    qu'à admin et chef de projet (allow=["admin", "chef_projet"]) — les
    agrégats globaux qu'ils exposent n'ont pas de sens scopés par
    utilisateur, donc l'endpoint entier leur est réservé plutôt que de
    tenter un filtrage partiel."""

    def has_permission(self, request, view) -> bool:
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in (Role.ADMIN, Role.CHEF_PROJET)
        )
