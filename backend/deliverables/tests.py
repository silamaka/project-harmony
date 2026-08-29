from django.urls import reverse

from core.test_utils import RoleTestCase

from missions.models import Mission, MissionStatus
from .models import Deliverable, DeliverableStatus


def deliverable_list_url():
    return reverse("deliverable-list")


def deliverable_detail_url(deliverable_id):
    return reverse("deliverable-detail", args=[deliverable_id])


class DeliverableSetupMixin:
    def setUp(self):
        super().setUp()
        self.deliverable = Deliverable.objects.create(
            mission=self.mission,
            name="Maquette",
            type="lien",
            url="https://example.com/maquette",
            uploaded_by=self.collaborateur,
            status=DeliverableStatus.EN_ATTENTE,
        )
        # Mission d'un autre collaborateur, partagée avec la même mission
        # test pour vérifier l'isolation "mes propres dépôts" ; et une
        # mission hors scope pour vérifier qu'on ne peut pas y déposer.
        self.foreign_mission = Mission.objects.create(
            title="Mission étrangère",
            project=self.project,
            client=self.other_client_company,
            assignee=self.other_collaborateur,
            start_date="2026-01-01",
            deadline="2026-12-31",
            status=MissionStatus.A_FAIRE,
        )


class DeliverableReadScopingTests(DeliverableSetupMixin, RoleTestCase):
    def setUp(self):
        super().setUp()
        self.other_collab_deliverable = Deliverable.objects.create(
            mission=self.mission,
            name="Autre dépôt",
            type="lien",
            url="https://example.com/autre",
            uploaded_by=self.other_collaborateur,
            status=DeliverableStatus.EN_ATTENTE,
        )

    def test_admin_sees_all_deliverables(self):
        self.auth_as(self.admin)
        res = self.client.get(deliverable_list_url())
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 2)

    def test_collaborateur_without_mission_filter_sees_only_own_uploads(self):
        self.auth_as(self.collaborateur)
        res = self.client.get(deliverable_list_url())
        self.assertEqual(res.status_code, 200)
        self.assertEqual({d["id"] for d in res.data}, {str(self.deliverable.id)})

    def test_collaborateur_with_mission_filter_sees_all_deliverables_on_it(self):
        self.auth_as(self.collaborateur)
        res = self.client.get(deliverable_list_url(), {"mission": str(self.mission.id)})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 2)

    def test_client_sees_only_own_company_mission_deliverables(self):
        self.auth_as(self.client_user)
        res = self.client.get(deliverable_list_url())
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 2)

    def test_other_client_sees_none(self):
        self.auth_as(self.other_client_user)
        res = self.client.get(deliverable_list_url())
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 0)


class DeliverableCreateTests(DeliverableSetupMixin, RoleTestCase):
    def _payload(self, mission_id=None):
        return {
            "mission_id": str(mission_id or self.mission.id),
            "name": "Nouveau livrable",
            "type": "lien",
            "url": "https://example.com/nouveau",
        }

    def test_collaborateur_can_deposit_on_own_visible_mission(self):
        self.auth_as(self.collaborateur)
        res = self.client.post(deliverable_list_url(), self._payload())
        self.assertEqual(res.status_code, 201)

    def test_client_can_deposit_on_own_company_mission(self):
        self.auth_as(self.client_user)
        res = self.client.post(deliverable_list_url(), self._payload())
        self.assertEqual(res.status_code, 201)

    def test_cannot_deposit_on_mission_outside_scope(self):
        """MissionPKField restreint le choix de mission_id à ce que
        l'utilisateur peut voir : impossible de deviner l'id d'une mission
        étrangère pour y déposer un fichier."""
        self.auth_as(self.collaborateur)
        res = self.client.post(deliverable_list_url(), self._payload(mission_id=self.foreign_mission.id))
        self.assertEqual(res.status_code, 400)

    def test_uploaded_by_is_always_the_authenticated_user(self):
        """uploaded_by est dérivé côté serveur, jamais accepté du payload."""
        self.auth_as(self.other_collaborateur)
        payload = self._payload(mission_id=self.foreign_mission.id)
        payload["uploaded_by"] = str(self.admin.id)
        res = self.client.post(deliverable_list_url(), payload)
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["uploaded_by"], str(self.other_collaborateur.id))


class DeliverableStatusUpdateTests(DeliverableSetupMixin, RoleTestCase):
    def test_admin_can_validate(self):
        self.auth_as(self.admin)
        res = self.client.patch(deliverable_detail_url(self.deliverable.id), {"status": "valide"})
        self.assertEqual(res.status_code, 200)

    def test_client_can_validate_own_company_deliverable(self):
        self.auth_as(self.client_user)
        res = self.client.patch(deliverable_detail_url(self.deliverable.id), {"status": "valide"})
        self.assertEqual(res.status_code, 200)

    def test_other_client_cannot_validate(self):
        """Hors scope de get_queryset (missions_visible_to) : la fiche n'est
        même pas trouvée, jamais un 403 sur un objet invisible."""
        self.auth_as(self.other_client_user)
        res = self.client.patch(deliverable_detail_url(self.deliverable.id), {"status": "valide"})
        self.assertEqual(res.status_code, 404)

    def test_client_cannot_change_other_fields_alongside_status(self):
        self.auth_as(self.client_user)
        res = self.client.patch(
            deliverable_detail_url(self.deliverable.id), {"status": "valide", "name": "Renommé"}
        )
        self.assertEqual(res.status_code, 403)

    def test_collaborateur_cannot_self_validate_own_upload(self):
        """Un collaborateur ne peut pas valider son propre livrable, même le
        sien : seuls admin/chef de projet/client en décident."""
        self.auth_as(self.collaborateur)
        res = self.client.patch(deliverable_detail_url(self.deliverable.id), {"status": "valide"})
        self.assertEqual(res.status_code, 403)


class DeliverableDeleteTests(DeliverableSetupMixin, RoleTestCase):
    def test_admin_can_delete(self):
        self.auth_as(self.admin)
        res = self.client.delete(deliverable_detail_url(self.deliverable.id))
        self.assertEqual(res.status_code, 204)

    def test_collaborateur_cannot_delete_even_own_upload(self):
        self.auth_as(self.collaborateur)
        res = self.client.delete(deliverable_detail_url(self.deliverable.id))
        self.assertEqual(res.status_code, 403)

    def test_client_cannot_delete(self):
        self.auth_as(self.client_user)
        res = self.client.delete(deliverable_detail_url(self.deliverable.id))
        self.assertEqual(res.status_code, 403)
