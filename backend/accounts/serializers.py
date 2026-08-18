from rest_framework import serializers

from .models import User


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
            "created_at",
            "password",
        ]
        read_only_fields = ["created_at"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if data.get("client_id") is not None:
            data["client_id"] = str(data["client_id"])
        else:
            data.pop("client_id", None)
        return data

    def create(self, validated_data):
        password = validated_data.pop("password", None)
        user = User(**validated_data)
        user.set_password(password or User.objects.make_random_password())
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance
