import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fonts, textStyles, tokens } from '@/theme/tokens';

import { DateTimePickerSheet } from './datetime-picker-sheet';

type Mode = 'date' | 'time' | 'datetime';

type Props = {
  /** Current value of the field. */
  value: Date;
  /** Called when the user taps Apply on the picker sheet. */
  onChange: (next: Date) => void;
  /** Small caps label rendered above the value. */
  label?: string;
  /** Picker mode. Defaults to 'datetime' (date + time wheels). */
  mode?: Mode;
  /** Sheet header title. Falls back to `label` when omitted. */
  title?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  /** Override the display formatter. Default formats based on `mode`. */
  formatValue?: (value: Date) => string;
  /** Visual treatment of the value text — 'over' tints accent ink (e.g. for validation issues). */
  valueTone?: 'normal' | 'over';
};

/**
 * Tap-to-edit datetime card. Composes `DateTimePickerSheet` with a labeled
 * pressable, exposing a controlled `value` / `onChange` interface so it
 * drops into any form. Owns the sheet's open/close state internally.
 */
export function DateTimeField({
  value,
  onChange,
  label,
  mode = 'datetime',
  title,
  minimumDate,
  maximumDate,
  formatValue,
  valueTone = 'normal',
}: Props) {
  const [open, setOpen] = useState(false);

  const formatted = formatValue ? formatValue(value) : defaultFormat(value, mode);

  return (
    <View>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label ? `Edit ${label}` : 'Edit date'}
        style={({ pressed }) => [styles.field, pressed && { opacity: 0.92 }]}>
        {label && <Text style={[styles.label, textStyles.cap]}>{label}</Text>}
        <Text
          style={[
            styles.value,
            textStyles.tnum,
            valueTone === 'over' && { color: tokens.accentInk },
          ]}>
          {formatted}
        </Text>
      </Pressable>

      <DateTimePickerSheet
        open={open}
        value={value}
        mode={mode}
        title={title ?? (label ? capitalize(label) : undefined)}
        minimumDate={minimumDate}
        maximumDate={maximumDate}
        onApply={(d) => {
          onChange(d);
          setOpen(false);
        }}
        onCancel={() => setOpen(false)}
      />
    </View>
  );
}

const DATE_FMT = new Intl.DateTimeFormat('en', { weekday: 'short', day: '2-digit', month: 'short' });

function defaultFormat(d: Date, mode: Mode): string {
  const time = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  if (mode === 'time') return time;
  const date = DATE_FMT.format(d).toLowerCase();
  if (mode === 'date') return date;
  return `${date} · ${time}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  field: {
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    shadowOpacity: 0.02,
  },
  label: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    letterSpacing: 1.98,
    marginBottom: 4,
  },
  value: {
    fontFamily: fonts.monoMedium,
    fontSize: 16,
    color: tokens.ink,
    letterSpacing: -0.32,
  },
});
