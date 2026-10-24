from rest_framework.permissions import BasePermission, SAFE_METHODS

from accounts.models import Role


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


class MissionPermission(BasePermission):
    """Création : admin / chef de projet (tout) ou collaborateur (pour
    lui-même uniquement, sur n'importe quel projet — voir
    `_collaborateur_can_create`, miroir de `CreateMissionDialog(lockAssignee)`).

    Modification et suppression :
    - admin / chef de projet : tous les champs, toute mission.
    - collaborateur : uniquement une mission où il est assignee OU
      collaborator ; suppression libre, et modification alignée sur ce
      qu'il peut faire à la création : contenu, dates, contributeurs
      additionnels et projet (n'importe lequel, comme à la création) —
      jamais le responsable principal (assignee_id).
    - client : jamais. Il valide ou refuse les livrables, et le statut de
      la mission en découle (deliverables.decisions.sync_mission_status).

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
        return request.user.role in (Role.ADMIN, Role.CHEF_PROJET, Role.COLLABORATEUR)

    @staticmethod
    def _collaborateur_can_create(request) -> bool:
        """Un collaborateur crée une mission pour lui-même uniquement (jamais
        pour un tiers), sur le projet de son choix : tous les projets lui
        sont ouverts, un projet neuf compris. Vérifié côté serveur, le
        formulaire verrouillé n'étant qu'un confort d'UI."""
        if str(request.data.get("assignee_id") or "") != str(request.user.id):
            return False
        from projects.models import Project

        project_id = request.data.get("project_id")
        return bool(project_id) and Project.objects.filter(id=project_id).exists()

    @staticmethod
    def _collaborateur_can_move_project(request) -> bool:
        """Changer de projet en modification obéit à la même règle qu'à la
        création : n'importe quel projet existant, et le client envoyé (s'il
        l'est) doit être celui du projet."""
        if "project_id" not in request.data:
            return "client_id" not in request.data
        from projects.models import Project

        project = Project.objects.filter(id=request.data.get("project_id")).first()
        if project is None:
            return False
        client_id = request.data.get("client_id")
        return client_id is None or str(client_id) == str(project.client_id)

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
        return False
