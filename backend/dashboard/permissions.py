from rest_framework.permissions import BasePermission

from accounts.models import Role


class IsAdminOrChefProjet(BasePermission):
    """Le Dashboard est accessible à admin, chef de projet et collaborateur
    (allow=["admin", "chef_projet", "collaborateur"]) — sur demande, le
    collaborateur y voit les mêmes agrégats globaux non scopés que l'admin
    (pas de filtrage par utilisateur). Les Statistiques restent réservées à
    admin/chef de projet. Nom de classe conservé pour ne pas renommer les
    imports dans toutes les vues ci-dessous."""

    def has_permission(self, request, view) -> bool:
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in (Role.ADMIN, Role.CHEF_PROJET, Role.COLLABORATEUR)
        )
