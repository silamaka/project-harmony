from rest_framework.permissions import BasePermission, SAFE_METHODS

from accounts.models import Role

COLLABORATEUR_EDITABLE_FIELDS = {"status", "priority"}
CLIENT_EDITABLE_FIELDS = {"status"}


class MissionPermission(BasePermission):
    """Création / suppression : admin ou chef de projet uniquement.

    Modification :
    - admin / chef de projet : tous les champs, toute mission.
    - collaborateur : uniquement sa propre mission (assignee), et
      uniquement statut/priorité (édition en ligne du tableau).
    - client : uniquement une mission de sa propre entreprise, et
      uniquement le statut (sa décision : Validé / Corrections).

    La portée en lecture (un collaborateur ne voit que ses missions, un
    client que celles de son entreprise) est gérée par
    MissionViewSet.get_queryset, pas ici.
    """

    def has_permission(self, request, view) -> bool:
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        if request.method == "POST" or request.method == "DELETE":
            return request.user.role in (Role.ADMIN, Role.CHEF_PROJET)
        return request.user.role in (Role.ADMIN, Role.CHEF_PROJET, Role.COLLABORATEUR, Role.CLIENT)

    def has_object_permission(self, request, view, obj) -> bool:
        if request.method in SAFE_METHODS:
            return True
        if request.user.role in (Role.ADMIN, Role.CHEF_PROJET):
            return True
        if request.method == "DELETE":
            return False
        fields_sent = set(request.data.keys())
        if request.user.role == Role.COLLABORATEUR:
            return obj.assignee_id == request.user.id and fields_sent <= COLLABORATEUR_EDITABLE_FIELDS
        if request.user.role == Role.CLIENT:
            return obj.client_id == request.user.client_id and fields_sent <= CLIENT_EDITABLE_FIELDS
        return False
