from rest_framework import serializers

from .models import Meeting


class MeetingSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)

    class Meta:
        model = Meeting
        fields = ["id", "title", "date", "time", "description"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if not data.get("time"):
            data.pop("time", None)
        if not data.get("description"):
            data.pop("description", None)
        return data
