import { Link } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { getDoseLogsForRange } from '@/db/doseLogs';
import { createMedication } from '@/db/medications';
import { openReminderSoundSettings } from '@/notifications/channelSettings';
import { getMedicationReminderInventory, syncMedicationReminders } from '@/notifications/scheduler';
import { localDayOffset, localDayStart, weekdayBitForDate } from '@/services/doseOccurrences';
import { colors, fontSize, fontWeight, radius, spacing, touchTarget } from '@/theme/tokens';

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const [diagnostics, setDiagnostics] = useState('');
  const [inspecting, setInspecting] = useState(false);
  const [soundError, setSoundError] = useState(false);

  async function chooseSound() {
    setSoundError(false);
    try {
      const opened = await openReminderSoundSettings();
      if (opened === 'app') setSoundError(true);
    } catch (cause) {
      console.error('Could not open medication sound settings:', cause);
      setSoundError(true);
    }
  }

  async function inspectReminders() {
    if (inspecting) return;
    setInspecting(true);
    try {
      const sync = await syncMedicationReminders(db);
      const inventory = await getMedicationReminderInventory();
      const today = localDayStart(new Date());
      const logs = await getDoseLogsForRange(
        db, localDayOffset(today, -7).getTime(), localDayOffset(today, 91).getTime(),
      );
      const snoozes = inventory.filter((item) => item.kind === 'snooze');
      console.info('Development reminder summary:', {
        sync,
        scheduledCount: inventory.length,
        snoozes,
        doseLogCount: logs.length,
      });
      setDiagnostics([
        `Durum: ${sync.status}; istenen: ${sync.desiredCount}; korunan: ${sync.retainedCount}; yeni: ${sync.newlyScheduledCount}; hata: ${sync.failureCount}`,
        `Planlanmış bildirim: ${inventory.length}; erteleme: ${snoozes.length}`,
        ...[...snoozes, ...inventory.filter((item) => item.kind === 'dose').slice(0, 8)].map((item) =>
          `${item.identifier} | ${item.kind} | m${item.medicationId} s${item.scheduleId} | ${new Date(item.scheduledAt).toLocaleString('tr-TR')} | ${JSON.stringify(item.trigger)}`),
        inventory.length > 8 + snoozes.length ? 'Diğer bildirimler geliştirici görünümünde gizlendi.' : '',
        `Doz kaydı: ${logs.length}`,
        ...logs.map((log) =>
          `log${log.id} m${log.medicationId} s${log.scheduleId} ${new Date(log.scheduledAt).toLocaleString('tr-TR')} ${log.status} takenAt=${log.takenAt ?? 'yok'}`),
      ].join('\n'));
    } catch (cause) {
      console.error('Could not inspect development reminders:', cause);
      setDiagnostics('Bildirim denetimi başarısız.');
    } finally {
      setInspecting(false);
    }
  }

  async function createDevelopmentReminder(minutesAhead = 2) {
    // DEV only: exercises real medication persistence and reconciliation.
    // Clear this Xiaomi test install's app data after acceptance testing.
    if (inspecting) return;
    setInspecting(true);
    try {
      const target = new Date(Date.now() + minutesAhead * 60_000);
      target.setSeconds(0, 0);
      const id = await createMedication(db, {
        name: 'BİLDİRİM TESTİ',
        dosage: 'Test',
        instructions: 'Geliştirici testi; gerçek ilaç değildir.',
        photoPath: null,
        schedules: [{
          hour: target.getHours(),
          minute: target.getMinutes(),
          weekdayMask: weekdayBitForDate(target),
        }],
      });
      const result = await syncMedicationReminders(db);
      setDiagnostics(`Test kaydı ${id}; hedef ${target.toLocaleString('tr-TR')}; bildirim durumu ${result.status}.`);
    } catch (cause) {
      console.error('Could not create development reminder:', cause);
      setDiagnostics('Test hatırlatması oluşturulamadı.');
    } finally {
      setInspecting(false);
    }
  }

  return (
    <Screen>
      <Link href="/" asChild>
        <Pressable accessibilityRole="button" style={styles.backButton}>
          <Text style={styles.backText}>Geri</Text>
        </Pressable>
      </Link>
      <Text accessibilityRole="header" style={styles.title}>Ayarlar</Text>
      <View style={styles.card}>
        <Text style={styles.description}>Alarm sesi</Text>
        <Text style={styles.help}>Tüm ilaç hatırlatmaları aynı telefon sesini kullanır.</Text>
        <Pressable accessibilityRole="button" style={styles.soundButton}
          onPress={() => { void chooseSound(); }}>
          <Text style={styles.backText}>Ses seç</Text>
        </Pressable>
        {soundError ? (
          <Text style={styles.help}>
            Bildirimler bölümünde İlaç hatırlatmaları kanalının Ses ayarını açın.
          </Text>
        ) : null}
      </View>
      {__DEV__ ? (
        <View style={styles.card}>
          <Text style={styles.description}>Geliştirici bildirim denetimi</Text>
          <Pressable accessibilityRole="button" disabled={inspecting} style={styles.inspectButton}
            onPress={() => { void inspectReminders(); }}>
            <Text style={styles.backText}>{inspecting ? 'Denetleniyor…' : 'Bildirimleri denetle'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={inspecting} style={styles.inspectButton}
            onPress={() => { void createDevelopmentReminder(2); }}>
            <Text style={styles.backText}>2 dk test hatırlatması oluştur</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={inspecting} style={styles.inspectButton}
            onPress={() => { void createDevelopmentReminder(4); }}>
            <Text style={styles.backText}>4 dk yeniden başlatma testi oluştur</Text>
          </Pressable>
          <ScrollView style={styles.inventory}>
            <Text selectable style={styles.inventoryText}>{diagnostics}</Text>
          </ScrollView>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignSelf: 'flex-start',
    minHeight: touchTarget.minimum,
    justifyContent: 'center',
    paddingHorizontal: spacing.medium,
    marginLeft: -spacing.medium,
    borderRadius: radius.button,
  },
  backText: {
    color: colors.accent,
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
    marginTop: spacing.small,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.large,
    marginTop: spacing.xlarge,
  },
  description: {
    color: colors.text,
    fontSize: fontSize.body,
  },
  help: { color: colors.secondaryText, fontSize: fontSize.body, marginTop: spacing.small },
  soundButton: { minHeight: touchTarget.primary, borderColor: colors.accent, borderWidth: 1,
    borderRadius: radius.button, alignItems: 'center', justifyContent: 'center',
    marginTop: spacing.medium },
  inspectButton: {
    minHeight: touchTarget.minimum,
    justifyContent: 'center',
    marginTop: spacing.medium,
  },
  inventory: { maxHeight: 300, marginTop: spacing.medium },
  inventoryText: { color: colors.text, fontSize: 16 },
});
