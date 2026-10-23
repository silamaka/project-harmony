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
        # Livrable validé par l'agence, donc envoyé au client : il le voit et
        # peut décider (voir DeliverableClientVisibilityTests pour les cas où
        # il ne le voit pas).
        self.mission.status = MissionStatus.ENVOYE_CLIENT
        self.mission.save()
        self.deliverable = Deliverable.objects.create(
            mission=self.mission,
            name="Maquette",
            type="lien",
            url="https://example.com/maquette",
            uploaded_by=self.collaborateur,
            status=DeliverableStatus.VALIDE,
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

    def test_client_sees_only_sent_deliverables_of_own_company(self):
        self.auth_as(self.client_user)
        res = self.client.get(deliverable_list_url())
        self.assertEqual(res.status_code, 200)
        self.assertEqual({d["id"] for d in res.data}, {str(self.deliverable.id)})

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
    """Deux validations indépendantes : `status` pour l'agence (admin / chef
    de projet), `client_status` pour le client."""

    def _patch(self, data, deliverable=None):
        return self.client.patch(
            deliverable_detail_url((deliverable or self.deliverable).id), data, format="json"
        )

    def test_admin_can_validate(self):
        self.auth_as(self.admin)
        self.assertEqual(self._patch({"status": "valide"}).status_code, 200)

    def test_collaborateur_cannot_self_validate_own_upload(self):
        """Un collaborateur ne valide jamais, même son propre dépôt."""
        self.auth_as(self.collaborateur)
        self.assertEqual(self._patch({"status": "valide"}).status_code, 403)

    def test_client_can_validate_sent_deliverable(self):
        self.auth_as(self.client_user)
        res = self._patch({"client_status": "valide"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["client_status"], "valide")
        self.assertEqual(res.data["status"], "valide")

    def test_client_cannot_touch_agency_validation(self):
        self.auth_as(self.client_user)
        self.assertEqual(self._patch({"status": "corrections"}).status_code, 403)

    def test_collaborateur_cannot_decide_for_the_client(self):
        self.auth_as(self.collaborateur)
        self.assertEqual(self._patch({"client_status": "valide"}).status_code, 403)

    def test_other_client_cannot_validate(self):
        """Hors scope de get_queryset (missions_visible_to) : la fiche n'est
        même pas trouvée, jamais un 403 sur un objet invisible."""
        self.auth_as(self.other_client_user)
        self.assertEqual(self._patch({"client_status": "valide"}).status_code, 404)

    def test_client_cannot_change_other_fields_alongside_decision(self):
        self.auth_as(self.client_user)
        res = self._patch({"client_status": "valide", "name": "Renommé"})
        self.assertEqual(res.status_code, 403)

    def test_client_cannot_put_deliverable_back_to_pending(self):
        self.deliverable.client_status = DeliverableStatus.VALIDE
        self.deliverable.save()
        self.auth_as(self.client_user)
        self.assertEqual(self._patch({"client_status": "en_attente"}).status_code, 403)
        self.deliverable.refresh_from_db()
        self.assertEqual(self.deliverable.client_status, DeliverableStatus.VALIDE)

    def test_client_can_request_corrections_without_details(self):
        self.auth_as(self.client_user)
        res = self._patch({"client_status": "corrections"})
        self.assertEqual(res.status_code, 200)
        self.deliverable.refresh_from_db()
        self.assertEqual(self.deliverable.client_status, DeliverableStatus.CORRECTIONS)

    def test_client_corrections_post_the_explanation_in_the_mission_discussion(self):
        from comments.models import Comment

        self.auth_as(self.client_user)
        res = self._patch(
            {
                "client_status": "corrections",
                "comment": "Remplacer la photo de la 2e slide.",
                "categories": ["image"],
            }
        )
        self.assertEqual(res.status_code, 200)
        comment = Comment.objects.get(mission=self.mission)
        self.assertEqual(comment.author, self.client_user)
        self.assertTrue(comment.client_visible)
        self.assertIn("Maquette", comment.body)
        self.assertIn("Remplacer la photo de la 2e slide.", comment.body)
        self.assertIn("Image / photo", comment.body)

    def test_agency_corrections_need_no_explanation(self):
        from comments.models import Comment

        self.auth_as(self.admin)
        self.assertEqual(self._patch({"status": "corrections"}).status_code, 200)
        self.assertFalse(Comment.objects.exists())

    def test_deposit_always_starts_in_agency_review(self):
        self.auth_as(self.admin)
        res = self.client.post(
            deliverable_list_url(),
            {
                "mission_id": str(self.mission.id),
                "name": "Dépôt",
                "type": "lien",
                "url": "https://example.com/depot",
                "status": "valide",
                "client_status": "valide",
            },
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["status"], "en_attente")
        self.assertEqual(res.data["client_status"], "en_attente")


class DeliverablePublishTests(DeliverableSetupMixin, RoleTestCase):
    """Chaque livrable se publie séparément (published_at), une fois validé
    par l'agence et par le client ; la date est toujours posée par le
    serveur."""

    def setUp(self):
        super().setUp()
        # "Prêt à publier" : validé des deux côtés.
        self.deliverable.client_status = DeliverableStatus.VALIDE
        self.deliverable.save()

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
        self.assertEqual(self.deliverable.status, DeliverableStatus.VALIDE)
        self.assertEqual(self.deliverable.client_status, DeliverableStatus.VALIDE)

    def test_cannot_publish_before_the_client_validates(self):
        for client_status in (DeliverableStatus.EN_ATTENTE, DeliverableStatus.CORRECTIONS):
            Deliverable.objects.filter(pk=self.deliverable.pk).update(client_status=client_status)
            self.auth_as(self.chef_projet)
            res = self._publish()
            self.assertEqual(res.status_code, 400, client_status)
            self.assertIn("published", res.data)
        self.deliverable.refresh_from_db()
        self.assertIsNone(self.deliverable.published_at)

    def test_cannot_publish_before_the_agency_validates(self):
        Deliverable.objects.filter(pk=self.deliverable.pk).update(
            status=DeliverableStatus.EN_ATTENTE
        )
        self.auth_as(self.collaborateur)
        self.assertEqual(self._publish().status_code, 400)

    def test_validate_for_client_then_publish(self):
        Deliverable.objects.filter(pk=self.deliverable.pk).update(
            client_status=DeliverableStatus.EN_ATTENTE
        )
        self.auth_as(self.admin)
        self.client.patch(
            deliverable_detail_url(self.deliverable.id), {"client_status": "valide"}, format="json"
        )
        self.assertEqual(self._publish().status_code, 200)

    def test_already_published_unvalidated_can_still_be_unpublished(self):
        """Publiés avant la règle : on ne casse rien, on peut toujours les
        dépublier (ou les "republier" sans effet)."""
        Deliverable.objects.filter(pk=self.deliverable.pk).update(
            client_status=DeliverableStatus.EN_ATTENTE, published_at="2026-10-01T10:00:00Z"
        )
        self.auth_as(self.collaborateur)
        self.assertEqual(self._publish().status_code, 200)
        res = self._publish(False)
        self.assertEqual(res.status_code, 200)
        self.assertIsNone(res.data["published_at"])
        self.assertEqual(self._publish().status_code, 400)

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

    def test_changing_link_resets_both_validations(self):
        self.deliverable.client_status = DeliverableStatus.VALIDE
        self.deliverable.save()
        self.auth_as(self.collaborateur)
        res = self._patch({"url": "https://example.com/nouveau"}, self.deliverable)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["status"], "en_attente")
        self.assertEqual(res.data["client_status"], "en_attente")

    def test_removing_link_unpublishes(self):
        self.deliverable.client_status = DeliverableStatus.VALIDE
        self.deliverable.save()
        self.auth_as(self.admin)
        self._patch({"published": True}, self.deliverable)
        res = self._patch({"url": ""}, self.deliverable)
        self.assertEqual(res.status_code, 200)
        self.assertIsNone(res.data["published_at"])


class DeliverableClientVisibilityTests(DeliverableSetupMixin, RoleTestCase):
    """Le client voit toutes ses missions, mais un livrable seulement une
    fois validé par l'agence (et avec un lien), quel que soit le statut de
    la mission ; plus ses propres dépôts."""

    def _client_ids(self):
        self.auth_as(self.client_user)
        res = self.client.get(deliverable_list_url())
        self.assertEqual(res.status_code, 200)
        return {d["id"] for d in res.data}

    def test_sees_agency_validated_deliverable_whatever_the_mission_status(self):
        for status in ["a_faire", "en_cours", "validation_interne", "valide", "publie", "termine"]:
            Mission.objects.filter(pk=self.mission.pk).update(status=status)
            self.assertIn(str(self.deliverable.id), self._client_ids(), status)

    def test_does_not_see_deliverable_under_agency_review(self):
        for status in [DeliverableStatus.EN_ATTENTE, DeliverableStatus.CORRECTIONS]:
            Deliverable.objects.filter(pk=self.deliverable.pk).update(status=status)
            self.assertNotIn(str(self.deliverable.id), self._client_ids(), status)

    def test_does_not_see_deliverable_without_link(self):
        pending = Deliverable.objects.create(
            mission=self.mission,
            name="À venir",
            type="lien",
            url="",
            uploaded_by=self.collaborateur,
            status=DeliverableStatus.VALIDE,
        )
        self.assertNotIn(str(pending.id), self._client_ids())

    def test_always_sees_own_uploads(self):
        own = Deliverable.objects.create(
            mission=self.mission,
            name="Brief du client",
            type="lien",
            url="https://example.com/brief",
            uploaded_by=self.client_user,
        )
        self.assertIn(str(own.id), self._client_ids())

    def test_cannot_decide_on_deliverable_under_agency_review(self):
        Deliverable.objects.filter(pk=self.deliverable.pk).update(status=DeliverableStatus.EN_ATTENTE)
        self.auth_as(self.client_user)
        res = self.client.patch(
            deliverable_detail_url(self.deliverable.id), {"client_status": "valide"}
        )
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
    """L'agence valide (= envoie), le client décide livrable par livrable, la
    mission suit ; chaque côté est prévenu de ce qui le concerne."""

    def setUp(self):
        super().setUp()
        self.second = Deliverable.objects.create(
            mission=self.mission,
            name="Bannière",
            type="lien",
            url="https://example.com/banniere",
            uploaded_by=self.collaborateur,
            status=DeliverableStatus.VALIDE,
        )

    def _decide(self, deliverable, decision):
        self.auth_as(self.client_user)
        payload = {"client_status": decision}
        if decision == "corrections":
            payload["comment"] = "Changer la couleur du titre en bleu."
            payload["categories"] = ["visuel"]
        res = self.client.patch(deliverable_detail_url(deliverable.id), payload, format="json")
        self.assertEqual(res.status_code, 200)
        self.mission.refresh_from_db()

    def _agency(self, deliverable, data):
        self.auth_as(self.admin)
        res = self.client.patch(deliverable_detail_url(deliverable.id), data)
        self.assertEqual(res.status_code, 200)
        self.mission.refresh_from_db()

    def _client_ids(self):
        self.auth_as(self.client_user)
        return {d["id"] for d in self.client.get(deliverable_list_url()).data}

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

    def test_not_validated_while_a_deliverable_is_still_in_agency_review(self):
        Deliverable.objects.create(
            mission=self.mission,
            name="Affiche",
            type="lien",
            url="https://example.com/affiche",
            uploaded_by=self.collaborateur,
        )
        self._decide(self.deliverable, "valide")
        self._decide(self.second, "valide")
        self.assertEqual(self.mission.status, MissionStatus.VALIDATION_INTERNE)

    def test_corrections_on_one_deliverable_moves_mission_to_corrections(self):
        self._decide(self.deliverable, "corrections")
        self.assertEqual(self.mission.status, MissionStatus.CORRECTIONS)

    def test_full_correction_loop(self):
        """Corrections → l'agence change le lien (retour en revue interne) →
        elle revalide (renvoi + notification) → le client valide."""
        from notifications.models import Notification, NotificationType

        self._decide(self.second, "valide")
        self._decide(self.deliverable, "corrections")
        self.assertEqual(self.mission.status, MissionStatus.CORRECTIONS)

        self._agency(self.deliverable, {"url": "https://example.com/maquette-v2"})
        self.assertEqual(self.mission.status, MissionStatus.VALIDATION_INTERNE)
        self.assertNotIn(str(self.deliverable.id), self._client_ids())

        self._agency(self.deliverable, {"status": "valide"})
        self.assertEqual(self.mission.status, MissionStatus.ENVOYE_CLIENT)
        notif = Notification.objects.get(type=NotificationType.VALIDATION)
        self.assertIn("Maquette", notif.body)

        self._decide(self.deliverable, "valide")
        self.assertEqual(self.mission.status, MissionStatus.VALIDE)

    def test_agency_validation_moves_internal_mission_to_sent(self):
        Mission.objects.filter(pk=self.mission.pk).update(status=MissionStatus.EN_COURS)
        Deliverable.objects.filter(mission=self.mission).update(status=DeliverableStatus.EN_ATTENTE)
        self._agency(self.deliverable, {"status": "valide"})
        self.assertEqual(self.mission.status, MissionStatus.ENVOYE_CLIENT)

    def test_internal_pipeline_untouched_while_nothing_is_sent(self):
        Mission.objects.filter(pk=self.mission.pk).update(status=MissionStatus.EN_COURS)
        Deliverable.objects.filter(mission=self.mission).update(status=DeliverableStatus.EN_ATTENTE)
        self._agency(self.deliverable, {"name": "Maquette finale"})
        self.assertEqual(self.mission.status, MissionStatus.EN_COURS)

    def test_never_moves_a_published_or_finished_mission(self):
        self.mission.status = MissionStatus.PUBLIE
        self.mission.save()
        self._decide(self.deliverable, "corrections")
        self.assertEqual(self.mission.status, MissionStatus.PUBLIE)

    def test_client_is_notified_once_when_agency_sends(self):
        from notifications.models import Notification, NotificationType

        Deliverable.objects.filter(pk=self.deliverable.pk).update(status=DeliverableStatus.EN_ATTENTE)
        self._agency(self.deliverable, {"status": "valide"})
        self._agency(self.deliverable, {"name": "Maquette finale"})
        notifs = Notification.objects.filter(type=NotificationType.VALIDATION)
        self.assertEqual(notifs.count(), 1)

        self.auth_as(self.client_user)
        seen = {str(n["id"]) for n in self.client.get(reverse("notification-list")).data}
        self.assertIn(str(notifs.get().id), seen)

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

        self._agency(self.deliverable, {"status": "corrections"})
        self.assertFalse(Notification.objects.filter(type=NotificationType.DECISION_CLIENT).exists())


class SplitValidationsMigrationTests(DeliverableSetupMixin, RoleTestCase):
    """Reprise des données (0005) : l'ancien `status` unique se répartit
    entre la validation agence et la décision client."""

    def _run(self):
        from importlib import import_module

        from django.apps import apps

        import_module("deliverables.migrations.0005_deliverable_client_status").split_validations(
            apps, None
        )

    def _make(self, mission_status, status, url="https://example.com/x", published=False):
        mission = Mission.objects.create(
            title=f"M {mission_status} {status}",
            project=self.project,
            client=self.client_company,
            assignee=self.collaborateur,
            start_date="2026-01-01",
            deadline="2026-12-31",
            status=mission_status,
        )
        return Deliverable.objects.create(
            mission=mission,
            name="D",
            type="lien",
            url=url,
            uploaded_by=self.collaborateur,
            status=status,
            published_at="2026-10-01T10:00:00Z" if published else None,
        )

    def test_split(self):
        sent_corrections = self._make("envoye_client", "corrections")
        sent_validated = self._make("valide", "valide")
        sent_pending = self._make("envoye_client", "en_attente")
        internal_validated = self._make("validation_interne", "valide")
        internal_published = self._make("en_cours", "valide", published=True)
        announced = self._make("envoye_client", "en_attente", url="")
        self._run()
        expected = {
            sent_corrections: ("valide", "corrections"),
            sent_validated: ("valide", "valide"),
            sent_pending: ("valide", "en_attente"),
            internal_validated: ("en_attente", "en_attente"),
            internal_published: ("valide", "en_attente"),
            announced: ("en_attente", "en_attente"),
        }
        for d, (status, client_status) in expected.items():
            d.refresh_from_db()
            self.assertEqual((d.status, d.client_status), (status, client_status), d.mission.title)


class ClientFeedbackTests(DeliverableSetupMixin, RoleTestCase):
    """Sur une mission à plusieurs livrables, la demande de corrections
    s'affiche sur le livrable concerné et la notification pointe sur lui."""

    def setUp(self):
        super().setUp()
        self.other = Deliverable.objects.create(
            mission=self.mission,
            name="Maquette",
            type="lien",
            url="https://example.com/maquette-bis",
            uploaded_by=self.collaborateur,
            status=DeliverableStatus.VALIDE,
            version=2,
        )

    def _corrections(self, deliverable, text="Changer la couleur du titre."):
        self.auth_as(self.client_user)
        return self.client.patch(
            deliverable_detail_url(deliverable.id),
            {"client_status": "corrections", "comment": text, "categories": ["visuel"]},
            format="json",
        )

    def test_feedback_is_stored_on_the_right_deliverable_only(self):
        res = self._corrections(self.other)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["client_feedback"], "Changer la couleur du titre.")
        self.assertIsNotNone(res.data["client_feedback_at"])
        self.deliverable.refresh_from_db()
        self.assertEqual(self.deliverable.client_feedback, "")

    def test_team_sees_the_feedback(self):
        self._corrections(self.other)
        self.auth_as(self.collaborateur)
        res = self.client.get(deliverable_detail_url(self.other.id))
        self.assertEqual(res.data["client_feedback"], "Changer la couleur du titre.")

    def test_feedback_cleared_when_client_validates(self):
        self._corrections(self.other)
        self.auth_as(self.client_user)
        res = self.client.patch(deliverable_detail_url(self.other.id), {"client_status": "valide"})
        self.assertEqual(res.data["client_feedback"], "")
        self.assertIsNone(res.data["client_feedback_at"])

    def test_feedback_cleared_on_new_link(self):
        self._corrections(self.other)
        self.auth_as(self.admin)
        res = self.client.patch(
            deliverable_detail_url(self.other.id), {"url": "https://example.com/maquette-v3"}
        )
        self.assertEqual(res.data["client_feedback"], "")

    def test_feedback_is_read_only_for_everyone(self):
        self.auth_as(self.admin)
        self.client.patch(deliverable_detail_url(self.other.id), {"client_feedback": "Faux"})
        self.other.refresh_from_db()
        self.assertEqual(self.other.client_feedback, "")

    def test_notification_and_comment_name_the_version_and_point_to_the_deliverable(self):
        from comments.models import Comment
        from notifications.models import Notification, NotificationType

        self._corrections(self.other)
        notif = Notification.objects.get(type=NotificationType.DECISION_CLIENT)
        self.assertIn("« Maquette » v2", notif.body)
        self.assertEqual(notif.deliverable_id, self.other.id)
        self.assertEqual(notif.link, f"/missions/{self.mission.id}?livrable={self.other.id}")
        self.assertIn("« Maquette » v2", Comment.objects.get().body)

        self.auth_as(self.collaborateur)
        listed = self.client.get(reverse("notification-list")).data
        self.assertEqual(
            next(n for n in listed if n["id"] == str(notif.id))["deliverable_id"], str(self.other.id)
        )


