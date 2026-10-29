from django.db import transaction
from rest_framework import serializers

from .models import Role, User


class ClientPKField(serializers.PrimaryKeyRelatedField):
    """Résout clients.Client paresseusement pour éviter un import circulaire
    entre les apps accounts et clients au chargement du module."""

    def get_queryset(self):
        from clients.models import Client

        return Client.objects.all()


class UserSerializer(serializers.ModelSerializer):
    """Miroir du type `User` du frontend — id et client_id sérialisés en
    string pour matcher exactement `id: string` / `client_id?: string`
    côté TypeScript (les PK Django sont des entiers)."""

    id = serializers.CharField(read_only=True)
    client_id = ClientPKField(source="client", required=False, allow_null=True)
    password = serializers.CharField(write_only=True, required=False, min_length=4)
    # Création d'un compte client : l'entreprise est saisie par son nom. Elle
    # est rattachée si elle existe déjà (sans tenir compte de la casse),
    # créée sinon (voir _company_from_name).
    company_name = serializers.CharField(
        write_only=True, required=False, allow_blank=True, max_length=200
    )

    class Meta:
        model = User
        fields = [
            "id",
            "first_name",
            "last_name",
            "email",
            "phone",
            "role",
            "avatar_url",
            "job_title",
            "workload",
            "client_id",
            "is_active",
            "last_login",
            "created_at",
            "password",
            "company_name",
        ]
        read_only_fields = ["created_at", "last_login"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Dernière connexion : utile à l'agence pour repérer les comptes
        # oubliés, sans intérêt (ni à divulguer) pour les autres.
        request = self.context.get("request")
        viewer = getattr(request, "user", None)
        if getattr(viewer, "role", None) not in (Role.ADMIN, Role.CHEF_PROJET):
            data.pop("last_login", None)
        if data.get("client_id") is not None:
            data["client_id"] = str(data["client_id"])
        else:
            data.pop("client_id", None)
        return data

    def validate(self, attrs):
        role = attrs.get("role", self.instance.role if self.instance else None)
        company_name = attrs.get("company_name", "").strip()
        has_company = attrs.get("client") or (self.instance and self.instance.client_id)
        if self.instance is None and role == Role.CLIENT and not (has_company or company_name):
            raise serializers.ValidationError(
                {"company_name": "Indiquez l'entreprise du client."}
            )
        return attrs

    @staticmethod
    def _company_from_name(name: str):
        from clients.models import Client, ClientStatus

        existing = Client.objects.filter(name__iexact=name).order_by("id").first()
        return existing or Client.objects.create(name=name, status=ClientStatus.ACTIF)

    def create(self, validated_data):
        password = validated_data.pop("password", None)
        company_name = validated_data.pop("company_name", "").strip()
        # Entreprise et compte ensemble : si le compte échoue, rien n'est créé.
        with transaction.atomic():
            if (
                validated_data.get("role") == Role.CLIENT
                and not validated_data.get("client")
                and company_name
            ):
                validated_data["client"] = self._company_from_name(company_name)
            user = User(**validated_data)
            user.set_password(password or User.objects.make_random_password())
            user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        company_name = validated_data.pop("company_name", "").strip()
        with transaction.atomic():
            if company_name and validated_data.get("role", instance.role) == Role.CLIENT:
                validated_data["client"] = self._company_from_name(company_name)
            for attr, value in validated_data.items():
                setattr(instance, attr, value)
            if password:
                instance.set_password(password)
            instance.save()
        return instance
