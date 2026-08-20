from django.urls import reverse

from core.test_utils import RoleTestCase

from .models import Mission, MissionStatus


def mission_list_url():
    return reverse("mission-list")


def mission_detail_url(mission_id):
    return reverse("mission-detail", args=[mission_id])


class MissionReadScopingTests(RoleTestCase):
    """Un utilisateur ne doit jamais voir une mission hors de son périmètre :
    un collaborateur que les siennes, un client que celles de sa société."""

    def setUp(self):
        super().setUp()
        # Mission d'un autre collaborateur, sur une autre entreprise cliente —
        # ne doit apparaître pour ni l'un ni l'autre par défaut.
        self.foreign_mission = Mission.objects.create(
            title="Mission étrangère",
            project=self.project,
            client=self.other_client_company,
            assignee=self.other_collaborateur,
            deadline="2026-12-31",
            status=MissionStatus.A_FAIRE,
        )

    def test_admin_sees_all_missions(self):
        self.auth_as(self.admin)
        res = self.client.get(mission_list_url())
        self.assertEqual(res.status_code, 200)
        self.assertEqual({m["id"] for m in res.data}, {str(self.mission.id), str(self.foreign_mission.id)})

    def test_chef_projet_sees_all_missions(self):
        self.auth_as(self.chef_projet)
        res = self.client.get(mission_list_url())
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 2)

    def test_collaborateur_sees_only_own_missions(self):
        self.auth_as(self.collaborateur)
        res = self.client.get(mission_list_url())
        self.assertEqual(res.status_code, 200)
        self.assertEqual({m["id"] for m in res.data}, {str(self.mission.id)})

    def test_client_sees_only_own_company_missions(self):
        self.auth_as(self.client_user)
        res = self.client.get(mission_list_url())
        self.assertEqual(res.status_code, 200)
        self.assertEqual({m["id"] for m in res.data}, {str(self.mission.id)})

    def test_collaborateur_gets_404_on_foreign_mission_detail(self):
        self.auth_as(self.collaborateur)
        res = self.client.get(mission_detail_url(self.foreign_mission.id))
        self.assertEqual(res.status_code, 404)

    def test_unauthenticated_request_rejected(self):
        res = self.client.get(mission_list_url())
        self.assertEqual(res.status_code, 401)


class MissionCreateDeleteTests(RoleTestCase):
    def _payload(self):
        return {
            "title": "Nouvelle mission",
            "project_id": str(self.project.id),
            "assignee_id": str(self.collaborateur.id),
            "deadline": "2026-12-31",
            "priority": "normale",
            "status": "a_faire",
        }

    def test_admin_can_create_mission(self):
        self.auth_as(self.admin)
        res = self.client.post(mission_list_url(), self._payload())
        self.assertEqual(res.status_code, 201)

    def test_chef_projet_can_create_mission(self):
        self.auth_as(self.chef_projet)
        res = self.client.post(mission_list_url(), self._payload())
        self.assertEqual(res.status_code, 201)

    def test_collaborateur_cannot_create_mission(self):
        self.auth_as(self.collaborateur)
        res = self.client.post(mission_list_url(), self._payload())
        self.assertEqual(res.status_code, 403)

    def test_client_cannot_create_mission(self):
        self.auth_as(self.client_user)
        res = self.client.post(mission_list_url(), self._payload())
        self.assertEqual(res.status_code, 403)

    def test_admin_can_delete_mission(self):
        self.auth_as(self.admin)
        res = self.client.delete(mission_detail_url(self.mission.id))
        self.assertEqual(res.status_code, 204)

    def test_collaborateur_cannot_delete_mission(self):
        self.auth_as(self.collaborateur)
        res = self.client.delete(mission_detail_url(self.mission.id))
        self.assertEqual(res.status_code, 403)

    def test_client_cannot_delete_mission(self):
        self.auth_as(self.client_user)
        res = self.client.delete(mission_detail_url(self.mission.id))
        self.assertEqual(res.status_code, 403)


