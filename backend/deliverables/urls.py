from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("deliverables", views.DeliverableViewSet, basename="deliverable")

urlpatterns = router.urls
