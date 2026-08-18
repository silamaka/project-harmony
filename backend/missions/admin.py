from django.contrib import admin

from .models import Mission


@admin.register(Mission)
class MissionAdmin(admin.ModelAdmin):
    list_display = ["title", "client", "project", "assignee", "priority", "status", "deadline"]
    list_filter = ["status", "priority"]
    search_fields = ["title"]
