/**
 * Direction Five — diff
 *
 * Every set is shown against the last time the same set was done. The delta is
 * the content; the absolute numbers are supporting detail. A session is a
 * changeset against the previous session of the same kind: blocks are changed,
 * added or removed. Logging works the same way — you say how this set differs
 * from its baseline, and the absolute value follows.
 *
 * Diff grammar without red and green: a gutter marker, before-and-after rows in
 * fixed columns, weight and direction arrows carrying the change.
 */

import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const MONO = Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' });

const C = {
  bg: '#FBFAF8',
  ink: '#1B1B18',
  mid: '#57564F',
  faint: '#93918A',
  rule: '#E3E0D8',
  band: '#F2F0EA',
  markInk: '#1B1B18',
  accent: '#3F5B70',
};

// ---------------------------------------------------------------- dummy data
// Today, and the previous session of the same kind, aligned set by set.

const HEAD = { date: '2 Sept', stamp: 'Tue 2 Sept 18:05', label: 'Upper A' };
const BASE = { date: '26 Aug', stamp: 'Tue 26 Aug 18:12', label: 'Upper A' };

const BLOCKS = [
  {
    status: 'changed',
    name: 'Barbell bench press',
    rx: '4 × 6–8 @ RIR 2 · 180 s',
    rxChanged: false,
    sets: [
      {
        n: 1, type: 'warmup',
        base: { kg: 40, reps: 10, rpe: null, rest: null, why: 'target reached' },
        head: { kg: 40, reps: 10, rpe: null, rest: null, why: 'target reached' },
      },
      {
        n: 2, type: 'working',
        base: { kg: 80, reps: 8, rpe: 7.5, rest: 0, why: 'target reached' },
        head: { kg: 80, reps: 8, rpe: 7.0, rest: 0, why: 'target reached' },
      },
      {
        n: 3, type: 'working',
        base: { kg: 80, reps: 8, rpe: 8.5, rest: 205, why: 'target reached' },
        head: { kg: 80, reps: 8, rpe: 8.0, rest: 194, why: 'target reached' },
      },
      {
        n: 4, type: 'working',
        base: { kg: 80, reps: 7, rpe: 9.0, rest: 188, why: 'concentric failure' },
        head: { kg: 80, reps: 7, rpe: 9.0, rest: 176, why: 'concentric failure' },
      },
      {
        n: 5, type: 'working',
        base: { kg: 80, reps: 5, rpe: 9.5, rest: 203, why: 'concentric failure' },
        head: { kg: 80, reps: 6, rpe: 9.5, rest: 210, why: 'technical failure' },
      },
    ],
  },
  {
    status: 'changed',
    name: 'Chest-supported row',
    rx: '3 × 10–12',
    rxChanged: false,
    sets: [
      {
        n: 1, type: 'working',
        base: { kg: 60, reps: 12, rpe: 7.0, rest: 0, why: 'target reached' },
        head: { kg: 60, reps: 12, rpe: 7.0, rest: 0, why: 'target reached' },
      },
      {
        n: 2, type: 'working',
        base: { kg: 60, reps: 10, rpe: 8.5, rest: 152, why: 'concentric failure' },
        head: { kg: 60, reps: 11, rpe: 8.0, rest: 141, why: 'target reached' },
      },
      {
        n: 3, type: 'working',
        base: { kg: 60, reps: 9, rpe: 9.5, rest: 149, why: 'concentric failure' },
        head: { kg: 60, reps: 9, rpe: 9.0, rest: 133, why: 'concentric failure' },
      },
    ],
  },
  {
    status: 'added',
    name: 'Incline dumbbell press',
    rx: null,
    sets: [
      { n: 1, type: 'working', base: null, head: { kg: 26, reps: 10, rpe: 8.0, rest: 0, why: 'target reached' } },
      { n: 2, type: 'working', base: null, head: { kg: 26, reps: 9, rpe: 9.0, rest: 128, why: 'concentric failure' } },
      { n: 3, type: 'working', base: null, head: { kg: 26, reps: 8, rpe: null, rest: 121, why: null } },
    ],
  },
  {
    status: 'removed',
    name: 'Cable fly',
    rx: '3 × 12–15',
    sets: [
      { n: 1, type: 'working', base: { kg: 15, reps: 15, rpe: 7.5, rest: 0, why: 'target reached' }, head: null },
      { n: 2, type: 'working', base: { kg: 15, reps: 14, rpe: 8.5, rest: 96, why: 'target reached' }, head: null },
      { n: 3, type: 'working', base: { kg: 15, reps: 12, rpe: 9.5, rest: 101, why: 'concentric failure' }, head: null },
    ],
  },
];

