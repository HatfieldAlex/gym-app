/**
 * Direction Two — notebook
 *
 * A bound lab journal. Serif type, wide margins, hairline rules, paper ground.
 * Low density on purpose: one thing at a time, plenty of air around it.
 * There is almost no interface — the writing is the interface. Sets are
 * sentences, prescriptions are marginalia, unrecorded values say so in words.
 */

import { useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const SERIF = Platform.select({ android: 'serif', ios: 'Georgia', default: 'serif' });

const C = {
  paper: '#F5F2EA',
  ink: '#211E19',
  soft: '#5A554B',
  margin: '#8C8578',
  rule: '#DCD5C6',
  ruleFaint: '#E7E1D4',
};

// ---------------------------------------------------------------- dummy data

const ENTRY = {
  weekday: 'Tuesday',
  date: '2 September 2025',
  title: 'Upper A',
  from: '18.05',
  to: '19.12',
  exercises: [
    {
      name: 'Barbell bench press',
      prescription: 'Four sets of six to eight, two reps in reserve. Three minutes between sets.',
      sets: [
        { type: 'warmup', kg: 40, reps: 10, rpe: null, term: 'target reached', rest: null },
        { type: 'working', kg: 80, reps: 8, rpe: 7, term: 'target reached', rest: 0 },
        { type: 'working', kg: 80, reps: 8, rpe: 8, term: 'target reached', rest: 194 },
        { type: 'working', kg: 80, reps: 7, rpe: 9, term: 'concentric failure', rest: 176 },
        { type: 'working', kg: 80, reps: 6, rpe: 9.5, term: 'technical failure', rest: 210 },
      ],
    },
    {
      name: 'Chest-supported row',
      prescription: 'Three sets of ten to twelve.',
      sets: [
        { type: 'working', kg: 60, reps: 12, rpe: 7, term: 'target reached', rest: 0 },
        { type: 'working', kg: 60, reps: 11, rpe: 8, term: 'target reached', rest: 141 },
        { type: 'working', kg: 60, reps: 9, rpe: 9, term: 'concentric failure', rest: 133 },
      ],
    },
    {
      name: 'Incline dumbbell press',
      prescription: null,
      sets: [
        { type: 'working', kg: 26, reps: 10, rpe: 8, term: 'target reached', rest: 0 },
        { type: 'working', kg: 26, reps: 9, rpe: 9, term: 'concentric failure', rest: 128 },
        { type: 'working', kg: 26, reps: 8, rpe: null, term: null, rest: 121 },
      ],
    },
  ],
};

const HISTORY = [
  { date: '15 July', kg: 77.5, best: '8 reps', rpe: '7 to 9', note: null },
  { date: '22 July', kg: 77.5, best: '8 reps', rpe: '7 to 8.5', note: null },
  { date: '29 July', kg: 80, best: '7 reps', rpe: '8 to 9.5', note: 'First session at eighty.' },
  { date: '5 August', kg: 80, best: '8 reps', rpe: '7.5 to 9.5', note: null },
  { date: '12 August', kg: 80, best: '6 reps', rpe: '9', note: 'Stopped after two sets. Shoulder pain. The remaining sets were not recorded.' },
  { date: '19 August', kg: 80, best: '8 reps', rpe: '7 to 9.5', note: null },
  { date: '26 August', kg: 80, best: '8 reps', rpe: '7.5 to 9.5', note: null },
  { date: '2 September', kg: 80, best: '8 reps', rpe: '7 to 9.5', note: 'Today.' },
];

const TERMS = [
  'target reached',
  'concentric failure',
  'technical failure',
  'pain',
  'time pressure',
  'leave unrecorded',
];

// ------------------------------------------------------------------ helpers

const sec = (s) => (s === null ? 'rest not recorded' : s === 0 ? 'no rest' : `${Math.floor(s / 60)} min ${s % 60} sec rest`);

// -------------------------------------------------------------------- parts

function Rule({ faint }) {
  return <View style={[S.rule, faint && S.ruleFaint]} />;
}

function SetLine({ set }) {
  return (
    <View style={S.setLine}>
      <Text style={S.setPrimary}>
        {set.kg} kg <Text style={S.times}>×</Text> {set.reps}
        {set.type === 'warmup' ? <Text style={S.warmup}>  warmup</Text> : null}
      </Text>
      <Text style={S.setSecondary}>
        {set.rpe === null ? <Text style={S.unrecorded}>RPE not recorded</Text> : `RPE ${set.rpe}`}
        {'   ·   '}
        {set.term === null ? (
          <Text style={S.unrecorded}>reason not recorded</Text>
        ) : (
          set.term
        )}
      </Text>
      <Text style={S.setTertiary}>{sec(set.rest)}</Text>
    </View>
  );
}

// ------------------------------------------------------------------ screen 1

function LoggingSection() {
  const bench = ENTRY.exercises[0];
  const done = bench.sets.slice(0, 4);
  const [reps, setReps] = useState('');
  const [rpe, setRpe] = useState('');
  const [kg, setKg] = useState('80');
  const [term, setTerm] = useState(null);
  const [written, setWritten] = useState([]);

  const write = () => {
    setWritten([
      ...written,
      {
        type: 'working',
        kg: parseFloat(kg) || null,
        reps: parseInt(reps, 10) || null,
        rpe: rpe === '' ? null : parseFloat(rpe),
        term: term === 'leave unrecorded' || term === null ? null : term,
        rest: 161,
      },
    ]);
    setReps('');
    setRpe('');
    setTerm(null);
  };

  return (
    <View style={S.section}>
      <Text style={S.sectionMark}>i. In the room</Text>

      <Text style={S.exerciseName}>{bench.name}</Text>
      <Text style={S.marginalia}>{bench.prescription}</Text>

      <View style={S.spacer} />
      {[...done, ...written].map((s, ix) => (
        <SetLine key={ix} set={s} />
      ))}

      <Rule />

      <Text style={S.writingLabel}>The set just finished</Text>
      <View style={S.writingRow}>
        <TextInput
          style={[S.field, S.fieldWide]}
          value={kg}
          onChangeText={setKg}
          keyboardType="decimal-pad"
          selectionColor={C.ink}
        />
        <Text style={S.fieldUnit}>kg</Text>
        <Text style={S.times}>×</Text>
        <TextInput
          style={S.field}
          value={reps}
          onChangeText={setReps}
          keyboardType="number-pad"
          placeholder="  "
          selectionColor={C.ink}
        />
        <Text style={S.fieldUnit}>reps</Text>
      </View>

      <View style={S.writingRow}>
        <Text style={S.fieldLead}>at RPE</Text>
        <TextInput
          style={S.field}
          value={rpe}
          onChangeText={setRpe}
          keyboardType="decimal-pad"
          placeholder="  "
          selectionColor={C.ink}
        />
        <Text style={S.fieldUnit}>
          {rpe === '' ? '— leave blank if you did not judge it' : ''}
        </Text>
      </View>

      <Text style={S.writingLabel}>It ended because</Text>
      <View style={S.termList}>
        {TERMS.map((t) => (
          <Pressable key={t} onPress={() => setTerm(t)} style={S.termRow} hitSlop={4}>
            <Text style={[S.termMark, term === t && S.termMarkOn]}>{term === t ? '—' : ' '}</Text>
            <Text style={[S.termText, term === t && S.termTextOn]}>{t}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable onPress={write} style={S.writeButton}>
        <Text style={S.writeButtonText}>Write it down</Text>
      </Pressable>

      <Text style={S.afterword}>
        Next: {ENTRY.exercises[1].name.toLowerCase()}, three sets of ten to twelve.
      </Text>
    </View>
  );
}

// ------------------------------------------------------------------ screen 2

function ReviewSection() {
  return (
    <View style={S.section}>
      <Text style={S.sectionMark}>ii. The entry</Text>

      <Text style={S.entryDate}>
        {ENTRY.weekday}, {ENTRY.date}
      </Text>
      <Text style={S.entryTitle}>{ENTRY.title}</Text>
      <Text style={S.marginalia}>
        {ENTRY.from} to {ENTRY.to}. Three movements, eleven sets, one of them a warmup.
      </Text>

      {ENTRY.exercises.map((ex, ix) => (
        <View key={ex.name} style={S.entryBlock}>
          <Rule faint />
          <Text style={S.exerciseName}>
            {ix + 1}. {ex.name}
          </Text>
          <Text style={S.marginalia}>
            {ex.prescription === null
              ? 'Improvised. Nothing was prescribed, so nothing was missed.'
              : ex.prescription}
          </Text>
          <View style={S.spacer} />
          {ex.sets.map((s, six) => (
            <SetLine key={six} set={s} />
          ))}
        </View>
      ))}

      <Rule faint />
      <Text style={S.closing}>
        Two of the four bench sets ended in failure rather than at the target, which the
        prescription did not ask for. The last incline set has no RPE and no reason
        against it; it was not written down at the time and has not been filled in since.
      </Text>
    </View>
  );
}

// ------------------------------------------------------------------ screen 3

function HistorySection() {
  return (
    <View style={S.section}>
      <Text style={S.sectionMark}>iii. Barbell bench press, eight sessions</Text>

      <Text style={S.closing}>
        Between 15 July and today the load moved once, from 77.5 kg to 80 kg, and has not
        moved since. The best set at 80 kg is eight reps. It was first reached on 5 August
        and has been matched three times without being passed.
      </Text>

      <View style={S.spacer} />
      {HISTORY.map((h) => (
        <View key={h.date} style={S.historyRow}>
          <Rule faint />
          <View style={S.historyHead}>
            <Text style={S.historyDate}>{h.date}</Text>
            <Text style={S.historyLoad}>{h.kg} kg</Text>
          </View>
          <Text style={S.historyBody}>
            Best set {h.best}. RPE {h.rpe}.
          </Text>
          {h.note ? <Text style={S.historyNote}>{h.note}</Text> : null}
        </View>
      ))}

      <Rule faint />
      <Text style={S.closing}>
        The gap between 12 August and 19 August is a session, not an absence of training;
        it was cut short and the missing sets stay missing.
      </Text>
    </View>
  );
}

// --------------------------------------------------------------------- root

export default function DirectionTwo() {
  return (
    <ScrollView style={S.root} contentContainerStyle={S.rootBody}>
      <LoggingSection />
      <View style={S.sectionBreak} />
      <ReviewSection />
      <View style={S.sectionBreak} />
      <HistorySection />
      <View style={{ height: 64 }} />
    </ScrollView>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper },
  rootBody: { paddingHorizontal: 30, paddingTop: 34 },
  section: {},
  sectionBreak: { height: 56 },
  sectionMark: {
    fontFamily: SERIF,
    fontSize: 12,
    color: C.margin,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: 26,
  },

  entryDate: { fontFamily: SERIF, fontSize: 25, color: C.ink, lineHeight: 32 },
  entryTitle: { fontFamily: SERIF, fontSize: 17, color: C.soft, marginTop: 2 },
  entryBlock: { marginTop: 34 },

  exerciseName: { fontFamily: SERIF, fontSize: 20, color: C.ink, lineHeight: 27 },
  marginalia: {
    fontFamily: SERIF,
    fontSize: 14,
    fontStyle: 'italic',
    color: C.margin,
    lineHeight: 21,
    marginTop: 6,
  },

  setLine: { marginBottom: 20 },
  setPrimary: { fontFamily: SERIF, fontSize: 21, color: C.ink },
  setSecondary: { fontFamily: SERIF, fontSize: 14, color: C.soft, marginTop: 3 },
  setTertiary: { fontFamily: SERIF, fontSize: 13, color: C.margin, marginTop: 2 },
  times: { color: C.margin },
  warmup: { fontFamily: SERIF, fontSize: 13, color: C.margin, fontStyle: 'italic' },
  unrecorded: { fontStyle: 'italic', color: C.margin },

  rule: { height: 1, backgroundColor: C.rule, marginVertical: 22 },
  ruleFaint: { backgroundColor: C.ruleFaint },
  spacer: { height: 20 },

  writingLabel: {
    fontFamily: SERIF,
    fontSize: 12,
    color: C.margin,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 18,
    marginBottom: 10,
  },
  writingRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 8 },
  field: {
    fontFamily: SERIF,
    fontSize: 24,
    color: C.ink,
    minWidth: 44,
    paddingVertical: 4,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
    textAlign: 'center',
  },
  fieldWide: { minWidth: 62 },
  fieldUnit: { fontFamily: SERIF, fontSize: 14, color: C.margin, marginLeft: 6, marginBottom: 8 },
  fieldLead: { fontFamily: SERIF, fontSize: 16, color: C.soft, marginRight: 8, marginBottom: 8 },

  termList: { marginTop: 2 },
  termRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  termMark: { fontFamily: SERIF, fontSize: 16, color: C.margin, width: 18 },
  termMarkOn: { color: C.ink },
  termText: { fontFamily: SERIF, fontSize: 17, color: C.soft },
  termTextOn: { color: C.ink },

  writeButton: {
    marginTop: 26,
    alignSelf: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: C.ink,
    paddingBottom: 3,
  },
  writeButtonText: { fontFamily: SERIF, fontSize: 19, color: C.ink },
  afterword: { fontFamily: SERIF, fontSize: 14, fontStyle: 'italic', color: C.margin, marginTop: 30 },

  closing: { fontFamily: SERIF, fontSize: 16, color: C.soft, lineHeight: 26, marginTop: 12 },

  historyRow: { marginBottom: 4 },
  historyHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  historyDate: { fontFamily: SERIF, fontSize: 18, color: C.ink },
  historyLoad: { fontFamily: SERIF, fontSize: 16, color: C.soft },
  historyBody: { fontFamily: SERIF, fontSize: 14, color: C.soft, marginTop: 4 },
  historyNote: { fontFamily: SERIF, fontSize: 14, fontStyle: 'italic', color: C.margin, marginTop: 4, lineHeight: 21 },
});
