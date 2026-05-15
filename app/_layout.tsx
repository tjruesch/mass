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

  // Seed singleton rows once migrations succeed so screens can assume they exist.
  useEffect(() => {
    if (!migrationsReady) return;
    getFastingPreferences().catch((err) => {
      console.warn('Failed to seed fasting preferences:', err);
    });
    getWaterPreferences().catch((err) => {
      console.warn('Failed to seed water preferences:', err);
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
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal', headerShown: true }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
