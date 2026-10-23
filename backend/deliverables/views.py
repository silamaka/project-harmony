from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import viewsets

from accounts.models import Role
from comments.models import Comment
from missions.scoping import missions_visible_to
from notifications.services import (
    notify_client_decision,
    notify_client_decision_cancelled,
    notify_deliverable_sent,
)

from .decisions import sync_mission_status
from .models import CorrectionCategory, Deliverable, DeliverableStatus
from .permissions import DeliverablePermission, is_clients_own_decision
from .serializers import DeliverableSerializer


def client_visible_q(user):
    """Livrables montrés à un client : ceux que l'agence a validés (sa
    validation vaut envoi) et qui ont un lien, plus ceux qu'il a lui-même
    déposés. Les dépôts encore en revue chez l'agence restent internes, quel
    que soit le statut de la mission."""
    return Q(uploaded_by=user) | (Q(status=DeliverableStatus.VALIDE) & ~Q(url=""))


def correction_comment_body(
    deliverable, comment, categories, reference_url, *, on_behalf=False
) -> str:
    """Trace de la demande dans la discussion de la mission (historique)."""
    labels = dict(CorrectionCategory.choices)
    lines = [f"Corrections demandées sur le livrable {deliverable.label}"]
    if on_behalf:
        lines[0] += " (enregistrées par l'agence pour le client)"
    if categories:
        lines.append("À corriger : " + ", ".join(labels[c] for c in categories))
    if comment:
        lines.append(comment)
    if reference_url:
        lines.append(f"Exemple : {reference_url}")
    return "\n".join(lines)


def schedule_comment_body(deliverable) -> str:
    if not deliverable.scheduled_at:
        return f"Date de publication prévue retirée pour le livrable {deliverable.label}."
    when = timezone.localtime(deliverable.scheduled_at)
    return (
        f"Publication du livrable {deliverable.label} prévue le "
        f"{when:%d/%m/%Y} à {when:%H:%M}."
    )


def is_sent_to_client(deliverable) -> bool:
    return deliverable.status == DeliverableStatus.VALIDE and bool(deliverable.url)


class DeliverableViewSet(viewsets.ModelViewSet):
    serializer_class = DeliverableSerializer
    permission_classes = [DeliverablePermission]

    def get_queryset(self):
        user = self.request.user
        queryset = Deliverable.objects.filter(mission__in=missions_visible_to(user))
        mission_id = self.request.query_params.get("mission")
        if mission_id:
            queryset = queryset.filter(mission_id=mission_id)
        # Un collaborateur voit tous les livrables de ses missions, qui que
        # soit le déposant ; DeliverablePermission limite ce qu'il peut en
        # faire (supprimer seulement ses dépôts, jamais valider).
        if user.role == Role.CLIENT:
            queryset = queryset.filter(client_visible_q(user))
        return queryset

    @transaction.atomic
    def perform_create(self, serializer):
        deliverable = serializer.save(uploaded_by=self.request.user)
        sync_mission_status(deliverable.mission)

    @transaction.atomic
    def perform_update(self, serializer):
        was_sent = is_sent_to_client(serializer.instance)
        previous_client_status = serializer.instance.client_status
        previous_scheduled_at = serializer.instance.scheduled_at
        # Calculé avant l'enregistrement, qui efface la trace de la décision.
        was_clients_own_decision = is_clients_own_decision(serializer.instance)
        comment = serializer.validated_data.get("comment", "").strip()
        categories = serializer.validated_data.get("categories", [])
        reference_url = serializer.validated_data.get("reference_url", "")
        deliverable = serializer.save()
        user = self.request.user

        # Décision du client : prise par lui dans le portail, ou enregistrée
        # pour lui par l'agence (DeliverablePermission), tracée dans
        # client_decided_by.
        on_behalf = user.role != Role.CLIENT
        if user.role == Role.CLIENT or "client_status" in serializer.validated_data:
            deliverable.client_decided_by = user if on_behalf else None
            if deliverable.client_status == DeliverableStatus.EN_ATTENTE:
                # Décision annulée : le livrable attend de nouveau la réponse
                # du client, sans trace restante. Si c'était la décision du
                # client lui-même (annulée par l'administrateur), il en est
                # prévenu : message visible et notification.
                deliverable.client_decided_by = None
                if was_clients_own_decision:
                    what = (
                        "validation"
                        if previous_client_status == DeliverableStatus.VALIDE
                        else "demande de corrections"
                    )
                    Comment.objects.create(
                        mission=deliverable.mission,
                        author=user,
                        body=f"Votre {what} du livrable {deliverable.label} a été annulée par "
                        "l'agence : il attend de nouveau votre réponse.",
                        client_visible=True,
                    )
                    notify_client_decision_cancelled(deliverable, what)
                else:
                    Comment.objects.create(
                        mission=deliverable.mission,
                        author=user,
                        body=f"Décision du client annulée sur le livrable {deliverable.label} : "
                        "il attend de nouveau sa réponse.",
                    )
            # Décision et explication partent ensemble : l'équipe ne voit
            # jamais un livrable en "Corrections" sans savoir quoi corriger.
            # L'explication s'affiche sur le livrable même, et reste dans la
            # discussion pour l'historique.
            if deliverable.client_status == DeliverableStatus.CORRECTIONS:
                deliverable.client_feedback = comment
                deliverable.client_feedback_at = timezone.now()
                deliverable.client_feedback_categories = categories
                deliverable.client_feedback_link = reference_url
                deliverable.client_validated_at = None
                Comment.objects.create(
                    mission=deliverable.mission,
                    author=user,
                    body=correction_comment_body(
                        deliverable, comment, categories, reference_url, on_behalf=on_behalf
                    ),
                    client_visible=True,
                )
            else:
                deliverable.client_feedback = ""
                deliverable.client_feedback_at = None
                deliverable.client_feedback_categories = []
                deliverable.client_feedback_link = ""
                if deliverable.client_status == DeliverableStatus.EN_ATTENTE:
                    deliverable.client_validated_at = None
                # Revalider sans changement garde la date de la première
                # validation.
                elif deliverable.client_validated_at is None:
                    deliverable.client_validated_at = timezone.now()
            deliverable.save(
                update_fields=[
                    "client_feedback",
                    "client_feedback_at",
                    "client_feedback_categories",
                    "client_feedback_link",
                    "client_validated_at",
                    "client_decided_by",
                ]
            )
            if (
                deliverable.client_status != previous_client_status
                and deliverable.client_status != DeliverableStatus.EN_ATTENTE
            ):
                notify_client_decision(
                    user,
                    deliverable.mission,
                    validated=deliverable.client_status == DeliverableStatus.VALIDE,
                    subject=f"livrable {deliverable.label} (mission « {deliverable.mission.title} »)",
                    deliverable=deliverable,
                    on_behalf=on_behalf,
                )
        elif not was_sent and is_sent_to_client(deliverable):
            notify_deliverable_sent(deliverable)

        if deliverable.scheduled_at != previous_scheduled_at:
            # Trace du planning dans la discussion ; visible du client dès
            # que le livrable lui a été envoyé (il voit alors la date).
            Comment.objects.create(
                mission=deliverable.mission,
                author=user,
                body=schedule_comment_body(deliverable),
                client_visible=is_sent_to_client(deliverable),
            )

        sync_mission_status(deliverable.mission)

    @transaction.atomic
    def perform_destroy(self, instance):
        mission = instance.mission
        instance.delete()
        sync_mission_status(mission)
