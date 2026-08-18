import re

from rest_framework import serializers

from .models import Comment

MENTION_RE = re.compile(r"@[\w.-]+")


class MissionPKField(serializers.PrimaryKeyRelatedField):
    """Restreint aux missions visibles par l'utilisateur connecté (même
    logique que deliverables.serializers.MissionPKField)."""

    def get_queryset(self):
        from missions.models import Mission
        from missions.scoping import missions_visible_to

        request = self.context.get("request")
        if request and request.user.is_authenticated:
            return missions_visible_to(request.user)
        return Mission.objects.none()


class ParentPKField(serializers.PrimaryKeyRelatedField):
    def get_queryset(self):
        return Comment.objects.all()


class CommentSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)
    mission_id = MissionPKField(source="mission")
    # Toujours l'utilisateur connecté (voir CommentViewSet.perform_create).
    author_id = serializers.PrimaryKeyRelatedField(source="author", read_only=True)
    parent_id = ParentPKField(source="parent", required=False, allow_null=True)
    # Extraites côté serveur depuis `body`, jamais depuis une valeur envoyée
    # par le client (voir la note dans services/index.ts, commentService.create) :
    # un client malveillant pourrait sinon déclencher de fausses notifications
    # de mention.
    mentions = serializers.SerializerMethodField()

    class Meta:
        model = Comment
        fields = [
            "id",
            "mission_id",
            "author_id",
            "body",
            "parent_id",
            "attachment_url",
            "mentions",
            "created_at",
        ]
        read_only_fields = ["created_at"]

    def get_mentions(self, obj: Comment) -> list[str]:
        return MENTION_RE.findall(obj.body)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["mission_id"] = str(data["mission_id"])
        data["author_id"] = str(data["author_id"])
        if data.get("parent_id") is not None:
            data["parent_id"] = str(data["parent_id"])
        else:
            data.pop("parent_id", None)
        return data
