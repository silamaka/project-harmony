from pathlib import PurePosixPath
from urllib.parse import urlparse

from datetime import timedelta

from django.core.validators import URLValidator
from django.utils import timezone
from rest_framework import serializers

from .models import (
    CorrectionCategory,
    Deliverable,
    DeliverableStatus,
    DeliverableType,
)

validate_http_url = URLValidator(
    schemes=["http", "https"], message="Le lien doit être une adresse web complète (https://…)."
)

TYPE_BY_EXTENSION = {
    ".pdf": DeliverableType.PDF,
    **dict.fromkeys(
        [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif"], DeliverableType.IMAGE
    ),
    **dict.fromkeys([".mp4", ".mov", ".webm", ".avi", ".mkv", ".m4v"], DeliverableType.VIDEO),
    **dict.fromkeys([".zip", ".rar", ".7z"], DeliverableType.ZIP),
}


def type_from_url(url: str) -> str:
    """Type d'un livrable déduit de son lien (extension du fichier) ; un lien
    Drive / Figma / page web reste un "Lien"."""
    suffix = PurePosixPath(urlparse(url).path).suffix.lower()
    return TYPE_BY_EXTENSION.get(suffix, DeliverableType.LIEN)


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
    # Qui a enregistré la décision pour le client (vide s'il a décidé lui-même).
    client_decided_by_name = serializers.SerializerMethodField()
    # Publier / dépublier s'écrit via `published` ; la date est toujours
    # posée par le serveur, jamais envoyée par le client.
    published = serializers.BooleanField(write_only=True, required=False)
    # Explication d'une demande de corrections du client, postée dans la
    # discussion de la mission dans la même transaction que sa décision
    # (voir DeliverableViewSet.perform_update).
    comment = serializers.CharField(
        write_only=True, required=False, allow_blank=True, max_length=2000
    )
    # Avec `comment`, pour une demande de corrections du client : ce qui est
    # à corriger, et un lien d'exemple / de capture facultatif.
    categories = serializers.ListField(
        child=serializers.ChoiceField(choices=CorrectionCategory.choices),
        write_only=True,
        required=False,
        max_length=len(CorrectionCategory.choices),
    )
    reference_url = serializers.CharField(
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
            "client_feedback_categories",
            "client_feedback_link",
            "client_validated_at",
            "client_decided_by_name",
            "published",
            "scheduled_at",
            "comment",
            "categories",
            "reference_url",
            "published_at",
            "created_at",
        ]
        # `version` et `type` sont posés par le serveur : v1 au dépôt, +1 à
        # chaque nouveau lien ; type déduit du lien (voir type_from_url).
        read_only_fields = [
            "created_at",
            "uploaded_by",
            "published_at",
            "client_feedback",
            "client_feedback_at",
            "client_feedback_categories",
            "client_feedback_link",
            "client_validated_at",
            "version",
            "type",
        ]

    def validate_url(self, value):
        value = value.strip()
        if value:
            validate_http_url(value)
        return value

    def validate_scheduled_at(self, value):
        # Une date déjà enregistrée peut être renvoyée telle quelle ; une
        # nouvelle date doit être à venir (marge d'une minute).
        current = self.instance.scheduled_at if self.instance else None
        if value and value != current and value < timezone.now() - timedelta(minutes=1):
            raise serializers.ValidationError("Choisissez une date et une heure à venir.")
        return value

    def validate_reference_url(self, value):
        value = value.strip()
        if value:
            validate_http_url(value)
        return value

    def validate(self, attrs):
        # Catégories et détail sont facultatifs : le client précise ce qu'il
        # veut. On range seulement les catégories (sans doublon, dans l'ordre
        # de la liste).
        if "categories" in attrs:
            chosen = set(attrs["categories"])
            attrs["categories"] = [c for c in CorrectionCategory.values if c in chosen]
        return attrs

    def create(self, validated_data):
        for key in ("comment", "categories", "reference_url"):
            validated_data.pop(key, None)
        # Un dépôt n'est jamais publié d'emblée : la publication passe
        # toujours par un PATCH, soumis à DeliverablePermission.
        validated_data.pop("published", None)
        validated_data["url"] = validated_data.get("url", "").strip()
        validated_data["type"] = type_from_url(validated_data["url"])
        validated_data["version"] = 1
        # Un dépôt commence toujours en revue chez l'agence : l'envoi au
        # client passe par sa validation (un PATCH), qui le notifie.
        validated_data["status"] = DeliverableStatus.EN_ATTENTE
        validated_data["client_status"] = DeliverableStatus.EN_ATTENTE
        return super().create(validated_data)

    def update(self, instance, validated_data):
        for key in ("comment", "categories", "reference_url"):
            validated_data.pop(key, None)
        url = validated_data.get("url", instance.url).strip()
        if "url" in validated_data:
            validated_data["url"] = url
            if url != instance.url:
                if url:
                    validated_data["type"] = type_from_url(url)
                if url and instance.url:
                    # Remplace un contenu existant : nouvelle version. Le
                    # premier lien d'un livrable annoncé reste la v1.
                    validated_data["version"] = instance.version + 1
                # Nouveau contenu (ou lien retiré) : il doit être revu par
                # l'agence puis par le client, quelles que soient les
                # décisions prises sur l'ancien lien.
                validated_data["status"] = DeliverableStatus.EN_ATTENTE
                validated_data["client_status"] = DeliverableStatus.EN_ATTENTE
                validated_data["client_feedback"] = ""
                validated_data["client_feedback_at"] = None
                validated_data["client_feedback_categories"] = []
                validated_data["client_feedback_link"] = ""
                validated_data["client_validated_at"] = None
                validated_data["client_decided_by"] = None
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

        if (
            validated_data.get("published")
            and instance.published_at is None
            and not (
                validated_data.get("status", instance.status) == DeliverableStatus.VALIDE
                and validated_data.get("client_status", instance.client_status)
                == DeliverableStatus.VALIDE
            )
        ):
            # Rien ne part en ligne sans l'accord du client : publier exige la
            # double validation ("Prêt à publier"). Un client qui a répondu
            # hors du portail : l'agence enregistre sa validation, puis publie.
            # Dépublier reste toujours possible.
            raise serializers.ValidationError(
                {
                    "published": "Ce livrable doit être validé par l'agence et par le client "
                    "avant d'être publié."
                }
            )

        if "published" in validated_data:
            if not validated_data.pop("published"):
                validated_data["published_at"] = None
            elif instance.published_at is None:
                validated_data["published_at"] = timezone.now()
        return super().update(instance, validated_data)

    def get_client_decided_by_name(self, obj) -> str:
        user = obj.client_decided_by
        if not user:
            return ""
        return f"{user.first_name} {user.last_name}".strip() or user.email

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["mission_id"] = str(data["mission_id"])
        data["uploaded_by"] = str(data["uploaded_by"])
        return data