class DepositVersionLinkTypeTests(DeliverableSetupMixin, RoleTestCase):
    """Version, type et validité du lien sont décidés par le serveur, jamais
    par ce qu'envoie le formulaire."""

    def _deposit(self, **extra):
        self.auth_as(self.collaborateur)
        payload = {"mission_id": str(self.mission.id), "name": "Affiche", **extra}
        return self.client.post(deliverable_list_url(), payload)

    def _patch(self, deliverable_id, data):
        self.auth_as(self.collaborateur)
        return self.client.patch(deliverable_detail_url(deliverable_id), data)

    def test_deposit_starts_at_v1_whatever_is_sent(self):
        res = self._deposit(url="https://example.com/affiche", version=7)
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["version"], 1)

    def test_new_link_bumps_version(self):
        res = self._patch(self.deliverable.id, {"url": "https://example.com/maquette-v2"})
        self.assertEqual(res.data["version"], 2)
        res = self._patch(self.deliverable.id, {"url": "https://example.com/maquette-v3"})
        self.assertEqual(res.data["version"], 3)

    def test_same_link_or_rename_keeps_version(self):
        res = self._patch(self.deliverable.id, {"name": "Maquette finale", "url": self.deliverable.url})
        self.assertEqual(res.data["version"], 1)

    def test_first_link_of_announced_deliverable_stays_v1(self):
        created = self._deposit().data
        self.assertEqual(created["url"], "")
        res = self._patch(created["id"], {"url": "https://example.com/affiche"})
        self.assertEqual(res.data["version"], 1)

    def test_rejects_links_that_are_not_web_addresses(self):
        for bad in ["drive maquette", "example.com/x", "javascript:alert(1)", "ftp://example.com/x"]:
            res = self._deposit(url=bad)
            self.assertEqual(res.status_code, 400, bad)
            self.assertIn("url", res.data)
            res = self._patch(self.deliverable.id, {"url": bad})
            self.assertEqual(res.status_code, 400, bad)
        self.deliverable.refresh_from_db()
        self.assertEqual(self.deliverable.url, "https://example.com/maquette")

    def test_type_is_derived_from_the_link(self):
        cases = {
            "https://example.com/brief.PDF": "pdf",
            "https://cdn.example.com/visuel.png?v=2": "image",
            "https://example.com/teaser.mp4": "video",
            "https://example.com/sources.zip": "zip",
            "https://www.figma.com/file/abc/Maquette": "lien",
        }
        for url, expected in cases.items():
            res = self._deposit(url=url, type="lien")
            self.assertEqual(res.data["type"], expected, url)
        res = self._patch(self.deliverable.id, {"url": "https://example.com/maquette.pdf"})
        self.assertEqual(res.data["type"], "pdf")


