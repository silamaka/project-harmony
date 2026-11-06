from rest_framework.permissions import SAFE_METHODS, BasePermission

from accounts.models import Role


class CampaignPermission(BasePermission):
    """Lecture : l'équipe (et le client pour ses campagnes lancées, portée
    imposée par le queryset). Écriture, relevés compris : admin et chef de
    projet, qui gèrent les clients et leurs budgets."""

    def has_permission(self, request, view) -> bool:
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return request.user.role in (Role.ADMIN, Role.CHEF_PROJET)
