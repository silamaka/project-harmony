import threading
import time
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import connections
from django.test import TransactionTestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import Role
from clients.models import Client, ClientStatus
from core.test_utils import RoleTestCase
from projects.models import Project, ProjectStatus

from .models import Mission, MissionStatus

User = get_user_model()


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


class MissionStatusRaceConditionTests(TransactionTestCase):
    """Reproduit le scénario signalé : l'admin valide une mission au moment
    précis où le client demande des corrections sur la même mission. Sans
    verrouillage, les deux requêtes pouvaient réussir (200) en s'écrasant
    silencieusement l'une l'autre, sans que personne ne soit informé du
    conflit — d'où l'incohérence observée. Avec select_for_update, la
    requête qui arrive en second lit l'état déjà à jour : si c'est le
    client, sa décision n'est plus valide (le statut n'est plus "envoyé
    au client") et elle est rejetée proprement plutôt que d'écraser la
    décision de l'admin sans le savoir.

    Utilise TransactionTestCase (et non RoleTestCase/APITestCase) car
    select_for_update nécessite de vraies transactions concurrentes sur
    de vraies connexions DB — incompatible avec la transaction unique et
    non validée dans laquelle APITestCase enveloppe chaque test."""

    def setUp(self):
        self.admin = User.objects.create_user(
            email="admin-race@test.local",
            password="pass1234",
            first_name="Admin",
            last_name="Race",
            role=Role.ADMIN,
        )
        self.collaborateur = User.objects.create_user(
            email="collab-race@test.local",
            password="pass1234",
            first_name="Collab",
            last_name="Race",
            role=Role.COLLABORATEUR,
        )
        self.client_company = Client.objects.create(
            name="Client Race", industry="Test", status=ClientStatus.ACTIF
        )
        self.client_user = User.objects.create_user(
            email="client-race@test.local",
            password="pass1234",
            first_name="Client",
            last_name="Race",
            role=Role.CLIENT,
            client=self.client_company,
        )
        self.project = Project.objects.create(
            name="Projet Race",
            client=self.client_company,
            owner=self.admin,
            start_date="2026-01-01",
            end_date="2026-12-31",
            status=ProjectStatus.EN_COURS,
        )
        self.mission = Mission.objects.create(
            title="Mission Race",
            project=self.project,
            client=self.client_company,
            assignee=self.collaborateur,
            deadline="2026-12-31",
            status=MissionStatus.ENVOYE_CLIENT,
        )

    @staticmethod
    def _authed_client(user):
        api = APIClient()
        token = RefreshToken.for_user(user).access_token
        api.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        return api

    def test_concurrent_validation_and_corrections_never_silently_overwrite(self):
        """Force précisément l'interleaving du bug signalé : l'admin a déjà
        lu la mission et s'apprête à écrire "valide" (permission déjà
        validée), et c'est exactement à ce moment que le client lit la
        mission pour décider "corrections". Sans verrouillage, la lecture
        du client tombe pendant la fenêtre où l'écriture de l'admin n'est
        pas encore commitée : elle voit encore "envoyé au client", réussit
        (200) sur la base d'une donnée déjà obsolète, et sa décision est
        silencieusement écrasée dès que l'admin termine — le client croit
        avoir réussi alors que rien de son changement ne subsiste. Avec
        select_for_update, la lecture du client doit attendre que la
        transaction de l'admin (qui tient le verrou pendant sa pause)
        se termine, puis relit l'état réellement à jour et est rejetée
        (403) au lieu d'écraser aveuglément une décision déjà prise."""
        url = mission_detail_url(self.mission.id)
        admin_client = self._authed_client(self.admin)
        client_client = self._authed_client(self.client_user)
        results = {}
        admin_about_to_write = threading.Event()
        original_save = Mission.save

        def delayed_save(mission_self, *args, **kwargs):
            if mission_self.status == MissionStatus.VALIDE:
                admin_about_to_write.set()
                time.sleep(0.4)
            return original_save(mission_self, *args, **kwargs)

        def do_admin():
            try:
                results["admin"] = admin_client.patch(
                    url, {"status": "valide"}, format="json"
                ).status_code
            finally:
                connections.close_all()

        def do_client():
            # Attend que l'admin ait passé sa vérification de permission et
            # soit sur le point d'écrire, pour que la lecture du client
            # tombe précisément dans cette fenêtre — pas avant, pas après.
            admin_about_to_write.wait(timeout=5)
            try:
                results["client"] = client_client.patch(
                    url, {"status": "corrections"}, format="json"
                ).status_code
            finally:
                # Une connexion DB ouverte dans un thread brut n'est jamais
                # fermée automatiquement par Django : sans ça, la base de
                # test reste "in use" et son DROP échoue en fin de suite.
                connections.close_all()

        with patch.object(Mission, "save", delayed_save):
            threads = [threading.Thread(target=do_admin), threading.Thread(target=do_client)]
            for t in threads:
                t.start()
            for t in threads:
                t.join()

        self.assertEqual(results["admin"], 200)
        self.mission.refresh_from_db()

        if results["client"] == 200:
            # Si le client a reçu un succès, sa décision doit réellement
            # être celle en base — jamais un succès fantôme écrasé sans
            # qu'il en soit informé.
            self.assertEqual(self.mission.status, MissionStatus.CORRECTIONS)
        else:
            self.assertEqual(results["client"], 403)
            self.assertEqual(self.mission.status, MissionStatus.VALIDE)
