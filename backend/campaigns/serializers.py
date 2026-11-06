from decimal import Decimal

from rest_framework import serializers

from accounts.models import Role

from .models import Campaign, CampaignPlatform, CampaignReport


class CampaignReportSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)

    class Meta:
        model = CampaignReport
        fields = ["id", "date", "spend", "reach", "impressions", "clicks", "results", "created_at"]
        read_only_fields = ["created_at"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["spend"] = float(instance.spend)
        return data


class ClientPKField(serializers.PrimaryKeyRelatedField):
    def get_queryset(self):
        from clients.models import Client

        return Client.objects.all()


class ProjectPKField(serializers.PrimaryKeyRelatedField):
    def get_queryset(self):
        from projects.models import Project

        return Project.objects.all()


class ContentPKField(serializers.PrimaryKeyRelatedField):
    def get_queryset(self):
        from deliverables.models import Deliverable

        return Deliverable.objects.all()


def _ratio(part, whole):
    return round(float(part) / float(whole) * 100) if whole else None


class CampaignSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)
    client_id = ClientPKField(source="client")
    project_id = ProjectPKField(source="project", required=False, allow_null=True)
    platforms = serializers.ListField(
        child=serializers.ChoiceField(choices=CampaignPlatform.choices), required=False
    )
    content_ids = ContentPKField(source="contents", many=True, required=False)
    reports = CampaignReportSerializer(many=True, read_only=True)
    summary = serializers.SerializerMethodField()

    class Meta:
        model = Campaign
        fields = [
            "id",
            "client_id",
            "project_id",
            "name",
            "platforms",
            "objective",
            "objective_target",
            "start_date",
            "end_date",
            "status",
            "budget_ht",
            "tva_rate",
            "paid_by",
            "targeting",
            "internal_notes",
            "content_ids",
            "reports",
            "summary",
            "created_at",
        ]
        read_only_fields = ["created_at"]

    def validate(self, attrs):
        from deliverables.models import DeliverableNature

        client = attrs.get("client", self.instance.client if self.instance else None)
        project = attrs.get("project", self.instance.project if self.instance else None)
        if project is not None and project.client_id != client.id:
            raise serializers.ValidationError({"project_id": "Ce projet n'appartient pas à ce client."})
        contents = attrs.get("contents")
        if contents is not None:
            wrong = [
                d
                for d in contents
                if d.mission.client_id != client.id or d.nature != DeliverableNature.CONTENU
            ]
            if wrong:
                raise serializers.ValidationError(
                    {"content_ids": "Seuls les contenus de ce client peuvent servir à la campagne."}
                )
        start = attrs.get("start_date", self.instance.start_date if self.instance else None)
        end = attrs.get("end_date", self.instance.end_date if self.instance else None)
        if start and end and end < start:
            raise serializers.ValidationError({"end_date": "La fin ne peut pas précéder le début."})
        return attrs

    def get_summary(self, obj: Campaign) -> dict:
        """Chiffres calculés : budget TTC, totaux du dernier relevé, coût par
        résultat, avancement face à l'objectif et au budget, et ce qui a été
        fait depuis le relevé précédent."""
        tva = (obj.budget_ht * obj.tva_rate / Decimal("100")).quantize(Decimal("0.01"))
        reports = list(obj.reports.all())
        last = reports[-1] if reports else None
        previous = reports[-2] if len(reports) > 1 else None
        spend = float(last.spend) if last else 0.0
        results = last.results if last else 0
        return {
            "budget_tva": float(tva),
            "budget_ttc": float(obj.budget_ht + tva),
            "spend": spend,
            "reach": last.reach if last else None,
            "impressions": last.impressions if last else None,
            "clicks": last.clicks if last else None,
            "results": results,
            "cost_per_result": round(spend / results, 2) if results else None,
            "results_progress": _ratio(results, obj.objective_target),
            "budget_used": _ratio(spend, obj.budget_ht),
            "last_report_date": last.date.isoformat() if last else None,
            "last_period": {
                "spend": round(spend - float(previous.spend), 2),
                "results": results - previous.results,
            }
            if previous
            else None,
        }

    def to_representation(self, instance):
        data = super().to_representation(instance)
        for key in ("client_id", "project_id"):
            if data.get(key) is not None:
                data[key] = str(data[key])
        data["content_ids"] = [str(i) for i in data["content_ids"]]
        data["budget_ht"] = float(instance.budget_ht)
        data["tva_rate"] = float(instance.tva_rate)
        request = self.context.get("request")
        if getattr(getattr(request, "user", None), "role", None) == Role.CLIENT:
            # Les notes de l'agence ne regardent pas le client.
            data.pop("internal_notes", None)
        return data
