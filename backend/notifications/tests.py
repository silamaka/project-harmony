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
            start_date="2026-01-01",
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
        # Seule notification censée être visible par le client : un livrable
        # envoyé sur l'une de ses propres missions, en attente de validation.
        self.own_validation_notification = Notification.objects.create(
            type=NotificationType.VALIDATION,
            title="Mission prête pour validation",
            body=self.mission.title,
            mission=self.mission,
        )


class NotificationReadScopingTests(NotificationSetupMixin, RoleTestCase):
    def test_admin_sees_all_notifications(self):
        self.auth_as(self.admin)
        res = self.client.get(notification_list_url())
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 4)

    def test_client_sees_only_own_validation_notifications(self):
        """Le client n'est alerté que pour les livrables de ses propres
        missions en attente de validation — jamais la création de mission
        ou d'autres évènements internes à l'agence."""
        self.auth_as(self.client_user)
        res = self.client.get(notification_list_url())
        self.assertEqual(res.status_code, 200)
        self.assertEqual(
            {n["id"] for n in res.data},
            {str(self.own_validation_notification.id)},
        )

    def test_collaborateur_sees_only_new_missions_and_corrections_on_own_missions(self):
        corrections = Notification.objects.create(
            type=NotificationType.DECISION_CLIENT,
            title="Corrections demandées par le client",
            body="Client — livrable « Maquette » v1",
            mission=self.mission,
        )
        Notification.objects.create(
            type=NotificationType.DECISION_CLIENT,
            title="Validé par le client",
            body="Client — livrable « Maquette » v1",
            mission=self.mission,
        )
        Notification.objects.create(
            type=NotificationType.DECISION_CLIENT,
            title="Corrections demandées par le client",
            body="Autre client",
            mission=self.foreign_mission,
        )
        self.auth_as(self.collaborateur)
        res = self.client.get(notification_list_url())
        self.assertEqual(res.status_code, 200)
        # Ni la validation, ni l'alerte écrite pour le client, ni l'alerte
        # globale, ni ce qui concerne la mission d'un autre.
        self.assertEqual(
            {n["id"] for n in res.data},
            {str(self.own_notification.id), str(corrections.id)},
        )

    def test_unauthenticated_rejected(self):
        res = self.client.get(notification_list_url())
        self.assertEqual(res.status_code, 401)


class NotificationMarkReadTests(NotificationSetupMixin, RoleTestCase):
    def test_any_role_can_mark_own_notification_read(self):
        self.auth_as(self.client_user)
        res = self.client.patch(
            notification_detail_url(self.own_validation_notification.id), {"read": True}
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["read"])
        self.assertTrue(self._read_by(self.own_validation_notification, self.client_user))

    def test_client_cannot_mark_out_of_scope_notification_read(self):
        """Ni une notification étrangère, ni une notification d'un type
        exclu (ex. création de mission) sur sa propre mission."""
        self.auth_as(self.client_user)
        res = self.client.patch(notification_detail_url(self.foreign_notification.id), {"read": True})
        self.assertEqual(res.status_code, 404)
        res = self.client.patch(notification_detail_url(self.own_notification.id), {"read": True})
        self.assertEqual(res.status_code, 404)

    def test_mark_all_read_only_affects_own_scope(self):
        self.auth_as(self.client_user)
        res = self.client.post(notification_mark_all_read_url())
        self.assertEqual(res.status_code, 200)
        u = self.client_user
        self.assertTrue(self._read_by(self.own_validation_notification, u))
        self.assertFalse(self._read_by(self.own_notification, u), "leaked to an excluded type")
        self.assertFalse(self._read_by(self.foreign_notification, u), "leaked outside scope")

    def test_read_state_is_per_person(self):
        """L'équipe qui marque tout comme lu ne doit pas effacer les alertes
        du client (et inversement) : l'état "lu" est propre à chacun."""
        self.auth_as(self.admin)
        self.client.post(notification_mark_all_read_url())
        self.auth_as(self.client_user)
        res = self.client.get(reverse("notification-list"))
        own = next(n for n in res.data if n["id"] == str(self.own_validation_notification.id))
        self.assertFalse(own["read"], "le client doit encore voir son alerte comme non lue")

    def test_can_mark_unread_again(self):
        self.auth_as(self.client_user)
        url = notification_detail_url(self.own_validation_notification.id)
        self.client.patch(url, {"read": True})
        res = self.client.patch(url, {"read": False})
        self.assertFalse(res.data["read"])

    @staticmethod
    def _read_by(notification, user):
        return notification.read_by.filter(pk=user.pk).exists()

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


PUSH_SETTINGS = {
    "VAPID_PUBLIC_KEY": "BM0B9CwZraYMNQf62iurv9A1Dw2udE2MtY7rjr9q85eRbIi1OpmnKb_z6uGL3JgEPwG6xRtTkSkYG8w8U01V6pE",
    "VAPID_PRIVATE_KEY": "mzq0MVXVkTht8TnuQTcCEEpLACdHuOCCQP64sDZRR7Q",
    "PUSH_SYNC": True,
}


def push_url():
    return reverse("notification-push")


def subscription_payload(name):
    return {
        "endpoint": f"https://push.example.com/{name}",
        "keys": {"p256dh": f"p256dh-{name}", "auth": f"auth-{name}"},
    }


