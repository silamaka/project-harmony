from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("notifications", views.NotificationViewSet, basename="notification")

# Avant le routeur : sinon "push" serait pris pour l'id d'une notification.
urlpatterns = [
    path("notifications/push/", views.PushSubscriptionView.as_view(), name="notification-push"),
    *router.urls,
]
