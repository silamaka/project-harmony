from django.contrib import admin

from .models import Deliverable


@admin.register(Deliverable)
class DeliverableAdmin(admin.ModelAdmin):
    list_display = ["name", "mission", "type", "version", "status", "uploaded_by"]
    list_filter = ["status", "type"]
    search_fields = ["name"]
