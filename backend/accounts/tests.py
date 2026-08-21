from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.core import mail
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from core.test_utils import RoleTestCase

from .models import User


def user_list_url():
    return reverse("user-list")


def user_detail_url(user_id):
    return reverse("user-detail", args=[user_id])


def user_toggle_active_url(user_id):
    return reverse("user-toggle-active", args=[user_id])


class UserReadTests(RoleTestCase):
    """Lecture ouverte à tout utilisateur authentifié (résolution de noms
    partout dans l'app : assigné, auteur de commentaire...)."""

    def test_any_authenticated_role_can_list_users(self):
        for user in [self.admin, self.chef_projet, self.collaborateur, self.client_user]:
            self.auth_as(user)
            res = self.client.get(user_list_url())
            self.assertEqual(res.status_code, 200, f"failed for role={user.role}")

    def test_unauthenticated_rejected(self):
        res = self.client.get(user_list_url())
        self.assertEqual(res.status_code, 401)


class CreateUserPermissionTests(RoleTestCase):
    def _payload(self, role="collaborateur", email="new@test.local"):
        return {
            "email": email,
            "password": "pass1234",
            "first_name": "New",
            "last_name": "User",
            "role": role,
        }

    def test_admin_can_create_any_role(self):
        for role in ["admin", "chef_projet", "collaborateur", "client"]:
            self.auth_as(self.admin)
            res = self.client.post(user_list_url(), self._payload(role=role, email=f"new-{role}@test.local"))
            self.assertEqual(res.status_code, 201, f"failed for role={role}")

    def test_chef_projet_can_create_collaborateur(self):
        self.auth_as(self.chef_projet)
        res = self.client.post(user_list_url(), self._payload(role="collaborateur"))
        self.assertEqual(res.status_code, 201)

    def test_chef_projet_cannot_create_admin(self):
        self.auth_as(self.chef_projet)
        res = self.client.post(user_list_url(), self._payload(role="admin", email="newadmin@test.local"))
        self.assertEqual(res.status_code, 403)

    def test_chef_projet_cannot_create_chef_projet(self):
        self.auth_as(self.chef_projet)
        res = self.client.post(
            user_list_url(), self._payload(role="chef_projet", email="newchef@test.local")
        )
        self.assertEqual(res.status_code, 403)

    def test_chef_projet_cannot_create_client(self):
        self.auth_as(self.chef_projet)
        res = self.client.post(user_list_url(), self._payload(role="client", email="newclient@test.local"))
        self.assertEqual(res.status_code, 403)

    def test_collaborateur_cannot_create_user(self):
        self.auth_as(self.collaborateur)
        res = self.client.post(user_list_url(), self._payload())
        self.assertEqual(res.status_code, 403)

    def test_client_cannot_create_user(self):
        self.auth_as(self.client_user)
        res = self.client.post(user_list_url(), self._payload())
        self.assertEqual(res.status_code, 403)


class UpdateDeleteUserPermissionTests(RoleTestCase):
    def test_admin_can_update_any_role(self):
        for target in [self.chef_projet, self.collaborateur, self.client_user]:
            self.auth_as(self.admin)
            res = self.client.patch(user_detail_url(target.id), {"job_title": "Nouveau titre"})
            self.assertEqual(res.status_code, 200, f"failed for target role={target.role}")

    def test_chef_projet_can_update_collaborateur(self):
        self.auth_as(self.chef_projet)
        res = self.client.patch(user_detail_url(self.collaborateur.id), {"job_title": "Designer"})
        self.assertEqual(res.status_code, 200)

    def test_chef_projet_cannot_update_admin(self):
        self.auth_as(self.chef_projet)
        res = self.client.patch(user_detail_url(self.admin.id), {"job_title": "Piraté"})
        self.assertEqual(res.status_code, 403)

    def test_chef_projet_cannot_update_client(self):
        self.auth_as(self.chef_projet)
        res = self.client.patch(user_detail_url(self.client_user.id), {"job_title": "Piraté"})
        self.assertEqual(res.status_code, 403)

    def test_collaborateur_cannot_update_another_user(self):
        self.auth_as(self.collaborateur)
        res = self.client.patch(user_detail_url(self.other_collaborateur.id), {"job_title": "Piraté"})
        self.assertEqual(res.status_code, 403)

    def test_client_cannot_update_another_user(self):
        self.auth_as(self.client_user)
        res = self.client.patch(user_detail_url(self.collaborateur.id), {"job_title": "Piraté"})
        self.assertEqual(res.status_code, 403)

    def test_admin_can_delete_user(self):
        self.auth_as(self.admin)
        res = self.client.delete(user_detail_url(self.other_collaborateur.id))
        self.assertEqual(res.status_code, 204)

    def test_chef_projet_can_delete_collaborateur(self):
        self.auth_as(self.chef_projet)
        res = self.client.delete(user_detail_url(self.other_collaborateur.id))
        self.assertEqual(res.status_code, 204)

    def test_deleting_user_with_assigned_missions_fails_cleanly(self):
        """Régression : supprimer un utilisateur encore assigné à des
        missions plantait (ProtectedError non gérée, 500) au lieu de
        renvoyer une erreur propre."""
        self.auth_as(self.admin)
        res = self.client.delete(user_detail_url(self.collaborateur.id))
        self.assertEqual(res.status_code, 400)
        self.assertTrue(User.objects.filter(id=self.collaborateur.id).exists())

    def test_chef_projet_cannot_delete_admin(self):
        self.auth_as(self.chef_projet)
        res = self.client.delete(user_detail_url(self.admin.id))
        self.assertEqual(res.status_code, 403)

    def test_collaborateur_cannot_delete_anyone(self):
        self.auth_as(self.collaborateur)
        res = self.client.delete(user_detail_url(self.other_collaborateur.id))
        self.assertEqual(res.status_code, 403)


