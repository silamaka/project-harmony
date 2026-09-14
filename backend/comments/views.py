from rest_framework import viewsets

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
        mission_id = self.request.query_params.get("mission")
        if mission_id:
            queryset = queryset.filter(mission_id=mission_id)
        return queryset

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)

    def perform_update(self, serializer):
        # mission/auteur restent ceux d'origine quoi qu'envoie le client :
        # seuls body/attachment_url sont vraiment éditables (voir aussi
        # perform_create, même logique pour author).
        serializer.save(mission=serializer.instance.mission, parent=serializer.instance.parent)
