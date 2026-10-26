import base64

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from django.core.management.base import BaseCommand


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


class Command(BaseCommand):
    help = "Génère la paire de clés VAPID des notifications push, à copier dans le .env."

    def handle(self, *args, **options):
        # À faire UNE seule fois par serveur : changer de clés désabonne tous
        # les appareils (chacun devra réactiver les notifications).
        private_key = ec.generate_private_key(ec.SECP256R1())
        private_raw = private_key.private_numbers().private_value.to_bytes(32, "big")
        public_raw = private_key.public_key().public_bytes(
            serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
        )
        self.stdout.write("Ajoutez ces lignes au fichier backend/.env, puis redémarrez l'API :\n")
        self.stdout.write(f"VAPID_PUBLIC_KEY={b64url(public_raw)}")
        self.stdout.write(f"VAPID_PRIVATE_KEY={b64url(private_raw)}")
