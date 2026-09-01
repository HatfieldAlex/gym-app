import sys

from django.apps import AppConfig


class SchemaDocsConfig(AppConfig):
    """Keeps docs/schema.dbml in step with the models.

    The file is rewritten after ``manage.py migrate``, which is the moment the
    schema actually changes. Regeneration is best-effort: a documentation
    problem must never fail a migration, so errors are reported and swallowed.
    """

    name = 'schemadocs'
    verbose_name = 'schema docs'

    def ready(self):
        from django.db.models.signals import post_migrate

        # sender=self makes this fire once per migrate run rather than once per
        # installed app. The model registry is fully populated either way.
        post_migrate.connect(_export_dbml, sender=self, dispatch_uid='schemadocs.export_dbml')


def _export_dbml(**kwargs):
    from django.conf import settings

    if getattr(settings, 'SCHEMA_DBML_AUTO_EXPORT', True) is False:
        return
    # post_migrate also fires when the test runner builds its database, and when
    # `migrate` is called programmatically; only the real command should write.
    if 'migrate' not in sys.argv:
        return

    from schemadocs import dbml

    try:
        path, changed = dbml.write()
    except Exception as exc:  # noqa: BLE001 — docs must never break a migration
        sys.stderr.write('schemadocs: could not regenerate schema.dbml: %r\n' % (exc,))
        return
    if changed:
        sys.stdout.write('schemadocs: regenerated %s\n' % path)