class ClientValidatedAtTests(DeliverableSetupMixin, RoleTestCase):
    """L'agence voit quand le client a validé ; la date disparaît si la
    validation ne tient plus (corrections, nouveau lien)."""

    def _decide(self, decision):
        self.auth_as(self.client_user)
        payload = {"client_status": decision}
        if decision == "corrections":
            payload["comment"] = "Revoir le titre, trop long sur mobile."
            payload["categories"] = ["texte"]
        return self.client.patch(
            deliverable_detail_url(self.deliverable.id), payload, format="json"
        ).data

    def test_set_when_client_validates_and_visible_to_team(self):
        self.assertIsNotNone(self._decide("valide")["client_validated_at"])
        self.auth_as(self.chef_projet)
        res = self.client.get(deliverable_detail_url(self.deliverable.id))
        self.assertIsNotNone(res.data["client_validated_at"])

    def test_cleared_on_corrections(self):
        self._decide("valide")
        self.assertIsNone(self._decide("corrections")["client_validated_at"])

    def test_cleared_on_new_link(self):
        self._decide("valide")
        self.auth_as(self.admin)
        res = self.client.patch(
            deliverable_detail_url(self.deliverable.id), {"url": "https://example.com/v2"}
        )
        self.assertIsNone(res.data["client_validated_at"])

    def test_read_only(self):
        self.auth_as(self.admin)
        self.client.patch(
            deliverable_detail_url(self.deliverable.id),
            {"client_validated_at": "2026-01-01T00:00:00Z"},
        )
        self.deliverable.refresh_from_db()
        self.assertIsNone(self.deliverable.client_validated_at)


