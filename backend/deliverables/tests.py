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
        # Mission déjà envoyée : ses livrables sont visibles du client (voir
        # DeliverableClientVisibilityTests pour les cas où ils ne le sont pas).
        self.mission.status = MissionStatus.ENVOYE_CLIENT
        self.mission.save()
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

    def test_collaborateur_sees_teammates_uploads_on_own_missions(self):
        """Sans filtre ?mission= (tableau Mes missions, page Livrables), un
        collaborateur voit aussi les livrables déposés par d'autres sur ses
        missions."""
        self.auth_as(self.collaborateur)
        res = self.client.get(deliverable_list_url())
        self.assertEqual(res.status_code, 200)
        self.assertEqual(
            {d["id"] for d in res.data},
            {str(self.deliverable.id), str(self.other_collab_deliverable.id)},
        )

    def test_collaborateur_does_not_see_deliverables_of_other_missions(self):
        Deliverable.objects.create(
            mission=self.foreign_mission,
            name="Hors périmètre",
            type="lien",
            url="https://example.com/hors",
            uploaded_by=self.other_collaborateur,
            status=DeliverableStatus.EN_ATTENTE,
        )
        self.auth_as(self.collaborateur)
        res = self.client.get(deliverable_list_url())
        self.assertNotIn("Hors périmètre", {d["name"] for d in res.data})

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

    def test_client_cannot_deposit(self):
        """Un livrable est produit par l'agence : le client le consulte et le
        valide, mais n'en dépose jamais, même sur sa propre mission."""
        self.auth_as(self.client_user)
        res = self.client.post(deliverable_list_url(), self._payload())
        self.assertEqual(res.status_code, 403)
        self.assertFalse(Deliverable.objects.filter(name="Nouveau livrable").exists())

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

    def test_client_cannot_put_deliverable_back_to_pending(self):
        self.deliverable.status = DeliverableStatus.VALIDE
        self.deliverable.save()
        self.auth_as(self.client_user)
        res = self.client.patch(
            deliverable_detail_url(self.deliverable.id), {"status": "en_attente"}
        )
        self.assertEqual(res.status_code, 403)
        self.deliverable.refresh_from_db()
        self.assertEqual(self.deliverable.status, DeliverableStatus.VALIDE)

    def test_client_corrections_require_an_explanation(self):
        self.auth_as(self.client_user)
        res = self.client.patch(
            deliverable_detail_url(self.deliverable.id), {"status": "corrections", "comment": "  "}
        )
        self.assertEqual(res.status_code, 400)
        self.deliverable.refresh_from_db()
        self.assertEqual(self.deliverable.status, DeliverableStatus.EN_ATTENTE)

    def test_client_corrections_post_the_explanation_in_the_mission_discussion(self):
        from comments.models import Comment

        self.auth_as(self.client_user)
        res = self.client.patch(
            deliverable_detail_url(self.deliverable.id),
            {"status": "corrections", "comment": "Remplacer la photo."},
        )
        self.assertEqual(res.status_code, 200)
        comment = Comment.objects.get(mission=self.mission)
        self.assertEqual(comment.author, self.client_user)
        self.assertTrue(comment.client_visible)
        self.assertIn("Maquette", comment.body)
        self.assertIn("Remplacer la photo.", comment.body)

    def test_agency_corrections_need_no_explanation(self):
        from comments.models import Comment

        self.auth_as(self.admin)
        res = self.client.patch(
            deliverable_detail_url(self.deliverable.id), {"status": "corrections"}
        )
        self.assertEqual(res.status_code, 200)
        self.assertFalse(Comment.objects.exists())

    def test_collaborateur_cannot_self_validate_own_upload(self):
        """Un collaborateur ne peut pas valider son propre livrable, même le
        sien : seuls admin/chef de projet/client en décident."""
        self.auth_as(self.collaborateur)
        res = self.client.patch(deliverable_detail_url(self.deliverable.id), {"status": "valide"})
        self.assertEqual(res.status_code, 403)


