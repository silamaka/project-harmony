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
        return Mission.objects.filter(assignee=user)
    if user.role == Role.CLIENT:
        return Mission.objects.filter(client_id=user.client_id)
    return Mission.objects.all()
