/**
 * Direction Three — instrument
 *
 * A readout panel. Every field has a fixed position, a fixed width and a unit
 * label that is always present, whether or not there is a value in it. Nothing
 * reflows. Deviation from prescription is first-class: each measured quantity
 * is shown next to its target as a signed delta, with a tolerance band, and
 * out-of-tolerance values are marked in the single accent the panel owns.
 * Entry is by increment, not by keyboard — instruments have detents.
 */

import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const MONO = Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' });

const C = {
  bg: '#0D1012',
  panel: '#12171A',
  grid: '#1F272B',
  gridBright: '#2C363B',
  value: '#E4EAED',
  label: '#71828A',
  dim: '#48565C',
  warn: '#C08A2E',
};

// ---------------------------------------------------------------- dummy data

const RX = { repLow: 6, repHigh: 8, rpe: 8.0, rpeTol: 0.5, rest: 180, restTol: 30, sets: 4 };

const SESSION = {
  code: 'UPPER-A',
  stamp: '2025-09-02 18:05',
  elapsed: '00:67',
  blocks: [
    {
      n: 1,
      name: 'BARBELL BENCH PRESS',
      rx: '4 × 6-8 @ RIR 2 / 180 s',
      rxRepLow: 6, rxRepHigh: 8, rxRpe: 8.0, rxRest: 180,
      sets: [
        { type: 'WU', kg: 40, reps: 10, rpe: null, term: 'TGT', rest: null },
        { type: 'WK', kg: 80, reps: 8, rpe: 7.0, term: 'TGT', rest: 0 },
        { type: 'WK', kg: 80, reps: 8, rpe: 8.0, term: 'TGT', rest: 194 },
        { type: 'WK', kg: 80, reps: 7, rpe: 9.0, term: 'CON', rest: 176 },
        { type: 'WK', kg: 80, reps: 6, rpe: 9.5, term: 'TEC', rest: 210 },
      ],
    },
    {
      n: 2,
      name: 'CHEST-SUPPORTED ROW',
      rx: '3 × 10-12 / rest n/p',
      rxRepLow: 10, rxRepHigh: 12, rxRpe: null, rxRest: null,
      sets: [
        { type: 'WK', kg: 60, reps: 12, rpe: 7.0, term: 'TGT', rest: 0 },
        { type: 'WK', kg: 60, reps: 11, rpe: 8.0, term: 'TGT', rest: 141 },
        { type: 'WK', kg: 60, reps: 9, rpe: 9.0, term: 'CON', rest: 133 },
      ],
    },
    {
      n: 3,
      name: 'INCLINE DUMBBELL PRESS',
      rx: null,
      rxRepLow: null, rxRepHigh: null, rxRpe: null, rxRest: null,
      sets: [
        { type: 'WK', kg: 26, reps: 10, rpe: 8.0, term: 'TGT', rest: 0 },
        { type: 'WK', kg: 26, reps: 9, rpe: 9.0, term: 'CON', rest: 128 },
        { type: 'WK', kg: 26, reps: 8, rpe: null, term: null, rest: 121 },
      ],
    },
  ],
};

const TREND = [
  { s: '07-15', kg: 77.5, top: 8, vol: 2402.5, rpe: 7.6, complete: true },
  { s: '07-22', kg: 77.5, top: 8, vol: 2480.0, rpe: 7.8, complete: true },
  { s: '07-29', kg: 80.0, top: 7, vol: 2080.0, rpe: 8.6, complete: true },
  { s: '08-05', kg: 80.0, top: 8, vol: 2160.0, rpe: 8.5, complete: true },
  { s: '08-12', kg: 80.0, top: 6, vol: 880.0, rpe: 9.0, complete: false },
  { s: '08-19', kg: 80.0, top: 8, vol: 2320.0, rpe: 8.4, complete: true },
  { s: '08-26', kg: 80.0, top: 8, vol: 2240.0, rpe: 8.6, complete: true },
  { s: '09-02', kg: 80.0, top: 8, vol: 2320.0, rpe: 8.4, complete: true },
];

