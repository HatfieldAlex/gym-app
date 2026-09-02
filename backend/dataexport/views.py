"""The export, over HTTP: one GET, one zip.

An APIView that answers a plain HttpResponse rather than a DRF Response.
DEFAULT_RENDERER_CLASSES is [JSONRenderer], so a Response cannot carry zip
bytes -- but finalize_response passes a non-Response HttpResponseBase straight
through untouched, and going through DRF is what keeps SessionAuthentication
and IsAuthenticated identical to every other route, so an anonymous GET is a
403 rather than login_required's 302 into the SPA catch-all (E3).
"""
from django.http import HttpResponse
from rest_framework.views import APIView

from . import export


class DataExportView(APIView):
    """`GET /api/v1/export/` — every row the requester can see, as a zip of CSVs.

    No permission_classes and no renderer_classes: the project-wide settings are
    the whole story. A zip renderer would win content negotiation for the 403 and
    405 bodies too, and DRF would hand it a {'detail': ...} dict to turn into
    bytes; the price of not adding one is that `Accept: application/zip` alone is
    a 406, so callers ask for `application/zip, application/json` (E3a).
    """

    def get(self, request):
        # request.user straight through: build_archive reads the scope off
        # is_superuser, and ownership is never a query parameter.
        filename, content = export.build_archive(request.user)
        response = HttpResponse(content, content_type='application/zip')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
