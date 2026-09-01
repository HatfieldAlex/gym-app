from django.core.management.base import BaseCommand, CommandError

from schemadocs import dbml


class Command(BaseCommand):
    help = 'Regenerate docs/schema.dbml from the current Django models.'

    def add_arguments(self, parser):
        parser.add_argument(
            '-o', '--output',
            help='Write to this path instead of docs/schema.dbml. "-" writes to stdout.',
        )
        parser.add_argument(
            '--check',
            action='store_true',
            help='Do not write; exit 1 if the file is out of date. For CI.',
        )

    def handle(self, *args, **options):
        from pathlib import Path

        if options['output'] == '-':
            self.stdout.write(dbml.render(), ending='')
            return

        path = Path(options['output']) if options['output'] else dbml.output_path()

        if options['check']:
            current = path.read_text(encoding='utf-8') if path.exists() else None
            if current == dbml.render():
                self.stdout.write(self.style.SUCCESS('%s is up to date.' % path))
                return
            raise CommandError('%s is out of date — run `manage.py export_dbml`.' % path)

        path, changed = dbml.write(path)
        if changed:
            self.stdout.write(self.style.SUCCESS('Wrote %s' % path))
        else:
            self.stdout.write('%s already up to date.' % path)
