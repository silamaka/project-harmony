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
            start_date="2026-01-01",
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

    def test_client_never_sees_internal_mission_deadlines(self):
        self.auth_as(self.client_user)
        res = self.client.get(reverse("calendar"))
        self.assertEqual([e for e in res.data if e["type"] == "mission"], [])

    def test_client_sees_descentes_of_own_company_only(self):
        Mission.objects.filter(pk__in=[self.mission.pk, self.foreign_mission.pk]).update(
            task_type="descente"
        )
        self.auth_as(self.client_user)
        res = self.client.get(reverse("calendar"))
        descentes = {e["mission_id"] for e in res.data if e["type"] == "descente"}
        self.assertEqual(descentes, {str(self.mission.id)})

    def _send_to_client(self):
        """L'agence valide le livrable (sa validation vaut envoi au client)."""
        deliverable = Deliverable.objects.get(mission=self.mission)
        self.auth_as(self.admin)
        res = self.client.patch(
            reverse("deliverable-detail", args=[deliverable.id]), {"status": "valide"}
        )
        self.assertEqual(res.status_code, 200, res.data)
        deliverable.refresh_from_db()
        return deliverable

    def test_client_does_not_see_deliverable_still_in_review(self):
        self.auth_as(self.client_user)
        res = self.client.get(reverse("calendar"))
        self.assertEqual([e for e in res.data if e["type"] == "livrable"], [])

    def test_client_sees_available_deliverable_on_its_sending_date(self):
        from django.utils import timezone

        # Déposé il y a dix jours, envoyé aujourd'hui : c'est aujourd'hui qu'il
        # devient disponible pour le client, pas le jour du dépôt.
        Deliverable.objects.filter(mission=self.mission).update(
            created_at=timezone.now() - timezone.timedelta(days=10)
        )
        deliverable = self._send_to_client()
        self.assertIsNotNone(deliverable.sent_at)
        self.auth_as(self.client_user)
        [event] = [e for e in self.client.get(reverse("calendar")).data if e["type"] == "livrable"]
        self.assertEqual(event["date"], timezone.localtime(deliverable.sent_at).date().isoformat())
        self.assertEqual(event["deliverable_id"], str(deliverable.id))
        self.assertTrue(event["awaiting_client"])
        self.assertEqual(event["description"], "Disponible : il attend votre validation.")

    def test_available_deliverable_reflects_client_decision(self):
        deliverable = self._send_to_client()
        Deliverable.objects.filter(pk=deliverable.pk).update(client_status=DeliverableStatus.VALIDE)
        self.auth_as(self.client_user)
        [event] = [e for e in self.client.get(reverse("calendar")).data if e["type"] == "livrable"]
        self.assertFalse(event["awaiting_client"])
        self.assertEqual(event["description"], "Vous l'avez validé.")

    def test_team_still_sees_deposit_dates(self):
        self.auth_as(self.admin)
        res = self.client.get(reverse("calendar"))
        self.assertEqual(len([e for e in res.data if e["type"] == "livrable"]), 1)

    def test_client_sees_publication_awaiting_his_validation(self):
        from django.utils import timezone

        Deliverable.objects.filter(mission=self.mission).update(
            status=DeliverableStatus.VALIDE, scheduled_at=timezone.now()
        )
        self.auth_as(self.client_user)
        res = self.client.get(reverse("calendar"))
        [publication] = [e for e in res.data if e["type"] == "publication"]
        self.assertTrue(publication["awaiting_client"])
        self.assertEqual(publication["description"], "En attente de votre validation.")

        Deliverable.objects.filter(mission=self.mission).update(
            client_status=DeliverableStatus.VALIDE
        )
        [publication] = [e for e in self.client.get(reverse("calendar")).data if e["type"] == "publication"]
        self.assertFalse(publication["awaiting_client"])

    def test_client_does_not_see_unsent_publication(self):
        from django.utils import timezone

        # En revue chez l'agence (pas encore envoyé) : rien côté client.
        Deliverable.objects.filter(mission=self.mission).update(scheduled_at=timezone.now())
        self.auth_as(self.client_user)
        res = self.client.get(reverse("calendar"))
        self.assertEqual([e for e in res.data if e["type"] == "publication"], [])

    def test_client_does_not_see_draft_deliverable_events(self):
        """Livrable pas encore validé par l'agence : il reste interne, y
        compris sur le calendrier."""
        self.auth_as(self.client_user)
        res = self.client.get(reverse("calendar"))
        self.assertEqual([e for e in res.data if e["type"] == "livrable"], [])

    def test_mission_event_type_reflects_task_type(self):
        self.mission.task_type = "descente"
        self.mission.save()
        self.auth_as(self.admin)
        res = self.client.get(reverse("calendar"))
        event = next(e for e in res.data if e.get("mission_id") == str(self.mission.id))
        self.assertEqual(event["type"], "descente")

    def test_events_carry_client_and_project_for_filtering(self):
        Deliverable.objects.filter(mission=self.mission).update(status=DeliverableStatus.VALIDE)
        self.auth_as(self.admin)
        res = self.client.get(reverse("calendar"))
        for event in res.data:
            if event.get("mission_id") == str(self.mission.id):
                self.assertEqual(event["client_id"], str(self.mission.client_id))
                self.assertEqual(event["project_id"], str(self.mission.project_id))

    def test_mission_event_carries_status(self):
        self.mission.status = "en_cours"
        self.mission.save()
        self.auth_as(self.admin)
        res = self.client.get(reverse("calendar"))
        event = next(e for e in res.data if e["id"] == f"ev-{self.mission.id}")
        self.assertEqual(event["status"], "en_cours")

    def test_meetings_are_not_shown_on_the_calendar(self):
        """Les réunions ont été retirées du calendrier (remplacées par les
        missions de type "Descente")."""
        self.auth_as(self.admin)
        res = self.client.get(reverse("calendar"))
        self.assertNotIn("Point hebdo", {e["title"] for e in res.data})
        self.assertEqual([e for e in res.data if e["type"] == "reunion"], [])


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