class GuidedCorrectionRequestTests(DeliverableSetupMixin, RoleTestCase):
    """Demande de corrections : catégories, détail et lien d'exemple sont
    tous facultatifs ; seul un lien fourni doit être valide."""

    def _request(self, **data):
        self.auth_as(self.client_user)
        payload = {
            "client_status": "corrections",
            "comment": "Titre : remplacer « Été » par « Summer ».",
            "categories": ["texte"],
            **data,
        }
        return self.client.patch(deliverable_detail_url(self.deliverable.id), payload, format="json")

    def test_categories_are_optional(self):
        res = self._request(categories=[], comment="")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["client_status"], "corrections")
        self.assertEqual(res.data["client_feedback_categories"], [])

    def test_explanation_is_optional(self):
        from comments.models import Comment

        res = self._request(comment="")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["client_feedback"], "")
        self.assertEqual(res.data["client_feedback_categories"], ["texte"])
        self.assertIn("Texte / orthographe", Comment.objects.get().body)
        self.assertEqual(self._request(comment="ok").status_code, 200)

    def test_rejects_unknown_category_and_bad_link(self):
        self.assertEqual(self._request(categories=["n_importe_quoi"]).status_code, 400)
        self.assertEqual(self._request(reference_url="capture d'écran").status_code, 400)

    def test_stores_categories_and_link_in_list_order(self):
        res = self._request(
            categories=["image", "texte", "image"], reference_url="https://example.com/capture.png"
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["client_feedback_categories"], ["texte", "image"])
        self.assertEqual(res.data["client_feedback_link"], "https://example.com/capture.png")

    def test_cleared_when_client_validates_or_new_link(self):
        self._request(reference_url="https://example.com/capture.png")
        self.auth_as(self.client_user)
        res = self.client.patch(
            deliverable_detail_url(self.deliverable.id), {"client_status": "valide"}, format="json"
        )
        self.assertEqual(res.data["client_feedback_categories"], [])
        self.assertEqual(res.data["client_feedback_link"], "")

        self._request(reference_url="https://example.com/capture.png")
        self.auth_as(self.admin)
        res = self.client.patch(
            deliverable_detail_url(self.deliverable.id), {"url": "https://example.com/v2"}
        )
        self.assertEqual(res.data["client_feedback_categories"], [])
        self.assertEqual(res.data["client_feedback_link"], "")

    def test_collaborateur_cannot_send_corrections_for_the_client(self):
        self.auth_as(self.collaborateur)
        res = self.client.patch(
            deliverable_detail_url(self.deliverable.id),
            {"client_status": "corrections", "categories": ["texte"]},
            format="json",
        )
        self.assertEqual(res.status_code, 403)


