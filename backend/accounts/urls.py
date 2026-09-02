"""Auth routes, mounted by settings.api_urls under /api/v1/auth/."""
from django.urls import path

from .views import LoginView, LogoutView, SessionView, SignupView

app_name = 'auth'
urlpatterns = [
    path('session/', SessionView.as_view(), name='session'),
    path('signup/', SignupView.as_view(), name='signup'),
    path('login/', LoginView.as_view(), name='login'),
    path('logout/', LogoutView.as_view(), name='logout'),
]
