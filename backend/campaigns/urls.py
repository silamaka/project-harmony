from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("campaigns", views.CampaignViewSet, basename="campaign")

urlpatterns = router.urls
