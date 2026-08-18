from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("meetings", views.MeetingViewSet, basename="meeting")

urlpatterns = [
    path("calendar/", views.calendar_events, name="calendar"),
    path("", include(router.urls)),
]
