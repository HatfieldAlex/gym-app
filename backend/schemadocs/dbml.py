"""Render the Django model layer as DBML diagram source.

Every table, column, type, index and relationship emitted here is read off
``model._meta``, so docs/schema.dbml cannot drift from the models by being
hand-edited — it is regenerated instead. That happens automatically after
``manage.py migrate`` (see ``schemadocs.apps.SchemaDocsConfig``), and on
demand via ``manage.py export_dbml``.
"""
import datetime
import re

from django.apps import apps
from django.conf import settings

# Django's own PostgreSQL data_types map (django/db/backends/postgresql/base.py).
# Used instead of the live connection so the diagram renders portable SQL types
# rather than SQLite's untyped affinities.
PG_TYPES = {
    'AutoField': 'integer',
    'BigAutoField': 'bigint',
    'BigIntegerField': 'bigint',
    'BinaryField': 'bytea',
    'BooleanField': 'boolean',
    'CharField': 'varchar({max_length})',
    'DateField': 'date',
    'DateTimeField': 'timestamptz',
    'DecimalField': 'numeric({max_digits},{decimal_places})',
    'DurationField': 'interval',
    'EmailField': 'varchar({max_length})',
    'FileField': 'varchar({max_length})',
    'FilePathField': 'varchar({max_length})',
    'FloatField': 'double precision',
    'GenericIPAddressField': 'inet',
    'IPAddressField': 'inet',
    'IntegerField': 'integer',
    'JSONField': 'jsonb',
    'PositiveBigIntegerField': 'bigint',
    'PositiveIntegerField': 'integer',
    'PositiveSmallIntegerField': 'smallint',
    'SlugField': 'varchar({max_length})',
    'SmallAutoField': 'smallint',
    'SmallIntegerField': 'smallint',
    'TextField': 'text',
    'TimeField': 'time',
    'URLField': 'varchar({max_length})',
    'UUIDField': 'uuid',
}
# An FK column stores the target's value, not the target's sequence-ness.
AUTO_TO_CONCRETE = {
    'AutoField': 'IntegerField',
    'BigAutoField': 'BigIntegerField',
    'SmallAutoField': 'SmallIntegerField',
}

def project_apps():
    """App labels belonging to this project, i.e. everything Django did not ship.

    Derived rather than listed, so a newly added app is picked up on its own.
    """
    return {
        config.label
        for config in apps.get_app_configs()
        if not config.name.startswith('django.')
    }


def sql_type(field):
    """The column type for a concrete field, following FKs to their target."""
    target = field
    seen = 0
    while target.is_relation and target.target_field is not target and seen < 10:
        target = target.target_field
        seen += 1
    internal = target.get_internal_type()
    internal = AUTO_TO_CONCRETE.get(internal, internal)
    template = PG_TYPES.get(internal, internal.lower())
    return template.format(
        max_length=target.max_length,
        max_digits=getattr(target, 'max_digits', None),
        decimal_places=getattr(target, 'decimal_places', None),
    )


def esc(text):
    return str(text).replace('\\', '\\\\').replace("'", "\\'")


def column_default(field):
    """DBML `default:` expression, or None when the default is Python-side."""
    from django.db.models import NOT_PROVIDED

    default = field.get_default() if field.has_default() else NOT_PROVIDED
    if field.has_default() is False:
        return None
    if callable(field.default):
        return None  # e.g. uuid.uuid4 — described in the note instead
    if default is None:
        return '`null`'
    if isinstance(default, bool):
        return '`%s`' % str(default).lower()
    if isinstance(default, (int, float)):
        return '`%s`' % default
    if isinstance(default, (datetime.date, datetime.datetime)):
        return "'%s'" % esc(default.isoformat())
    return "'%s'" % esc(default)


def column_notes(field):
    notes = []
    if field.has_default() and callable(field.default):
        fn = field.default
        name = getattr(fn, '__qualname__', repr(fn))
        module = getattr(fn, '__module__', '')
        notes.append('default set in Python: %s%s()' % (module + '.' if module else '', name))
    if getattr(field, 'auto_now_add', False):
        notes.append('set to now() on insert (auto_now_add)')
    if getattr(field, 'auto_now', False):
        notes.append('set to now() on every save (auto_now)')
    if field.choices:
        notes.append('choices: ' + ', '.join(str(c[0]) for c in field.choices))
    if field.is_relation and (field.many_to_one or field.one_to_one):
        if getattr(field, 'remote_field', None) is not None:
            on_delete = getattr(field.remote_field, 'on_delete', None)
            if on_delete is not None:
                notes.append('on_delete=%s' % getattr(on_delete, '__name__', on_delete))
    if field.help_text:
        notes.append(esc(field.help_text))
    if getattr(field, 'db_comment', None):
        notes.append(esc(field.db_comment))
    return notes


# dbml relationship operators; Django's delete behaviour is a note, not a constraint.
def ref_suffix(field):
    if not field.is_relation or field.remote_field is None:
        return None
    remote = field.remote_field.model._meta
    target = field.target_field
    op = '-' if field.one_to_one else '>'
    return 'ref: %s %s.%s' % (op, remote.db_table, target.column)


def table_note(model):
    doc = (model.__doc__ or '').strip()
    # Django synthesises "Model(field, field, ...)" when there is no docstring.
    if re.match(r'^%s\(.*\)$' % re.escape(model.__name__), doc, re.S):
        return None
    doc = ' '.join(line.strip() for line in doc.splitlines() if line.strip())
    if not doc:
        return None
    if model._meta.app_label not in project_apps():
        # Django's built-in models carry multi-paragraph docstrings; one sentence
        # is enough to label the table on a diagram.
        first, sep, _ = doc.partition('. ')
        doc = first + ('.' if sep else '')
    return doc


