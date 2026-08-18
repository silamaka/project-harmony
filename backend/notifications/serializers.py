from rest_framework import serializers

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)
    mission_id = serializers.PrimaryKeyRelatedField(source="mission", read_only=True)

    class Meta:
        model = Notification
        fields = ["id", "type", "title", "body", "read", "link", "mission_id", "created_at"]
        # Tout est en lecture seule sauf `read` (marquer comme lu) : les
        # notifications sont générées côté serveur (signaux), jamais créées
        # ni modifiées en profondeur par le client.
        read_only_fields = ["id", "type", "title", "body", "link", "mission_id", "created_at"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if data.get("mission_id") is not None:
            data["mission_id"] = str(data["mission_id"])
        else:
            data.pop("mission_id", None)
        if not data.get("link"):
            data.pop("link", None)
        return data