class PushSubscriptionApiTests(RoleTestCase):
    def test_subscribe_registers_device_for_current_user(self):
        from .models import PushSubscription

        self.auth_as(self.client_user)
        res = self.client.post(push_url(), subscription_payload("phone"), format="json")
        self.assertEqual(res.status_code, 201)
        sub = PushSubscription.objects.get(endpoint="https://push.example.com/phone")
        self.assertEqual(sub.user, self.client_user)

    def test_same_device_moves_to_the_account_now_logged_in(self):
        from .models import PushSubscription

        self.auth_as(self.client_user)
        self.client.post(push_url(), subscription_payload("shared"), format="json")
        self.auth_as(self.admin)
        self.client.post(push_url(), subscription_payload("shared"), format="json")
        self.assertEqual(PushSubscription.objects.get().user, self.admin)

    def test_invalid_subscription_rejected(self):
        self.auth_as(self.admin)
        res = self.client.post(push_url(), {"endpoint": "http://x", "keys": {}}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_unsubscribe_only_removes_own_device(self):
        from .models import PushSubscription

        self.auth_as(self.client_user)
        self.client.post(push_url(), subscription_payload("mine"), format="json")
        self.auth_as(self.admin)
        self.client.delete(push_url(), {"endpoint": "https://push.example.com/mine"}, format="json")
        self.assertTrue(PushSubscription.objects.exists())
        self.auth_as(self.client_user)
        self.client.delete(push_url(), {"endpoint": "https://push.example.com/mine"}, format="json")
        self.assertFalse(PushSubscription.objects.exists())

    def test_requires_authentication(self):
        res = self.client.post(push_url(), subscription_payload("anon"), format="json")
        self.assertEqual(res.status_code, 401)

    def test_public_key_exposed_only_when_configured(self):
        from django.test import override_settings

        self.auth_as(self.admin)
        self.assertFalse(self.client.get(push_url()).data["enabled"])
        with override_settings(**PUSH_SETTINGS):
            data = self.client.get(push_url()).data
        self.assertTrue(data["enabled"])
        self.assertEqual(data["public_key"], PUSH_SETTINGS["VAPID_PUBLIC_KEY"])


class PushDeliveryTests(RoleTestCase):
    """Un appareil ne reçoit que ce que son propriétaire voit dans sa cloche."""

    def setUp(self):
        super().setUp()
        from .models import PushSubscription

        for user in [self.admin, self.chef_projet, self.collaborateur, self.client_user, self.other_client_user]:
            PushSubscription.objects.create(
                user=user, endpoint=f"https://push.example.com/{user.pk}", p256dh="k", auth="a"
            )

    def _notify(self, **fields):
        from unittest import mock

        from django.test import override_settings

        with override_settings(**PUSH_SETTINGS), mock.patch("pywebpush.webpush") as webpush:
            with self.captureOnCommitCallbacks(execute=True):
                Notification.objects.create(mission=self.mission, title="T", body="B", **fields)
        endpoints = {call.kwargs["subscription_info"]["endpoint"] for call in webpush.call_args_list}
        return {int(e.rsplit("/", 1)[1]) for e in endpoints}, webpush

    def test_validation_reaches_client_and_staff_not_collaborator(self):
        reached, _ = self._notify(type=NotificationType.VALIDATION, link="/missions/1")
        self.assertEqual(reached, {self.admin.pk, self.chef_projet.pk, self.client_user.pk})

    def test_internal_event_never_reaches_client(self):
        reached, _ = self._notify(type=NotificationType.DECISION_CLIENT)
        self.assertNotIn(self.client_user.pk, reached)
        self.assertNotIn(self.other_client_user.pk, reached)

    def test_mission_created_reaches_assigned_collaborator(self):
        # Le signal de création de mission notifie déjà : on vérifie l'envoi réel.
        reached, _ = self._notify(type=NotificationType.MISSION_CREEE)
        self.assertIn(self.collaborateur.pk, reached)
        self.assertNotIn(self.client_user.pk, reached)

    def test_payload_carries_title_body_and_link(self):
        import json

        _, webpush = self._notify(type=NotificationType.VALIDATION, link="/missions/42")
        payload = json.loads(webpush.call_args_list[0].kwargs["data"])
        self.assertEqual(payload["title"], "T")
        self.assertEqual(payload["body"], "B")
        self.assertEqual(payload["url"], "/missions/42")

    def test_inactive_user_gets_nothing(self):
        self.client_user.is_active = False
        self.client_user.save()
        reached, _ = self._notify(type=NotificationType.VALIDATION)
        self.assertNotIn(self.client_user.pk, reached)

    def test_expired_device_is_forgotten(self):
        from unittest import mock

        from django.test import override_settings
        from pywebpush import WebPushException

        from .models import PushSubscription

        gone = WebPushException("gone", response=mock.Mock(status_code=410))
        with override_settings(**PUSH_SETTINGS), mock.patch("pywebpush.webpush", side_effect=gone):
            with self.captureOnCommitCallbacks(execute=True):
                Notification.objects.create(
                    mission=self.mission, type=NotificationType.VALIDATION, title="T", body="B"
                )
        self.assertFalse(PushSubscription.objects.filter(user=self.client_user).exists())

    def test_nothing_sent_without_server_keys(self):
        from unittest import mock

        with mock.patch("pywebpush.webpush") as webpush:
            with self.captureOnCommitCallbacks(execute=True):
                Notification.objects.create(
                    mission=self.mission, type=NotificationType.VALIDATION, title="T", body="B"
                )
        webpush.assert_not_called()
