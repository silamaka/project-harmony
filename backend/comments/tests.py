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
        self.auth_as(self.client_user)
        res = self.client.get(comment_list_url())
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)

    def test_other_client_sees_none(self):
        self.auth_as(self.other_client_user)
        res = self.client.get(comment_list_url())
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 0)

    def test_unauthenticated_rejected(self):
        res = self.client.get(comment_list_url())
        self.assertEqual(res.status_code, 401)


class CommentCreateTests(CommentSetupMixin, RoleTestCase):
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

    def test_mentions_are_reextracted_from_body_not_trusted_from_payload(self):
        self.auth_as(self.collaborateur)
        res = self.client.post(
            comment_list_url(),
            {
                "mission_id": str(self.mission.id),
                "body": "Salut @admin, tu peux valider ?",
                "mentions": ["@fake-injected"],
            },
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["mentions"], ["@admin"])


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
