"""Base commune pour les tests de permissions par rôle.

Met en place un jeu minimal mais complet : un utilisateur par rôle, deux
entreprises clientes distinctes (pour tester l'isolation entre elles), un
projet et une mission — prêts à l'emploi dans n'importe quel test d'app.
"""

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from clients.models import Client, ClientStatus
from missions.models import Mission, MissionStatus, Priority
from projects.models import Project, ProjectStatus

User = get_user_model()


class RoleTestCase(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="admin@test.local",
            password="pass1234",
            first_name="Admin",
            last_name="Test",
            role="admin",
        )
        self.chef_projet = User.objects.create_user(
            email="chef@test.local",
            password="pass1234",
            first_name="Chef",
            last_name="Test",
            role="chef_projet",
        )
        self.collaborateur = User.objects.create_user(
            email="collab@test.local",
            password="pass1234",
            first_name="Collab",
            last_name="Test",
            role="collaborateur",
        )
        self.other_collaborateur = User.objects.create_user(
            email="collab2@test.local",
            password="pass1234",
            first_name="Collab2",
            last_name="Test",
            role="collaborateur",
        )

        self.client_company = Client.objects.create(
            name="Client Test", industry="Test", status=ClientStatus.ACTIF
        )
        self.client_user = User.objects.create_user(
            email="client@test.local",
            password="pass1234",
            first_name="Client",
            last_name="Test",
            role="client",
            client=self.client_company,
        )

        self.other_client_company = Client.objects.create(
            name="Autre Client", industry="Test", status=ClientStatus.ACTIF
        )
        self.other_client_user = User.objects.create_user(
            email="client2@test.local",
            password="pass1234",
            first_name="Client2",
            last_name="Test",
            role="client",
            client=self.other_client_company,
        )

        self.project = Project.objects.create(
            name="Projet Test",
            client=self.client_company,
            owner=self.chef_projet,
            start_date="2026-01-01",
            end_date="2026-12-31",
            status=ProjectStatus.EN_COURS,
        )
        self.mission = Mission.objects.create(
            title="Mission Test",
            project=self.project,
            client=self.client_company,
            assignee=self.collaborateur,
            deadline="2026-12-31",
            status=MissionStatus.A_FAIRE,
            priority=Priority.NORMALE,
        )

    def auth_as(self, user):
        """Authentifie le client de test comme `user` pour les requêtes suivantes."""
        token = RefreshToken.for_user(user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def logout(self):
        self.client.credentials()
