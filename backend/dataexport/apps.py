from django.apps import AppConfig


class DataExportConfig(AppConfig):
    """The whole database out as a zip of CSVs. Holds no models.

    It is an app rather than a loose module because Django only discovers
    management commands inside installed apps, and ``manage.py export_data``
    lives here.
    """

    name = 'dataexport'
    verbose_name = 'data export'
