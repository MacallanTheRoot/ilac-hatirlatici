import { useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { colors, fontSize, fontWeight, radius, spacing, touchTarget } from '@/theme/tokens';

const ROW_HEIGHT = 72;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const MINUTES = Array.from({ length: 60 }, (_, minute) => minute);

function label(value: number): string {
  return String(value).padStart(2, '0');
}

type WheelProps = {
  title: string;
  values: number[];
  selected: number;
  onSelect: (value: number) => void;
};

function Wheel({ title, values, selected, onSelect }: WheelProps) {
  const list = useRef<FlatList<number>>(null);

  function settle(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const index = Math.max(0, Math.min(values.length - 1,
      Math.round(event.nativeEvent.contentOffset.y / ROW_HEIGHT)));
    onSelect(values[index]);
  }

  return (
    <View style={styles.column}>
      <Text style={styles.columnTitle}>{title}</Text>
      <View style={styles.wheel}>
        <View pointerEvents="none" style={styles.selectionFrame} />
        <FlatList
          ref={list}
          data={values}
          keyExtractor={(value) => String(value)}
          initialScrollIndex={selected}
          getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
          contentContainerStyle={styles.wheelPadding}
          snapToInterval={ROW_HEIGHT}
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          onScrollEndDrag={settle}
          onMomentumScrollEnd={settle}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${title} ${label(item)}`}
              accessibilityState={{ selected: item === selected }}
              onPress={() => {
                list.current?.scrollToIndex({ index: item, animated: true });
                onSelect(item);
              }}
              style={styles.wheelRow}>
              <Text style={[styles.wheelNumber, item === selected && styles.selectedNumber]}>
                {item === selected ? '✓ ' : ''}{label(item)}
              </Text>
            </Pressable>
          )}
        />
      </View>
    </View>
  );
}

type Props = {
  visible: boolean;
  hour: number;
  minute: number;
  onCancel: () => void;
  onConfirm: (hour: number, minute: number) => void;
};

export function TimeWheelPicker({ visible, hour, minute, onCancel, onConfirm }: Props) {
  // The parent mounts this picker for the selected schedule. Draft values are
  // committed only when Tamam is pressed.
  const [selectedHour, setSelectedHour] = useState(hour);
  const [selectedMinute, setSelectedMinute] = useState(minute);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <Text accessibilityRole="header" style={styles.title}>Hatırlatma saati</Text>
          <Text style={styles.current}>{label(selectedHour)}:{label(selectedMinute)}</Text>
          <View style={styles.columns}>
            <Wheel title="SAAT" values={HOURS} selected={selectedHour} onSelect={setSelectedHour} />
            <Wheel title="DAKİKA" values={MINUTES} selected={selectedMinute} onSelect={setSelectedMinute} />
          </View>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelText}>İptal</Text>
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.confirmButton}
              onPress={() => onConfirm(selectedHour, selectedMinute)}>
              <Text style={styles.confirmText}>Tamam</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(12, 28, 48, 0.65)',
    justifyContent: 'center',
    padding: spacing.medium,
  },
  dialog: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.medium,
    gap: spacing.medium,
  },
  title: { color: colors.text, fontSize: 24, fontWeight: fontWeight.bold, textAlign: 'center' },
  current: { color: colors.text, fontSize: 36, fontWeight: fontWeight.bold, textAlign: 'center' },
  columns: { flexDirection: 'row', gap: spacing.medium },
  column: { flex: 1, minWidth: 0 },
  columnTitle: {
    color: colors.text,
    fontSize: fontSize.body,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  wheel: { height: ROW_HEIGHT * 5, overflow: 'hidden' },
  wheelPadding: { paddingVertical: ROW_HEIGHT * 2 },
  selectionFrame: {
    position: 'absolute', top: ROW_HEIGHT * 2, left: 0, right: 0,
    height: ROW_HEIGHT,
    borderColor: colors.accent,
    borderWidth: 2,
    borderRadius: radius.button,
    backgroundColor: '#EAF3FC',
  },
  wheelRow: { height: ROW_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  wheelNumber: { color: colors.secondaryText, fontSize: 28, fontWeight: fontWeight.regular },
  selectedNumber: { color: colors.text, fontWeight: fontWeight.bold },
  actions: { flexDirection: 'row', gap: spacing.small },
  cancelButton: {
    flex: 1, minHeight: touchTarget.primary, justifyContent: 'center', alignItems: 'center',
    borderColor: colors.border, borderWidth: 1, borderRadius: radius.button,
  },
  cancelText: { color: colors.text, fontSize: fontSize.body, fontWeight: fontWeight.semibold },
  confirmButton: {
    flex: 1, minHeight: touchTarget.primary, justifyContent: 'center', alignItems: 'center',
    backgroundColor: colors.accent, borderRadius: radius.button,
  },
  confirmText: { color: colors.surface, fontSize: fontSize.body, fontWeight: fontWeight.bold },
});