def render_table(model):
    meta = model._meta
    lines = ['Table %s {' % meta.db_table]

    rows = []
    for field in meta.local_concrete_fields:
        attrs = []
        if field.primary_key:
            attrs.append('pk')  # implies not null
        elif field.null:
            attrs.append('null')
        else:
            attrs.append('not null')
        if field.unique and not field.primary_key:
            attrs.append('unique')
        default = column_default(field)
        if default:
            attrs.append('default: %s' % default)
        ref = ref_suffix(field)
        if ref:
            attrs.append(ref)
        notes = column_notes(field)
        if notes:
            attrs.append("note: '%s'" % '; '.join(notes))
        rows.append((field.column, sql_type(field), attrs))

    width_name = max(len(r[0]) for r in rows)
    width_type = max(len(r[1]) for r in rows)
    for name, type_, attrs in rows:
        line = '  %-*s %-*s' % (width_name, name, width_type, type_)
        lines.append((line + ' [%s]' % ', '.join(attrs)).rstrip())

    # Indexes: db_index columns, Meta.indexes, unique_together, UniqueConstraint.
    index_lines = []
    for field in meta.local_concrete_fields:
        # A pk or unique column is already backed by its own implicit index.
        if field.db_index and not field.primary_key and not field.unique:
            opts = ['note: \'implicit: Django indexes every ForeignKey column\''] if field.is_relation else []
            index_lines.append(_index_line([field.column], opts))
    for index in meta.indexes:
        cols = [meta.get_field(f.lstrip('-')).column for f in index.fields]
        opts = ["name: '%s'" % index.name] if index.name else []
        index_lines.append(_index_line(cols, opts))
    for unique_set in meta.unique_together:
        cols = [meta.get_field(f).column for f in unique_set]
        index_lines.append(_index_line(cols, ['unique']))
    for constraint in meta.constraints:
        fields = getattr(constraint, 'fields', None)
        if not fields:
            expr = getattr(constraint, 'check', None) or getattr(constraint, 'condition', None)
            if expr is not None:
                lines.append("  Note: 'CHECK constraint %s: %s'" % (constraint.name, esc(expr)))
            continue
        cols = [meta.get_field(f).column for f in fields]
        index_lines.append(_index_line(cols, ['unique', "name: '%s'" % constraint.name]))

    if index_lines:
        lines.append('')
        lines.append('  indexes {')
        lines.extend('    ' + line for line in index_lines)
        lines.append('  }')

    note = table_note(model)
    if note:
        lines.append('')
        lines.append("  Note: '%s'" % esc(note))

    lines.append('}')
    return '\n'.join(lines)


def _index_line(cols, opts):
    target = cols[0] if len(cols) == 1 else '(%s)' % ', '.join(cols)
    return target + (' [%s]' % ', '.join(opts) if opts else '')


def render():
    all_models = apps.get_models(include_auto_created=True)
    by_app = {}
    for model in all_models:
        by_app.setdefault(model._meta.app_label, []).append(model)

    ours = project_apps()
    # Project tables first — they are what the diagram is actually about.
    ordered_apps = sorted(a for a in by_app if a in ours)
    ordered_apps += sorted(a for a in by_app if a not in ours)

    out = []
    out.append('// Gym app database schema.')
    out.append('// GENERATED FROM THE DJANGO MODELS — do not hand-edit; regenerate instead.')
    out.append('// Source: the Django app registry (model._meta), via manage.py export_dbml.')
    out.append('// Render: paste into https://dbdiagram.io')
    out.append('')
    out.append('Project gym_app {')
    out.append("  database_type: 'PostgreSQL'")
    out.append("  Note: '''")
    out.append('Workout tracking. Every table, column, type, index and relationship below is')
    out.append('read directly off the Django models, so this file mirrors them exactly.')
    out.append('Column types are the SQL Django emits on PostgreSQL; the development database')
    out.append("is SQLite (settings.DATABASES['default'] = %s)," % settings.DATABASES['default']['ENGINE'])
    out.append('whose affinities are looser but structurally identical.')
    out.append('Django-level delete behaviour (on_delete=...) is recorded as a column note,')
    out.append('since DBML has no way to express it.')
    out.append("'''")
    out.append('}')
    out.append('')

    for app_label in ordered_apps:
        models = sorted(by_app[app_label], key=lambda m: m._meta.db_table)
        heading = 'app: %s' % app_label
        out.append('// ' + '=' * 74)
        out.append('// %s%s' % (heading, '  (project)' if app_label in ours else ''))
        out.append('// ' + '=' * 74)
        out.append('')
        for model in models:
            out.append(render_table(model))
            out.append('')

    out.append('// ' + '=' * 74)
    out.append('// Table groups')
    out.append('// ' + '=' * 74)
    out.append('')
    for app_label in ordered_apps:
        out.append('TableGroup %s {' % app_label)
        for model in sorted(by_app[app_label], key=lambda m: m._meta.db_table):
            out.append('  %s' % model._meta.db_table)
        out.append('}')
        out.append('')

    return '\n'.join(out).rstrip() + '\n'




def output_path():
    return settings.BASE_DIR / 'docs' / 'schema.dbml'


def write(path=None):
    """Write the rendered DBML. Returns (path, changed)."""
    path = path or output_path()
    document = render()
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_text(encoding='utf-8') == document:
        return path, False
    path.write_text(document, encoding='utf-8')
    return path, True
