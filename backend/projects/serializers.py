from rest_framework import serializers

from .models import Project


class ClientPKField(serializers.PrimaryKeyRelatedField):
    def get_queryset(self):
        from clients.models import Client

        return Client.objects.all()


class OwnerPKField(serializers.PrimaryKeyRelatedField):
    def get_queryset(self):
        from django.contrib.auth import get_user_model

        return get_user_model().objects.all()


class ProjectSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)
    client_id = ClientPKField(source="client")
    owner_id = OwnerPKField(source="owner")
    progress = serializers.ReadOnlyField()

    class Meta:
        model = Project
        fields = [
            "id",
            "name",
            "client_id",
            "description",
            "start_date",
            "end_date",
            "status",
            "progress",
            "owner_id",
            "created_at",
        ]
        read_only_fields = ["created_at"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["client_id"] = str(data["client_id"])
        data["owner_id"] = str(data["owner_id"])
        return data
