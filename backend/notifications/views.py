from django.db.models import Q
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.models import Role
from missions.scoping import missions_visible_to

from .models import Notification
from .permissions import NotificationPermission
from .serializers import NotificationSerializer


class NotificationViewSet(viewsets.ModelViewSet):
    http_method_names = ["get", "patch", "delete", "post", "head", "options"]
    serializer_class = NotificationSerializer
    permission_classes = [NotificationPermission]

    def get_queryset(self):
        user = self.request.user
        if user.role in (Role.ADMIN, Role.CHEF_PROJET):
            return Notification.objects.all()
        return Notification.objects.filter(
            Q(mission__isnull=True) | Q(mission__in=missions_visible_to(user))
        )

    @action(detail=False, methods=["post"], url_path="mark-all-read")
    def mark_all_read(self, request):
        self.get_queryset().update(read=True)
        return Response(NotificationSerializer(self.get_queryset(), many=True).data)