class CollaborateurUpdateTests(RoleTestCase):
    """Un collaborateur ne peut modifier que statut/priorité, et uniquement
    sur sa propre mission."""

    def test_can_update_status_on_own_mission(self):
        self.auth_as(self.collaborateur)
        res = self.client.patch(mission_detail_url(self.mission.id), {"status": "en_cours"})
        self.assertEqual(res.status_code, 200)
        self.mission.refresh_from_db()
        self.assertEqual(self.mission.status, "en_cours")

    def test_can_update_priority_on_own_mission(self):
        self.auth_as(self.collaborateur)
        res = self.client.patch(mission_detail_url(self.mission.id), {"priority": "urgente"})
        self.assertEqual(res.status_code, 200)

    def test_cannot_update_title_on_own_mission(self):
        self.auth_as(self.collaborateur)
        res = self.client.patch(mission_detail_url(self.mission.id), {"title": "Piraté"})
        self.assertEqual(res.status_code, 403)

    def test_cannot_update_other_collaborateurs_mission(self):
        other_mission = Mission.objects.create(
            title="Mission d'un autre",
            project=self.project,
            client=self.client_company,
            assignee=self.other_collaborateur,
            deadline="2026-12-31",
            status=MissionStatus.A_FAIRE,
        )
        self.auth_as(self.collaborateur)
        res = self.client.patch(mission_detail_url(other_mission.id), {"status": "en_cours"})
        self.assertEqual(res.status_code, 404)


class ClientValidationGateTests(RoleTestCase):
    """Régression : le client ne doit pouvoir Valider / Demander des
    corrections qu'une fois la mission réellement envoyée par l'agence —
    jamais avant, quel que soit le statut interne en cours."""

    def test_client_cannot_validate_before_mission_sent(self):
        self.assertEqual(self.mission.status, MissionStatus.A_FAIRE)
        self.auth_as(self.client_user)
        res = self.client.patch(mission_detail_url(self.mission.id), {"status": "valide"})
        self.assertEqual(res.status_code, 403)

    def test_client_cannot_request_corrections_before_mission_sent(self):
        self.auth_as(self.client_user)
        res = self.client.patch(mission_detail_url(self.mission.id), {"status": "corrections"})
        self.assertEqual(res.status_code, 403)

    def test_client_cannot_validate_mid_pipeline(self):
        for status in ["en_cours", "livrable_depose", "validation_interne"]:
            self.mission.status = status
            self.mission.save()
            self.auth_as(self.client_user)
            res = self.client.patch(mission_detail_url(self.mission.id), {"status": "valide"})
            self.assertEqual(res.status_code, 403, f"failed at internal status={status}")

    def test_client_can_validate_once_sent(self):
        self.mission.status = MissionStatus.ENVOYE_CLIENT
        self.mission.save()
        self.auth_as(self.client_user)
        res = self.client.patch(mission_detail_url(self.mission.id), {"status": "valide"})
        self.assertEqual(res.status_code, 200)
        self.mission.refresh_from_db()
        self.assertEqual(self.mission.status, "valide")

    def test_client_can_request_corrections_once_sent(self):
        self.mission.status = MissionStatus.ENVOYE_CLIENT
        self.mission.save()
        self.auth_as(self.client_user)
        res = self.client.patch(mission_detail_url(self.mission.id), {"status": "corrections"})
        self.assertEqual(res.status_code, 200)

    def test_client_cannot_set_arbitrary_status_even_once_sent(self):
        self.mission.status = MissionStatus.ENVOYE_CLIENT
        self.mission.save()
        self.auth_as(self.client_user)
        res = self.client.patch(mission_detail_url(self.mission.id), {"status": "termine"})
        self.assertEqual(res.status_code, 403)

    def test_client_cannot_act_on_other_companys_mission(self):
        self.mission.status = MissionStatus.ENVOYE_CLIENT
        self.mission.save()
        self.auth_as(self.other_client_user)
        res = self.client.patch(mission_detail_url(self.mission.id), {"status": "valide"})
        self.assertEqual(res.status_code, 404)

    def test_client_cannot_update_other_fields(self):
        self.mission.status = MissionStatus.ENVOYE_CLIENT
        self.mission.save()
        self.auth_as(self.client_user)
        res = self.client.patch(mission_detail_url(self.mission.id), {"title": "Modifié"})
        self.assertEqual(res.status_code, 403)
