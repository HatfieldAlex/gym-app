from django.contrib.auth import authenticate
from django.contrib.auth.models import User
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


class SignupSerializer(serializers.ModelSerializer):
    """A new account, as the SPA's signup form sends it.

    A ModelSerializer rather than a plain one so the username rules stay the
    model's: the same character validator and the same uniqueness check the
    admin and `createsuperuser` already apply, rather than a second opinion
    here that could drift from them. The password is only checked for being
    there -- AUTH_PASSWORD_VALIDATORS is deliberately not run at this stage.
    """

    class Meta:
        model = User
        fields = ['username', 'password']
        extra_kwargs = {
            'password': {'write_only': True, 'style': {'input_type': 'password'}},
        }

    def create(self, validated_data):
        # create_user, not create: it is the one that stores the password
        # hashed rather than as it was typed.
        return User.objects.create_user(**validated_data)


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
