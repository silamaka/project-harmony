from django.urls import reverse

from core.test_utils import RoleTestCase

from .models import Project, ProjectStatus


def project_list_url():
    return reverse("project-list")


def project_detail_url(project_id):
    return reverse("project-detail", args=[project_id])


class ProjectReadScopingTests(RoleTestCase):
    def setUp(self):
        super().setUp()
        self.other_project = Project.objects.create(
            name="Projet étranger",
            client=self.other_client_company,
            owner=self.chef_projet,
            start_date="2026-01-01",
            end_date="2026-12-31",
            status=ProjectStatus.EN_COURS,
        )

    def test_admin_sees_all_projects(self):
        self.auth_as(self.admin)
        res = self.client.get(project_list_url())
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 2)

    def test_collaborateur_sees_all_projects(self):
        # Design documenté : lecture ouverte à tout authentifié, seule
        # l'écriture est restreinte à admin/chef de projet.
        self.auth_as(self.collaborateur)
        res = self.client.get(project_list_url())
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 2)

    def test_client_sees_only_own_company_projects(self):
        self.auth_as(self.client_user)
        res = self.client.get(project_list_url())
        self.assertEqual(res.status_code, 200)
        self.assertEqual({p["id"] for p in res.data}, {str(self.project.id)})

    def test_client_query_param_cannot_leak_other_company_projects(self):
        """Même en demandant explicitement le projet d'une autre société via
        ?client=, le scoping par rôle doit rester la restriction finale."""
        self.auth_as(self.client_user)
        res = self.client.get(project_list_url(), {"client": str(self.other_client_company.id)})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 0)

    def test_unauthenticated_rejected(self):
        res = self.client.get(project_list_url())
        self.assertEqual(res.status_code, 401)


class ProjectWritePermissionTests(RoleTestCase):
    def _payload(self):
        return {
            "name": "Nouveau projet",
            "client_id": str(self.client_company.id),
            "owner_id": str(self.chef_projet.id),
            "start_date": "2026-01-01",
            "end_date": "2026-12-31",
        }

    def test_admin_can_create_project(self):
        self.auth_as(self.admin)
        res = self.client.post(project_list_url(), self._payload())
        self.assertEqual(res.status_code, 201)

    def test_chef_projet_can_create_project(self):
        self.auth_as(self.chef_projet)
        res = self.client.post(project_list_url(), self._payload())
        self.assertEqual(res.status_code, 201)

    def test_collaborateur_cannot_create_project(self):
        self.auth_as(self.collaborateur)
        res = self.client.post(project_list_url(), self._payload())
        self.assertEqual(res.status_code, 403)

    def test_client_cannot_create_project(self):
        self.auth_as(self.client_user)
        res = self.client.post(project_list_url(), self._payload())
        self.assertEqual(res.status_code, 403)

    def test_admin_can_update_project(self):
        self.auth_as(self.admin)
        res = self.client.patch(project_detail_url(self.project.id), {"status": "termine"})
        self.assertEqual(res.status_code, 200)

    def test_collaborateur_cannot_update_project(self):
        self.auth_as(self.collaborateur)
        res = self.client.patch(project_detail_url(self.project.id), {"status": "termine"})
        self.assertEqual(res.status_code, 403)

    def test_client_cannot_update_own_project(self):
        self.auth_as(self.client_user)
        res = self.client.patch(project_detail_url(self.project.id), {"status": "termine"})
        self.assertEqual(res.status_code, 403)

    def test_admin_can_delete_project(self):
        self.auth_as(self.admin)
        res = self.client.delete(project_detail_url(self.project.id))
        self.assertEqual(res.status_code, 204)

    def test_collaborateur_cannot_delete_project(self):
        self.auth_as(self.collaborateur)
        res = self.client.delete(project_detail_url(self.project.id))
        self.assertEqual(res.status_code, 403)
