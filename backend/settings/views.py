"""Serving the built SPA.

Routing now lives in the browser, so Django's job for anything that is not the
API or the admin is to hand back the same ``index.html`` and get out of the way.
"""
from django.conf import settings
from django.http import HttpResponse

INDEX_HTML = settings.FRONTEND_WEB_DIST / 'index.html'

MISSING = """<!DOCTYPE html>
<title>Frontend not built</title>
<h1>The frontend has not been built yet</h1>
<p>Run <code>npm install &amp;&amp; npm run build</code> in <code>frontend-web/</code>,
or develop against the Vite dev server with <code>npm run dev</code>.</p>
"""


def spa(request):
    """Return the SPA shell for every client-side route.

    Read straight off disk rather than rendered as a template: Vite's output is
    not Django template source and must not be parsed as any.
    """
    try:
        html = INDEX_HTML.read_bytes()
    except FileNotFoundError:
        return HttpResponse(MISSING, status=501)
    return HttpResponse(html, content_type='text/html; charset=utf-8')
