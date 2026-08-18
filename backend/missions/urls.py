from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("missions", views.MissionViewSet, basename="mission")

urlpatterns = router.urls
