from django.db import transaction
from django.db.models import ProtectedError
from rest_framework import status, viewsets
from rest_framework.response import Response

from accounts.models import Role, User

from .models import Client
from .permissions import ClientPermission
from .serializers import ClientSerializer


class ClientViewSet(viewsets.ModelViewSet):
    """Supprimer une entreprise emporte ses projets et missions (CASCADE) et
    ses comptes "client" : sans entreprise, un tel compte ne verrait plus
    qu'un portail vide."""

    queryset = Client.objects.all()
    serializer_class = ClientSerializer
    permission_classes = [ClientPermission]

    def destroy(self, request, *args, **kwargs):
        company = self.get_object()
        try:
            with transaction.atomic():
                account_ids = list(company.users.filter(role=Role.CLIENT).values_list("id", flat=True))
                # Entreprise d'abord : ses missions (et leurs commentaires /
                # livrables, PROTECT sur l'auteur) partent avec elle, ce qui
                # libère ensuite la suppression des comptes.
                company.delete()
                User.objects.filter(id__in=account_ids).delete()
        except ProtectedError:
            return Response(
                {"detail": "Impossible de supprimer : un compte de cette entreprise est encore lié à d'autres données."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)
