from datetime import date, timedelta

from django.urls import reverse

from core.test_utils import RoleTestCase

from deliverables.models import Deliverable, DeliverableStatus
from missions.models import Mission, MissionStatus


class DashboardPermissionTests(RoleTestCase):
    def test_admin_can_access_stats(self):
        self.auth_as(self.admin)
        res = self.client.get(reverse("dashboard-stats"))
        self.assertEqual(res.status_code, 200)

    def test_chef_projet_can_access_stats(self):
        self.auth_as(self.chef_projet)
        res = self.client.get(reverse("dashboard-stats"))
        self.assertEqual(res.status_code, 200)

    def test_collaborateur_can_access_stats(self):
        self.auth_as(self.collaborateur)
        res = self.client.get(reverse("dashboard-stats"))
        self.assertEqual(res.status_code, 200)

    def test_client_cannot_access_alerts(self):
        self.auth_as(self.client_user)
        res = self.client.get(reverse("dashboard-alerts"))
        self.assertEqual(res.status_code, 403)

    def test_unauthenticated_rejected(self):
        res = self.client.get(reverse("dashboard-stats"))
        self.assertEqual(res.status_code, 401)


class StatsAndCompletionRateTests(RoleTestCase):
    def test_stats_counts_match_db_state(self):
        self.auth_as(self.admin)
        res = self.client.get(reverse("dashboard-stats"))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["clients"], 2)  # client_company + other_client_company
        self.assertEqual(res.data["missions"], 1)
        self.assertEqual(res.data["collaborators"], 2)

    def test_completion_rate_counts_valide_publie_termine_as_done(self):
        Mission.objects.all().delete()
        for status in [
            MissionStatus.A_FAIRE,
            MissionStatus.VALIDE,
            MissionStatus.PUBLIE,
            MissionStatus.TERMINE,
        ]:
            Mission.objects.create(
                title=f"Mission {status}",
                project=self.project,
                client=self.client_company,
                assignee=self.collaborateur,
                start_date="2026-01-01",
                deadline="2026-12-31",
                status=status,
            )
        self.auth_as(self.admin)
        res = self.client.get(reverse("dashboard-completion-rate"))
        self.assertEqual(res.status_code, 200)
        # 3 sur 4 (valide, publie, termine) = 75%
        self.assertEqual(res.data, 75)

    def test_completion_rate_zero_when_no_missions(self):
        Mission.objects.all().delete()
        self.auth_as(self.admin)
        res = self.client.get(reverse("dashboard-completion-rate"))
        self.assertEqual(res.data, 0)


class AlertsTests(RoleTestCase):
    """Couvre la régression corrigée cette session : une mission due
    aujourd'hui même doit alerter (ni "en retard", ni "dans 24h" au sens
    strict de l'ancienne logique ne la couvraient), et les missions déjà
    terminées ne doivent jamais apparaître comme urgentes."""

    def setUp(self):
        super().setUp()
        # self.mission (fixture de base) reste "à faire", deadline lointaine
        # (2026-12-31) : neutre pour ces tests, pas dans les fenêtres testées.
        self.today = date.today()

    def _mission(self, deadline, status=MissionStatus.EN_COURS, **kwargs):
        return Mission.objects.create(
            title="Mission test alertes",
            project=self.project,
            client=self.client_company,
            assignee=self.collaborateur,
            start_date="2026-01-01",
            deadline=deadline,
            status=status,
            **kwargs,
        )

    def test_mission_due_today_triggers_in24h(self):
        m = self._mission(self.today)
        self.auth_as(self.admin)
        res = self.client.get(reverse("dashboard-alerts"))
        self.assertIn(str(m.id), [x["id"] for x in res.data["in24h"]])

    def test_mission_due_today_but_done_does_not_trigger_in24h(self):
        m = self._mission(self.today, status=MissionStatus.VALIDE)
        self.auth_as(self.admin)
        res = self.client.get(reverse("dashboard-alerts"))
        self.assertNotIn(str(m.id), [x["id"] for x in res.data["in24h"]])

    def test_mission_due_tomorrow_triggers_in24h(self):
        m = self._mission(self.today + timedelta(days=1))
        self.auth_as(self.admin)
        res = self.client.get(reverse("dashboard-alerts"))
        self.assertIn(str(m.id), [x["id"] for x in res.data["in24h"]])

    def test_mission_due_in_two_days_triggers_in48h_not_in24h(self):
        m = self._mission(self.today + timedelta(days=2))
        self.auth_as(self.admin)
        res = self.client.get(reverse("dashboard-alerts"))
        self.assertIn(str(m.id), [x["id"] for x in res.data["in48h"]])
        self.assertNotIn(str(m.id), [x["id"] for x in res.data["in24h"]])

    def test_mission_due_in_two_days_but_done_does_not_trigger_in48h(self):
        m = self._mission(self.today + timedelta(days=2), status=MissionStatus.TERMINE)
        self.auth_as(self.admin)
        res = self.client.get(reverse("dashboard-alerts"))
        self.assertNotIn(str(m.id), [x["id"] for x in res.data["in48h"]])

    def test_mission_overdue_does_not_trigger_in24h_or_in48h(self):
        m = self._mission(self.today - timedelta(days=1))
        self.auth_as(self.admin)
        res = self.client.get(reverse("dashboard-alerts"))
        all_ids = [x["id"] for x in res.data["in24h"]] + [x["id"] for x in res.data["in48h"]]
        self.assertNotIn(str(m.id), all_ids)

    def test_corrections_status_triggers_blocked(self):
        m = self._mission(self.today + timedelta(days=30), status=MissionStatus.CORRECTIONS)
        self.auth_as(self.admin)
        res = self.client.get(reverse("dashboard-alerts"))
        self.assertIn(str(m.id), [x["id"] for x in res.data["blocked"]])

    def test_pending_deliverable_appears_in_alerts(self):
        d = Deliverable.objects.create(
            mission=self.mission,
            name="En attente",
            type="lien",
            url="https://example.com/x",
            uploaded_by=self.collaborateur,
            status=DeliverableStatus.EN_ATTENTE,
        )
        self.auth_as(self.admin)
        res = self.client.get(reverse("dashboard-alerts"))
        self.assertIn(str(d.id), [x["id"] for x in res.data["pendingDeliverables"]])

    def test_validated_deliverable_does_not_appear_in_alerts(self):
        d = Deliverable.objects.create(
            mission=self.mission,
            name="Validé",
            type="lien",
            url="https://example.com/x",
            uploaded_by=self.collaborateur,
            status=DeliverableStatus.VALIDE,
        )
        self.auth_as(self.admin)
        res = self.client.get(reverse("dashboard-alerts"))
        self.assertNotIn(str(d.id), [x["id"] for x in res.data["pendingDeliverables"]])
