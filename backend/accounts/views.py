"""JSON session authentication for the React SPA.

The API authenticates with the session cookie Django already issues, so the
frontend needs four things it used to get from server-rendered pages: a way to
open an account, a way to start a session, a way to end one, and a way to find
out on boot whether it still has one.
"""
from django.contrib.auth import login, logout
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import LoginSerializer, SessionSerializer, SignupSerializer


@method_decorator(ensure_csrf_cookie, name='dispatch')
class SessionView(APIView):
    """`GET /api/v1/auth/session/` — who, if anyone, is signed in.

    The SPA calls this before it renders anything, which makes it the natural
    place to plant the CSRF cookie every later unsafe request has to echo.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        return Response(SessionSerializer.for_user(request.user).data)


# Same reasoning as LoginView below: an anonymous POST that DRF will not check
# for itself, so it asks for the check by hand.
@method_decorator(csrf_protect, name='dispatch')
class SignupView(APIView):
    """`POST /api/v1/auth/signup/` — open an account, and sign into it.

    Signing the new account straight in saves making the caller post the same
    credentials again to the login route; every later visit goes through that
    route as usual.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = SignupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        # Rotates the session key and the CSRF token with it, exactly as
        # logging in does -- the SPA re-reads the cookie per request.
        login(request, user)
        return Response(
            SessionSerializer.for_user(request.user).data,
            status=status.HTTP_201_CREATED,
        )


# DRF exempts its views from the middleware's CSRF check and re-applies it in
# SessionAuthentication -- which only runs once a session exists. Logging in is
# the request that creates one, so it has to ask for the check itself.
@method_decorator(csrf_protect, name='dispatch')
class LoginView(APIView):
    """`POST /api/v1/auth/login/` — exchange credentials for a session cookie."""

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        # Rotates the session key, and with it the CSRF token: the SPA reads the
        # token from the cookie per request, so it picks the new one up by itself.
        login(request, serializer.validated_data['user'])
        return Response(SessionSerializer.for_user(request.user).data)


class LogoutView(APIView):
    """`POST /api/v1/auth/logout/` — end the session.

    POST rather than GET, as before, so a prefetch or a stray link cannot sign
    somebody out.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)
