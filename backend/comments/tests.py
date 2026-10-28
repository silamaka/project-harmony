from django.urls import reverse

from core.test_utils import RoleTestCase

from missions.models import Mission, MissionStatus
from .models import Comment


def comment_list_url():
    return reverse("comment-list")


def comment_detail_url(comment_id):
    return reverse("comment-detail", args=[comment_id])


class CommentSetupMixin:
    def setUp(self):
        super().setUp()
        self.comment = Comment.objects.create(
            mission=self.mission, author=self.collaborateur, body="Premier commentaire"
        )
        self.foreign_mission = Mission.objects.create(
            title="Mission étrangère",
            project=self.project,
            client=self.other_client_company,
            assignee=self.other_collaborateur,
            start_date="2026-01-01",
            deadline="2026-12-31",
            status=MissionStatus.A_FAIRE,
        )


class CommentReadScopingTests(CommentSetupMixin, RoleTestCase):
    def test_admin_sees_all_comments(self):
        self.auth_as(self.admin)
        res = self.client.get(comment_list_url())
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)

    def test_client_sees_own_company_mission_comments(self):
        self.comment.client_visible = True
        self.comment.save()
        self.auth_as(self.client_user)
        res = self.client.get(comment_list_url())
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)

    def test_client_never_sees_internal_comments(self):
        """Interne par défaut : un échange de l'équipe n'est jamais lu par
        le client, ni en liste ni en accès direct."""
        self.auth_as(self.client_user)
        res = self.client.get(comment_list_url(), {"mission": str(self.mission.id)})
        self.assertEqual(res.data, [])
        res = self.client.get(reverse("comment-detail", args=[self.comment.id]))
        self.assertEqual(res.status_code, 404)

    def test_team_sees_internal_comments(self):
        self.auth_as(self.collaborateur)
        res = self.client.get(comment_list_url())
        self.assertEqual(len(res.data), 1)
        self.assertFalse(res.data[0]["client_visible"])

    def test_other_client_sees_none(self):
        self.auth_as(self.other_client_user)
        res = self.client.get(comment_list_url())
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 0)

    def test_unauthenticated_rejected(self):
        res = self.client.get(comment_list_url())
        self.assertEqual(res.status_code, 401)


