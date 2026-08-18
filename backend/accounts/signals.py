from django.db.models.signals import post_delete
from django.dispatch import receiver

from .models import Role, User


@receiver(post_delete, sender=User)
def delete_linked_client(sender, instance: User, **kwargs):
    """Supprimer un compte "client" supprime aussi l'entreprise associée.

    Miroir serveur de la logique jusqu'ici simulée côté frontend
    (services/index.ts, userService.remove). L'autre sens — supprimer un
    Client détache l'utilisateur — est déjà géré nativement par
    client = models.ForeignKey(..., on_delete=models.SET_NULL).
    """
    if instance.role == Role.CLIENT and instance.client_id:
        from clients.models import Client

        Client.objects.filter(pk=instance.client_id).delete()