class DecisionRecordedForClientTests(DeliverableSetupMixin, RoleTestCase):
    """L'admin ou le chef de projet enregistre la réponse d'un client reçue
    hors du portail : même effet que si le client avait cliqué, avec la
    trace de qui l'a enregistrée."""

    def _record(self, user, data):
        self.auth_as(user)
        return self.client.patch(deliverable_detail_url(self.deliverable.id), data, format="json")

    def test_admin_and_chef_de_projet_can_validate_for_the_client(self):
        for user in (self.admin, self.chef_projet):
            self.deliverable.client_status = DeliverableStatus.EN_ATTENTE
            self.deliverable.client_validated_at = None
            self.deliverable.save()
            res = self._record(user, {"client_status": "valide"})
            self.assertEqual(res.status_code, 200, user.role)
            self.assertEqual(res.data["client_status"], "valide")
            self.assertIsNotNone(res.data["client_validated_at"])
            self.assertTrue(res.data["client_decided_by_name"])

    def test_corrections_for_the_client_behave_like_the_clients(self):
        from comments.models import Comment
        from notifications.models import Notification, NotificationType

        res = self._record(
            self.chef_projet,
            {"client_status": "corrections", "comment": "Logo plus grand.", "categories": ["visuel"]},
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["client_feedback"], "Logo plus grand.")
        self.mission.refresh_from_db()
        self.assertEqual(self.mission.status, MissionStatus.CORRECTIONS)
        self.assertIn("enregistrées par l'agence pour le client", Comment.objects.get().body)
        notif = Notification.objects.get(type=NotificationType.DECISION_CLIENT)
        self.assertIn("pour le client", notif.body)

    def test_cannot_decide_before_the_agency_has_sent_it(self):
        Deliverable.objects.filter(pk=self.deliverable.pk).update(status=DeliverableStatus.EN_ATTENTE)
        self.assertEqual(self._record(self.admin, {"client_status": "valide"}).status_code, 403)

    def test_cannot_mix_with_other_fields(self):
        res = self._record(self.admin, {"client_status": "valide", "name": "Renommé"})
        self.assertEqual(res.status_code, 403)

    def test_client_own_decision_clears_the_trace(self):
        self._record(self.admin, {"client_status": "corrections"})
        res = self._record(self.client_user, {"client_status": "valide"})
        self.assertEqual(res.data["client_decided_by_name"], "")

    def test_new_link_clears_the_trace(self):
        self._record(self.admin, {"client_status": "valide"})
        res = self._record(self.admin, {"url": "https://example.com/v2"})
        self.assertEqual(res.data["client_decided_by_name"], "")


