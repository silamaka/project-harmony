from django.db import models


class ClientStatus(models.TextChoices):
    ACTIF = "actif", "Actif"
    INACTIF = "inactif", "Inactif"
    PROSPECT = "prospect", "Prospect"


class Client(models.Model):
    """Correspond au type `Client` du frontend (src/types/index.ts)."""

    name = models.CharField(max_length=200)
    industry = models.CharField(max_length=150, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    address = models.CharField(max_length=255, blank=True)
    # TextField (pas URLField) : même raison que User.avatar_url, une data
    # URL base64 générée côté client.
    logo_url = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=ClientStatus.choices, default=ClientStatus.PROSPECT)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.name


class Contact(models.Model):
    """Correspond au type `Contact` du frontend (contact d'un client)."""

    client = models.ForeignKey(Client, related_name="contacts", on_delete=models.CASCADE)
    name = models.CharField(max_length=200)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    position = models.CharField(max_length=150, blank=True)

    def __str__(self) -> str:
        return self.name
