from django.urls import reverse

from core.test_utils import RoleTestCase

from deliverables.models import Deliverable, DeliverableStatus
from missions.models import Mission, MissionStatus
from .models import Meeting


def meeting_list_url():
    return reverse("meeting-list")


def meeting_detail_url(meeting_id):
    return reverse("meeting-detail", args=[meeting_id])


class CalendarEventsTests(RoleTestCase):
    def setUp(self):
        super().setUp()
        self.foreign_mission = Mission.objects.create(
            title="Mission étrangère",
            project=self.project,
            client=self.other_client_company,
            assignee=self.other_collaborateur,
            deadline="2026-06-15",
            status=MissionStatus.A_FAIRE,
        )
        Deliverable.objects.create(
            mission=self.mission,
            name="Livrable visible",
            type="lien",
            url="https://example.com/x",
            uploaded_by=self.collaborateur,
            status=DeliverableStatus.EN_ATTENTE,
        )
        self.meeting = Meeting.objects.create(title="Point hebdo", date="2026-06-01")

    def test_unauthenticated_rejected(self):
        res = self.client.get(reverse("calendar"))
        self.assertEqual(res.status_code, 401)

    def test_admin_sees_all_mission_events(self):
        self.auth_as(self.admin)
        res = self.client.get(reverse("calendar"))
        self.assertEqual(res.status_code, 200)
        mission_event_ids = {e["mission_id"] for e in res.data if e["type"] == "mission"}
        self.assertEqual(mission_event_ids, {str(self.mission.id), str(self.foreign_mission.id)})

    def test_client_sees_only_own_company_mission_events(self):
        self.auth_as(self.client_user)
        res = self.client.get(reverse("calendar"))
        self.assertEqual(res.status_code, 200)
        mission_event_ids = {e["mission_id"] for e in res.data if e["type"] == "mission"}
        self.assertEqual(mission_event_ids, {str(self.mission.id)})

    def test_client_sees_only_own_company_deliverable_events(self):
        self.auth_as(self.client_user)
        res = self.client.get(reverse("calendar"))
        livrable_events = [e for e in res.data if e["type"] == "livrable"]
        self.assertEqual(len(livrable_events), 1)
        self.assertEqual(livrable_events[0]["mission_id"], str(self.mission.id))

    def test_meetings_are_visible_to_everyone_including_client(self):
        """Design documenté : contrairement aux missions/livrables, les
        réunions ne sont pas scopées à l'entreprise."""
        self.auth_as(self.client_user)
        res = self.client.get(reverse("calendar"))
        reunion_titles = {e["title"] for e in res.data if e["type"] == "reunion"}
        self.assertIn("Point hebdo", reunion_titles)


class MeetingReadTests(RoleTestCase):
    def test_any_authenticated_role_can_list_meetings(self):
        for user in [self.admin, self.chef_projet, self.collaborateur, self.client_user]:
            self.auth_as(user)
            res = self.client.get(meeting_list_url())
            self.assertEqual(res.status_code, 200, f"failed for role={user.role}")


class MeetingWritePermissionTests(RoleTestCase):
    def _payload(self):
        return {"title": "Nouvelle réunion", "date": "2026-07-01"}

    def test_admin_can_create_meeting(self):
        self.auth_as(self.admin)
        res = self.client.post(meeting_list_url(), self._payload())
        self.assertEqual(res.status_code, 201)

    def test_chef_projet_can_create_meeting(self):
        self.auth_as(self.chef_projet)
        res = self.client.post(meeting_list_url(), self._payload())
        self.assertEqual(res.status_code, 201)

    def test_collaborateur_can_create_meeting(self):
        self.auth_as(self.collaborateur)
        res = self.client.post(meeting_list_url(), self._payload())
        self.assertEqual(res.status_code, 201)

    def test_client_cannot_create_meeting(self):
        self.auth_as(self.client_user)
        res = self.client.post(meeting_list_url(), self._payload())
        self.assertEqual(res.status_code, 403)

    def test_client_cannot_update_meeting(self):
        meeting = Meeting.objects.create(title="Existante", date="2026-07-01")
        self.auth_as(self.client_user)
        res = self.client.patch(meeting_detail_url(meeting.id), {"title": "Modifiée"})
        self.assertEqual(res.status_code, 403)

    def test_client_cannot_delete_meeting(self):
        meeting = Meeting.objects.create(title="Existante", date="2026-07-01")
        self.auth_as(self.client_user)
        res = self.client.delete(meeting_detail_url(meeting.id))
        self.assertEqual(res.status_code, 403)

    def test_collaborateur_can_delete_any_meeting(self):
        """Pas de notion de propriétaire sur une réunion : n'importe quel
        collaborateur peut en supprimer une, comme documenté."""
        meeting = Meeting.objects.create(title="Existante", date="2026-07-01")
        self.auth_as(self.collaborateur)
        res = self.client.delete(meeting_detail_url(meeting.id))
        self.assertEqual(res.status_code, 204)
