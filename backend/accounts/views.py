from django.conf import settings
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.core.mail import send_mail
from django.db.models import ProtectedError
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import Role, User
from .permissions import UserWritePermission
from .serializers import UserSerializer


class EmailTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Ajoute l'utilisateur sérialisé à la réponse de connexion, comme
    documenté côté frontend (auth-context.tsx) : { access, refresh, user }.
    USERNAME_FIELD = "email" sur le modèle User suffit à authentifier par
    email ; rien à changer côté champs de la requête.
    """

    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user).data
        return data


class LoginView(TokenObtainPairView):
    serializer_class = EmailTokenObtainPairSerializer
    permission_classes = [permissions.AllowAny]
    throttle_scope = "auth-sensitive"


class ForgotPasswordView(APIView):
    """Génère un lien de réinitialisation à durée de vie limitée (via
    PasswordResetTokenGenerator, le mécanisme standard de Django — le
    jeton se périme automatiquement passé PASSWORD_RESET_TIMEOUT, ou dès
    que le mot de passe change) et l'envoie par e-mail. Répond toujours de
    la même façon, qu'un compte existe ou non pour l'adresse donnée : ne
    jamais laisser deviner quelles adresses sont enregistrées."""

    permission_classes = [permissions.AllowAny]
    throttle_scope = "auth-sensitive"

    def post(self, request):
        email = str(request.data.get("email", "")).strip()
        user = User.objects.filter(email__iexact=email).first() if email else None
        if user is not None and user.role not in ADMIN_MANAGED_PASSWORD_ROLES:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = PasswordResetTokenGenerator().make_token(user)
            reset_url = f"{settings.FRONTEND_URL}/reinitialiser-mot-de-passe?uid={uid}&token={token}"
            send_mail(
                subject="Réinitialisation de votre mot de passe OLYMPE",
                message=(
                    f"Bonjour {user.first_name},\n\n"
                    "Une demande de réinitialisation de mot de passe a été effectuée pour ce "
                    f"compte. Cliquez sur ce lien pour choisir un nouveau mot de passe :\n\n"
                    f"{reset_url}\n\n"
                    "Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail."
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                fail_silently=True,
            )
        return Response(
            {"detail": "Si un compte existe pour cette adresse, un e-mail vient d'être envoyé."}
        )


class ResetPasswordView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_scope = "auth-sensitive"

    def post(self, request):
        uid = request.data.get("uid", "")
        token = request.data.get("token", "")
        password = str(request.data.get("password", ""))
        if len(password) < 4:
            return Response({"detail": "Mot de passe trop court."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            user = User.objects.get(pk=force_str(urlsafe_base64_decode(uid)))
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            return Response({"detail": "Lien invalide."}, status=status.HTTP_400_BAD_REQUEST)
        if not PasswordResetTokenGenerator().check_token(user, token):
            return Response({"detail": "Lien invalide ou expiré."}, status=status.HTTP_400_BAD_REQUEST)
        # Même avec un lien valide (ex. obtenu avant cette règle) : le mot de
        # passe de ces comptes ne se change que par l'admin.
        if user.role in ADMIN_MANAGED_PASSWORD_ROLES:
            return Response(
                {"detail": ADMIN_MANAGED_PASSWORD_DETAIL}, status=status.HTTP_403_FORBIDDEN
            )
        user.set_password(password)
        user.save(update_fields=["password"])
        return Response({"detail": "Mot de passe mis à jour."})


# Ce qu'un utilisateur peut modifier sur son propre compte. Tout le reste
# (rôle, entreprise rattachée, statut actif, e-mail de connexion...) relève
# de l'admin : sans cette liste, n'importe qui pouvait se passer admin ou se
# rattacher à une autre entreprise via PATCH /auth/me/.
SELF_EDITABLE_FIELDS = {"phone", "avatar_url"}

# Décision produit : le mot de passe d'un client ou d'un collaborateur est
# géré par l'admin seul (il le choisit, le transmet et peut le redonner
# depuis Paramètres). Ces comptes ne peuvent ni le changer eux-mêmes, ni le
# réinitialiser par "Mot de passe oublié".
ADMIN_MANAGED_PASSWORD_ROLES = (Role.CLIENT, Role.COLLABORATEUR)
ADMIN_MANAGED_PASSWORD_DETAIL = (
    "Votre mot de passe est géré par l'administrateur : contactez-le pour le modifier."
)


class MeView(APIView):
    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        forbidden = set(request.data.keys()) - SELF_EDITABLE_FIELDS
        if forbidden:
            return Response(
                {"detail": f"Champs non modifiables sur votre propre compte : {', '.join(sorted(forbidden))}."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class ChangePasswordView(APIView):
    """Changer son propre mot de passe, en confirmant l'actuel. Réservé à
    l'admin et au chef de projet : pour un client ou un collaborateur, le mot
    de passe est géré par l'admin (ADMIN_MANAGED_PASSWORD_ROLES)."""

    throttle_scope = "auth-sensitive"

    def post(self, request):
        if request.user.role in ADMIN_MANAGED_PASSWORD_ROLES:
            return Response(
                {"detail": ADMIN_MANAGED_PASSWORD_DETAIL}, status=status.HTTP_403_FORBIDDEN
            )
        current = str(request.data.get("current_password", ""))
        new = str(request.data.get("new_password", ""))
        if not request.user.check_password(current):
            return Response(
                {"detail": "Mot de passe actuel incorrect."}, status=status.HTTP_400_BAD_REQUEST
            )
        if len(new) < 8:
            return Response(
                {"detail": "Le nouveau mot de passe doit contenir au moins 8 caractères."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if new == current:
            return Response(
                {"detail": "Le nouveau mot de passe doit être différent de l'actuel."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        request.user.set_password(new)
        request.user.save(update_fields=["password"])
        return Response({"detail": "Mot de passe mis à jour."})


class UserViewSet(viewsets.ModelViewSet):
    """Supprimer un compte "client" ne supprime jamais son entreprise : elle
    peut avoir d'autres contacts, et surtout tout son historique (projets,
    missions) en dépend."""

    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [UserWritePermission]

    def get_queryset(self):
        queryset = super().get_queryset()
        role = self.request.query_params.get("role")
        if role:
            queryset = queryset.filter(role=role)
        return queryset

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {"detail": "Impossible de supprimer : des missions sont encore assignées à cet utilisateur."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=["post"])
    def toggle_active(self, request, pk=None):
        user = self.get_object()
        user.is_active = not user.is_active
        user.save(update_fields=["is_active"])
        return Response(UserSerializer(user).data)
