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


class MonthlyEvolutionTests(RoleTestCase):
    """Évolution mensuelle : missions créées et livrables déposés par mois,
    du mois de la première mission jusqu'au mois en cours, creux compris."""

    LABELS = ["janv.", "févr.", "mars", "avr.", "mai", "juin",
              "juil.", "août", "sept.", "oct.", "nov.", "déc."]

    def _get(self):
        self.auth_as(self.admin)
        res = self.client.get(reverse("dashboard-monthly"))
        self.assertEqual(res.status_code, 200)
        return res.data

    def _label(self, d):
        return f"{self.LABELS[d.month - 1]} {d.year % 100:02d}"

    def test_starts_at_the_first_mission_and_ends_this_month(self):
        from django.utils import timezone

        today = timezone.localdate()
        first = today.replace(day=1) - timedelta(days=95)  # environ 3 mois plus tôt
        Mission.objects.filter(pk=self.mission.pk).update(
            created_at=timezone.make_aware(
                timezone.datetime(first.year, first.month, 15), timezone.get_current_timezone()
            )
        )
        data = self._get()
        self.assertEqual(data[0]["month"], self._label(first))
        self.assertEqual(data[-1]["month"], self._label(today))
        self.assertEqual(data[0]["missions"], 1)
        # Mois intermédiaires présents, à 0 s'ils sont vides.
        self.assertEqual(len(data), (today.year - first.year) * 12 + today.month - first.month + 1)

    def test_only_current_month_without_missions(self):
        from django.utils import timezone

        Mission.objects.all().delete()
        data = self._get()
        self.assertEqual([row["month"] for row in data], [self._label(timezone.localdate())])

    def test_counts_deliverables_deposited_this_month(self):
        before = self._get()[-1]
        Deliverable.objects.create(
            mission=self.mission, name="Maquette", type="lien",
            url="https://example.com/m", uploaded_by=self.collaborateur,
        )
        data = self._get()
        self.assertEqual(data[-1]["livrables"], before["livrables"] + 1)
        self.assertEqual(data[-1]["missions"], before["missions"])

    def test_client_cannot_access(self):
        self.auth_as(self.client_user)
        self.assertEqual(self.client.get(reverse("dashboard-monthly")).status_code, 403)


class ContentQuotaTests(RoleTestCase):
    """Jauge des contenus du mois par client, face à son forfait."""

    def _get(self, **params):
        self.auth_as(self.admin)
        res = self.client.get(reverse("dashboard-content-quota"), params)
        self.assertEqual(res.status_code, 200)
        return res.data

    def _row(self, data, client):
        return next(r for r in data["clients"] if r["client_id"] == str(client.id))

    def _deliverable(self, url=""):
        return Deliverable.objects.create(
            mission=self.mission, name="Post", type="lien", url=url,
            uploaded_by=self.collaborateur,
        )

    def test_counts_with_and_without_link_against_the_quota(self):
        from clients.models import Client

        Client.objects.filter(pk=self.client_company.pk).update(monthly_quota=12)
        self._deliverable("https://example.com/a")
        self._deliverable("https://example.com/b")
        self._deliverable()
        row = self._row(self._get(), self.client_company)
        self.assertEqual(
            (row["quota"], row["with_link"], row["without_link"]), (12, 2, 1)
        )
        # Un client sans livrable ce mois-ci figure quand même, à zéro.
        other = self._row(self._get(), self.other_client_company)
        self.assertEqual((other["quota"], other["with_link"], other["without_link"]), (16, 0, 0))

    def test_a_new_version_does_not_add_a_content(self):
        d = self._deliverable("https://example.com/a")
        Deliverable.objects.filter(pk=d.pk).update(url="https://example.com/a-v2", version=2)
        self.assertEqual(self._row(self._get(), self.client_company)["with_link"], 1)

    def test_other_months_are_separate(self):
        from django.utils import timezone

        d = self._deliverable("https://example.com/a")
        last_month = timezone.localdate().replace(day=1) - timedelta(days=1)
        Deliverable.objects.filter(pk=d.pk).update(
            created_at=timezone.make_aware(
                timezone.datetime(last_month.year, last_month.month, 10),
                timezone.get_current_timezone(),
            )
        )
        self.assertEqual(self._row(self._get(), self.client_company)["with_link"], 0)
        past = self._get(month=f"{last_month.year}-{last_month.month:02d}")
        self.assertEqual(past["month"], f"{last_month.year}-{last_month.month:02d}")
        self.assertEqual(self._row(past, self.client_company)["with_link"], 1)

    def test_inactive_clients_only_listed_with_contents(self):
        from clients.models import Client, ClientStatus

        Client.objects.filter(pk=self.client_company.pk).update(status=ClientStatus.INACTIF)
        ids = {r["client_id"] for r in self._get()["clients"]}
        self.assertNotIn(str(self.client_company.id), ids)
        self._deliverable()
        ids = {r["client_id"] for r in self._get()["clients"]}
        self.assertIn(str(self.client_company.id), ids)

    def test_invalid_month_falls_back_to_current(self):
        from django.utils import timezone

        today = timezone.localdate()
        self.assertEqual(self._get(month="nimporte")["month"], f"{today.year}-{today.month:02d}")

    def test_client_cannot_access(self):
        self.auth_as(self.client_user)
        self.assertEqual(
            self.client.get(reverse("dashboard-content-quota")).status_code, 403
        )

    def test_lists_the_month_deliverables_links_first(self):
        self._deliverable()
        linked = self._deliverable("https://example.com/a")
        items = self._row(self._get(), self.client_company)["deliverables"]
        self.assertEqual([i["has_link"] for i in items], [True, False])
        self.assertEqual(items[0]["id"], str(linked.id))
        self.assertEqual(items[0]["mission_title"], self.mission.title)

    def test_mission_link_only_for_missions_the_user_can_open(self):
        self._deliverable("https://example.com/a")
        self.auth_as(self.other_collaborateur)
        res = self.client.get(reverse("dashboard-content-quota"))
        item = self._row(res.data, self.client_company)["deliverables"][0]
        self.assertFalse(item["can_open"])
        self.assertTrue(self._row(self._get(), self.client_company)["deliverables"][0]["can_open"])