const TERMS = ['TGT', 'CON', 'TEC', 'PAIN', 'TIME', '---'];
const TERM_LONG = {
  TGT: 'TARGET REACHED',
  CON: 'CONCENTRIC FAILURE',
  TEC: 'TECHNICAL FAILURE',
  PAIN: 'PAIN',
  TIME: 'TIME PRESSURE',
  '---': 'NOT RECORDED',
};

// ------------------------------------------------------------------ helpers

const f = (v, d) => (v === null || v === undefined ? null : v.toFixed(d));
const sign = (v, d = 0) => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(d);

function repDelta(reps, low, high) {
  if (reps === null || low === null) return null;
  if (reps > high) return reps - high;
  if (reps < low) return reps - low;
  return 0;
}

// -------------------------------------------------------------------- parts

function Field({ label, value, unit, width, warn, align = 'right' }) {
  const missing = value === null || value === undefined;
  return (
    <View style={{ width }}>
      <Text style={[S.fieldLabel, { textAlign: align }]}>{label}</Text>
      <Text
        style={[
          S.fieldValue,
          { textAlign: align },
          warn && S.warn,
          missing && S.missing,
        ]}
        numberOfLines={1}
      >
        {missing ? '—' : value}
      </Text>
      <Text style={[S.fieldUnit, { textAlign: align }, missing && S.missingUnit]}>
        {missing ? 'NOT REC' : unit}
      </Text>
    </View>
  );
}

const W = { idx: 18, type: 30, load: 48, rep: 28, drep: 36, rpe: 34, drpe: 40, rest: 38, drest: 44 };

function TableHead() {
  return (
    <View style={[S.trow, S.thead]}>
      <Text style={[S.th, { width: W.idx }]}>#</Text>
      <Text style={[S.th, { width: W.type, textAlign: 'left' }]}>TYP</Text>
      <Text style={[S.th, { width: W.load }]}>LOAD</Text>
      <Text style={[S.th, { width: W.rep }]}>REP</Text>
      <Text style={[S.th, { width: W.drep }]}>ΔREP</Text>
      <Text style={[S.th, { width: W.rpe }]}>RPE</Text>
      <Text style={[S.th, { width: W.drpe }]}>ΔRPE</Text>
      <Text style={[S.th, { width: W.rest }]}>REST</Text>
      <Text style={[S.th, { width: W.drest }]}>ΔREST</Text>
    </View>
  );
}

function TableRow({ set, index, block }) {
  const isWarmup = set.type === 'WU';
  const dRep = isWarmup ? null : repDelta(set.reps, block.rxRepLow, block.rxRepHigh);
  const dRpe = isWarmup || set.rpe === null || block.rxRpe === null ? null : set.rpe - block.rxRpe;
  const dRest = set.rest === null || block.rxRest === null ? null : set.rest - block.rxRest;

  const cell = (v, w, warn, missingText = '—') => (
    <Text
      style={[S.td, { width: w }, warn && S.warn, v === null && S.tdMissing]}
      numberOfLines={1}
    >
      {v === null ? missingText : v}
    </Text>
  );

  return (
    <View style={[S.trow, isWarmup && S.trowWarmup]}>
      <Text style={[S.td, S.tdDim, { width: W.idx }]}>{index}</Text>
      <Text style={[S.td, S.tdDim, { width: W.type, textAlign: 'left' }]}>{set.type}</Text>
      {cell(f(set.kg, 1), W.load, false)}
      {cell(set.reps, W.rep, false)}
      {cell(dRep === null ? null : dRep === 0 ? '··' : sign(dRep), W.drep, dRep !== null && dRep !== 0, isWarmup ? 'n/a' : '—')}
      {cell(f(set.rpe, 1), W.rpe, false)}
      {cell(
        dRpe === null ? null : sign(dRpe, 1),
        W.drpe,
        dRpe !== null && Math.abs(dRpe) > RX.rpeTol,
        isWarmup ? 'n/a' : '—',
      )}
      {cell(set.rest === null ? null : String(set.rest), W.rest, false)}
      {cell(
        dRest === null ? null : sign(dRest),
        W.drest,
        dRest !== null && Math.abs(dRest) > RX.restTol,
        block.rxRest === null ? 'n/p' : '—',
      )}
    </View>
  );
}

