"""The export from a terminal, so a backup needs no browser in the loop.

`manage.py export_data -o backup.zip` locally, and
`heroku run --no-tty 'python manage.py export_data -o -' > backup.zip` against
production, which is the reason `-` exists. Plumbing only: every row and every
CSV comes from `dataexport.export`, which the endpoint calls the same way.
"""
import sys
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from dataexport import export


def human_size(count):
    """A byte count as a file manager would show it, e.g. `412.3 kB`."""
    if count < 1000:
        return '%d bytes' % count
    size = count / 1000
    for unit in ('kB', 'MB'):
        if size < 1000:
            return '%.1f %s' % (size, unit)
        size /= 1000
    return '%.1f GB' % size


class Command(BaseCommand):
    help = 'Write every row a user can see to a zip of CSVs.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--user',
            metavar='USERNAME',
            help=(
                'Export as this user, with their scope: their own rows, or every '
                'row if the account is a superuser. Omitted, everything is exported.'
            ),
        )
        parser.add_argument(
            '-o', '--output',
            metavar='PATH',
            help=(
                'Write the zip to this path. "-" writes it to stdout. Omitted, a '
                'stamped file is written into the current directory.'
            ),
        )

    def handle(self, *args, **options):
        username = options['user']
        user = None
        if username:
            try:
                user = get_user_model().objects.get(username=username)
            except get_user_model().DoesNotExist:
                raise CommandError('No user named %r.' % username)

        filename, content = export.build_archive(user)
        size = human_size(len(content))

        if options['output'] == '-':
            # self.stdout is an OutputWrapper around a text stream and will not
            # take zip bytes. And with the zip going down stdout, every message
            # goes to stderr instead, or the archive arrives with a sentence
            # glued to the front of it.
            sys.stdout.buffer.write(content)
            sys.stdout.buffer.flush()
            self.stderr.write(
                'Wrote %s to stdout (%s)' % (filename, size), style_func=self.style.SUCCESS,
            )
            return

        path = Path(options['output']) if options['output'] else Path.cwd() / filename
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        self.stdout.write(self.style.SUCCESS('Wrote %s (%s)' % (path, size)))
