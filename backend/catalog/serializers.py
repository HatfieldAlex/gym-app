from rest_framework import serializers

from .models import ExerciseDefinition


class ExerciseDefinitionSerializer(serializers.ModelSerializer):
    """The catalogue entry as the API exposes it."""

    # Declared rather than generated from the model, and that is the whole point of
    # the line: a generated field would pick up a UniqueValidator from name's
    # unique=True and answer an exact duplicate on its own, in its own wording and
    # with no pointer to the row that already exists. Every duplicate -- exact, case
    # variant or whitespace variant -- has to come out of the single path in
    # validate() below, which hands back the entry (N5). Do not "simplify" this
    # declaration away: that quietly reintroduces two different answers to one
    # question.
    name = serializers.CharField(max_length=120, trim_whitespace=True)

    class Meta:
        model = ExerciseDefinition
        # created_by is deliberately absent (N6): a client can neither read who added
        # an entry nor claim it -- the viewset stamps it from the request.
        fields = ['id', 'name', 'created_at']
        read_only_fields = ['id', 'created_at']

    def validate_name(self, value):
        # trim_whitespace only tidies the ends. Collapsing the middle too is what
        # makes "Bench  press" and "Bench press" the same movement (N4); the case is
        # left exactly as typed, so the catalogue reads the way its author meant it
        # to (N9).
        name = ' '.join(value.split())
        if not name:
            raise serializers.ValidationError('A name is required.')
        return name

    def validate(self, attrs):
        name = attrs.get('name')
        if name is not None:
            existing = ExerciseDefinition.objects.filter(name__iexact=name).first()
            if existing is not None:
                raise duplicate_entry_error(existing)
        return attrs


def duplicate_entry_error(existing):
    """The one answer to "that movement is already here" (N5).

    A rejected create, so an ordinary 400 -- a client checking only `response.ok`
    must not read it as a success -- but the body carries the entry itself so the
    caller can offer that row instead of making the user retype.

    `name` is first because `ApiError.detail` in the frontend's api.js reads the
    first message of the first key: a client that shows nothing but `.detail` still
    says something true rather than a UUID. The sentence quotes the *stored*
    spelling, not what was typed, because the difference in case is usually the
    reason the user could not find it in the first place.
    """
    return serializers.ValidationError({
        'name': [f'"{existing.name}" is already in the catalogue.'],
        # The same three fields a create returns: downstream screens offer this row
        # straight away, and need its name and not only its id.
        'existing': ExerciseDefinitionSerializer(existing).data,
    })
