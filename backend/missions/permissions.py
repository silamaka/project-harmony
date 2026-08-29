from django.db.models import Q
from rest_framework.permissions import BasePermission, SAFE_METHODS

from accounts.models import Role

from .models import Mission, MissionStatus

COLLABORATEUR_EDITABLE_FIELDS = {"status", "priority"}
CLIENT_EDITABLE_FIELDS = {"status"}
CLIENT_ALLOWED_STATUSES = {MissionStatus.VALIDE, MissionStatus.CORRECTIONS}


class MissionPermission(BasePermission):
    """Création : admin / chef de projet (tout) ou collaborateur (auto-
    limité, voir `_collaborateur_can_create` — miroir de la contrainte déjà
    posée côté frontend par `CreateMissionDialog(lockAssignee, allowedProjectIds)`).
    Suppression : admin ou chef de projet uniquement.

    Modification :
    - admin / chef de projet : tous les champs, toute mission.
    - collaborateur : uniquement une mission où il est assignee OU
      collaborator, et uniquement statut/priorité (édition en ligne du
      tableau).
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
        if request.method == "DELETE":
            return request.user.role in (Role.ADMIN, Role.CHEF_PROJET)
        if request.method == "POST":
            if request.user.role in (Role.ADMIN, Role.CHEF_PROJET):
                return True
            if request.user.role == Role.COLLABORATEUR:
                return self._collaborateur_can_create(request)
            return False
        return request.user.role in (Role.ADMIN, Role.CHEF_PROJET, Role.COLLABORATEUR, Role.CLIENT)

    @staticmethod
    def _collaborateur_can_create(request) -> bool:
        """Un collaborateur ne peut créer une mission que pour lui-même, et
        uniquement sur un projet où il est déjà impliqué (assignee ou
        collaborator d'au moins une mission) — jamais pour un tiers ni hors
        de son périmètre. Vérifié côté serveur : ce que le frontend
        restreint dans le formulaire (allowedProjectIds) n'est qu'un
        confort d'UI, pas une garantie de sécurité."""
        if str(request.data.get("assignee_id") or "") != str(request.user.id):
            return False
        project_id = request.data.get("project_id")
        if not project_id:
            return False
        return Mission.objects.filter(
            Q(assignee_id=request.user.id) | Q(collaborators__id=request.user.id),
            project_id=project_id,
        ).exists()

    def has_object_permission(self, request, view, obj) -> bool:
        if request.method in SAFE_METHODS:
            return True
        if request.user.role in (Role.ADMIN, Role.CHEF_PROJET):
            return True
        if request.method == "DELETE":
            return False
        fields_sent = set(request.data.keys())
        if request.user.role == Role.COLLABORATEUR:
            is_involved = obj.assignee_id == request.user.id or obj.collaborators.filter(
                id=request.user.id
            ).exists()
            return is_involved and fields_sent <= COLLABORATEUR_EDITABLE_FIELDS
        if request.user.role == Role.CLIENT:
            if not (obj.client_id == request.user.client_id and fields_sent <= CLIENT_EDITABLE_FIELDS):
                return False
            # Le client ne peut valider / demander des corrections que
            # lorsque c'est effectivement son tour (mission déjà envoyée),
            # pas à n'importe quel stade du pipeline interne.
            if "status" in request.data:
                return (
                    obj.status == MissionStatus.ENVOYE_CLIENT
                    and request.data["status"] in CLIENT_ALLOWED_STATUSES
                )
            return True
        return False