function Stepper({ label, unit, value, onDown, onUp, format, target, delta, warn }) {
  return (
    <View style={S.stepper}>
      <View style={S.stepperHead}>
        <Text style={S.fieldLabel}>{label}</Text>
        <Text style={S.stepperTarget}>{target}</Text>
      </View>
      <View style={S.stepperBody}>
        <Pressable onPress={onDown} style={S.stepBtn} hitSlop={4}>
          <Text style={S.stepBtnText}>−</Text>
        </Pressable>
        <View style={S.stepperReadout}>
          <Text style={[S.stepperValue, value === null && S.missing, warn && S.warn]}>
            {value === null ? '—' : format(value)}
          </Text>
          <Text style={S.stepperUnit}>{unit}</Text>
        </View>
        <Pressable onPress={onUp} style={S.stepBtn} hitSlop={4}>
          <Text style={S.stepBtnText}>+</Text>
        </Pressable>
      </View>
      <Text style={[S.stepperDelta, warn && S.warn]}>{delta}</Text>
    </View>
  );
}

// ------------------------------------------------------------------ screen 1

function LogPanel() {
  const block = SESSION.blocks[0];
  const done = block.sets.slice(0, 4);
  const [kg, setKg] = useState(80);
  const [reps, setReps] = useState(null);
  const [rpe, setRpe] = useState(null);
  const [term, setTerm] = useState(null);
  const [extra, setExtra] = useState([]);

  const dRep = repDelta(reps, block.rxRepLow, block.rxRepHigh);
  const dRpe = rpe === null ? null : rpe - block.rxRpe;

  const commit = () => {
    setExtra([...extra, { type: 'WK', kg, reps, rpe, term: term === '---' ? null : term, rest: 161 }]);
    setReps(null);
    setRpe(null);
    setTerm(null);
  };

  const rows = [...done, ...extra];

  return (
    <ScrollView style={S.body} contentContainerStyle={S.bodyPad}>
      <View style={S.panel}>
        <View style={S.panelHead}>
          <Text style={S.panelTitle}>BLOCK {block.n} / 3   {block.name}</Text>
          <Text style={S.panelSub}>RX {block.rx}</Text>
        </View>

        <View style={S.readoutRow}>
          <Field label="SET" value={String(rows.length + 1)} unit={`OF ${RX.sets}`} width={54} align="left" />
          <Field label="LOAD" value={f(kg, 1)} unit="KG" width={78} />
          <Field label="LAST REST" value="161" unit="S" width={88} />
          <Field label="TERMINATION" value={term ? TERM_LONG[term].split(' ')[0] : null} unit="CODE" width={110} />
        </View>
      </View>

      <View style={S.panel}>
        <Stepper
          label="LOAD"
          unit="KG"
          value={kg}
          format={(v) => v.toFixed(1)}
          onDown={() => setKg(Math.max(0, Math.round((kg - 2.5) * 10) / 10))}
          onUp={() => setKg(Math.round((kg + 2.5) * 10) / 10)}
          target="RX  80.0 KG"
          delta={`Δ ${sign(kg - 80, 1)} KG`}
          warn={Math.abs(kg - 80) > 0}
        />
        <View style={S.hgrid} />
        <Stepper
          label="REPS"
          unit="REP"
          value={reps}
          format={(v) => String(v)}
          onDown={() => setReps(Math.max(0, (reps === null ? 8 : reps) - 1))}
          onUp={() => setReps((reps === null ? 7 : reps) + 1)}
          target={`RX  ${block.rxRepLow}-${block.rxRepHigh}`}
          delta={
            dRep === null
              ? 'Δ  NOT ENTERED'
              : dRep === 0
              ? 'Δ  IN BAND'
              : `Δ ${sign(dRep)} REP OUT OF BAND`
          }
          warn={dRep !== null && dRep !== 0}
        />
        <View style={S.hgrid} />
        <Stepper
          label="RPE"
          unit="RPE"
          value={rpe}
          format={(v) => v.toFixed(1)}
          onDown={() => setRpe(Math.max(1, Math.round(((rpe === null ? 8.5 : rpe) - 0.5) * 10) / 10))}
          onUp={() => setRpe(Math.min(10, Math.round(((rpe === null ? 7.5 : rpe) + 0.5) * 10) / 10))}
          target={`RX  ${block.rxRpe.toFixed(1)} (RIR 2)`}
          delta={dRpe === null ? 'Δ  NOT ENTERED' : `Δ ${sign(dRpe, 1)} RPE`}
          warn={dRpe !== null && Math.abs(dRpe) > RX.rpeTol}
        />
      </View>

      <View style={S.panel}>
        <Text style={S.fieldLabel}>TERMINATION REASON</Text>
        <View style={S.termGrid}>
          {TERMS.map((t) => (
            <Pressable
              key={t}
              onPress={() => setTerm(t)}
              style={[S.termCell, term === t && S.termCellOn]}
            >
              <Text style={[S.termCode, term === t && S.termCodeOn]}>{t}</Text>
              <Text style={[S.termName, term === t && S.termNameOn]} numberOfLines={1}>
                {TERM_LONG[t]}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Pressable onPress={commit} style={S.commit}>
        <Text style={S.commitText}>COMMIT SET</Text>
        <Text style={S.commitSub}>
          {kg.toFixed(1)} KG · {reps === null ? '—' : reps} REP ·{' '}
          {rpe === null ? '—' : rpe.toFixed(1)} RPE · {term === null ? '—' : term}
        </Text>
      </Pressable>

      <View style={S.panel}>
        <TableHead />
        {rows.map((s, ix) => (
          <TableRow key={ix} set={s} index={ix + 1} block={block} />
        ))}
      </View>
    </ScrollView>
  );
}

// ------------------------------------------------------------------ screen 2

function ReviewPanel() {
  return (
    <ScrollView style={S.body} contentContainerStyle={S.bodyPad}>
      <View style={S.panel}>
        <View style={S.readoutRow}>
          <Field label="SESSION" value={SESSION.code} unit="CODE" width={104} align="left" />
          <Field label="START" value="18:05" unit="LOCAL" width={70} />
          <Field label="DURATION" value="67" unit="MIN" width={68} />
          <Field label="SETS" value="11" unit="COUNT" width={54} />
          <Field label="WU" value="1" unit="COUNT" width={44} />
        </View>
      </View>

      {SESSION.blocks.map((b) => (
        <View key={b.n} style={S.panel}>
          <View style={S.panelHead}>
            <Text style={S.panelTitle}>
              BLOCK {b.n}   {b.name}
            </Text>
            <Text style={S.panelSub}>RX {b.rx === null ? 'NONE — IMPROVISED' : b.rx}</Text>
          </View>
          <TableHead />
          {b.sets.map((s, ix) => (
            <TableRow key={ix} set={s} index={ix + 1} block={b} />
          ))}
        </View>
      ))}

      <View style={S.panel}>
        <Text style={S.fieldLabel}>DATA INTEGRITY</Text>
        <Text style={S.integrity}>1.1  RPE          NOT RECORDED</Text>
        <Text style={S.integrity}>1.1  REST         NOT RECORDED</Text>
        <Text style={S.integrity}>3.3  RPE          NOT RECORDED</Text>
        <Text style={S.integrity}>3.3  TERMINATION  NOT RECORDED</Text>
        <Text style={S.integrityNote}>
          4 FIELDS UNRECORDED OF 55. NOT IMPUTED, NOT ZEROED.
        </Text>
      </View>
    </ScrollView>
  );
}

// ------------------------------------------------------------------ screen 3

function TrendPanel() {
  const max = 2600;
  return (
    <ScrollView style={S.body} contentContainerStyle={S.bodyPad}>
      <View style={S.panel}>
        <View style={S.panelHead}>
          <Text style={S.panelTitle}>BARBELL BENCH PRESS</Text>
          <Text style={S.panelSub}>8 SESSIONS   2025-07-15 → 2025-09-02</Text>
        </View>
        <View style={S.readoutRow}>
          <Field label="LOAD NOW" value="80.0" unit="KG" width={78} align="left" />
          <Field label="Δ 8 SESS" value="+2.5" unit="KG" width={74} />
          <Field label="TOP REP" value="8" unit="REP" width={62} />
          <Field label="Δ TOP" value="±0" unit="REP" width={58} />
          <Field label="E1RM" value="101.3" unit="KG" width={82} />
        </View>
      </View>

      <View style={S.panel}>
        <View style={[S.trow, S.thead]}>
          <Text style={[S.th, { width: 44, textAlign: 'left' }]}>SESS</Text>
          <Text style={[S.th, { width: 50 }]}>LOAD</Text>
          <Text style={[S.th, { width: 34 }]}>TOP</Text>
          <Text style={[S.th, { width: 54 }]}>E1RM</Text>
          <Text style={[S.th, { width: 62 }]}>VOL</Text>
          <Text style={[S.th, { width: 40 }]}>RPE</Text>
          <Text style={[S.th, { width: 40 }]}>SETS</Text>
        </View>
        {TREND.map((t) => (
          <View key={t.s} style={S.trow}>
            <Text style={[S.td, S.tdDim, { width: 44, textAlign: 'left' }]}>{t.s}</Text>
            <Text style={[S.td, { width: 50 }]}>{t.kg.toFixed(1)}</Text>
            <Text style={[S.td, { width: 34 }]}>{t.top}</Text>
            <Text style={[S.td, { width: 54 }]}>{(t.kg * (1 + t.top / 30)).toFixed(1)}</Text>
            <Text style={[S.td, { width: 62 }]}>{t.vol.toFixed(0)}</Text>
            <Text style={[S.td, { width: 40 }]}>{t.rpe.toFixed(1)}</Text>
            <Text style={[S.td, { width: 40 }, !t.complete && S.warn]}>
              {t.complete ? '4' : '2/4'}
            </Text>
          </View>
        ))}
      </View>

      <View style={S.panel}>
        <Text style={S.fieldLabel}>WORKING VOLUME   KG   SCALE 0–2600</Text>
        <View style={S.chart}>
          {TREND.map((t) => (
            <View key={t.s} style={S.chartCol}>
              <View style={S.chartTrack}>
                <View
                  style={[
                    S.chartBar,
                    { height: `${(t.vol / max) * 100}%` },
                    !t.complete && S.chartBarPartial,
                  ]}
                />
              </View>
              <Text style={S.chartLabel}>{t.s.slice(3)}</Text>
            </View>
          ))}
        </View>
        <Text style={S.integrityNote}>
          08-12 BAR IS SHORT BECAUSE LOGGING STOPPED, NOT{'\n'}BECAUSE WORK STOPPED. 2 OF 4 SETS RECORDED.
        </Text>
      </View>
    </ScrollView>
  );
}

// --------------------------------------------------------------------- root

export default function DirectionThree() {
  const [screen, setScreen] = useState('LOG');
  const segs = ['LOG', 'REVIEW', 'TREND'];
  return (
    <View style={S.root}>
      <View style={S.statusStrip}>
        <Text style={S.statusItem}>
          <Text style={S.statusKey}>SESS </Text>
          {SESSION.code}
        </Text>
        <Text style={S.statusItem}>
          <Text style={S.statusKey}>UTC </Text>
          {SESSION.stamp}
        </Text>
        <Text style={S.statusItem}>
          <Text style={S.statusKey}>T+ </Text>
          {SESSION.elapsed}
        </Text>
      </View>
      <View style={S.segs}>
        {segs.map((s) => (
          <Pressable key={s} onPress={() => setScreen(s)} style={[S.seg, screen === s && S.segOn]}>
            <Text style={[S.segText, screen === s && S.segTextOn]}>{s}</Text>
          </Pressable>
        ))}
      </View>
      {screen === 'LOG' && <LogPanel />}
      {screen === 'REVIEW' && <ReviewPanel />}
      {screen === 'TREND' && <TrendPanel />}
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  statusStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: C.grid,
  },
  statusItem: { fontFamily: MONO, fontSize: 10, color: C.value, letterSpacing: 0.5 },
  statusKey: { color: C.dim },

  segs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.grid },
  seg: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRightWidth: 1, borderRightColor: C.grid },
  segOn: { backgroundColor: C.panel, borderBottomWidth: 2, borderBottomColor: C.value },
  segText: { fontFamily: MONO, fontSize: 11, color: C.dim, letterSpacing: 2 },
  segTextOn: { color: C.value },

  body: { flex: 1 },
  bodyPad: { padding: 10, paddingBottom: 60, gap: 10 },

  panel: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.grid, padding: 10 },
  panelHead: { borderBottomWidth: 1, borderBottomColor: C.grid, paddingBottom: 8, marginBottom: 10 },
  panelTitle: { fontFamily: MONO, fontSize: 12, color: C.value, letterSpacing: 1 },
  panelSub: { fontFamily: MONO, fontSize: 10, color: C.label, marginTop: 3, letterSpacing: 0.5 },

  readoutRow: { flexDirection: 'row', justifyContent: 'space-between' },
  fieldLabel: { fontFamily: MONO, fontSize: 9, color: C.dim, letterSpacing: 1.4 },
  fieldValue: { fontFamily: MONO, fontSize: 20, color: C.value, marginTop: 3 },
  fieldUnit: { fontFamily: MONO, fontSize: 9, color: C.label, letterSpacing: 1.2, marginTop: 1 },
  missing: { color: C.dim },
  missingUnit: { color: C.dim },
  warn: { color: C.warn },

  trow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 5 },
  thead: { borderBottomWidth: 1, borderBottomColor: C.gridBright, paddingBottom: 6, marginBottom: 2 },
  trowWarmup: { opacity: 0.72 },
  th: { fontFamily: MONO, fontSize: 9, color: C.dim, letterSpacing: 0.6, textAlign: 'right' },
  td: { fontFamily: MONO, fontSize: 12, color: C.value, textAlign: 'right' },
  tdDim: { color: C.label },
  tdMissing: { color: C.dim },

  stepper: { paddingVertical: 8 },
  stepperHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  stepperTarget: { fontFamily: MONO, fontSize: 10, color: C.label, letterSpacing: 0.8 },
  stepperBody: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  stepBtn: {
    width: 56,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.gridBright,
  },
  stepBtnText: { fontFamily: MONO, fontSize: 22, color: C.value },
  stepperReadout: { flex: 1, alignItems: 'center' },
  stepperValue: { fontFamily: MONO, fontSize: 34, color: C.value },
  stepperUnit: { fontFamily: MONO, fontSize: 9, color: C.label, letterSpacing: 1.6 },
  stepperDelta: { fontFamily: MONO, fontSize: 10, color: C.label, letterSpacing: 0.8, marginTop: 6 },
  hgrid: { height: 1, backgroundColor: C.grid },

  termGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  termCell: {
    width: '33.33%',
    paddingVertical: 10,
    paddingRight: 6,
    borderTopWidth: 1,
    borderTopColor: C.grid,
  },
  termCellOn: { borderTopColor: C.value },
  termCode: { fontFamily: MONO, fontSize: 14, color: C.dim, letterSpacing: 1 },
  termCodeOn: { color: C.value },
  termName: { fontFamily: MONO, fontSize: 8, color: C.dim, letterSpacing: 0.4, marginTop: 2 },
  termNameOn: { color: C.label },

  commit: {
    borderWidth: 1,
    borderColor: C.value,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: C.panel,
  },
  commitText: { fontFamily: MONO, fontSize: 15, color: C.value, letterSpacing: 3 },
  commitSub: { fontFamily: MONO, fontSize: 10, color: C.label, marginTop: 5, letterSpacing: 0.6 },

  integrity: { fontFamily: MONO, fontSize: 11, color: C.label, marginTop: 6, letterSpacing: 0.4 },
  integrityNote: { fontFamily: MONO, fontSize: 9, color: C.dim, marginTop: 10, lineHeight: 14, letterSpacing: 0.4 },

  chart: { flexDirection: 'row', height: 140, marginTop: 10, alignItems: 'flex-end' },
  chartCol: { flex: 1, alignItems: 'center' },
  chartTrack: {
    width: 18,
    height: 120,
    borderBottomWidth: 1,
    borderBottomColor: C.gridBright,
    justifyContent: 'flex-end',
  },
  chartBar: { width: 18, backgroundColor: C.label },
  chartBarPartial: { backgroundColor: C.warn },
  chartLabel: { fontFamily: MONO, fontSize: 8, color: C.dim, marginTop: 5 },
});
