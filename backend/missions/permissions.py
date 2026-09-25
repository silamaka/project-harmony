from django.db.models import Q
from rest_framework.permissions import BasePermission, SAFE_METHODS

from accounts.models import Role

from .models import Mission, MissionStatus

COLLABORATEUR_EDITABLE_FIELDS = {
    "title",
    "description",
    "sources",
    "task_type",
    "priority",
    "status",
    "start_date",
    "deadline",
    "collaborators",
    "project_id",
    "client_id",
}
CLIENT_EDITABLE_FIELDS = {"status"}
CLIENT_ALLOWED_STATUSES = {MissionStatus.VALIDE, MissionStatus.CORRECTIONS}


class MissionPermission(BasePermission):
    """Création : admin / chef de projet (tout) ou collaborateur (auto-
    limité, voir `_collaborateur_can_create` — miroir de la contrainte déjà
    posée côté frontend par `CreateMissionDialog(lockAssignee, allowedProjectIds)`).

    Modification et suppression :
    - admin / chef de projet : tous les champs, toute mission.
    - collaborateur : uniquement une mission où il est assignee OU
      collaborator ; suppression libre, et modification alignée sur ce
      qu'il peut faire à la création : contenu, dates, contributeurs
      additionnels et projet (limité à son périmètre, comme à la
      création) — jamais le responsable principal (assignee_id).
    - client : uniquement une mission de sa propre entreprise, et
      uniquement le statut (sa décision : Validé / Corrections) — jamais
      la suppression.

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
            return request.user.role in (Role.ADMIN, Role.CHEF_PROJET, Role.COLLABORATEUR)
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
        return MissionPermission._collaborateur_involved_in_project(request.user, project_id)

    @staticmethod
    def _collaborateur_involved_in_project(user, project_id) -> bool:
        return Mission.objects.filter(
            Q(assignee_id=user.id) | Q(collaborators__id=user.id),
            project_id=project_id,
        ).exists()

    @staticmethod
    def _collaborateur_can_move_project(request) -> bool:
        """Changer de projet en modification obéit à la même règle qu'à la
        création : uniquement vers un projet de son périmètre, et le client
        envoyé (s'il l'est) doit être celui du projet."""
        if "project_id" not in request.data:
            return "client_id" not in request.data
        from projects.models import Project

        project = Project.objects.filter(id=request.data.get("project_id")).first()
        if project is None:
            return False
        client_id = request.data.get("client_id")
        if client_id is not None and str(client_id) != str(project.client_id):
            return False
        return MissionPermission._collaborateur_involved_in_project(request.user, project.id)

    def has_object_permission(self, request, view, obj) -> bool:
        if request.method in SAFE_METHODS:
            return True
        if request.user.role in (Role.ADMIN, Role.CHEF_PROJET):
            return True
        if request.user.role == Role.COLLABORATEUR:
            is_involved = obj.assignee_id == request.user.id or obj.collaborators.filter(
                id=request.user.id
            ).exists()
            if request.method == "DELETE":
                return is_involved
            return (
                is_involved
                and set(request.data.keys()) <= COLLABORATEUR_EDITABLE_FIELDS
                and self._collaborateur_can_move_project(request)
            )
        if request.method == "DELETE":
            return False
        fields_sent = set(request.data.keys())
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
