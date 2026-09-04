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

    # Declared rather than generated for the same reason `name` is: the rules belong to
    # the serializer, not to whatever the model's nullable columns happen to imply.
    # Optional on create (W7) -- the API is not stricter than the column, and the *form*
    # (chunk 06) is what makes sure a new entry is answered. Both or neither, checked in
    # validate() below, so a half-answer is a 400 here rather than a 500 out of
    # exercisedef_loading_both_or_neither.
    #
    # Neither is writable after create: the viewset offers no update method, so a PATCH
    # carrying either one is 405 and never reaches this serializer (AGREED 2). The one
    # way a null pair ever becomes a set pair is the `loading/` action.
    bar_kg = serializers.DecimalField(
        max_digits=6,
        decimal_places=2,
        min_value=0,
        required=False,
        allow_null=True,
    )
    # 1 for a stack or a sled, 2 for a barbell, and nothing else (W5, AGREED 1). A
    # ChoiceField rather than an IntegerField with bounds so that 3, 0 and "two" are all
    # refused in the field's own words.
    sides = serializers.ChoiceField(
        choices=[1, 2],
        required=False,
        allow_null=True,
    )

    class Meta:
        model = ExerciseDefinition
        # created_by is deliberately absent (N6): a client can neither read who added
        # an entry nor claim it -- the viewset stamps it from the request.
        fields = ['id', 'name', 'bar_kg', 'sides', 'created_at']
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

        # Both numbers or neither of them (W1). Neither one says anything on its own --
        # a bar with no side count cannot be added up, and a side count with no bar
        # cannot either -- so "unset" stays one state rather than three. The database
        # says the same thing in exercisedef_loading_both_or_neither; this is the
        # version that answers 400 and names the column the sender forgot, instead of
        # letting an IntegrityError become a 500 for a client that could have been
        # told. Keyed on the *missing* one, so ApiError.detail reads as an instruction
        # rather than a complaint about the number they did send.
        bar_kg = attrs.get('bar_kg')
        sides = attrs.get('sides')
        if bar_kg is None and sides is not None:
            raise serializers.ValidationError({'bar_kg': [LOADING_HALF_ANSWERED]})
        if sides is None and bar_kg is not None:
            raise serializers.ValidationError({'sides': [LOADING_HALF_ANSWERED]})
        return attrs


LOADING_HALF_ANSWERED = 'Say both the bar weight and the side count, or neither.'


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


class ExerciseLoadingSerializer(serializers.Serializer):
    """The body of `POST /exercises/<id>/loading/`: how a movement is loaded.

    Both numbers are required here, unlike on create. This endpoint exists to *answer*
    the question "how is this loaded?", so a body that answers half of it has not
    answered it, and gets a 400.

    `name` is deliberately not a field: this route sets the loading and nothing else,
    so a body that also carries a name renames nothing.
    """

    # The same bounds the catalogue entry states, restated because this is a different
    # body arriving at a different route -- and, being required, they cannot simply be
    # borrowed from the entry serializer's optional pair.
    bar_kg = serializers.DecimalField(max_digits=6, decimal_places=2, min_value=0)
    sides = serializers.ChoiceField(choices=[1, 2])
