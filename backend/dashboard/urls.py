from django.urls import path

from . import views

urlpatterns = [
    path("dashboard/", views.stats, name="dashboard-stats"),
    path("dashboard/missions-by-client/", views.missions_by_client, name="dashboard-missions-by-client"),
    path(
        "dashboard/missions-by-collaborator/",
        views.missions_by_collaborator,
        name="dashboard-missions-by-collaborator",
    ),
    path("dashboard/monthly/", views.monthly, name="dashboard-monthly"),
    path("dashboard/completion-rate/", views.completion_rate, name="dashboard-completion-rate"),
    path("dashboard/alerts/", views.alerts, name="dashboard-alerts"),
]