class CancelDecisionRecordedForClientTests(DeliverableSetupMixin, RoleTestCase):
    """L'agence peut annuler une décision qu'elle a enregistrée pour le
    client (erreur, client revenu sur sa réponse), jamais celle du client
    lui-même, et pas une fois le livrable publié."""

    def _patch(self, user, data):
        self.auth_as(user)
        return self.client.patch(deliverable_detail_url(self.deliverable.id), data, format="json")

    def test_cancel_a_validation_recorded_for_the_client(self):
        from comments.models import Comment

        self._patch(self.admin, {"client_status": "valide"})
        self.mission.refresh_from_db()
        self.assertEqual(self.mission.status, MissionStatus.VALIDE)

        res = self._patch(self.chef_projet, {"client_status": "en_attente"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["client_status"], "en_attente")
        self.assertIsNone(res.data["client_validated_at"])
        self.assertEqual(res.data["client_decided_by_name"], "")
        self.mission.refresh_from_db()
        self.assertEqual(self.mission.status, MissionStatus.ENVOYE_CLIENT)
        self.assertIn("annulée", Comment.objects.get().body)

    def test_cancel_corrections_recorded_for_the_client(self):
        self._patch(self.admin, {"client_status": "corrections", "comment": "Logo"})
        res = self._patch(self.admin, {"client_status": "en_attente"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["client_feedback"], "")
        self.assertEqual(res.data["client_feedback_categories"], [])

    def test_only_the_admin_can_cancel_the_clients_own_decision(self):
        from comments.models import Comment
        from notifications.models import Notification, NotificationType

        self._patch(self.client_user, {"client_status": "valide"})
        self.assertEqual(
            self._patch(self.chef_projet, {"client_status": "en_attente"}).status_code, 403
        )
        res = self._patch(self.admin, {"client_status": "en_attente"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["client_status"], "en_attente")

        # Le client en est prévenu : message visible et notification.
        message = Comment.objects.get(client_visible=True, body__startswith="Votre validation")
        self.assertIn("annulée par l'agence", message.body)
        notif = Notification.objects.get(
            type=NotificationType.VALIDATION, title="Votre décision a été annulée"
        )
        self.auth_as(self.client_user)
        seen = {str(n["id"]) for n in self.client.get(reverse("notification-list")).data}
        self.assertIn(str(notif.id), seen)

    def test_admin_can_cancel_the_clients_own_corrections(self):
        self._patch(self.client_user, {"client_status": "corrections", "comment": "Logo"})
        res = self._patch(self.admin, {"client_status": "en_attente"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["client_feedback"], "")

    def test_can_cancel_an_old_decision_without_any_trace(self):
        """Validé avant le suivi (ni auteur ni date) : rien ne prouve que le
        client l'a prise, l'agence peut l'annuler."""
        Deliverable.objects.filter(pk=self.deliverable.pk).update(
            client_status=DeliverableStatus.VALIDE
        )
        res = self._patch(self.admin, {"client_status": "en_attente"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["client_status"], "en_attente")

    def test_cannot_cancel_once_published(self):
        self._patch(self.admin, {"client_status": "valide"})
        self._patch(self.admin, {"published": True})
        self.assertEqual(self._patch(self.admin, {"client_status": "en_attente"}).status_code, 403)

    def test_collaborateur_and_client_cannot_cancel(self):
        self._patch(self.admin, {"client_status": "valide"})
        self.assertEqual(
            self._patch(self.collaborateur, {"client_status": "en_attente"}).status_code, 403
        )
        self.assertEqual(
            self._patch(self.client_user, {"client_status": "en_attente"}).status_code, 403
        )



class ScheduledPublicationTests(DeliverableSetupMixin, RoleTestCase):
    """Date de publication prévue : programmée par l'équipe (pas le client),
    à venir, tracée dans la discussion, visible au calendrier et dans les
    alertes quand la publication est à risque."""

    def _schedule(self, user, when):
        self.auth_as(user)
        value = when.isoformat() if when else None
        return self.client.patch(
            deliverable_detail_url(self.deliverable.id), {"scheduled_at": value}, format="json"
        )

    def _in(self, **delta):
        from datetime import timedelta

        from django.utils import timezone

        return timezone.now() + timedelta(**delta)

    def test_team_can_schedule_and_clear(self):
        for user in (self.admin, self.chef_projet, self.collaborateur):
            res = self._schedule(user, self._in(days=3))
            self.assertEqual(res.status_code, 200, user.role)
            self.assertIsNotNone(res.data["scheduled_at"])
        res = self._schedule(self.collaborateur, None)
        self.assertEqual(res.status_code, 200)
        self.assertIsNone(res.data["scheduled_at"])

    def test_client_cannot_schedule(self):
        self.assertEqual(self._schedule(self.client_user, self._in(days=3)).status_code, 403)

    def test_past_date_is_accepted(self):
        """Pas de limite : une date passée sert à reporter après coup une
        publication, ou à rattraper un planning (le livrable non publié
        apparaît alors en retard)."""
        res = self._schedule(self.admin, self._in(days=-3))
        self.assertEqual(res.status_code, 200)
        self.assertIsNotNone(res.data["scheduled_at"])

    def test_change_is_traced_and_visible_to_client_once_sent(self):
        from comments.models import Comment

        self._schedule(self.admin, self._in(days=2))
        comment = Comment.objects.get()
        self.assertIn("prévue le", comment.body)
        self.assertTrue(comment.client_visible)  # livrable déjà envoyé (setup)

        Deliverable.objects.filter(pk=self.deliverable.pk).update(
            status=DeliverableStatus.EN_ATTENTE
        )
        self._schedule(self.admin, None)
        last = Comment.objects.order_by("-id").first()
        self.assertIn("retirée", last.body)
        self.assertFalse(last.client_visible)  # en revue agence : interne

    def test_calendar_shows_upcoming_publications(self):
        self._schedule(self.admin, self._in(days=2))
        self.auth_as(self.admin)
        events = self.client.get(reverse("calendar")).data
        event = next(e for e in events if e["id"] == f"pub-{self.deliverable.id}")
        self.assertEqual(event["type"], "publication")
        self.assertEqual(event["deliverable_id"], str(self.deliverable.id))
        self.assertIn("validation du client", event["description"])
        self.assertIsNone(event["published_at"])

    def test_published_publication_stays_on_the_calendar(self):
        self._schedule(self.admin, self._in(days=2))
        Deliverable.objects.filter(pk=self.deliverable.pk).update(
            client_status=DeliverableStatus.VALIDE, published_at=self._in(days=2)
        )
        self.auth_as(self.admin)
        events = self.client.get(reverse("calendar")).data
        event = next(e for e in events if e["id"] == f"pub-{self.deliverable.id}")
        self.assertIsNotNone(event["published_at"])
        self.assertEqual(event["description"], "Publiée.")

    def test_dashboard_flags_publications_at_risk(self):
        self.auth_as(self.admin)
        self._schedule(self.admin, self._in(hours=20))  # client pas encore validé
        risky = self.client.get(reverse("dashboard-alerts")).data["publicationsAtRisk"]
        self.assertEqual([d["id"] for d in risky], [str(self.deliverable.id)])

        Deliverable.objects.filter(pk=self.deliverable.pk).update(
            client_status=DeliverableStatus.VALIDE
        )
        risky = self.client.get(reverse("dashboard-alerts")).data["publicationsAtRisk"]
        self.assertEqual(risky, [])  # prêt à temps : pas de risque

        Deliverable.objects.filter(pk=self.deliverable.pk).update(scheduled_at=self._in(hours=-1))
        risky = self.client.get(reverse("dashboard-alerts")).data["publicationsAtRisk"]
        self.assertEqual(len(risky), 1)  # date passée sans publication



class PublicationRemindersTests(DeliverableSetupMixin, RoleTestCase):
    """Rappels de publication (commande send_publication_reminders) : la
    veille et en retard, une seule fois par date, aux bonnes personnes."""

    def setUp(self):
        super().setUp()
        from django.utils import timezone

        from notifications.models import Notification

        Notification.objects.all().delete()
        self.now = timezone.now()

    def _schedule(self, **delta):
        from datetime import timedelta

        Deliverable.objects.filter(pk=self.deliverable.pk).update(
            scheduled_at=self.now + timedelta(**delta), publication_reminders=[]
        )

    def _run(self, **delta):
        from datetime import timedelta

        from deliverables.management.commands.send_publication_reminders import (
            send_publication_reminders,
        )

        return send_publication_reminders(now=self.now + timedelta(**delta))

    def _titles(self, **filters):
        from notifications.models import Notification

        return sorted(Notification.objects.filter(**filters).values_list("title", flat=True))

    def _visible_to(self, user):
        self.auth_as(user)
        return {n["title"] for n in self.client.get(reverse("notification-list")).data}

    def test_eve_reminder_when_client_has_not_validated(self):
        self._schedule(hours=20)
        self.assertEqual(self._run(), 1)
        self.assertEqual(
            self._titles(),
            ["Publication prévue, pas encore validée", "À valider avant la publication"],
        )
        # Le client voit son rappel, pas celui de l'équipe ; le collaborateur
        # voit celui de l'équipe.
        self.assertEqual(self._visible_to(self.client_user), {"À valider avant la publication"})
        self.assertIn("Publication prévue, pas encore validée", self._visible_to(self.collaborateur))

    def test_eve_reminder_when_ready(self):
        Deliverable.objects.filter(pk=self.deliverable.pk).update(
            client_status=DeliverableStatus.VALIDE
        )
        self._schedule(hours=20)
        self._run()
        self.assertEqual(self._titles(), ["À publier bientôt"])

    def test_nothing_more_than_24h_before(self):
        self._schedule(days=3)
        self.assertEqual(self._run(), 0)
        self.assertEqual(self._titles(), [])

    def test_each_reminder_is_sent_once(self):
        self._schedule(hours=20)
        self._run()
        self.assertEqual(self._run(hours=1), 0)
        self.assertEqual(len(self._titles(title="Publication prévue, pas encore validée")), 1)

    def test_late_reminder_once_the_date_has_passed(self):
        self._schedule(hours=2)
        self._run()  # veille
        self._run(hours=3)  # en retard
        self._run(hours=4)  # rien de plus
        self.assertEqual(len(self._titles(title="Publication en retard")), 1)

    def test_new_date_restarts_the_reminders(self):
        self._schedule(hours=20)
        self._run()
        Deliverable.objects.filter(pk=self.deliverable.pk).update(
            scheduled_at=self.now + __import__("datetime").timedelta(hours=10)
        )
        self.assertEqual(self._run(), 1)

    def test_published_deliverables_are_ignored(self):
        self._schedule(hours=-5)
        Deliverable.objects.filter(pk=self.deliverable.pk).update(published_at=self.now)
        self.assertEqual(self._run(), 0)
