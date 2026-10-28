from django.db.models import Q

from accounts.models import Role, User


def mentionable_users(mission, *, client_visible: bool):
    """Personnes qui peuvent lire un message de cette mission, donc être
    mentionnées : l'admin et le chef de projet (ils voient tout), le
    responsable et les contributeurs de la mission, et les comptes du client
    seulement si le message lui est visible — une note interne ne doit jamais
    pouvoir l'atteindre."""
    who = (
        Q(role__in=[Role.ADMIN, Role.CHEF_PROJET])
        | Q(id=mission.assignee_id)
        | Q(id__in=mission.collaborators.values("id"))
    )
    if client_visible and mission.client_id:
        who |= Q(role=Role.CLIENT, client_id=mission.client_id)
    return User.objects.filter(who, is_active=True)


def apply_mentions(comment, requested_ids, *, notify_new=True):
    """Enregistre les mentions autorisées parmi celles demandées et prévient
    les personnes nouvellement mentionnées. Renvoie celles-ci."""
    from notifications.services import notify_mention

    ids = {str(i) for i in requested_ids or []}
    allowed = mentionable_users(comment.mission, client_visible=comment.client_visible)
    mentioned = set(allowed.filter(id__in=ids).exclude(id=comment.author_id))
    before = set(comment.mentioned_users.all())
    comment.mentioned_users.set(mentioned)
    added = mentioned - before
    if notify_new:
        for user in added:
            notify_mention(comment, user)
    return added
