from django.urls import reverse

from core.test_utils import RoleTestCase

from accounts.models import User


def client_list_url():
    return reverse("client-list")


def client_detail_url(client_id):
    return reverse("client-detail", args=[client_id])


class ClientReadTests(RoleTestCase):
    """Lecture ouverte à tout utilisateur authentifié, y compris un client
    (portail, résolution de noms dans les tableaux) — design documenté, pas
    un oubli."""

    def test_any_authenticated_role_can_list_clients(self):
        for user in [self.admin, self.chef_projet, self.collaborateur, self.client_user]:
            self.auth_as(user)
            res = self.client.get(client_list_url())
            self.assertEqual(res.status_code, 200, f"failed for role={user.role}")

    def test_unauthenticated_rejected(self):
        res = self.client.get(client_list_url())
        self.assertEqual(res.status_code, 401)


class ClientWritePermissionTests(RoleTestCase):
    def test_admin_can_create_client(self):
        self.auth_as(self.admin)
        res = self.client.post(client_list_url(), {"name": "Nouveau client"})
        self.assertEqual(res.status_code, 201)

    def test_chef_projet_cannot_create_client(self):
        self.auth_as(self.chef_projet)
        res = self.client.post(client_list_url(), {"name": "Nouveau client"})
        self.assertEqual(res.status_code, 403)

    def test_collaborateur_cannot_create_client(self):
        self.auth_as(self.collaborateur)
        res = self.client.post(client_list_url(), {"name": "Nouveau client"})
        self.assertEqual(res.status_code, 403)

    def test_client_cannot_create_client(self):
        self.auth_as(self.client_user)
        res = self.client.post(client_list_url(), {"name": "Nouveau client"})
        self.assertEqual(res.status_code, 403)

    def test_admin_can_update_client(self):
        self.auth_as(self.admin)
        res = self.client.patch(client_detail_url(self.client_company.id), {"industry": "Retail"})
        self.assertEqual(res.status_code, 200)

    def test_chef_projet_can_update_client(self):
        self.auth_as(self.chef_projet)
        res = self.client.patch(client_detail_url(self.client_company.id), {"industry": "Retail"})
        self.assertEqual(res.status_code, 200)

    def test_collaborateur_cannot_update_client(self):
        self.auth_as(self.collaborateur)
        res = self.client.patch(client_detail_url(self.client_company.id), {"industry": "Retail"})
        self.assertEqual(res.status_code, 403)

    def test_client_cannot_update_own_company(self):
        self.auth_as(self.client_user)
        res = self.client.patch(client_detail_url(self.client_company.id), {"industry": "Retail"})
        self.assertEqual(res.status_code, 403)

    def test_admin_can_delete_client(self):
        self.auth_as(self.admin)
        res = self.client.delete(client_detail_url(self.client_company.id))
        self.assertEqual(res.status_code, 204)

    def test_chef_projet_cannot_delete_client(self):
        self.auth_as(self.chef_projet)
        res = self.client.delete(client_detail_url(self.client_company.id))
        self.assertEqual(res.status_code, 403)


class ClientDeletionDetachesUserTests(RoleTestCase):
    def test_deleting_client_detaches_linked_user_instead_of_deleting_it(self):
        self.auth_as(self.admin)
        res = self.client.delete(client_detail_url(self.client_company.id))
        self.assertEqual(res.status_code, 204)
        self.client_user.refresh_from_db()
        self.assertIsNone(self.client_user.client_id)
        self.assertTrue(User.objects.filter(id=self.client_user.id).exists())
