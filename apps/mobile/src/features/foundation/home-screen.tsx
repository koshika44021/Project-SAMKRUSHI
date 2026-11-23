import { formatBusinessDate, toBusinessDate } from '@samkrushi/shared';
import Constants from 'expo-constants';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Phase 1 placeholder. The guest catalog, cart and serviceability flows
 * arrive in master Phase 5. The date shown here is device-local display
 * only — cutoffs and slots are always validated by the server.
 */
export function HomeScreen() {
  const appVariant = String(Constants.expoConfig?.extra?.appVariant ?? 'development');
  const today = formatBusinessDate(toBusinessDate(new Date()));

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text accessibilityRole="header" style={styles.title}>
          SAMKRUSHI
        </Text>
        <Text style={styles.body}>Fresh produce ordering is coming soon.</Text>
        <Text style={styles.meta} testID="business-date">
          {today}
        </Text>
        {appVariant !== 'production' ? (
          <Text style={styles.meta} testID="app-variant">
            Build: {appVariant}
          </Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F1F5F4' },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  title: { fontSize: 28, fontWeight: '700', color: '#14532D' },
  body: { fontSize: 16, color: '#334155', textAlign: 'center' },
  meta: { fontSize: 13, color: '#64748B' },
});
