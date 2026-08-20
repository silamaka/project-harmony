from django.urls import reverse

from core.test_utils import RoleTestCase

from missions.models import Mission, MissionStatus
from .models import Notification, NotificationType


def notification_list_url():
    return reverse("notification-list")


def notification_detail_url(notification_id):
    return reverse("notification-detail", args=[notification_id])


def notification_mark_all_read_url():
    return reverse("notification-mark-all-read")


class NotificationSetupMixin:
    def setUp(self):
        super().setUp()
        self.foreign_mission = Mission.objects.create(
            title="Mission étrangère",
            project=self.project,
            client=self.other_client_company,
            assignee=self.other_collaborateur,
            deadline="2026-12-31",
            status=MissionStatus.A_FAIRE,
        )
        # Créer une mission déclenche déjà notify_mission_created (signal
        # réel) : on repart d'une ardoise propre pour contrôler exactement
        # les notifications en jeu dans ces tests plutôt que de les compter
        # en plus des notifications auto-générées ci-dessus.
        Notification.objects.all().delete()
        self.own_notification = Notification.objects.create(
            type=NotificationType.MISSION_CREEE,
            title="Nouvelle mission",
            body=self.mission.title,
            mission=self.mission,
        )
        self.foreign_notification = Notification.objects.create(
            type=NotificationType.MISSION_CREEE,
            title="Nouvelle mission",
            body=self.foreign_mission.title,
            mission=self.foreign_mission,
        )
        self.global_notification = Notification.objects.create(
            type=NotificationType.RETARD, title="Retard global", body="Sans mission liée"
        )


class NotificationReadScopingTests(NotificationSetupMixin, RoleTestCase):
    def test_admin_sees_all_notifications(self):
        self.auth_as(self.admin)
        res = self.client.get(notification_list_url())
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 3)

    def test_client_sees_own_mission_and_global_notifications_only(self):
        self.auth_as(self.client_user)
        res = self.client.get(notification_list_url())
        self.assertEqual(res.status_code, 200)
        self.assertEqual(
            {n["id"] for n in res.data},
            {str(self.own_notification.id), str(self.global_notification.id)},
        )

    def test_collaborateur_sees_own_mission_and_global_notifications_only(self):
        self.auth_as(self.collaborateur)
        res = self.client.get(notification_list_url())
        self.assertEqual(res.status_code, 200)
        self.assertEqual(
            {n["id"] for n in res.data},
            {str(self.own_notification.id), str(self.global_notification.id)},
        )

    def test_unauthenticated_rejected(self):
        res = self.client.get(notification_list_url())
        self.assertEqual(res.status_code, 401)


class NotificationMarkReadTests(NotificationSetupMixin, RoleTestCase):
    def test_any_role_can_mark_own_notification_read(self):
        self.auth_as(self.client_user)
        res = self.client.patch(notification_detail_url(self.own_notification.id), {"read": True})
        self.assertEqual(res.status_code, 200)
        self.own_notification.refresh_from_db()
        self.assertTrue(self.own_notification.read)

    def test_cannot_mark_foreign_notification_read(self):
        self.auth_as(self.client_user)
        res = self.client.patch(notification_detail_url(self.foreign_notification.id), {"read": True})
        self.assertEqual(res.status_code, 404)

    def test_mark_all_read_only_affects_own_scope(self):
        self.auth_as(self.client_user)
        res = self.client.post(notification_mark_all_read_url())
        self.assertEqual(res.status_code, 200)
        self.own_notification.refresh_from_db()
        self.foreign_notification.refresh_from_db()
        self.assertTrue(self.own_notification.read)
        self.assertFalse(self.foreign_notification.read, "mark-all-read leaked outside scope")

    def test_substantive_fields_are_read_only(self):
        self.auth_as(self.admin)
        res = self.client.patch(notification_detail_url(self.own_notification.id), {"title": "Piraté"})
        self.assertEqual(res.status_code, 200)
        self.own_notification.refresh_from_db()
        self.assertEqual(self.own_notification.title, "Nouvelle mission")


class NotificationDeleteTests(NotificationSetupMixin, RoleTestCase):
    def test_admin_can_delete(self):
        self.auth_as(self.admin)
        res = self.client.delete(notification_detail_url(self.own_notification.id))
        self.assertEqual(res.status_code, 204)

    def test_non_admin_cannot_delete(self):
        self.auth_as(self.chef_projet)
        res = self.client.delete(notification_detail_url(self.own_notification.id))
        self.assertEqual(res.status_code, 403)


class NotificationCreateEndpointTests(RoleTestCase):
    """Régression : POST /notifications/ créait une notification vide (tous
    les champs substantiels étant read_only, une requête sans permission
    particulière aboutissait quand même à un 201 avec type/title/body
    vides) — les notifications ne doivent naître que des signaux serveur."""

    def test_direct_create_is_rejected_even_for_admin(self):
        self.auth_as(self.admin)
        before = Notification.objects.count()
        res = self.client.post(notification_list_url(), {"title": "Fausse notif", "body": "x"})
        self.assertEqual(res.status_code, 405)
        self.assertEqual(Notification.objects.count(), before)
