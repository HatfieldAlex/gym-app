"""
URL configuration for settings project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import include, path
from django.views.generic import TemplateView

from catalog.views import exercise_detail, exercises_catelog
from observations.views import training_sessions

urlpatterns = [
    path('admin/', admin.site.urls),
    # LoginView/LogoutView at accounts/login/ and accounts/logout/.
    path('accounts/', include('django.contrib.auth.urls')),
    path('', TemplateView.as_view(template_name='index.html'), name='home'),
    path('exercises-catelog/', exercises_catelog, name='exercises_catelog'),
    path('exercises-catelog/<uuid:exercise_id>/', exercise_detail, name='exercise_detail'),
    path('training-sessions/', training_sessions, name='training_sessions'),
]