class ToggleActiveTests(RoleTestCase):
    """toggle_active est un POST sans corps : la même logique de permission
    que la création (qui inspecte request.data.get('role')) ne doit pas s'y
    appliquer par erreur."""

    def test_admin_can_toggle_collaborateur_active(self):
        self.auth_as(self.admin)
        was_active = self.collaborateur.is_active
        res = self.client.post(user_toggle_active_url(self.collaborateur.id))
        self.assertEqual(res.status_code, 200)
        self.collaborateur.refresh_from_db()
        self.assertEqual(self.collaborateur.is_active, not was_active)

    def test_chef_projet_can_toggle_collaborateur_active(self):
        self.auth_as(self.chef_projet)
        res = self.client.post(user_toggle_active_url(self.collaborateur.id))
        self.assertEqual(res.status_code, 200)

    def test_chef_projet_cannot_toggle_admin_active(self):
        self.auth_as(self.chef_projet)
        res = self.client.post(user_toggle_active_url(self.admin.id))
        self.assertEqual(res.status_code, 403)

    def test_collaborateur_cannot_toggle_anyone(self):
        self.auth_as(self.collaborateur)
        res = self.client.post(user_toggle_active_url(self.other_collaborateur.id))
        self.assertEqual(res.status_code, 403)


class LoginThrottleTests(RoleTestCase):
    """Protection contre le bourrage de mots de passe : au-delà de
    auth-sensitive (10/min), /auth/login/ doit se mettre à refuser."""

    def test_login_gets_throttled_after_limit(self):
        url = reverse("login")
        statuses = []
        for _ in range(11):
            res = self.client.post(url, {"email": "nobody@test.local", "password": "wrong"})
            statuses.append(res.status_code)
        self.assertNotIn(429, statuses[:10], "throttled too early")
        self.assertEqual(statuses[10], 429)


class ForgotPasswordTests(RoleTestCase):
    def test_existing_email_sends_reset_link(self):
        res = self.client.post(reverse("password_forgot"), {"email": self.collaborateur.email})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(self.collaborateur.email, mail.outbox[0].to)
        self.assertIn("reinitialiser-mot-de-passe", mail.outbox[0].body)

    def test_unknown_email_returns_same_response_without_sending(self):
        """Ne doit jamais révéler si une adresse existe ou non."""
        res = self.client.post(reverse("password_forgot"), {"email": "inconnu@test.local"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(mail.outbox), 0)

    def test_missing_email_does_not_crash(self):
        res = self.client.post(reverse("password_forgot"), {})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(mail.outbox), 0)


class ResetPasswordTests(RoleTestCase):
    def _valid_token_payload(self, user):
        return {
            "uid": urlsafe_base64_encode(force_bytes(user.pk)),
            "token": PasswordResetTokenGenerator().make_token(user),
        }

    def test_valid_token_resets_password(self):
        payload = self._valid_token_payload(self.collaborateur)
        payload["password"] = "nouveau-mdp-1234"
        res = self.client.post(reverse("password_reset"), payload)
        self.assertEqual(res.status_code, 200)
        self.collaborateur.refresh_from_db()
        self.assertTrue(self.collaborateur.check_password("nouveau-mdp-1234"))

    def test_reset_allows_login_with_new_password(self):
        payload = self._valid_token_payload(self.collaborateur)
        payload["password"] = "nouveau-mdp-1234"
        self.client.post(reverse("password_reset"), payload)
        res = self.client.post(
            reverse("login"), {"email": self.collaborateur.email, "password": "nouveau-mdp-1234"}
        )
        self.assertEqual(res.status_code, 200)

    def test_token_cannot_be_reused_after_password_changed(self):
        payload = self._valid_token_payload(self.collaborateur)
        payload["password"] = "premier-mdp-1234"
        self.client.post(reverse("password_reset"), payload)
        # Même jeton, même uid, nouvelle tentative avec un autre mot de passe.
        res = self.client.post(reverse("password_reset"), {**payload, "password": "second-mdp-1234"})
        self.assertEqual(res.status_code, 400)

    def test_invalid_token_rejected(self):
        res = self.client.post(
            reverse("password_reset"),
            {
                "uid": urlsafe_base64_encode(force_bytes(self.collaborateur.pk)),
                "token": "invalide-au-hasard",
                "password": "nouveau-mdp-1234",
            },
        )
        self.assertEqual(res.status_code, 400)

    def test_token_for_wrong_user_rejected(self):
        """Le jeton d'un utilisateur ne doit pas réinitialiser un autre compte."""
        payload = self._valid_token_payload(self.collaborateur)
        payload["uid"] = urlsafe_base64_encode(force_bytes(self.admin.pk))
        payload["password"] = "nouveau-mdp-1234"
        res = self.client.post(reverse("password_reset"), payload)
        self.assertEqual(res.status_code, 400)
        self.admin.refresh_from_db()
        self.assertFalse(self.admin.check_password("nouveau-mdp-1234"))

    def test_malformed_uid_does_not_crash(self):
        res = self.client.post(
            reverse("password_reset"),
            {"uid": "not-valid-base64!!!", "token": "x", "password": "nouveau-mdp-1234"},
        )
        self.assertEqual(res.status_code, 400)

    def test_password_too_short_rejected(self):
        payload = self._valid_token_payload(self.collaborateur)
        payload["password"] = "abc"
        res = self.client.post(reverse("password_reset"), payload)
        self.assertEqual(res.status_code, 400)
