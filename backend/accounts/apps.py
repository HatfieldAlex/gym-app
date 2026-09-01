from django.apps import AppConfig


class AccountsConfig(AppConfig):
    """Session authentication for the SPA.

    No models of its own: it wraps ``django.contrib.auth`` in JSON so the React
    frontend can log in, log out and ask who it is talking to.
    """

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'accounts'