// bench press revisions, newest first
const REVISIONS = [
  { date: '09-02', load: 80.0, reps: [8, 8, 7, 6], summary: '+1 rep on set 4, mean RPE −0.2', head: true },
  { date: '08-26', load: 80.0, reps: [8, 8, 7, 5], summary: '−1 rep on set 4, mean RPE +0.2', head: false },
  { date: '08-19', load: 80.0, reps: [8, 8, 7, 6], summary: 'no comparable parent — 08-12 incomplete', head: false },
  { date: '08-12', load: 80.0, reps: [6, 5, null, null], summary: 'incomplete: 2 of 4 sets recorded, pain', head: false },
  { date: '08-05', load: 80.0, reps: [8, 7, 6, 6], summary: '+1 rep on set 1', head: false },
  { date: '07-29', load: 80.0, reps: [7, 7, 6, 6], summary: 'load +2.5 kg, −6 reps total', head: false },
  { date: '07-22', load: 77.5, reps: [8, 8, 8, 8], summary: '+1 rep on set 4', head: false },
  { date: '07-15', load: 77.5, reps: [8, 8, 8, 7], summary: 'root — no earlier session at this load', head: false },
];

// ------------------------------------------------------------------ helpers

const num = (v, d = 1) => (v === null || v === undefined ? '—' : v.toFixed(d));
const int = (v) => (v === null || v === undefined ? '—' : String(v));

function delta(a, b) {
  // b relative to a. null-safe: any missing side means "no comparison".
  if (a === null || a === undefined || b === null || b === undefined) return null;
  return b - a;
}

function deltaLabel(d, unit, decimals = 0) {
  if (d === null) return null;
  if (d === 0) return null;
  const arrow = d > 0 ? '▲' : '▼';
  return `${arrow} ${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(decimals)} ${unit}`;
}

function setStatus(s) {
  if (s.base === null) return 'added';
  if (s.head === null) return 'removed';
  const same =
    s.base.kg === s.head.kg &&
    s.base.reps === s.head.reps &&
    s.base.rpe === s.head.rpe &&
    s.base.rest === s.head.rest &&
    s.base.why === s.head.why;
  return same ? 'same' : 'changed';
}

const MARK = { same: '=', changed: '~', added: '+', removed: '−' };

// -------------------------------------------------------------------- parts

function Marker({ status }) {
  return (
    <Text style={[S.marker, status === 'same' && S.markerSame]}>{MARK[status]}</Text>
  );
}

function SideRow({ when, side, muted }) {
  return (
    <View style={S.side}>
      <Text style={[S.sideWhen, muted && S.muted]}>{when}</Text>
      <Text style={[S.sideNum, S.colKg, muted && S.muted]}>{num(side.kg)}</Text>
      <Text style={[S.sideUnit, muted && S.muted]}>kg</Text>
      <Text style={[S.sideNum, S.colReps, muted && S.muted]}>{int(side.reps)}</Text>
      <Text style={[S.sideUnit, muted && S.muted]}>rep</Text>
      <Text style={[S.sideNum, S.colRpe, side.rpe === null && S.absent, muted && S.muted]}>
        {side.rpe === null ? '—' : num(side.rpe)}
      </Text>
      <Text style={[S.sideUnit, muted && S.muted]}>rpe</Text>
      <Text style={[S.sideNum, S.colRest, side.rest === null && S.absent, muted && S.muted]}>
        {side.rest === null ? '—' : int(side.rest)}
      </Text>
      <Text style={[S.sideUnit, muted && S.muted]}>s</Text>
    </View>
  );
}

