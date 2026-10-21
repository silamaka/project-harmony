from django.utils import timezone
from rest_framework import serializers

from accounts.models import Role

from .models import Deliverable, DeliverableStatus


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
    # Explication d'une demande de corrections du client, postée dans la
    # discussion de la mission dans la même transaction que sa décision
    # (voir DeliverableViewSet.perform_update).
    comment = serializers.CharField(
        write_only=True, required=False, allow_blank=True, max_length=2000
    )

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
            "client_status",
            "client_feedback",
            "client_feedback_at",
            "published",
            "comment",
            "published_at",
            "created_at",
        ]
        read_only_fields = [
            "created_at",
            "uploaded_by",
            "published_at",
            "client_feedback",
            "client_feedback_at",
        ]

    def validate(self, attrs):
        request = self.context.get("request")
        if (
            request
            and request.user.role == Role.CLIENT
            and attrs.get("client_status") == DeliverableStatus.CORRECTIONS
            and not attrs.get("comment", "").strip()
        ):
            raise serializers.ValidationError(
                {"comment": "Expliquez ce qu'il faut corriger."}
            )
        return attrs

    def create(self, validated_data):
        validated_data.pop("comment", None)
        # Un dépôt n'est jamais publié d'emblée : la publication passe
        # toujours par un PATCH, soumis à DeliverablePermission.
        validated_data.pop("published", None)
        validated_data["url"] = validated_data.get("url", "").strip()
        # Un dépôt commence toujours en revue chez l'agence : l'envoi au
        # client passe par sa validation (un PATCH), qui le notifie.
        validated_data["status"] = DeliverableStatus.EN_ATTENTE
        validated_data["client_status"] = DeliverableStatus.EN_ATTENTE
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data.pop("comment", None)
        url = validated_data.get("url", instance.url).strip()
        if "url" in validated_data:
            validated_data["url"] = url
            if url != instance.url:
                # Nouveau contenu (ou lien retiré) : il doit être revu par
                # l'agence puis par le client, quelles que soient les
                # décisions prises sur l'ancien lien.
                validated_data["status"] = DeliverableStatus.EN_ATTENTE
                validated_data["client_status"] = DeliverableStatus.EN_ATTENTE
                validated_data["client_feedback"] = ""
                validated_data["client_feedback_at"] = None
            if not url:
                # Lien retiré : le livrable redevient "à venir", ce qui
                # annule une publication devenue sans objet.
                validated_data["published_at"] = None

        if not url and (
            validated_data.get("published")
            or validated_data.get("status") == DeliverableStatus.VALIDE
            or validated_data.get("client_status") == DeliverableStatus.VALIDE
        ):
            raise serializers.ValidationError(
                "Ce livrable n'a pas encore de lien : il ne peut être ni validé ni publié."
            )

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
