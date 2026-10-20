from rest_framework import viewsets

from accounts.models import Role
from missions.scoping import missions_visible_to

from .models import Comment
from .permissions import CommentPermission
from .serializers import CommentSerializer


class CommentViewSet(viewsets.ModelViewSet):
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    serializer_class = CommentSerializer
    permission_classes = [CommentPermission]

    def get_queryset(self):
        queryset = Comment.objects.filter(mission__in=missions_visible_to(self.request.user))
        if self.request.user.role == Role.CLIENT:
            # Les échanges internes de l'équipe restent invisibles du client.
            queryset = queryset.filter(client_visible=True)
        mission_id = self.request.query_params.get("mission")
        if mission_id:
            queryset = queryset.filter(mission_id=mission_id)
        return queryset

    def perform_create(self, serializer):
        extra = {}
        if self.request.user.role == Role.CLIENT:
            # Ce qu'écrit le client s'adresse à l'équipe et reste visible de lui.
            extra["client_visible"] = True
        serializer.save(author=self.request.user, **extra)

    def perform_update(self, serializer):
        # mission/auteur restent ceux d'origine quoi qu'envoie le client :
        # seuls body/attachment_url sont vraiment éditables (voir aussi
        # perform_create, même logique pour author).
        extra = {}
        if self.request.user.role == Role.CLIENT:
            extra["client_visible"] = True
        serializer.save(
            mission=serializer.instance.mission, parent=serializer.instance.parent, **extra
        )