function SetHunk({ set }) {
  const status = setStatus(set);
  const dReps = set.base && set.head ? delta(set.base.reps, set.head.reps) : null;
  const dRpe = set.base && set.head ? delta(set.base.rpe, set.head.rpe) : null;
  const dRest = set.base && set.head ? delta(set.base.rest, set.head.rest) : null;
  const dKg = set.base && set.head ? delta(set.base.kg, set.head.kg) : null;

  const deltas = [
    deltaLabel(dKg, 'kg', 1),
    deltaLabel(dReps, 'rep'),
    deltaLabel(dRpe, 'rpe', 1),
    deltaLabel(dRest, 's'),
  ].filter(Boolean);

  const whyChanged =
    set.base && set.head && set.base.why !== set.head.why
      ? `${set.base.why ?? 'not recorded'} → ${set.head.why ?? 'not recorded'}`
      : null;

  return (
    <View style={[S.hunk, status === 'changed' && S.hunkChanged]}>
      <View style={S.hunkHead}>
        <Marker status={status} />
        <Text style={S.hunkTitle}>
          set {set.n}
          {set.type === 'warmup' ? '  warmup' : ''}
        </Text>
        <View style={S.grow} />
        {status === 'same' ? (
          <Text style={S.unchanged}>unchanged</Text>
        ) : status === 'added' ? (
          <Text style={S.addedTag}>no baseline</Text>
        ) : status === 'removed' ? (
          <Text style={S.addedTag}>not performed</Text>
        ) : (
          <Text style={S.deltaSummary}>{deltas.join('   ')}</Text>
        )}
      </View>

      {set.base ? (
        <SideRow when={BASE.date} side={set.base} muted={status !== 'removed'} />
      ) : (
        <Text style={S.noSide}>{BASE.date}   no set to compare against</Text>
      )}
      {set.head ? (
        <SideRow when="today" side={set.head} muted={false} />
      ) : (
        <Text style={S.noSide}>today    not performed</Text>
      )}

      {whyChanged ? <Text style={S.whyLine}>termination  {whyChanged}</Text> : null}
      {set.head && set.head.why === null ? (
        <Text style={S.whyLine}>termination  not recorded — nothing to compare</Text>
      ) : null}
    </View>
  );
}