class CommentCreateTests(CommentSetupMixin, RoleTestCase):
    def test_client_comment_is_always_client_visible(self):
        self.auth_as(self.client_user)
        res = self.client.post(
            comment_list_url(),
            {"mission_id": str(self.mission.id), "body": "Merci !", "client_visible": False},
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        self.assertTrue(res.data["client_visible"])

    def test_team_comment_is_internal_by_default(self):
        self.auth_as(self.collaborateur)
        res = self.client.post(
            comment_list_url(), {"mission_id": str(self.mission.id), "body": "Note interne"}
        )
        self.assertEqual(res.status_code, 201)
        self.assertFalse(res.data["client_visible"])

    def test_team_can_write_to_client(self):
        self.auth_as(self.chef_projet)
        res = self.client.post(
            comment_list_url(),
            {"mission_id": str(self.mission.id), "body": "Bonjour", "client_visible": True},
            format="json",
        )
        self.assertTrue(res.data["client_visible"])

    def test_client_can_post_comment_on_own_mission(self):
        self.auth_as(self.client_user)
        res = self.client.post(
            comment_list_url(), {"mission_id": str(self.mission.id), "body": "Un avis client"}
        )
        self.assertEqual(res.status_code, 201)

    def test_cannot_post_on_mission_outside_scope(self):
        self.auth_as(self.collaborateur)
        res = self.client.post(
            comment_list_url(), {"mission_id": str(self.foreign_mission.id), "body": "Intrusion"}
        )
        self.assertEqual(res.status_code, 400)

    def test_author_is_always_the_authenticated_user(self):
        self.auth_as(self.client_user)
        res = self.client.post(
            comment_list_url(),
            {"mission_id": str(self.mission.id), "body": "Test", "author_id": str(self.admin.id)},
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["author_id"], str(self.client_user.id))

    def test_injected_mentions_field_is_ignored(self):
        self.auth_as(self.collaborateur)
        res = self.client.post(
            comment_list_url(),
            {"mission_id": str(self.mission.id), "body": "Salut", "mentions": [str(self.admin.id)]},
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["mentions"], [])


class CommentMentionTests(CommentSetupMixin, RoleTestCase):
    """Une mention n'atteint que quelqu'un qui peut lire le message."""

    def _post(self, author, mention_ids, **extra):
        self.auth_as(author)
        res = self.client.post(
            comment_list_url(),
            {
                "mission_id": str(self.mission.id),
                "body": "Peux-tu regarder ?",
                "mention_ids": [str(i) for i in mention_ids],
                **extra,
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.data)
        return res.data

    def _mentions_for(self, user):
        from notifications.models import Notification, NotificationType
        from notifications.scoping import notifications_visible_to

        return notifications_visible_to(user).filter(type=NotificationType.MENTION)

    def test_mentioned_teammate_gets_personal_notification(self):
        data = self._post(self.admin, [self.collaborateur.id])
        self.assertEqual(data["mentions"], [str(self.collaborateur.id)])
        [notification] = self._mentions_for(self.collaborateur)
        self.assertTrue(notification.title.startswith("Admin Test vous a mentionné"))

    def test_mention_is_private_to_the_mentioned_person(self):
        self._post(self.admin, [self.collaborateur.id])
        self.assertFalse(self._mentions_for(self.chef_projet).exists())
        self.assertFalse(self._mentions_for(self.other_collaborateur).exists())

    def test_client_cannot_be_mentioned_in_internal_note(self):
        data = self._post(self.admin, [self.client_user.id])
        self.assertEqual(data["mentions"], [])
        self.assertFalse(self._mentions_for(self.client_user).exists())

    def test_client_mentioned_in_message_visible_to_him(self):
        data = self._post(self.admin, [self.client_user.id], client_visible=True)
        self.assertEqual(data["mentions"], [str(self.client_user.id)])
        self.assertTrue(self._mentions_for(self.client_user).exists())

    def test_other_company_and_outsider_collaborator_are_dropped(self):
        data = self._post(
            self.admin, [self.other_client_user.id, self.other_collaborateur.id], client_visible=True
        )
        self.assertEqual(data["mentions"], [])

    def test_author_cannot_mention_himself(self):
        data = self._post(self.admin, [self.admin.id])
        self.assertEqual(data["mentions"], [])

    def test_mention_replaces_the_general_comment_alert(self):
        from notifications.models import Notification, NotificationType
        from notifications.scoping import notifications_visible_to

        self._post(self.admin, [self.collaborateur.id])
        general = Notification.objects.get(type=NotificationType.COMMENTAIRE)
        self.assertIn(self.collaborateur, general.read_by.all())
        # Les autres membres gardent la notification générale non lue.
        self.assertNotIn(self.chef_projet, general.read_by.all())
        self.assertTrue(notifications_visible_to(self.chef_projet).filter(pk=general.pk).exists())

    def test_edit_notifies_only_newly_mentioned(self):
        from notifications.models import Notification, NotificationType

        data = self._post(self.admin, [self.collaborateur.id])
        self.client.patch(
            comment_detail_url(data["id"]),
            {"body": "Et toi aussi", "mention_ids": [str(self.collaborateur.id), str(self.chef_projet.id)]},
            format="json",
        )
        mentions = Notification.objects.filter(type=NotificationType.MENTION)
        self.assertEqual(mentions.filter(recipient=self.collaborateur).count(), 1)
        self.assertEqual(mentions.filter(recipient=self.chef_projet).count(), 1)


class CommentEditTests(CommentSetupMixin, RoleTestCase):
    """PUT reste bloqué pour tout le monde (has_permission) ; PATCH n'est
    permis qu'à l'auteur du commentaire (has_object_permission)."""

    def test_put_always_rejected_even_for_admin(self):
        self.auth_as(self.admin)
        res = self.client.put(comment_detail_url(self.comment.id), {"body": "Modifié"})
        self.assertEqual(res.status_code, 403)

    def test_author_can_edit_own_comment(self):
        self.auth_as(self.collaborateur)
        res = self.client.patch(comment_detail_url(self.comment.id), {"body": "Modifié"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["body"], "Modifié")

    def test_admin_cannot_edit_someone_elses_comment(self):
        self.auth_as(self.admin)
        res = self.client.patch(comment_detail_url(self.comment.id), {"body": "Modifié"})
        self.assertEqual(res.status_code, 403)

    def test_edit_cannot_reassign_parent_or_author(self):
        other_comment = Comment.objects.create(
            mission=self.mission, author=self.collaborateur, body="Autre message"
        )
        self.auth_as(self.collaborateur)
        res = self.client.patch(
            comment_detail_url(self.comment.id),
            {
                "body": "Modifié",
                "parent_id": str(other_comment.id),
                "author_id": str(self.admin.id),
            },
        )
        self.assertEqual(res.status_code, 200)
        self.comment.refresh_from_db()
        self.assertIsNone(self.comment.parent_id)
        self.assertEqual(self.comment.author_id, self.collaborateur.id)


class CommentDeleteTests(CommentSetupMixin, RoleTestCase):
    def test_admin_can_delete(self):
        self.auth_as(self.admin)
        res = self.client.delete(comment_detail_url(self.comment.id))
        self.assertEqual(res.status_code, 204)

    def test_chef_projet_cannot_delete(self):
        self.auth_as(self.chef_projet)
        res = self.client.delete(comment_detail_url(self.comment.id))
        self.assertEqual(res.status_code, 403)

    def test_author_can_delete_own_comment(self):
        self.auth_as(self.collaborateur)
        res = self.client.delete(comment_detail_url(self.comment.id))
        self.assertEqual(res.status_code, 204)

    def test_other_client_cannot_delete(self):
        """Hors scope, l'objet n'est même pas trouvé (404) : la portée est
        imposée par le queryset avant que has_object_permission ne soit
        évalué (même comportement qu'un GET, cf. test_other_client_get_detail_404)."""
        self.auth_as(self.other_client_user)
        res = self.client.delete(comment_detail_url(self.comment.id))
        self.assertEqual(res.status_code, 404)

    def test_other_client_get_detail_404(self):
        self.auth_as(self.other_client_user)
        res = self.client.get(comment_detail_url(self.comment.id))
        self.assertEqual(res.status_code, 404)
