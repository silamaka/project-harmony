from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.models import Role

from .models import Campaign, CampaignReport, CampaignStatus
from .permissions import CampaignPermission
from .serializers import CampaignReportSerializer, CampaignSerializer


class CampaignViewSet(viewsets.ModelViewSet):
    serializer_class = CampaignSerializer
    permission_classes = [CampaignPermission]

    def get_queryset(self):
        user = self.request.user
        queryset = Campaign.objects.select_related("client", "project").prefetch_related(
            "reports", "contents"
        )
        if user.role == Role.CLIENT:
            # Ses campagnes, une fois lancées : une campagne en préparation
            # n'est pas encore une promesse faite au client.
            queryset = queryset.filter(client_id=user.client_id).exclude(
                status=CampaignStatus.PREPARATION
            )
        client_id = self.request.query_params.get("client")
        if client_id:
            queryset = queryset.filter(client_id=client_id)
        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=["post"], url_path="reports")
    def add_report(self, request, pk=None):
        """Relevé à une date (totaux depuis le début). Un relevé existant à
        la même date est corrigé plutôt que doublé."""
        campaign = self.get_object()
        serializer = CampaignReportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        date = data.pop("date")
        CampaignReport.objects.update_or_create(
            campaign=campaign,
            date=date,
            defaults={**data, "created_by": request.user},
        )
        campaign.refresh_from_db()
        return Response(
            self.get_serializer(campaign).data, status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=["delete"], url_path=r"reports/(?P<report_id>[^/.]+)")
    def delete_report(self, request, pk=None, report_id=None):
        campaign = self.get_object()
        campaign.reports.filter(pk=report_id).delete()
        return Response(self.get_serializer(campaign).data)
