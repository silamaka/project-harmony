from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models


class Role(models.TextChoices):
    ADMIN = "admin", "Administrateur"
    CHEF_PROJET = "chef_projet", "Chef de projet"
    COLLABORATEUR = "collaborateur", "Collaborateur"
    CLIENT = "client", "Client"


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email: str, password: str | None, **extra_fields):
        if not email:
            raise ValueError("L'email est obligatoire.")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email: str, password: str | None = None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        extra_fields.setdefault("role", Role.COLLABORATEUR)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email: str, password: str | None = None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", Role.ADMIN)
        if extra_fields.get("is_staff") is not True:
            raise ValueError("Un superuser doit avoir is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Un superuser doit avoir is_superuser=True.")
        return self._create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """Correspond au type `User` du frontend (src/types/index.ts)."""

    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    phone = models.CharField(max_length=30, blank=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.COLLABORATEUR)
    avatar_url = models.URLField(blank=True)
    job_title = models.CharField(max_length=150, blank=True)
    workload = models.PositiveSmallIntegerField(default=0)
    # Lié à clients.Client une fois cette app créée (Phase 1) : un utilisateur de
    # rôle "client" porte la fiche entreprise associée, comme côté frontend.
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["first_name", "last_name"]

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.first_name} {self.last_name} <{self.email}>"
