from django.db.models import Q

from accounts.models import Role

from .models import Mission


def missions_visible_to(user):
    """Missions qu'un utilisateur a le droit de voir, selon son rôle.

    Source unique de vérité pour la portée : MissionViewSet, mais aussi
    DeliverableViewSet et CommentViewSet s'appuient dessus pour ne jamais
    exposer un livrable ou un commentaire d'une mission que l'utilisateur
    ne peut lui-même pas voir.
    """
    if user.role == Role.COLLABORATEUR:
        # Sous-requête (pas un join sur collaborators) : MissionViewSet
        # applique select_for_update() sur ce queryset en écriture, et
        # Postgres interdit FOR UPDATE combiné à DISTINCT — nécessaire pour
        # dédupliquer un join M2M mais pas une sous-requête IN.
        return Mission.objects.filter(
            Q(assignee=user) | Q(id__in=user.collaborating_missions.values("id"))
        )
    if user.role == Role.CLIENT:
        return Mission.objects.filter(client_id=user.client_id)
    return Mission.objects.all()
