/**
 * Direction Four — thumb
 *
 * Ergonomics taken to the extreme. One question on screen at a time, answered
 * with targets big enough to hit while standing, out of breath, with one hand.
 * Everything interactive lives in the bottom half; the top half is read-only
 * and never needs to be reached. Type is sized to be read at arm's length.
 * Overview is deliberately sacrificed: this screen knows about one set.
 */

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const C = {
  bg: '#FFFFFF',
  ink: '#101010',
  mid: '#5E5E5E',
  faint: '#9A9A9A',
  line: '#D8D8D8',
  fill: '#101010',
  onFill: '#FFFFFF',
  band: '#F0F0EE',
};

// ---------------------------------------------------------------- dummy data

const CURRENT = {
  exercise: 'Bench press',
  block: '1 of 3',
  prescribed: '4 × 6–8 · RIR 2 · 3 min',
  setNumber: 4,
  setsPrescribed: 4,
  lastLoad: 80,
  previous: [
    { kg: 40, reps: 10, rpe: null, why: 'Target', warmup: true },
    { kg: 80, reps: 8, rpe: 7, why: 'Target' },
    { kg: 80, reps: 8, rpe: 8, why: 'Target' },
    { kg: 80, reps: 7, rpe: 9, why: 'Concentric' },
  ],
};

const SESSION = [
  {
    name: 'Bench press',
    rx: '4 × 6–8 · RIR 2',
    sets: [
      { kg: 40, reps: 10, rpe: null, why: 'Target reached', warmup: true },
      { kg: 80, reps: 8, rpe: 7, why: 'Target reached' },
      { kg: 80, reps: 8, rpe: 8, why: 'Target reached' },
      { kg: 80, reps: 7, rpe: 9, why: 'Concentric failure' },
      { kg: 80, reps: 6, rpe: 9.5, why: 'Technical failure' },
    ],
  },
  {
    name: 'Chest-supported row',
    rx: '3 × 10–12',
    sets: [
      { kg: 60, reps: 12, rpe: 7, why: 'Target reached' },
      { kg: 60, reps: 11, rpe: 8, why: 'Target reached' },
      { kg: 60, reps: 9, rpe: 9, why: 'Concentric failure' },
    ],
  },
  {
    name: 'Incline dumbbell press',
    rx: null,
    sets: [
      { kg: 26, reps: 10, rpe: 8, why: 'Target reached' },
      { kg: 26, reps: 9, rpe: 9, why: 'Concentric failure' },
      { kg: 26, reps: 8, rpe: null, why: null },
    ],
  },
];

const HISTORY = [
  { date: '15 Jul', kg: 77.5, best: 8, partial: false },
  { date: '22 Jul', kg: 77.5, best: 8, partial: false },
  { date: '29 Jul', kg: 80, best: 7, partial: false },
  { date: '5 Aug', kg: 80, best: 8, partial: false },
  { date: '12 Aug', kg: 80, best: 6, partial: true },
  { date: '19 Aug', kg: 80, best: 8, partial: false },
  { date: '26 Aug', kg: 80, best: 8, partial: false },
  { date: '2 Sep', kg: 80, best: 8, partial: false },
];

const RPES = ['7', '7.5', '8', '8.5', '9', '9.5', '10'];
const WHYS = [
  'Target reached',
  'Concentric failure',
  'Technical failure',
  'Pain',
  'Time pressure',
  'Not recorded',
];

// -------------------------------------------------------------------- parts

function Big({ onPress, label, selected, wide }) {
  return (
    <Pressable
      onPress={onPress}
      style={[S.big, wide && S.bigWide, selected && S.bigOn]}
    >
      <Text style={[S.bigText, selected && S.bigTextOn]}>{label}</Text>
    </Pressable>
  );
}

// ------------------------------------------------------------------ screen 1

