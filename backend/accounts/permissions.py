from rest_framework.permissions import BasePermission, SAFE_METHODS

from .models import Role


class IsAdmin(BasePermission):
    def has_permission(self, request, view) -> bool:
        return bool(request.user and request.user.is_authenticated and request.user.role == Role.ADMIN)


class UserWritePermission(BasePermission):
    """Miroir des règles déjà établies côté frontend cette session :
    - Lecture : tout utilisateur authentifié (résolution de noms partout
      dans l'app — assigné, auteur de commentaire...).
    - Écriture sur un compte "collaborateur" : admin OU chef_projet
      (page Collaborateurs, gérée par les deux rôles).
    - Écriture sur tout autre rôle (admin/chef_projet/client) : admin
      uniquement (Paramètres > Inviter un utilisateur, admin-only).
    """

    def has_permission(self, request, view) -> bool:
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        if request.user.role == Role.ADMIN:
            return True
        if request.user.role == Role.CHEF_PROJET and request.method == "POST":
            return request.data.get("role") == Role.COLLABORATEUR.value
        # PATCH/DELETE sur un objet précis : tranché par has_object_permission.
        return request.user.role == Role.CHEF_PROJET

    def has_object_permission(self, request, view, obj) -> bool:
        if request.method in SAFE_METHODS:
            return True
        if request.user.role == Role.ADMIN:
            return True
        if request.user.role == Role.CHEF_PROJET:
            return obj.role == Role.COLLABORATEUR
        return False
