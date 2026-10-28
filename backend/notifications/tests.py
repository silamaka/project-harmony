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


# Sans clés, quel que soit le .env local de la machine qui lance les tests.
NO_PUSH_SETTINGS = {"VAPID_PUBLIC_KEY": "", "VAPID_PRIVATE_KEY": ""}


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
        with override_settings(**NO_PUSH_SETTINGS):
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

    def test_already_read_is_not_pushed(self):
        from unittest import mock

        from django.test import override_settings

        with override_settings(**PUSH_SETTINGS), mock.patch("pywebpush.webpush") as webpush:
            with self.captureOnCommitCallbacks(execute=True):
                n = Notification.objects.create(
                    mission=self.mission, type=NotificationType.VALIDATION, title="T", body="B"
                )
                n.read_by.add(self.client_user)
        endpoints = {c.kwargs["subscription_info"]["endpoint"] for c in webpush.call_args_list}
        self.assertNotIn(f"https://push.example.com/{self.client_user.pk}", endpoints)
        self.assertIn(f"https://push.example.com/{self.admin.pk}", endpoints)

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

        from django.test import override_settings

        with override_settings(**NO_PUSH_SETTINGS), mock.patch("pywebpush.webpush") as webpush:
            with self.captureOnCommitCallbacks(execute=True):
                Notification.objects.create(
                    mission=self.mission, type=NotificationType.VALIDATION, title="T", body="B"
                )
        webpush.assert_not_called()


