import datetime

from django.urls import reverse

from core.test_utils import RoleTestCase
from deliverables.models import Deliverable, DeliverableNature

from .models import Campaign, CampaignStatus


def campaign_list_url():
    return reverse("campaign-list")


def campaign_detail_url(campaign_id):
    return reverse("campaign-detail", args=[campaign_id])


def campaign_reports_url(campaign_id):
    return reverse("campaign-add-report", args=[campaign_id])


class CampaignSetupMixin:
    def setUp(self):
        super().setUp()
        self.campaign = Campaign.objects.create(
            client=self.client_company,
            name="Lancement boutique",
            objective="messages",
            objective_target=200,
            start_date=datetime.date(2026, 11, 1),
            end_date=datetime.date(2026, 11, 30),
            status=CampaignStatus.EN_COURS,
            budget_ht=100000,
            internal_notes="Marge serrée",
        )

    def _payload(self, **extra):
        return {
            "client_id": str(self.client_company.id),
            "name": "Promo fin d'année",
            "platforms": ["meta", "tiktok"],
            "objective": "ventes",
            "objective_target": 50,
            "start_date": "2026-12-01",
            "end_date": "2026-12-31",
            "budget_ht": "250000",
            **extra,
        }


class CampaignPermissionTests(CampaignSetupMixin, RoleTestCase):
    def test_admin_and_chef_can_create(self):
        for user in [self.admin, self.chef_projet]:
            self.auth_as(user)
            res = self.client.post(campaign_list_url(), self._payload(), format="json")
            self.assertEqual(res.status_code, 201, res.data)

    def test_collaborateur_and_client_cannot_write(self):
        for user in [self.collaborateur, self.client_user]:
            self.auth_as(user)
            self.assertEqual(self.client.post(campaign_list_url(), self._payload(), format="json").status_code, 403)
            res = self.client.post(
                campaign_reports_url(self.campaign.id), {"date": "2026-11-07", "results": 1}, format="json"
            )
            self.assertIn(res.status_code, (403, 404))

    def test_collaborateur_can_read(self):
        self.auth_as(self.collaborateur)
        self.assertEqual(len(self.client.get(campaign_list_url()).data), 1)


class CampaignClientVisibilityTests(CampaignSetupMixin, RoleTestCase):
    def test_client_sees_own_launched_campaigns_without_internal_notes(self):
        Campaign.objects.create(
            client=self.client_company, name="Brouillon", objective="messages",
            start_date=datetime.date(2026, 12, 1), status=CampaignStatus.PREPARATION,
        )
        Campaign.objects.create(
            client=self.other_client_company, name="Autre client", objective="messages",
            start_date=datetime.date(2026, 11, 1), status=CampaignStatus.EN_COURS,
        )
        self.auth_as(self.client_user)
        data = self.client.get(campaign_list_url()).data
        self.assertEqual([c["name"] for c in data], ["Lancement boutique"])
        self.assertNotIn("internal_notes", data[0])

    def test_staff_sees_internal_notes(self):
        self.auth_as(self.admin)
        self.assertEqual(self.client.get(campaign_detail_url(self.campaign.id)).data["internal_notes"], "Marge serrée")


class CampaignValidationTests(CampaignSetupMixin, RoleTestCase):
    def test_project_must_belong_to_the_client(self):
        from projects.models import Project

        foreign = Project.objects.create(
            name="Autre", client=self.other_client_company, owner=self.chef_projet,
            start_date="2026-01-01", end_date="2026-12-31",
        )
        self.auth_as(self.admin)
        res = self.client.post(campaign_list_url(), self._payload(project_id=str(foreign.id)), format="json")
        self.assertEqual(res.status_code, 400)

    def test_only_contents_of_the_client_can_be_linked(self):
        content = Deliverable.objects.create(
            mission=self.mission, name="Visuel", type="lien", url="https://x.test/v", uploaded_by=self.collaborateur
        )
        document = Deliverable.objects.create(
            mission=self.mission, name="Charte", type="lien", url="https://x.test/c",
            uploaded_by=self.collaborateur, nature=DeliverableNature.DOCUMENT,
        )
        self.auth_as(self.admin)
        ok = self.client.post(campaign_list_url(), self._payload(content_ids=[str(content.id)]), format="json")
        self.assertEqual(ok.status_code, 201, ok.data)
        bad = self.client.post(campaign_list_url(), self._payload(content_ids=[str(document.id)]), format="json")
        self.assertEqual(bad.status_code, 400)

    def test_end_cannot_precede_start(self):
        self.auth_as(self.admin)
        res = self.client.post(campaign_list_url(), self._payload(end_date="2026-11-01"), format="json")
        self.assertEqual(res.status_code, 400)


class CampaignReportTests(CampaignSetupMixin, RoleTestCase):
    def _report(self, date, spend, results):
        self.auth_as(self.chef_projet)
        res = self.client.post(
            campaign_reports_url(self.campaign.id),
            {"date": date, "spend": spend, "results": results, "reach": 1000},
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.data)
        return res.data

    def test_summary_is_computed_from_cumulative_reports(self):
        self._report("2026-11-07", "30000", 40)
        data = self._report("2026-11-14", "60000", 100)
        s = data["summary"]
        self.assertEqual(s["spend"], 60000)
        self.assertEqual(s["results"], 100)
        self.assertEqual(s["cost_per_result"], 600)
        self.assertEqual(s["results_progress"], 50)
        self.assertEqual(s["budget_used"], 60)
        self.assertEqual(s["budget_tva"], 18000)
        self.assertEqual(s["budget_ttc"], 118000)
        self.assertEqual(s["last_period"], {"spend": 30000, "results": 60})

    def test_same_day_report_is_corrected_not_duplicated(self):
        self._report("2026-11-07", "30000", 40)
        data = self._report("2026-11-07", "32000", 42)
        self.assertEqual(len(data["reports"]), 1)
        self.assertEqual(data["summary"]["results"], 42)


class CampaignAlertTests(CampaignSetupMixin, RoleTestCase):
    def _titles(self, user):
        from notifications.scoping import notifications_visible_to

        return list(notifications_visible_to(user).values_list("title", flat=True))

    def test_ending_budget_and_missing_report_alerts_once_for_staff_only(self):
        from .alerts import notify_campaign_alerts
        from .models import CampaignReport

        CampaignReport.objects.create(
            campaign=self.campaign, date=datetime.date(2026, 11, 10), spend=95000, results=150
        )
        sent = notify_campaign_alerts(today=datetime.date(2026, 11, 28))
        self.assertEqual(sent, 3)  # fin dans 2 jours, 95 % du budget, 18 jours sans relevé
        self.assertEqual(notify_campaign_alerts(today=datetime.date(2026, 11, 29)), 0)
        titles = self._titles(self.chef_projet)
        self.assertIn("Campagne bientôt terminée", titles)
        self.assertIn("Budget de campagne presque dépensé", titles)
        self.assertIn("Relevé de campagne en attente", titles)
        self.assertNotIn("Campagne bientôt terminée", self._titles(self.collaborateur))
        self.assertNotIn("Campagne bientôt terminée", self._titles(self.client_user))

    def test_campaign_in_preparation_never_alerts(self):
        from .alerts import notify_campaign_alerts

        Campaign.objects.filter(pk=self.campaign.pk).update(status=CampaignStatus.PREPARATION)
        self.assertEqual(notify_campaign_alerts(today=datetime.date(2026, 11, 28)), 0)
