/**
 * Scaffolding only. This switcher is deliberately unstyled — it is not one of
 * the directions and should not be read as design work. It exists so the five
 * prototypes can be reached from one build.
 */

import { useState } from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';

import DirectionOne from './DirectionOne';
import DirectionTwo from './DirectionTwo';
import DirectionThree from './DirectionThree';
import DirectionFour from './DirectionFour';
import DirectionFive from './DirectionFive';

const DIRECTIONS = [
  ['One - terminal', DirectionOne],
  ['Two - notebook', DirectionTwo],
  ['Three - instrument', DirectionThree],
  ['Four - thumb', DirectionFour],
  ['Five - diff', DirectionFive],
];

export default function App() {
  const [open, setOpen] = useState(null);

  if (open === null) {
    return (
      <View style={styles.root}>
        <StatusBar barStyle="dark-content" backgroundColor="#cccccc" />
        <ScrollView contentContainerStyle={styles.menu}>
          <Text style={styles.menuTitle}>directions</Text>
          {DIRECTIONS.map(([label], i) => (
            <Pressable key={label} onPress={() => setOpen(i)}>
              <Text style={styles.link}>{label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  }

  const Current = DIRECTIONS[open][1];

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#cccccc" />
      <View style={styles.bar}>
        <Pressable onPress={() => setOpen(null)} hitSlop={10}>
          <Text style={styles.back}>{'<'} menu</Text>
        </Pressable>
        <Text style={styles.barLabel}>{DIRECTIONS[open][0]}</Text>
      </View>
      <View style={styles.stage}>
        <Current />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#cccccc', paddingTop: StatusBar.currentHeight || 0 },
  menu: { padding: 20 },
  menuTitle: { fontSize: 14, color: '#333333', marginBottom: 12 },
  link: { fontSize: 18, color: '#0000ee', textDecorationLine: 'underline', paddingVertical: 12 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 10,
    height: 30,
    backgroundColor: '#cccccc',
  },
  back: { fontSize: 13, color: '#0000ee', textDecorationLine: 'underline' },
  barLabel: { fontSize: 12, color: '#333333' },
  stage: { flex: 1 },
});
