"""This app defines no models.

The module exists because Django only emits ``post_migrate`` for app configs
that have a models module (``django.core.management.sql.emit_post_migrate_signal``
skips the rest), and that signal is how docs/schema.dbml gets regenerated.
"""
