from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("core.urls")),
    path("api/v1/", include("accounts.urls")),
    path("api/v1/", include("clients.urls")),
    path("api/v1/", include("projects.urls")),
    path("api/v1/", include("missions.urls")),
    path("api/v1/", include("deliverables.urls")),
    path("api/v1/", include("comments.urls")),
    path("api/v1/", include("calendar_app.urls")),
    path("api/v1/", include("notifications.urls")),
    path("api/v1/", include("dashboard.urls")),
]
