from rest_framework.permissions import BasePermission, SAFE_METHODS

from .models import Role

# Comptes que le chef de projet gère comme l'admin.
CHEF_MANAGED_ROLES = (Role.COLLABORATEUR.value, Role.CLIENT.value)


class IsAdmin(BasePermission):
    def has_permission(self, request, view) -> bool:
        return bool(request.user and request.user.is_authenticated and request.user.role == Role.ADMIN)


class UserWritePermission(BasePermission):
    """Miroir des règles déjà établies côté frontend cette session :
    - Lecture : tout utilisateur authentifié (résolution de noms partout
      dans l'app — assigné, auteur de commentaire...).
    - Écriture sur un compte "collaborateur" ou "client" : admin OU
      chef_projet (page Collaborateurs, équipe du client sur la fiche
      entreprise) — le chef de projet gère les clients comme l'admin.
    - Écriture sur un compte admin ou chef_projet : admin uniquement.
    """

    def has_permission(self, request, view) -> bool:
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        if request.user.role == Role.ADMIN:
            return True
        if request.user.role != Role.CHEF_PROJET:
            return False
        if view.action == "create":
            return request.data.get("role") in CHEF_MANAGED_ROLES
        # update/partial_update/destroy/toggle_active sur un objet précis :
        # tranché par has_object_permission. Le contrôle POST-avec-rôle
        # ci-dessus ne doit s'appliquer qu'à la création — toggle_active est
        # aussi un POST, mais sans corps, et n'a rien à voir avec un rôle.
        return True

    def has_object_permission(self, request, view, obj) -> bool:
        if request.method in SAFE_METHODS:
            return True
        if request.user.role == Role.ADMIN:
            return True
        if request.user.role == Role.CHEF_PROJET:
            # Un collaborateur ou un client uniquement, et sans jamais changer
            # son rôle : sinon un chef de projet pourrait promouvoir n'importe
            # qui admin en modifiant simplement le champ `role`.
            return obj.role in CHEF_MANAGED_ROLES and request.data.get(
                "role", obj.role
            ) == obj.role
        return False
