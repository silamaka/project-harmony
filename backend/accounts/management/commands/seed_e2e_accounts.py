from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from accounts.models import Role, User
from clients.models import Client

# Mêmes identifiants que e2e/utils.ts (DEMO_ACCOUNTS).
PASSWORD = "demo1234"
ACCOUNTS = [
    ("admin@bebaempire.com", "Admin", "E2E", Role.ADMIN),
    ("sara@bebaempire.com", "Sara", "E2E", Role.CHEF_PROJET),
    ("yassine@bebaempire.com", "Yassine", "E2E", Role.COLLABORATEUR),
    ("omar@atlasretail.com", "Omar", "E2E", Role.CLIENT),
]


class Command(BaseCommand):
    help = (
        "Crée (ou remet à neuf) les comptes de démonstration utilisés par les "
        "tests Playwright (e2e/). Développement uniquement : refuse de tourner "
        "si DEBUG est désactivé, un admin au mot de passe connu serait une faille."
    )

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("Refusé : DEBUG est désactivé (environnement de production ?).")
        company, _ = Client.objects.get_or_create(name="Atlas Retail")
        for email, first_name, last_name, role in ACCOUNTS:
            user = User.objects.filter(email=email).first() or User(email=email)
            user.first_name, user.last_name, user.role = first_name, last_name, role
            user.client = company if role == Role.CLIENT else None
            user.is_active = True
            user.set_password(PASSWORD)
            user.save()
            self.stdout.write(f"{email} ({role})")
        self.stdout.write(self.style.SUCCESS("Comptes e2e prêts."))