class DeliverablePublishTests(DeliverableSetupMixin, RoleTestCase):
    """Chaque livrable se publie séparément (published_at), indépendamment
    de sa validation ; la date est toujours posée par le serveur."""

    def _publish(self, published=True):
        return self.client.patch(
            deliverable_detail_url(self.deliverable.id), {"published": published}, format="json"
        )

    def test_collaborateur_can_publish_and_unpublish(self):
        self.auth_as(self.collaborateur)
        res = self._publish()
        self.assertEqual(res.status_code, 200)
        self.assertIsNotNone(res.data["published_at"])
        res = self._publish(False)
        self.assertEqual(res.status_code, 200)
        self.assertIsNone(res.data["published_at"])

    def test_additional_collaborator_can_publish(self):
        self.mission.collaborators.add(self.other_collaborateur)
        self.auth_as(self.other_collaborateur)
        self.assertEqual(self._publish().status_code, 200)

    def test_uninvolved_collaborateur_cannot_publish(self):
        # self.other_collaborateur n'est ni responsable ni collaborateur de
        # self.mission : le livrable est hors de sa portée.
        self.auth_as(self.other_collaborateur)
        self.assertEqual(self._publish().status_code, 404)

    def test_republishing_keeps_original_date(self):
        self.auth_as(self.admin)
        first = self._publish().data["published_at"]
        self.assertEqual(self._publish().data["published_at"], first)

    def test_publishing_does_not_change_status(self):
        self.auth_as(self.chef_projet)
        self._publish()
        self.deliverable.refresh_from_db()
        self.assertEqual(self.deliverable.status, DeliverableStatus.EN_ATTENTE)

    def test_client_cannot_publish(self):
        self.auth_as(self.client_user)
        self.assertEqual(self._publish().status_code, 403)

    def test_collaborateur_cannot_publish_and_validate_together(self):
        self.auth_as(self.collaborateur)
        res = self.client.patch(
            deliverable_detail_url(self.deliverable.id),
            {"published": True, "status": "valide"},
            format="json",
        )
        self.assertEqual(res.status_code, 403)

    def test_deposit_is_never_published_on_creation(self):
        self.auth_as(self.collaborateur)
        res = self.client.post(
            deliverable_list_url(),
            {
                "mission_id": str(self.mission.id),
                "name": "Dépôt",
                "type": "lien",
                "url": "https://example.com/depot",
                "published": True,
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        self.assertIsNone(res.data["published_at"])


class DeliverableWithoutLinkTests(DeliverableSetupMixin, RoleTestCase):
    """Un livrable peut être annoncé sans lien ("Lien à venir"), puis
    complété ; tant qu'il n'a pas de lien il n'est ni validable ni publiable."""

    def setUp(self):
        super().setUp()
        self.pending = Deliverable.objects.create(
            mission=self.mission,
            name="Vidéo finale",
            type="lien",
            url="",
            uploaded_by=self.collaborateur,
        )

    def _patch(self, data, deliverable=None):
        return self.client.patch(
            deliverable_detail_url((deliverable or self.pending).id), data, format="json"
        )

    def test_can_create_without_link(self):
        self.auth_as(self.collaborateur)
        res = self.client.post(
            deliverable_list_url(),
            {"mission_id": str(self.mission.id), "name": "À venir", "type": "lien"},
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["url"], "")

    def test_cannot_validate_without_link(self):
        self.auth_as(self.admin)
        self.assertEqual(self._patch({"status": "valide"}).status_code, 400)

    def test_cannot_publish_without_link(self):
        self.auth_as(self.collaborateur)
        self.assertEqual(self._patch({"published": True}).status_code, 400)

    def test_author_can_add_link_and_rename(self):
        self.auth_as(self.collaborateur)
        res = self._patch({"name": "Vidéo finale v2", "url": "https://example.com/video"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["url"], "https://example.com/video")
        self.assertEqual(res.data["name"], "Vidéo finale v2")

    def test_other_collaborator_cannot_edit_link(self):
        self.mission.collaborators.add(self.other_collaborateur)
        self.auth_as(self.other_collaborateur)
        self.assertEqual(self._patch({"url": "https://example.com/x"}).status_code, 403)

    def test_manager_can_edit_anyones_link(self):
        self.auth_as(self.chef_projet)
        self.assertEqual(self._patch({"url": "https://example.com/x"}).status_code, 200)

    def test_client_cannot_edit_link(self):
        self.auth_as(self.client_user)
        # Livrable sans lien : invisible du client (404) ; avec lien : refusé (403).
        self.assertEqual(self._patch({"url": "https://example.com/x"}).status_code, 404)
        res = self._patch({"url": "https://example.com/x"}, self.deliverable)
        self.assertEqual(res.status_code, 403)

    def test_changing_link_of_validated_deliverable_resets_to_pending(self):
        self.deliverable.status = DeliverableStatus.VALIDE
        self.deliverable.save()
        self.auth_as(self.collaborateur)
        res = self._patch({"url": "https://example.com/nouveau"}, self.deliverable)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["status"], "en_attente")

    def test_removing_link_unpublishes(self):
        self.auth_as(self.admin)
        self._patch({"published": True}, self.deliverable)
        res = self._patch({"url": ""}, self.deliverable)
        self.assertEqual(res.status_code, 200)
        self.assertIsNone(res.data["published_at"])


class DeliverableClientVisibilityTests(DeliverableSetupMixin, RoleTestCase):
    """Le client ne voit que ce que l'agence lui a envoyé : livrables avec un
    lien, sur une mission "Envoyé au client" ou plus loin, plus ses propres
    dépôts. Brouillons internes et "Lien à venir" restent invisibles."""

    def _client_ids(self):
        self.auth_as(self.client_user)
        res = self.client.get(deliverable_list_url())
        self.assertEqual(res.status_code, 200)
        return {d["id"] for d in res.data}

    def test_sees_deliverables_once_mission_sent(self):
        self.assertIn(str(self.deliverable.id), self._client_ids())

    def test_does_not_see_drafts_before_mission_is_sent(self):
        for status in ["a_faire", "en_cours", "livrable_depose", "validation_interne"]:
            self.mission.status = status
            self.mission.save()
            self.assertNotIn(str(self.deliverable.id), self._client_ids(), status)

    def test_sees_deliverables_after_validation_and_publication(self):
        for status in ["valide", "corrections", "publie", "termine"]:
            self.mission.status = status
            self.mission.save()
            self.assertIn(str(self.deliverable.id), self._client_ids(), status)

    def test_does_not_see_deliverable_without_link(self):
        pending = Deliverable.objects.create(
            mission=self.mission, name="À venir", type="lien", url="", uploaded_by=self.collaborateur
        )
        self.assertNotIn(str(pending.id), self._client_ids())

    def test_always_sees_own_uploads(self):
        self.mission.status = "en_cours"
        self.mission.save()
        own = Deliverable.objects.create(
            mission=self.mission,
            name="Brief du client",
            type="lien",
            url="https://example.com/brief",
            uploaded_by=self.client_user,
        )
        self.assertIn(str(own.id), self._client_ids())

    def test_cannot_validate_a_draft(self):
        self.mission.status = "validation_interne"
        self.mission.save()
        self.auth_as(self.client_user)
        res = self.client.patch(deliverable_detail_url(self.deliverable.id), {"status": "valide"})
        self.assertEqual(res.status_code, 404)


class DeliverableDeleteTests(DeliverableSetupMixin, RoleTestCase):
    def test_admin_can_delete(self):
        self.auth_as(self.admin)
        res = self.client.delete(deliverable_detail_url(self.deliverable.id))
        self.assertEqual(res.status_code, 204)

    def test_collaborateur_can_delete_own_upload(self):
        self.auth_as(self.collaborateur)
        res = self.client.delete(deliverable_detail_url(self.deliverable.id))
        self.assertEqual(res.status_code, 204)

    def test_collaborateur_cannot_delete_someone_elses_upload(self):
        """Le dépôt d'un autre sur sa mission lui est visible (portée de la
        mission), mais has_object_permission refuse la suppression (403)."""
        other_upload = Deliverable.objects.create(
            mission=self.mission,
            name="Dépôt d'un autre",
            type="lien",
            url="https://example.com/autre-depot",
            uploaded_by=self.other_collaborateur,
            status=DeliverableStatus.EN_ATTENTE,
        )
        self.auth_as(self.collaborateur)
        res = self.client.delete(deliverable_detail_url(other_upload.id))
        self.assertEqual(res.status_code, 403)
        self.assertTrue(Deliverable.objects.filter(id=other_upload.id).exists())

    def test_client_cannot_delete(self):
        self.auth_as(self.client_user)
        res = self.client.delete(deliverable_detail_url(self.deliverable.id))
        self.assertEqual(res.status_code, 403)

    def test_collaborator_sharing_mission_cannot_delete_teammates_upload(self):
        """Même visible (mission partagée, cf. get_queryset avec ?mission=),
        le dépôt d'un coéquipier reste hors de portée : has_object_permission
        vérifie l'auteur du dépôt, pas seulement la visibilité de la mission."""
        other_upload = Deliverable.objects.create(
            mission=self.mission,
            name="Dépôt d'un autre",
            type="lien",
            url="https://example.com/autre-depot",
            uploaded_by=self.other_collaborateur,
            status=DeliverableStatus.EN_ATTENTE,
        )
        self.auth_as(self.collaborateur)
        res = self.client.delete(
            f"{deliverable_detail_url(other_upload.id)}?mission={self.mission.id}"
        )
        self.assertEqual(res.status_code, 403)


class ClientDecisionLoopTests(DeliverableSetupMixin, RoleTestCase):
    """Le client valide les livrables, la mission suit, et l'équipe est
    prévenue (sans que le client voie cette notification)."""

    def setUp(self):
        super().setUp()
        self.second = Deliverable.objects.create(
            mission=self.mission,
            name="Bannière",
            type="lien",
            url="https://example.com/banniere",
            uploaded_by=self.collaborateur,
        )

    def _decide(self, deliverable, status):
        self.auth_as(self.client_user)
        payload = {"status": status}
        if status == "corrections":
            payload["comment"] = "Changer la couleur du titre."
        res = self.client.patch(deliverable_detail_url(deliverable.id), payload)
        self.assertEqual(res.status_code, 200)
        self.mission.refresh_from_db()

    def test_mission_validated_only_once_every_sent_deliverable_is(self):
        self._decide(self.deliverable, "valide")
        self.assertEqual(self.mission.status, MissionStatus.ENVOYE_CLIENT)
        self._decide(self.second, "valide")
        self.assertEqual(self.mission.status, MissionStatus.VALIDE)

    def test_published_deliverable_counts_as_done(self):
        self.second.published_at = "2026-10-01T10:00:00Z"
        self.second.save()
        self._decide(self.deliverable, "valide")
        self.assertEqual(self.mission.status, MissionStatus.VALIDE)

    def test_links_to_come_and_client_uploads_are_ignored(self):
        Deliverable.objects.create(
            mission=self.mission, name="À venir", type="lien", url="", uploaded_by=self.collaborateur
        )
        Deliverable.objects.create(
            mission=self.mission,
            name="Brief client",
            type="lien",
            url="https://example.com/brief",
            uploaded_by=self.client_user,
        )
        self._decide(self.deliverable, "valide")
        self._decide(self.second, "valide")
        self.assertEqual(self.mission.status, MissionStatus.VALIDE)

    def test_corrections_on_one_deliverable_moves_mission_to_corrections(self):
        self._decide(self.deliverable, "corrections")
        self.assertEqual(self.mission.status, MissionStatus.CORRECTIONS)

    def test_validating_after_corrections_brings_mission_back_to_validated(self):
        self._decide(self.deliverable, "corrections")
        self._decide(self.second, "valide")
        self.assertEqual(self.mission.status, MissionStatus.CORRECTIONS)
        self._decide(self.deliverable, "valide")
        self.assertEqual(self.mission.status, MissionStatus.VALIDE)

    def test_never_moves_a_published_or_finished_mission(self):
        self.mission.status = MissionStatus.PUBLIE
        self.mission.save()
        self._decide(self.deliverable, "corrections")
        self.assertEqual(self.mission.status, MissionStatus.PUBLIE)

    def test_team_is_notified_and_client_does_not_see_it(self):
        from notifications.models import Notification, NotificationType

        self._decide(self.deliverable, "corrections")
        notif = Notification.objects.get(type=NotificationType.DECISION_CLIENT)
        self.assertIn("Maquette", notif.body)
        self.assertEqual(notif.mission_id, self.mission.id)

        self.auth_as(self.collaborateur)
        team = self.client.get(reverse("notification-list")).data
        self.assertIn(str(notif.id), {str(n["id"]) for n in team})
        self.auth_as(self.client_user)
        client = self.client.get(reverse("notification-list")).data
        self.assertNotIn(str(notif.id), {str(n["id"]) for n in client})

    def test_agency_status_change_does_not_notify_as_client_decision(self):
        from notifications.models import Notification, NotificationType

        self.auth_as(self.admin)
        self.client.patch(deliverable_detail_url(self.deliverable.id), {"status": "valide"})
        self.assertFalse(Notification.objects.filter(type=NotificationType.DECISION_CLIENT).exists())


class ClientMissionDecisionNotificationTests(DeliverableSetupMixin, RoleTestCase):
    def test_client_mission_decision_notifies_team(self):
        from notifications.models import Notification, NotificationType

        self.auth_as(self.client_user)
        res = self.client.patch(
            reverse("mission-detail", args=[self.mission.id]), {"status": "valide"}
        )
        self.assertEqual(res.status_code, 200)
        notif = Notification.objects.get(type=NotificationType.DECISION_CLIENT)
        self.assertEqual(notif.title, "Validé par le client")