function Tabs({ value, onChange }) {
  const items = [
    ['log', 'staging'],
    ['review', 'changeset'],
    ['history', 'revisions'],
  ];
  return (
    <View style={S.tabs}>
      {items.map(([k, label]) => (
        <Pressable key={k} onPress={() => onChange(k)} style={[S.tab, value === k && S.tabOn]}>
          <Text style={[S.tabText, value === k && S.tabTextOn]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ------------------------------------------------------------------ screen 1

function StagingScreen() {
  const set = BLOCKS[0].sets[4]; // set 4 of bench, baseline 80 × 5 @ 9.5
  const base = set.base;
  const [reps, setReps] = useState(base.reps);
  const [kg, setKg] = useState(base.kg);
  const [rpe, setRpe] = useState(base.rpe);
  const [why, setWhy] = useState(base.why);
  const [staged, setStaged] = useState(null);

  const dReps = reps - base.reps;
  const dKg = Math.round((kg - base.kg) * 10) / 10;
  const dRpe = rpe === null ? null : Math.round((rpe - base.rpe) * 10) / 10;
  const anyChange = dReps !== 0 || dKg !== 0 || (dRpe !== null && dRpe !== 0) || why !== base.why;

  return (
    <ScrollView style={S.body} contentContainerStyle={S.bodyPad}>
      <Text style={S.h1}>Barbell bench press</Text>
      <Text style={S.h1sub}>
        block 1 · set 4 of 4 · baseline {BASE.date}, same block, same position
      </Text>

      <View style={S.stageBox}>
        <View style={S.side}>
          <Text style={[S.sideWhen, S.muted]}>{BASE.date}</Text>
          <Text style={[S.sideNum, S.colKg, S.muted]}>{num(base.kg)}</Text>
          <Text style={[S.sideUnit, S.muted]}>kg</Text>
          <Text style={[S.sideNum, S.colReps, S.muted]}>{int(base.reps)}</Text>
          <Text style={[S.sideUnit, S.muted]}>rep</Text>
          <Text style={[S.sideNum, S.colRpe, S.muted]}>{num(base.rpe)}</Text>
          <Text style={[S.sideUnit, S.muted]}>rpe</Text>
        </View>
        <View style={S.side}>
          <Text style={S.sideWhen}>today</Text>
          <Text style={[S.sideNum, S.colKg, S.strong]}>{num(kg)}</Text>
          <Text style={S.sideUnit}>kg</Text>
          <Text style={[S.sideNum, S.colReps, S.strong]}>{int(reps)}</Text>
          <Text style={S.sideUnit}>rep</Text>
          <Text style={[S.sideNum, S.colRpe, S.strong, rpe === null && S.absent]}>
            {rpe === null ? '—' : num(rpe)}
          </Text>
          <Text style={S.sideUnit}>rpe</Text>
        </View>
        <Text style={S.stageDelta}>
          {anyChange
            ? [
                deltaLabel(dKg, 'kg', 1),
                deltaLabel(dReps, 'rep'),
                deltaLabel(dRpe, 'rpe', 1),
                why !== base.why ? `ended: ${why ?? 'not recorded'}` : null,
              ]
                .filter(Boolean)
                .join('    ')
            : 'identical to baseline'}
        </Text>
      </View>

      <Text style={S.label}>reps against {BASE.date}</Text>
      <View style={S.btnRow}>
        <Pressable style={S.btn} onPress={() => setReps(reps - 1)}>
          <Text style={S.btnText}>−1</Text>
        </Pressable>
        <Pressable style={[S.btn, dReps === 0 && S.btnOn]} onPress={() => setReps(base.reps)}>
          <Text style={[S.btnText, dReps === 0 && S.btnTextOn]}>same</Text>
        </Pressable>
        <Pressable style={S.btn} onPress={() => setReps(reps + 1)}>
          <Text style={S.btnText}>+1</Text>
        </Pressable>
        <Pressable style={S.btn} onPress={() => setReps(reps + 2)}>
          <Text style={S.btnText}>+2</Text>
        </Pressable>
      </View>

      <Text style={S.label}>load against {BASE.date}</Text>
      <View style={S.btnRow}>
        <Pressable style={S.btn} onPress={() => setKg(kg - 2.5)}>
          <Text style={S.btnText}>−2.5</Text>
        </Pressable>
        <Pressable style={[S.btn, dKg === 0 && S.btnOn]} onPress={() => setKg(base.kg)}>
          <Text style={[S.btnText, dKg === 0 && S.btnTextOn]}>same</Text>
        </Pressable>
        <Pressable style={S.btn} onPress={() => setKg(kg + 2.5)}>
          <Text style={S.btnText}>+2.5</Text>
        </Pressable>
      </View>

      <Text style={S.label}>rpe against {BASE.date}</Text>
      <View style={S.btnRow}>
        <Pressable style={S.btn} onPress={() => setRpe(rpe === null ? base.rpe : rpe - 0.5)}>
          <Text style={S.btnText}>−0.5</Text>
        </Pressable>
        <Pressable style={[S.btn, dRpe === 0 && S.btnOn]} onPress={() => setRpe(base.rpe)}>
          <Text style={[S.btnText, dRpe === 0 && S.btnTextOn]}>same</Text>
        </Pressable>
        <Pressable style={S.btn} onPress={() => setRpe(rpe === null ? base.rpe : rpe + 0.5)}>
          <Text style={S.btnText}>+0.5</Text>
        </Pressable>
        <Pressable style={[S.btn, rpe === null && S.btnOn]} onPress={() => setRpe(null)}>
          <Text style={[S.btnText, rpe === null && S.btnTextOn]}>unset</Text>
        </Pressable>
      </View>

      <Text style={S.label}>termination</Text>
      <View style={S.btnWrap}>
        {['target reached', 'concentric failure', 'technical failure', 'pain', 'time pressure'].map(
          (w) => (
            <Pressable key={w} style={[S.chip, why === w && S.btnOn]} onPress={() => setWhy(w)}>
              <Text style={[S.chipText, why === w && S.btnTextOn]}>{w}</Text>
            </Pressable>
          ),
        )}
        <Pressable style={[S.chip, why === null && S.btnOn]} onPress={() => setWhy(null)}>
          <Text style={[S.chipText, why === null && S.btnTextOn]}>leave unrecorded</Text>
        </Pressable>
      </View>

      <Pressable
        style={S.commit}
        onPress={() => setStaged({ kg, reps, rpe, why, dReps, dKg, dRpe })}
      >
        <Text style={S.commitText}>stage set</Text>
      </Pressable>

      {staged ? (
        <Text style={S.stagedLine}>
          staged  {num(staged.kg)} kg × {int(staged.reps)} ·{' '}
          {staged.rpe === null ? 'rpe unrecorded' : `rpe ${num(staged.rpe)}`} ·{' '}
          {staged.why ?? 'reason unrecorded'}
        </Text>
      ) : null}
    </ScrollView>
  );
}

// ------------------------------------------------------------------ screen 2

function ChangesetScreen() {
  const changed = BLOCKS.filter((b) => b.status === 'changed').length;
  const added = BLOCKS.filter((b) => b.status === 'added').length;
  const removed = BLOCKS.filter((b) => b.status === 'removed').length;

  return (
    <ScrollView style={S.body} contentContainerStyle={S.bodyPad}>
      <Text style={S.h1}>{HEAD.label}</Text>
      <Text style={S.commitLine}>head   {HEAD.stamp}</Text>
      <Text style={S.commitLine}>base   {BASE.stamp}</Text>
      <Text style={S.commitStat}>
        {changed} blocks changed · {added} added · {removed} removed · 14 sets compared
      </Text>

      {BLOCKS.map((b) => (
        <View key={b.name} style={S.blockWrap}>
          <View style={S.blockHead}>
            <Marker status={b.status} />
            <Text style={S.blockName}>{b.name}</Text>
          </View>
          <Text style={S.blockRx}>
            {b.status === 'added'
              ? 'new in this session — improvised, no prescription and no baseline'
              : b.status === 'removed'
              ? `present on ${BASE.date}, not performed today`
              : `prescription unchanged · ${b.rx}`}
          </Text>
          {b.sets.map((s) => (
            <SetHunk key={s.n} set={s} />
          ))}
        </View>
      ))}

      <Text style={S.footnote}>
        Sets are matched by position within the block, not by weight. A set with no
        counterpart is shown as added or removed rather than paired with something it is
        not. Unrecorded values are never treated as unchanged.
      </Text>
    </ScrollView>
  );
}

// ------------------------------------------------------------------ screen 3

function RevisionsScreen() {
  return (
    <ScrollView style={S.body} contentContainerStyle={S.bodyPad}>
      <Text style={S.h1}>Barbell bench press</Text>
      <Text style={S.h1sub}>8 revisions · 15 July → 2 September</Text>

      <View style={S.netBox}>
        <Text style={S.netLine}>load      77.5 → 80.0 kg     ▲ +2.5 kg</Text>
        <Text style={S.netLine}>best set  8 → 8 rep          = unchanged</Text>
        <Text style={S.netLine}>reps      31 → 29 total      ▼ −2 rep</Text>
        <Text style={S.netNote}>
          The load moved once, seven sessions ago. Nothing has moved since.
        </Text>
      </View>

      {REVISIONS.map((r) => (
        <View key={r.date} style={S.rev}>
          <View style={S.revHead}>
            <Text style={[S.revDate, r.head && S.strong]}>{r.date}</Text>
            <Text style={S.revLoad}>{r.load.toFixed(1)} kg</Text>
            <Text style={S.revReps}>
              {r.reps.map((x) => (x === null ? '–' : x)).join(' / ')}
            </Text>
            {r.head ? <Text style={S.headTag}>head</Text> : null}
          </View>
          <Text style={S.revSummary}>{r.summary}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

// --------------------------------------------------------------------- root

export default function DirectionFive() {
  const [screen, setScreen] = useState('log');
  return (
    <View style={S.root}>
      <Tabs value={screen} onChange={setScreen} />
      {screen === 'log' && <StagingScreen />}
      {screen === 'review' && <ChangesetScreen />}
      {screen === 'history' && <RevisionsScreen />}
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  body: { flex: 1 },
  bodyPad: { padding: 16, paddingBottom: 56 },
  grow: { flex: 1 },

  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.rule },
  tab: { paddingHorizontal: 16, paddingVertical: 13 },
  tabOn: { borderBottomWidth: 2, borderBottomColor: C.ink },
  tabText: { fontSize: 14, color: C.faint },
  tabTextOn: { color: C.ink, fontWeight: '600' },

  h1: { fontSize: 21, color: C.ink, fontWeight: '600' },
  h1sub: { fontSize: 13, color: C.faint, marginTop: 4, marginBottom: 18 },
  label: {
    fontSize: 11,
    color: C.faint,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginTop: 20,
    marginBottom: 8,
  },
  footnote: { fontSize: 13, color: C.faint, lineHeight: 20, marginTop: 26 },

  commitLine: { fontFamily: MONO, fontSize: 12, color: C.mid, marginTop: 4 },
  commitStat: { fontSize: 13, color: C.ink, marginTop: 10, marginBottom: 4 },

  blockWrap: { marginTop: 28 },
  blockHead: { flexDirection: 'row', alignItems: 'center' },
  blockName: { fontSize: 17, color: C.ink, fontWeight: '600' },
  blockRx: { fontSize: 12, color: C.faint, marginLeft: 22, marginTop: 2, marginBottom: 10 },

  marker: { fontFamily: MONO, fontSize: 15, color: C.markInk, width: 22 },
  markerSame: { color: C.faint },

  hunk: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.rule },
  hunkChanged: { backgroundColor: C.band, marginHorizontal: -6, paddingHorizontal: 6 },
  hunkHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  hunkTitle: { fontSize: 13, color: C.mid },
  unchanged: { fontSize: 12, color: C.faint },
  addedTag: { fontSize: 12, color: C.mid },
  deltaSummary: { fontFamily: MONO, fontSize: 12, color: C.accent },

  side: { flexDirection: 'row', alignItems: 'baseline', paddingVertical: 2, paddingLeft: 22 },
  sideWhen: { fontFamily: MONO, fontSize: 11, color: C.faint, width: 54 },
  sideNum: { fontFamily: MONO, fontSize: 14, color: C.ink, textAlign: 'right' },
  sideUnit: { fontFamily: MONO, fontSize: 10, color: C.faint, width: 26, paddingLeft: 3 },
  colKg: { width: 44 },
  colReps: { width: 26 },
  colRpe: { width: 34 },
  colRest: { width: 34 },
  muted: { color: C.faint },
  strong: { fontWeight: '700' },
  absent: { color: C.faint },
  noSide: { fontFamily: MONO, fontSize: 12, color: C.faint, paddingLeft: 22, paddingVertical: 3 },
  whyLine: { fontFamily: MONO, fontSize: 11, color: C.mid, paddingLeft: 22, marginTop: 4 },

  stageBox: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.rule, paddingVertical: 12 },
  stageDelta: { fontFamily: MONO, fontSize: 13, color: C.accent, paddingLeft: 22, marginTop: 10 },

  btnRow: { flexDirection: 'row', gap: 8 },
  btnWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: {
    flex: 1,
    height: 54,
    borderWidth: 1,
    borderColor: C.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOn: { backgroundColor: C.ink },
  btnText: { fontFamily: MONO, fontSize: 15, color: C.ink },
  btnTextOn: { color: C.bg },
  chip: {
    paddingHorizontal: 12,
    height: 46,
    borderWidth: 1,
    borderColor: C.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { fontFamily: MONO, fontSize: 12, color: C.ink },

  commit: {
    marginTop: 26,
    height: 58,
    backgroundColor: C.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commitText: { fontFamily: MONO, fontSize: 16, color: C.bg, letterSpacing: 1 },
  stagedLine: { fontFamily: MONO, fontSize: 12, color: C.mid, marginTop: 14 },

  netBox: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.rule, paddingVertical: 14 },
  netLine: { fontFamily: MONO, fontSize: 13, color: C.ink, marginBottom: 6 },
  netNote: { fontSize: 13, color: C.faint, marginTop: 6, lineHeight: 19 },

  rev: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.rule },
  revHead: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  revDate: { fontFamily: MONO, fontSize: 14, color: C.ink, width: 52 },
  revLoad: { fontFamily: MONO, fontSize: 13, color: C.mid, width: 62 },
  revReps: { fontFamily: MONO, fontSize: 13, color: C.ink },
  headTag: { fontFamily: MONO, fontSize: 10, color: C.faint },
  revSummary: { fontSize: 13, color: C.mid, marginTop: 4 },
});
