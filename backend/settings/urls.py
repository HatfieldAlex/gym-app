"""URL configuration for the settings project.

Two layers, deliberately separate:

* /api/v1/... is the DRF API -- the only thing that touches the ORM.
* everything else is the React single-page app in frontend-web/. Django serves
  one shell for every one of its routes; the app fetches its data from the API.
"""
from django.conf import settings
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.static import serve

from .views import spa

urlpatterns = [
    path('admin/', admin.site.urls),

    path('api/v1/', include('settings.api_urls')),
    # Session login/logout for DRF's browsable API.
    path('api/auth/', include('rest_framework.urls')),

    # The service worker, at the root rather than under /static/: a worker
    # controls only the URLs at or below its own path, and the app is at /.
    # Vite serves the same file at /sw.js in development, so the registration
    # in frontend-web/src/serviceWorker.js needs one path and no branch. Above
    # the catch-all, or it would be answered with the SPA shell.
    re_path(
        r'^sw\.js$',
        serve,
        {'document_root': settings.FRONTEND_WEB_DIST, 'path': 'sw.js'},
        name='service-worker',
    ),

    # Catch-all, last: the routes above are matched first, so everything that
    # reaches here belongs to the SPA's own router -- including deep links and
    # reloads on /exercises-catelog/<uuid>/.
    re_path(r'^.*$', spa, name='spa'),
]
