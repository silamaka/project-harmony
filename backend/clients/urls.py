from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("clients", views.ClientViewSet, basename="client")

urlpatterns = router.urls
