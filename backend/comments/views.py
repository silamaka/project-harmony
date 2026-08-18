from rest_framework import viewsets

from missions.scoping import missions_visible_to

from .models import Comment
from .permissions import CommentPermission
from .serializers import CommentSerializer


class CommentViewSet(viewsets.ModelViewSet):
    http_method_names = ["get", "post", "delete", "head", "options"]
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
