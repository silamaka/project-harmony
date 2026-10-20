from rest_framework import serializers

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)
    mission_id = serializers.PrimaryKeyRelatedField(source="mission", read_only=True)
    # Lu / non lu pour l'utilisateur connecté uniquement (Notification.read_by).
    read = serializers.BooleanField(required=False, write_only=True)

    class Meta:
        model = Notification
        fields = ["id", "type", "title", "body", "read", "link", "mission_id", "created_at"]
        # Tout est en lecture seule sauf `read` (marquer comme lu) : les
        # notifications sont générées côté serveur (signaux), jamais créées
        # ni modifiées en profondeur par le client.
        read_only_fields = ["id", "type", "title", "body", "link", "mission_id", "created_at"]

    def _user(self):
        request = self.context.get("request")
        return request.user if request else None

    def update(self, instance, validated_data):
        read = validated_data.get("read")
        user = self._user()
        if read is not None and user is not None:
            if read:
                instance.read_by.add(user)
            else:
                instance.read_by.remove(user)
            instance.is_read = read
        return instance

    def to_representation(self, instance):
        data = super().to_representation(instance)
        is_read = getattr(instance, "is_read", None)
        if is_read is None:
            user = self._user()
            is_read = bool(user) and instance.read_by.filter(pk=user.pk).exists()
        data["read"] = bool(is_read)
        if data.get("mission_id") is not None:
            data["mission_id"] = str(data["mission_id"])
        else:
            data.pop("mission_id", None)
        if not data.get("link"):
            data.pop("link", None)
        return data