function NowScreen() {
  const [step, setStep] = useState('reps');
  const [kg, setKg] = useState(CURRENT.lastLoad);
  // undefined means "not answered yet". null means "answered: not recorded".
  // The two are different facts and the screen must not conflate them.
  const [reps, setReps] = useState(null);
  const [rpe, setRpe] = useState(undefined);
  const [why, setWhy] = useState(undefined);
  const [saved, setSaved] = useState(null);

  const reset = () => {
    setStep('reps');
    setReps(null);
    setRpe(undefined);
    setWhy(undefined);
  };

  const value = `${kg} kg${reps === null ? '' : ` × ${reps}`}`;

  return (
    <View style={S.now}>
      <View style={S.nowTop}>
        <Text style={S.nowExercise}>{CURRENT.exercise}</Text>
        <Text style={S.nowMeta}>
          Set {CURRENT.setNumber} of {CURRENT.setsPrescribed} · {CURRENT.prescribed}
        </Text>

        <Text style={S.nowValue}>{value}</Text>
        <Text style={S.nowSub}>
          {rpe === undefined ? 'RPE not set' : rpe === null ? 'RPE not recorded' : `RPE ${rpe}`}
          {'   ·   '}
          {why === undefined ? 'Reason not set' : why === null ? 'Reason not recorded' : why}
        </Text>

        {saved ? (
          <Text style={S.nowSaved}>
            Logged: {saved.kg} kg × {saved.reps} ·{' '}
            {saved.rpe === null || saved.rpe === undefined
              ? 'RPE not recorded'
              : `RPE ${saved.rpe}`}{' '}
            ·{' '}
            {saved.why === null || saved.why === undefined
              ? 'reason not recorded'
              : saved.why.toLowerCase()}
          </Text>
        ) : (
          <Text style={S.nowLast}>
            Last set: {CURRENT.previous[3].kg} kg × {CURRENT.previous[3].reps} · RPE{' '}
            {CURRENT.previous[3].rpe}
          </Text>
        )}
      </View>

      <View style={S.nowBottom}>
        {step === 'reps' && (
          <>
            <Text style={S.question}>How many reps?</Text>
            <View style={S.repRow}>
              <Pressable
                style={S.repStep}
                onPress={() => setReps(Math.max(0, (reps === null ? 8 : reps) - 1))}
              >
                <Text style={S.repStepText}>−</Text>
              </Pressable>
              <Text style={S.repValue}>{reps === null ? '–' : reps}</Text>
              <Pressable
                style={S.repStep}
                onPress={() => setReps((reps === null ? 7 : reps) + 1)}
              >
                <Text style={S.repStepText}>+</Text>
              </Pressable>
            </View>
            <View style={S.row}>
              <Big label="Weight −2.5" onPress={() => setKg(kg - 2.5)} />
              <Big label="Weight +2.5" onPress={() => setKg(kg + 2.5)} />
            </View>
            <Pressable
              style={[S.primary, reps === null && S.primaryOff]}
              onPress={() => reps !== null && setStep('rpe')}
            >
              <Text style={[S.primaryText, reps === null && S.primaryTextOff]}>
                {reps === null ? 'Enter reps' : 'Next: how hard'}
              </Text>
            </Pressable>
          </>
        )}

        {step === 'rpe' && (
          <>
            <Text style={S.question}>How hard was it?</Text>
            <View style={S.wrap}>
              {RPES.map((r) => (
                <Big
                  key={r}
                  label={r}
                  selected={rpe === parseFloat(r)}
                  onPress={() => setRpe(parseFloat(r))}
                />
              ))}
              <Big
                label="Didn't judge it"
                wide
                selected={rpe === null}
                onPress={() => setRpe(null)}
              />
            </View>
            <Pressable style={S.primary} onPress={() => setStep('why')}>
              <Text style={S.primaryText}>Next: why it ended</Text>
            </Pressable>
            <Pressable style={S.secondary} onPress={() => setStep('reps')}>
              <Text style={S.secondaryText}>Back to reps</Text>
            </Pressable>
          </>
        )}

        {step === 'why' && (
          <>
            <Text style={S.question}>Why did the set end?</Text>
            <ScrollView style={S.whyScroll}>
              {WHYS.map((w) => (
                <Pressable
                  key={w}
                  onPress={() => setWhy(w === 'Not recorded' ? null : w)}
                  style={[
                    S.whyRow,
                    (why === w || (w === 'Not recorded' && why === null)) && S.whyRowOn,
                  ]}
                >
                  <Text
                    style={[
                      S.whyText,
                      (why === w || (w === 'Not recorded' && why === null)) && S.whyTextOn,
                    ]}
                    numberOfLines={1}
                  >
                    {w}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              style={S.primary}
              onPress={() => {
                setSaved({ kg, reps, rpe, why });
                reset();
              }}
            >
              <Text style={S.primaryText}>Log set</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

// ------------------------------------------------------------------ screen 2

function SessionScreen() {
  return (
    <ScrollView style={S.scroll} contentContainerStyle={S.scrollBody}>
      <Text style={S.h1}>Tuesday 2 Sept</Text>
      <Text style={S.h1sub}>Upper A · 67 min · 11 sets</Text>

      {SESSION.map((ex) => (
        <View key={ex.name} style={S.exBlock}>
          <Text style={S.exName}>{ex.name}</Text>
          <Text style={S.exRx}>{ex.rx === null ? 'No prescription' : ex.rx}</Text>
          {ex.sets.map((s, ix) => (
            <View key={ix} style={S.setBlock}>
              <Text style={S.setBig}>
                {s.kg} kg <Text style={S.setTimes}>×</Text> {s.reps}
                {s.warmup ? <Text style={S.setWarm}>  warmup</Text> : null}
              </Text>
              <Text style={S.setSmall}>
                {s.rpe === null ? 'RPE not recorded' : `RPE ${s.rpe}`}
                {' · '}
                {s.why === null ? 'reason not recorded' : s.why.toLowerCase()}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

// ------------------------------------------------------------------ screen 3

function BenchScreen() {
  return (
    <ScrollView style={S.scroll} contentContainerStyle={S.scrollBody}>
      <Text style={S.h1}>Bench press</Text>
      <Text style={S.h1sub}>Last 8 sessions</Text>

      <Text style={S.hugeNumber}>80 kg × 8</Text>
      <Text style={S.hugeCaption}>
        Best set today. Same as 26 Aug, 19 Aug and 5 Aug.
      </Text>

      {HISTORY.slice().reverse().map((h) => (
        <View key={h.date} style={S.histRow}>
          <Text style={S.histDate}>{h.date}</Text>
          <Text style={S.histValue}>
            {h.kg} kg × {h.best}
          </Text>
          {h.partial ? <Text style={S.histFlag}>2 of 4 sets recorded</Text> : null}
        </View>
      ))}
    </ScrollView>
  );
}

// --------------------------------------------------------------------- root

export default function DirectionFour() {
  const [tab, setTab] = useState('now');
  return (
    <View style={S.root}>
      <View style={S.content}>
        {tab === 'now' && <NowScreen />}
        {tab === 'session' && <SessionScreen />}
        {tab === 'bench' && <BenchScreen />}
      </View>
      <View style={S.tabs}>
        {[
          ['now', 'Now'],
          ['session', 'Session'],
          ['bench', 'Bench'],
        ].map(([key, label]) => (
          <Pressable
            key={key}
            style={[S.tab, tab === key && S.tabOn]}
            onPress={() => setTab(key)}
          >
            <Text style={[S.tabText, tab === key && S.tabTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { flex: 1 },

  now: { flex: 1 },
  nowTop: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 18 },
  nowExercise: { fontSize: 30, color: C.ink, fontWeight: '600' },
  nowMeta: { fontSize: 15, color: C.mid, marginTop: 6 },
  nowValue: { fontSize: 56, color: C.ink, fontWeight: '700', marginTop: 22, letterSpacing: -1 },
  nowSub: { fontSize: 17, color: C.mid, marginTop: 8 },
  nowLast: { fontSize: 15, color: C.faint, marginTop: 16 },
  nowSaved: { fontSize: 15, color: C.ink, marginTop: 16 },

  nowBottom: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: C.line,
    backgroundColor: C.band,
    paddingTop: 14,
  },
  question: { fontSize: 20, color: C.ink, marginBottom: 12, fontWeight: '600' },

  repRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  repStep: {
    width: 104,
    height: 104,
    borderWidth: 2,
    borderColor: C.ink,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.bg,
  },
  repStepText: { fontSize: 44, color: C.ink, lineHeight: 50 },
  repValue: { flex: 1, textAlign: 'center', fontSize: 68, color: C.ink, fontWeight: '700' },

  row: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  big: {
    minWidth: 86,
    flexGrow: 1,
    height: 66,
    borderWidth: 2,
    borderColor: C.ink,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.bg,
  },
  bigWide: { width: '100%' },
  bigOn: { backgroundColor: C.fill },
  bigText: { fontSize: 22, color: C.ink, fontWeight: '600' },
  bigTextOn: { color: C.onFill },

  primary: {
    height: 78,
    backgroundColor: C.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryOff: { backgroundColor: C.bg, borderWidth: 2, borderColor: C.line },
  primaryText: { fontSize: 25, color: C.onFill, fontWeight: '700' },
  primaryTextOff: { color: C.faint },
  secondary: { height: 56, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 18, color: C.mid },

  whyScroll: { maxHeight: 300, marginBottom: 12 },
  whyRow: {
    height: 68,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: C.ink,
    marginBottom: 8,
    backgroundColor: C.bg,
  },
  whyRowOn: { backgroundColor: C.fill },
  whyText: { fontSize: 21, color: C.ink },
  whyTextOn: { color: C.onFill },

  scroll: { flex: 1 },
  scrollBody: { padding: 20, paddingBottom: 40 },
  h1: { fontSize: 32, color: C.ink, fontWeight: '700' },
  h1sub: { fontSize: 17, color: C.mid, marginTop: 4 },
  exBlock: { marginTop: 34 },
  exName: { fontSize: 24, color: C.ink, fontWeight: '600' },
  exRx: { fontSize: 15, color: C.faint, marginTop: 2, marginBottom: 14 },
  setBlock: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.line },
  setBig: { fontSize: 30, color: C.ink, fontWeight: '600' },
  setTimes: { color: C.faint },
  setWarm: { fontSize: 15, color: C.faint, fontWeight: '400' },
  setSmall: { fontSize: 16, color: C.mid, marginTop: 4 },

  hugeNumber: { fontSize: 52, color: C.ink, fontWeight: '700', marginTop: 26, letterSpacing: -1 },
  hugeCaption: { fontSize: 16, color: C.mid, marginTop: 8, marginBottom: 24, lineHeight: 23 },
  histRow: { paddingVertical: 16, borderTopWidth: 1, borderTopColor: C.line },
  histDate: { fontSize: 15, color: C.faint },
  histValue: { fontSize: 28, color: C.ink, fontWeight: '600', marginTop: 2 },
  histFlag: { fontSize: 15, color: C.mid, marginTop: 4 },

  // paddingBottom clears the Android gesture bar: this project targets SDK 36,
  // where edge-to-edge is enforced, and there is no safe-area library here.
  tabs: { flexDirection: 'row', borderTopWidth: 2, borderTopColor: C.ink, paddingBottom: 24, backgroundColor: C.bg },
  tab: { flex: 1, height: 68, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  tabOn: { backgroundColor: C.fill },
  tabText: { fontSize: 19, color: C.ink, fontWeight: '600' },
  tabTextOn: { color: C.onFill },
});
