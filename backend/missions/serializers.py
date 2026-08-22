from rest_framework import serializers

from .models import Mission


class AssigneePKField(serializers.PrimaryKeyRelatedField):
    def get_queryset(self):
        from django.contrib.auth import get_user_model

        return get_user_model().objects.all()


class ProjectPKField(serializers.PrimaryKeyRelatedField):
    def get_queryset(self):
        from projects.models import Project

        return Project.objects.all()


class ClientPKField(serializers.PrimaryKeyRelatedField):
    def get_queryset(self):
        from clients.models import Client

        return Client.objects.all()


class MissionSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)
    assignee_id = AssigneePKField(source="assignee")
    project_id = ProjectPKField(source="project")
    # Optionnel en entrée : dérivé de project.client si absent, comme le
    # fait déjà CreateMissionDialog côté frontend.
    client_id = ClientPKField(source="client", required=False)

    class Meta:
        model = Mission
        fields = [
            "id",
            "title",
            "description",
            "priority",
            "assignee_id",
            "project_id",
            "client_id",
            "deadline",
            "status",
            "created_at",
        ]
        read_only_fields = ["created_at"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["assignee_id"] = str(data["assignee_id"])
        data["project_id"] = str(data["project_id"])
        data["client_id"] = str(data["client_id"])
        return data

    def create(self, validated_data):
        if "client" not in validated_data:
            validated_data["client"] = validated_data["project"].client
        return super().create(validated_data)
