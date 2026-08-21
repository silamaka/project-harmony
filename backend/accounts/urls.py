from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from . import views

router = DefaultRouter()
router.register("users", views.UserViewSet, basename="user")

urlpatterns = [
    path("auth/login/", views.LoginView.as_view(), name="login"),
    path("auth/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("auth/me/", views.MeView.as_view(), name="me"),
    path("auth/password/forgot/", views.ForgotPasswordView.as_view(), name="password_forgot"),
    path("auth/password/reset/", views.ResetPasswordView.as_view(), name="password_reset"),
    path("", include(router.urls)),
]
