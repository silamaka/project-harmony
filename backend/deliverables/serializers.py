from django.utils import timezone
from rest_framework import serializers

from .models import Deliverable


class MissionPKField(serializers.PrimaryKeyRelatedField):
    """Restreint aux missions visibles par l'utilisateur connecté : un
    collaborateur ne peut pas déposer un livrable sur une mission qui n'est
    pas la sienne en devinant simplement son id."""

    def get_queryset(self):
        from missions.models import Mission
        from missions.scoping import missions_visible_to

        request = self.context.get("request")
        if request and request.user.is_authenticated:
            return missions_visible_to(request.user)
        return Mission.objects.none()


class DeliverableSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)
    mission_id = MissionPKField(source="mission")
    # Toujours l'utilisateur connecté, jamais une valeur envoyée par le
    # client (voir DeliverableViewSet.perform_create) : lecture seule ici,
    # get_queryset n'est donc jamais sollicité.
    uploaded_by = serializers.PrimaryKeyRelatedField(read_only=True)
    # Publier / dépublier s'écrit via `published` ; la date est toujours
    # posée par le serveur, jamais envoyée par le client.
    published = serializers.BooleanField(write_only=True, required=False)

    class Meta:
        model = Deliverable
        fields = [
            "id",
            "mission_id",
            "name",
            "type",
            "url",
            "version",
            "size_kb",
            "uploaded_by",
            "status",
            "published",
            "published_at",
            "created_at",
        ]
        read_only_fields = ["created_at", "uploaded_by", "published_at"]

    def create(self, validated_data):
        # Un dépôt n'est jamais publié d'emblée : la publication passe
        # toujours par un PATCH, soumis à DeliverablePermission.
        validated_data.pop("published", None)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if "published" in validated_data:
            if not validated_data.pop("published"):
                validated_data["published_at"] = None
            elif instance.published_at is None:
                validated_data["published_at"] = timezone.now()
        return super().update(instance, validated_data)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["mission_id"] = str(data["mission_id"])
        data["uploaded_by"] = str(data["uploaded_by"])
        return data
