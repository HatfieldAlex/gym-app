# Applied on every release, before the new dynos start taking traffic. A
# failure here aborts the release and the previous version keeps serving.
release: cd backend && python manage.py migrate --noinput

# Two workers is what a Basic dyno's 512 MB comfortably holds. Logs go to
# stdout, which is where Heroku's log drain reads them from.
web: cd backend && gunicorn settings.wsgi --bind 0.0.0.0:$PORT --workers 2 --log-file -