class NotificationRoutingTests(RoleTestCase):
    """Chacun reçoit ce qui le concerne : l'admin et le chef de projet tout,
    le collaborateur ce qui touche ses missions, le client ce qui l'attend.
    Jamais sa propre action."""

    def _titles_for(self, user):
        self.auth_as(user)
        return [n["title"] for n in self.client.get(notification_list_url()).data]

    def _ids_for(self, user):
        self.auth_as(user)
        return [str(n["id"]) for n in self.client.get(notification_list_url()).data]

    def _deposit(self, user, url="https://example.com/v1"):
        self.auth_as(user)
        res = self.client.post(
            reverse("deliverable-list"),
            {"mission_id": str(self.mission.id), "name": "Visuel", "type": "lien", "url": url},
        )
        self.assertEqual(res.status_code, 201)
        return res.data["id"]

    # --- Livrable à revoir -------------------------------------------------

    def test_deposit_alerts_admin_and_chef_only(self):
        self._deposit(self.collaborateur)
        self.assertIn("Nouveau livrable à revoir", self._titles_for(self.admin))
        self.assertIn("Nouveau livrable à revoir", self._titles_for(self.chef_projet))
        self.assertNotIn("Nouveau livrable à revoir", self._titles_for(self.collaborateur))
        self.assertNotIn("Nouveau livrable à revoir", self._titles_for(self.client_user))

    def test_new_version_alerts_again(self):
        deliverable_id = self._deposit(self.collaborateur)
        self.client.patch(
            reverse("deliverable-detail", args=[deliverable_id]), {"url": "https://example.com/v2"}
        )
        self.assertIn("Nouvelle version à revoir", self._titles_for(self.admin))

    # --- Assignation -------------------------------------------------------

    def test_added_collaborator_alone_is_told(self):
        self.auth_as(self.admin)
        res = self.client.patch(
            reverse("mission-detail", args=[self.mission.id]),
            {"collaborators": [str(self.other_collaborateur.id)]},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        title = "Vous êtes assigné à une mission"
        self.assertIn(title, self._titles_for(self.other_collaborateur))
        # Le responsable déjà en place n'a pas à lire l'arrivée d'un autre.
        self.assertNotIn(title, self._titles_for(self.collaborateur))
        self.assertNotIn(title, self._titles_for(self.client_user))

    def test_unchanged_team_sends_nothing(self):
        self.auth_as(self.admin)
        self.client.patch(
            reverse("mission-detail", args=[self.mission.id]), {"title": "Renommée"}, format="json"
        )
        self.assertFalse(Notification.objects.filter(type=NotificationType.MISSION_ASSIGNEE).exists())

    # --- Commentaires ------------------------------------------------------

    def _comment(self, user, body, **extra):
        self.auth_as(user)
        res = self.client.post(
            reverse("comment-list"), {"mission_id": str(self.mission.id), "body": body, **extra}
        )
        self.assertEqual(res.status_code, 201)

    def test_client_question_reaches_team_not_client_itself(self):
        self._comment(self.client_user, "Une question sur la vidéo")
        title = f"Nouveau commentaire — {self.mission.title}"
        for user in [self.admin, self.chef_projet, self.collaborateur]:
            self.assertIn(title, self._titles_for(user), user.role)
        self.assertNotIn(title, self._titles_for(self.client_user))
        self.assertNotIn(title, self._titles_for(self.other_client_user))

    def test_internal_comment_stays_internal(self):
        self._comment(self.admin, "Note interne")
        title = f"Nouveau commentaire — {self.mission.title}"
        self.assertIn(title, self._titles_for(self.collaborateur))
        self.assertNotIn(title, self._titles_for(self.client_user))

    def test_team_reply_to_client_reaches_client(self):
        self._comment(self.collaborateur, "Voici la réponse", client_visible=True)
        self.assertIn(f"Nouveau commentaire — {self.mission.title}", self._titles_for(self.client_user))

    def test_collaborator_of_another_mission_sees_nothing(self):
        self._comment(self.client_user, "Question")
        self.assertNotIn(
            f"Nouveau commentaire — {self.mission.title}", self._titles_for(self.other_collaborateur)
        )

    # --- Sa propre action ----------------------------------------------------

    def test_own_action_not_in_own_bell(self):
        self.auth_as(self.admin)
        res = self.client.post(
            reverse("mission-list"),
            {
                "title": "Créée par l'admin",
                "project_id": str(self.project.id),
                "assignee_id": str(self.collaborateur.id),
                "start_date": "2026-01-01",
                "deadline": "2026-12-31",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.data)
        notification = Notification.objects.get(body="Créée par l'admin")
        self.assertEqual(notification.actor, self.admin)
        # Par identifiant : la mission de départ a aussi son "Nouvelle mission".
        self.assertNotIn(str(notification.id), self._ids_for(self.admin))
        self.assertIn(str(notification.id), self._ids_for(self.chef_projet))
        self.assertIn(str(notification.id), self._ids_for(self.collaborateur))

    def test_own_action_never_pushed_to_self(self):
        from unittest import mock

        from django.test import override_settings

        from .models import PushSubscription

        for user in [self.admin, self.chef_projet]:
            PushSubscription.objects.create(
                user=user, endpoint=f"https://push.example.com/{user.pk}", p256dh="k", auth="a"
            )
        with override_settings(**PUSH_SETTINGS), mock.patch("pywebpush.webpush") as webpush:
            with self.captureOnCommitCallbacks(execute=True):
                self._comment(self.admin, "Je préviens l'équipe")
        endpoints = {c.kwargs["subscription_info"]["endpoint"] for c in webpush.call_args_list}
        self.assertEqual(endpoints, {f"https://push.example.com/{self.chef_projet.pk}"})

    # --- Retards -----------------------------------------------------------

    def test_late_mission_flagged_once_for_team(self):
        import datetime

        from .services import notify_late_missions

        Mission.objects.filter(pk=self.mission.pk).update(deadline=datetime.date(2026, 1, 10))
        self.assertEqual(notify_late_missions(today=datetime.date(2026, 1, 12)), 1)
        self.assertEqual(notify_late_missions(today=datetime.date(2026, 1, 13)), 0)
        self.assertIn("Mission en retard", self._titles_for(self.collaborateur))
        self.assertIn("Mission en retard", self._titles_for(self.chef_projet))
        self.assertNotIn("Mission en retard", self._titles_for(self.client_user))
        self.assertNotIn("Mission en retard", self._titles_for(self.other_collaborateur))

    def test_finished_mission_never_flagged(self):
        import datetime

        from .services import notify_late_missions

        Mission.objects.filter(pk=self.mission.pk).update(
            deadline=datetime.date(2026, 1, 10), status=MissionStatus.TERMINE
        )
        self.assertEqual(notify_late_missions(today=datetime.date(2026, 1, 12)), 0)


class NotificationListLimitTests(RoleTestCase):
    def test_bell_returns_only_most_recent(self):
        from .views import NotificationViewSet

        Notification.objects.bulk_create(
            [
                Notification(type=NotificationType.MISSION_CREEE, title=f"N{i}", body="", mission=self.mission)
                for i in range(NotificationViewSet.LIST_LIMIT + 20)
            ]
        )
        self.auth_as(self.admin)
        data = self.client.get(notification_list_url()).data
        self.assertEqual(len(data), NotificationViewSet.LIST_LIMIT)
        newest = Notification.objects.order_by("-created_at", "-id").first()
        self.assertIn(str(newest.id), [str(n["id"]) for n in data])

    def test_api_responses_are_compressed(self):
        # Django ne compresse pas les toutes petites réponses : il en faut une vraie.
        Notification.objects.bulk_create(
            [
                Notification(type=NotificationType.MISSION_CREEE, title=f"N{i}", body="x" * 50)
                for i in range(20)
            ]
        )
        self.auth_as(self.admin)
        res = self.client.get(notification_list_url(), HTTP_ACCEPT_ENCODING="gzip")
        self.assertEqual(res.get("Content-Encoding"), "gzip")
