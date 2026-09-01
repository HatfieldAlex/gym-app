"""URL configuration for the settings project.

Two layers, deliberately separate:

* /api/v1/... is the DRF API -- the only thing that touches the ORM.
* everything else serves a page shell from frontend-web/. The shells carry no
  data; they fetch it from the API in the browser.
"""
from django.contrib import admin
from django.urls import include, path
from django.views.generic import TemplateView

urlpatterns = [
    path('admin/', admin.site.urls),
    # LoginView/LogoutView at accounts/login/ and accounts/logout/.
    path('accounts/', include('django.contrib.auth.urls')),

    path('api/v1/', include('settings.api_urls')),
    # Session login/logout for DRF's browsable API.
    path('api/auth/', include('rest_framework.urls')),

    # Page shells. TemplateView puts the URL kwargs in the template context, so
    # exercise_detail.html gets {{ exercise_id }} to fetch with.
    path('', TemplateView.as_view(template_name='index.html'), name='home'),
    path(
        'exercises-catelog/',
        TemplateView.as_view(template_name='exercises_catelog.html'),
        name='exercises_catelog',
    ),
    path(
        'exercises-catelog/<uuid:exercise_id>/',
        TemplateView.as_view(template_name='exercise_detail.html'),
        name='exercise_detail',
    ),
    path(
        'training-sessions/',
        TemplateView.as_view(template_name='training_sessions.html'),
        name='training_sessions',
    ),
    path(
        'settings/',
        TemplateView.as_view(template_name='settings.html'),
        name='settings',
    ),
]
