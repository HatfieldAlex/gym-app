from django.contrib.auth import authenticate
from rest_framework import serializers


class LoginSerializer(serializers.Serializer):
    """Credentials as the SPA's login form sends them."""

    username = serializers.CharField(write_only=True)
    password = serializers.CharField(write_only=True, style={'input_type': 'password'})

    def validate(self, attrs):
        user = authenticate(
            request=self.context.get('request'),
            username=attrs['username'],
            password=attrs['password'],
        )
        # One message for both a wrong username and a wrong password, so the
        # response cannot be used to find out which accounts exist.
        if user is None:
            raise serializers.ValidationError(
                "Your username and password didn't match. Please try again.",
            )
        attrs['user'] = user
        return attrs


class SessionSerializer(serializers.Serializer):
    """Who the current session belongs to, if anyone."""

    authenticated = serializers.BooleanField()
    username = serializers.CharField(allow_null=True)

    @classmethod
    def for_user(cls, user):
        return cls({
            'authenticated': user.is_authenticated,
            'username': user.get_username() if user.is_authenticated else None,
        })
