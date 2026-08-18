from rest_framework import viewsets

from .models import Client
from .permissions import ClientPermission
from .serializers import ClientSerializer


class ClientViewSet(viewsets.ModelViewSet):
    """La suppression détache automatiquement l'utilisateur "client" lié
    (client = models.ForeignKey(..., on_delete=models.SET_NULL) côté
    accounts.User), pas de logique supplémentaire à écrire ici."""

    queryset = Client.objects.all()
    serializer_class = ClientSerializer
    permission_classes = [ClientPermission]
