from django.contrib import admin

from .models import Client, Contact


class ContactInline(admin.TabularInline):
    model = Contact
    extra = 0


@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display = ["name", "industry", "status", "created_at"]
    list_filter = ["status"]
    search_fields = ["name", "email"]
    inlines = [ContactInline]
