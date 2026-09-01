/**
 * Direction One — terminal
 *
 * Monospace, dense, aligned columns. Two colours: a near-black ground and a
 * warm grey ink, with dimmer values of the same ink standing in for hierarchy.
 * No borders, no cards. Alignment does the work that boxes usually do.
 * Logging a set is editing a row in a file.
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

const MONO = Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' });

const C = {
  bg: '#0F110F',
  ink: '#D2CFC3',
  dim: '#7C8078',
  faint: '#4A4E48',
  rule: '#23261F',
};

// ---------------------------------------------------------------- dummy data

const SESSION = {
  label: 'upper-a',
  date: '2025-09-02',
  weekday: 'tue',
  span: '18:05-19:12',
  minutes: 67,
  exercises: [
    {
      slug: 'barbell-bench-press',
      prescription: '4 x 6-8 @ rir 2   rest 180s',
      sets: [
        { type: 'warmup', kg: 40, reps: 10, rpe: null, term: 'target', rest: null, at: '18:07' },
        { type: 'work', kg: 80, reps: 8, rpe: 7, term: 'target', rest: 0, at: '18:09' },
        { type: 'work', kg: 80, reps: 8, rpe: 8, term: 'target', rest: 194, at: '18:13' },
        { type: 'work', kg: 80, reps: 7, rpe: 9, term: 'concentric', rest: 176, at: '18:17' },
        { type: 'work', kg: 80, reps: 6, rpe: 9.5, term: 'technical', rest: 210, at: '18:21' },
      ],
    },
    {
      slug: 'chest-supported-row',
      prescription: '3 x 10-12   rest not prescribed',
      sets: [
        { type: 'work', kg: 60, reps: 12, rpe: 7, term: 'target', rest: 0, at: '18:26' },
        { type: 'work', kg: 60, reps: 11, rpe: 8, term: 'target', rest: 141, at: '18:30' },
        { type: 'work', kg: 60, reps: 9, rpe: 9, term: 'concentric', rest: 133, at: '18:34' },
      ],
    },
    {
      slug: 'incline-dumbbell-press',
      prescription: null,
      sets: [
        { type: 'work', kg: 26, reps: 10, rpe: 8, term: 'target', rest: 0, at: '18:41' },
        { type: 'work', kg: 26, reps: 9, rpe: 9, term: 'concentric', rest: 128, at: '18:45' },
        { type: 'work', kg: 26, reps: 8, rpe: null, term: null, rest: 121, at: '18:49' },
      ],
    },
  ],
};

// bench press, eight sessions, oldest first
const HISTORY = [
  { date: '07-15', kg: 77.5, reps: [8, 8, 8, 7], rpe: 7.6, note: null },
  { date: '07-22', kg: 77.5, reps: [8, 8, 8, 8], rpe: 7.8, note: null },
  { date: '07-29', kg: 80, reps: [7, 7, 6, 6], rpe: 8.6, note: null },
  { date: '08-05', kg: 80, reps: [8, 7, 6, 6], rpe: 8.5, note: null },
  { date: '08-12', kg: 80, reps: [6, 5], rpe: 9.0, note: 'cut short: pain. sets 3-4 not recorded' },
  { date: '08-19', kg: 80, reps: [8, 8, 7, 6], rpe: 8.4, note: null },
  { date: '08-26', kg: 80, reps: [8, 8, 7, 5], rpe: 8.6, note: null },
  { date: '09-02', kg: 80, reps: [8, 8, 7, 6], rpe: 8.4, note: null },
];

const TERMS = ['target', 'concentric', 'technical', 'pain', 'time', '--'];

// ------------------------------------------------------------------ helpers

const n = (v, digits = 1) => (v === null || v === undefined ? '--' : v.toFixed(digits));
const i = (v) => (v === null || v === undefined ? '--' : String(v));
const term = (v) => (v === null || v === undefined ? '--' : v);
const rest = (v) => (v === null || v === undefined ? '--' : String(v));
const e1rm = (kg, reps) => kg * (1 + reps / 30);
const volume = (kg, reps) => kg * reps.reduce((a, b) => a + b, 0);

// -------------------------------------------------------------------- parts

function Row({ children, style }) {
  return <View style={[S.row, style]}>{children}</View>;
}

function Cell({ text, w, align = 'right', tone = 'ink' }) {
  return (
    <Text
      style={[S.mono, { width: w, textAlign: align, color: C[tone] }]}
      numberOfLines={1}
    >
      {text}
    </Text>
  );
}

const W = { idx: 18, type: 52, kg: 46, reps: 32, rpe: 34, term: 78, rest: 38 };

function HeaderRow() {
  return (
    <Row style={S.headRow}>
      <Cell text="#" w={W.idx} tone="faint" />
      <Cell text="type" w={W.type} align="left" tone="faint" />
      <Cell text="kg" w={W.kg} tone="faint" />
      <Cell text="rep" w={W.reps} tone="faint" />
      <Cell text="rpe" w={W.rpe} tone="faint" />
      <Cell text="term" w={W.term} align="left" tone="faint" />
      <Cell text="rest" w={W.rest} tone="faint" />
    </Row>
  );
}

function SetRow({ set, index, pending }) {
  const tone = set.type === 'warmup' ? 'dim' : 'ink';
  return (
    <Row>
      <Cell text={pending ? '>' : String(index)} w={W.idx} tone={pending ? 'ink' : 'faint'} />
      <Cell text={set.type} w={W.type} align="left" tone="dim" />
      <Cell text={n(set.kg)} w={W.kg} tone={tone} />
      <Cell text={i(set.reps)} w={W.reps} tone={tone} />
      <Cell text={set.rpe === null ? '--' : n(set.rpe)} w={W.rpe} tone={set.rpe === null ? 'faint' : tone} />
      <Cell text={term(set.term)} w={W.term} align="left" tone={set.term === null ? 'faint' : 'dim'} />
      <Cell text={rest(set.rest)} w={W.rest} tone="dim" />
    </Row>
  );
}

function Tabs({ value, onChange }) {
  const items = ['log', 'review', 'history'];
  return (
    <Row style={S.tabs}>
      {items.map((it) => (
        <Pressable key={it} onPress={() => onChange(it)} hitSlop={8}>
          <Text style={[S.mono, S.tab, value === it && S.tabOn]}>
            {value === it ? `[${it}]` : ` ${it} `}
          </Text>
        </Pressable>
      ))}
    </Row>
  );
}

// ------------------------------------------------------------------ screen 1

function LogScreen() {
  const bench = SESSION.exercises[0];
  const done = bench.sets.slice(0, 4);
  const [kg, setKg] = useState('80');
  const [reps, setReps] = useState('');
  const [rpe, setRpe] = useState('');
  const [pickedTerm, setPickedTerm] = useState(null);
  const [logged, setLogged] = useState([]);

  const commit = () => {
    setLogged([
      ...logged,
      {
        type: 'work',
        kg: parseFloat(kg) || null,
        reps: parseInt(reps, 10) || null,
        rpe: rpe === '' ? null : parseFloat(rpe),
        term: pickedTerm === '--' ? null : pickedTerm,
        rest: 161,
      },
    ]);
    setReps('');
    setRpe('');
    setPickedTerm(null);
  };

  const all = [...done, ...logged];

  return (
    <ScrollView style={S.pane} contentContainerStyle={S.paneBody}>
      <Text style={[S.mono, S.h1]}>{bench.slug}</Text>
      <Text style={[S.mono, S.meta]}>block 1/3   set {all.length + 1} pending</Text>
      <Text style={[S.mono, S.meta]}>rx  {bench.prescription}</Text>

      <View style={S.gap} />
      <HeaderRow />
      {all.map((s, ix) => (
        <SetRow key={ix} set={s} index={ix + 1} />
      ))}

      <Row style={S.entryRow}>
        <Cell text=">" w={W.idx} />
        <Cell text="work" w={W.type} align="left" tone="dim" />
        <TextInput
          style={[S.mono, S.input, { width: W.kg }]}
          value={kg}
          onChangeText={setKg}
          keyboardType="decimal-pad"
          selectionColor={C.ink}
          placeholder="--"
          placeholderTextColor={C.faint}
        />
        <TextInput
          style={[S.mono, S.input, { width: W.reps }]}
          value={reps}
          onChangeText={setReps}
          keyboardType="number-pad"
          selectionColor={C.ink}
          placeholder="--"
          placeholderTextColor={C.faint}
        />
        <TextInput
          style={[S.mono, S.input, { width: W.rpe }]}
          value={rpe}
          onChangeText={setRpe}
          keyboardType="decimal-pad"
          selectionColor={C.ink}
          placeholder="--"
          placeholderTextColor={C.faint}
        />
        <Cell
          text={pickedTerm === null ? '--' : pickedTerm}
          w={W.term}
          align="left"
          tone={pickedTerm === null ? 'faint' : 'ink'}
        />
        <Cell text="161" w={W.rest} tone="dim" />
      </Row>

      <View style={S.gap} />
      <Text style={[S.mono, S.label]}>termination</Text>
      <View style={S.termWrap}>
        {TERMS.map((t) => (
          <Pressable key={t} onPress={() => setPickedTerm(t)} hitSlop={6}>
            <Text style={[S.mono, S.termOpt, pickedTerm === t && S.termOptOn]}>
              {pickedTerm === t ? `[${t}]` : ` ${t} `}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={S.gap} />
      <View style={S.actions}>
        <Pressable onPress={commit} style={S.action}>
          <Text style={[S.mono, S.actionText]}>[ write set ]</Text>
        </Pressable>
        <Pressable onPress={() => { setReps(''); setRpe(''); setPickedTerm(null); }} style={S.action}>
          <Text style={[S.mono, S.actionTextDim]}>[ clear ]</Text>
        </Pressable>
      </View>

      <View style={S.gap} />
      <Text style={[S.mono, S.footnote]}>
        rest since last set 2:41 as of last touch{'\n'}
        next block  chest-supported-row  3 x 10-12
      </Text>
    </ScrollView>
  );
}

// ------------------------------------------------------------------ screen 2

function ReviewScreen() {
  return (
    <ScrollView style={S.pane} contentContainerStyle={S.paneBody}>
      <Text style={[S.mono, S.h1]}>
        {SESSION.label}  {SESSION.date} {SESSION.weekday}
      </Text>
      <Text style={[S.mono, S.meta]}>
        {SESSION.span}  {SESSION.minutes}m   3 blocks  11 sets
      </Text>

      {SESSION.exercises.map((ex, exIx) => (
        <View key={ex.slug} style={S.block}>
          <Text style={[S.mono, S.h2]}>
            {exIx + 1}. {ex.slug}
          </Text>
          <Text style={[S.mono, S.meta]}>
            rx  {ex.prescription === null ? 'none. improvised' : ex.prescription}
          </Text>
          <View style={S.gapSmall} />
          <HeaderRow />
          {ex.sets.map((s, ix) => (
            <SetRow key={ix} set={s} index={ix + 1} />
          ))}
        </View>
      ))}

      <View style={S.gap} />
      <Text style={[S.mono, S.label]}>unrecorded</Text>
      <Text style={[S.mono, S.footnote]}>
        set 1.1  rpe not recorded{'\n'}
        set 1.1  rest not recorded{'\n'}
        set 3.3  rpe not recorded{'\n'}
        set 3.3  termination not recorded
      </Text>
    </ScrollView>
  );
}

// ------------------------------------------------------------------ screen 3

function HistoryScreen() {
  const peak = Math.max(...HISTORY.map((h) => e1rm(h.kg, Math.max(...h.reps))));
  const floor = Math.min(...HISTORY.map((h) => e1rm(h.kg, Math.max(...h.reps))));

  return (
    <ScrollView style={S.pane} contentContainerStyle={S.paneBody}>
      <Text style={[S.mono, S.h1]}>barbell-bench-press</Text>
      <Text style={[S.mono, S.meta]}>last 8 sessions   2025-07-15..09-02</Text>

      <View style={S.gap} />
      <Row style={S.headRow}>
        <Cell text="date" w={46} align="left" tone="faint" />
        <Cell text="kg" w={46} tone="faint" />
        <Cell text="reps" w={72} align="left" tone="faint" />
        <Cell text="vol" w={58} tone="faint" />
        <Cell text="e1rm" w={48} tone="faint" />
        <Cell text="rpe" w={38} tone="faint" />
      </Row>
      {HISTORY.map((h) => (
        <View key={h.date}>
          <Row>
            <Cell text={h.date} w={46} align="left" tone="dim" />
            <Cell text={n(h.kg)} w={46} />
            <Cell
              text={[...h.reps, ...Array(4 - h.reps.length).fill('--')].join('/')}
              w={72}
              align="left"
            />
            <Cell text={String(volume(h.kg, h.reps))} w={58} tone="dim" />
            <Cell text={n(e1rm(h.kg, Math.max(...h.reps)))} w={48} />
            <Cell text={n(h.rpe)} w={38} tone="dim" />
          </Row>
          {h.note ? <Text style={[S.mono, S.note]}>   {h.note}</Text> : null}
        </View>
      ))}

      <View style={S.gap} />
      <Text style={[S.mono, S.label]}>e1rm, kg</Text>
      {HISTORY.map((h) => {
        const v = e1rm(h.kg, Math.max(...h.reps));
        const width = Math.round(((v - floor + 1) / (peak - floor + 1)) * 30);
        return (
          <Row key={h.date}>
            <Cell text={h.date} w={46} align="left" tone="dim" />
            <Cell text={n(v)} w={48} />
            <Text style={[S.mono, S.bar]} numberOfLines={1}>
              {' '}
              {'='.repeat(Math.max(width, 1))}
            </Text>
          </Row>
        );
      })}

      <View style={S.gap} />
      <Text style={[S.mono, S.footnote]}>
        80.0 kg held for 6 sessions. best set 8 reps, first{'\n'}
        reached 08-05, matched 3 times, not exceeded.{'\n'}
        08-12 incomplete. do not read the drop as a decline.
      </Text>
    </ScrollView>
  );
}

// --------------------------------------------------------------------- root

export default function DirectionOne() {
  const [screen, setScreen] = useState('log');
  return (
    <View style={S.root}>
      <View style={S.top}>
        <Text style={[S.mono, S.title]}>
          trainlog  {SESSION.label}  {SESSION.date}
        </Text>
        <Tabs value={screen} onChange={setScreen} />
      </View>
      {screen === 'log' && <LogScreen />}
      {screen === 'review' && <ReviewScreen />}
      {screen === 'history' && <HistoryScreen />}
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  mono: { fontFamily: MONO, fontSize: 12, color: C.ink },
  top: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.rule },
  title: { color: C.dim, fontSize: 11, letterSpacing: 0.4 },
  tabs: { marginTop: 8, gap: 4 },
  tab: { color: C.faint, fontSize: 13, paddingVertical: 4 },
  tabOn: { color: C.ink },

  pane: { flex: 1 },
  paneBody: { padding: 12, paddingBottom: 56 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 },
  headRow: { borderBottomWidth: 1, borderBottomColor: C.rule, paddingBottom: 4, marginBottom: 2 },
  entryRow: { borderTopWidth: 1, borderTopColor: C.rule, marginTop: 4, paddingTop: 6 },

  h1: { fontSize: 15, color: C.ink },
  h2: { fontSize: 13, color: C.ink, marginBottom: 2 },
  meta: { fontSize: 11, color: C.dim, marginTop: 2 },
  label: { fontSize: 11, color: C.faint, marginBottom: 4 },
  note: { fontSize: 11, color: C.faint, paddingBottom: 2 },
  footnote: { fontSize: 11, color: C.dim, lineHeight: 17 },
  block: { marginTop: 20 },
  gap: { height: 18 },
  gapSmall: { height: 8 },

  input: {
    color: C.ink,
    fontSize: 12,
    textAlign: 'right',
    paddingVertical: 2,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: C.faint,
  },
  termWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  termOpt: { color: C.faint, fontSize: 13, paddingVertical: 7 },
  termOptOn: { color: C.ink },

  actions: { flexDirection: 'row', gap: 14 },
  action: { paddingVertical: 8 },
  actionText: { color: C.ink, fontSize: 14 },
  actionTextDim: { color: C.faint, fontSize: 14 },
  bar: { color: C.faint, fontSize: 12, flexShrink: 1 },
});
