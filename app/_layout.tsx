import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
} from '@expo-google-fonts/jetbrains-mono';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { db, migrations, useMigrations } from '@/src/db';
import { getPreferences as getFastingPreferences } from '@/src/db/queries/fasting-preferences';
import { getPreferences as getWaterPreferences } from '@/src/db/queries/water-preferences';
import { getPreferences as getWeightPreferences } from '@/src/db/queries/weight-preferences';
import { getPreferences as getWorkoutPreferences } from '@/src/db/queries/workout-preferences';
import { seedBuiltinWorkoutTypes } from '@/src/db/queries/workout-types';
import {
  backfillLegacyActivityKeys,
  resetWorkoutsCursorForUnitsFix,
} from '@/src/db/queries/workouts';
import { useWeightAutoSync } from '@/src/hooks/use-weight-sync';
import { useWorkoutAutoSync } from '@/src/hooks/use-workout-sync';
import { tokens } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold,
  });
  const { success: migrationsReady, error: migrationsError } = useMigrations(db, migrations);

  // Pulls HK body-mass + workout samples into the local mirror on
  // auth-granted + every app foreground. Gated on migrations so the
  // query layer has tables to write into.
  useWeightAutoSync({ enabled: migrationsReady });
  useWorkoutAutoSync({ enabled: migrationsReady });

  // Seed singleton rows once migrations succeed so screens can assume they exist.
  useEffect(() => {
    if (!migrationsReady) return;
    getFastingPreferences().catch((err) => {
      console.warn('Failed to seed fasting preferences:', err);
    });
    getWaterPreferences().catch((err) => {
      console.warn('Failed to seed water preferences:', err);
    });
    getWeightPreferences().catch((err) => {
      console.warn('Failed to seed weight preferences:', err);
    });
    getWorkoutPreferences().catch((err) => {
      console.warn('Failed to seed workout preferences:', err);
    });
    seedBuiltinWorkoutTypes().catch((err) => {
      console.warn('Failed to seed workout types:', err);
    });
    backfillLegacyActivityKeys().catch((err) => {
      console.warn('Failed to backfill legacy activity keys:', err);
    });
    resetWorkoutsCursorForUnitsFix().catch((err) => {
      console.warn('Failed to reset workouts cursor for units fix:', err);
    });
  }, [migrationsReady]);

  useEffect(() => {
    if ((fontsLoaded || fontError) && (migrationsReady || migrationsError)) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, migrationsReady, migrationsError]);

  if (migrationsError) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: tokens.bg }}>
        <Text style={{ color: tokens.ink, fontSize: 14 }}>
          Database failed to initialize: {migrationsError.message}
        </Text>
      </View>
    );
  }

  if (!fontsLoaded && !fontError) return null;
  if (!migrationsReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="fasting" />
          <Stack.Screen name="fasting-settings" />
          <Stack.Screen name="water" />
          <Stack.Screen name="water-settings" />
          <Stack.Screen name="weight" />
          <Stack.Screen name="weight-settings" />
          <Stack.Screen name="workouts" />
          <Stack.Screen name="workouts-settings" />
          <Stack.Screen name="workout-type/[id]" />
          <Stack.Screen name="pantry/index" />
          <Stack.Screen name="pantry/[id]" />
          <Stack.Screen name="meals/index" />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal', headerShown: true }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
