import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Dialog } from 'react-native-paper';
import { ChevronDown } from 'lucide-react-native';
import { SvgXml } from 'react-native-svg';
import { PHONE_COUNTRIES } from '@hydrosense/shared';
import type { PhoneCountryCode } from '@hydrosense/shared';
import { authColors, uiScale, useTheme } from '../theme';
import { Button, createFormStyles, GlassDialog } from './ui';

interface PhoneFieldProps {
  label: string;
  value: string;
  country: PhoneCountryCode;
  onChange: (value: string) => void;
  onCountryChange: (country: PhoneCountryCode) => void;
  auth?: boolean;
}

export function PhoneField({ label, value, country, onChange, onCountryChange, auth = false }: PhoneFieldProps) {
  const { colors } = useTheme();
  const ui = createFormStyles(colors);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [focused, setFocused] = useState(false);
  const selected = PHONE_COUNTRIES.find((item) => item.code === country);
  if (!selected) throw new Error(`Unknown phone country: ${country}`);
  const query = search.trim().toLowerCase();
  const options = PHONE_COUNTRIES.filter((item) => `${item.name} ${item.code} ${item.callingCode}`.toLowerCase().includes(query));
  return <View style={[ui.formField, auth && { marginBottom: 0 }]}>
    <Text style={[ui.label, auth && { color: authColors.ink }]}>{label}</Text>
    <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: auth ? 0 : 1, borderBottomWidth: 1, borderColor: auth ? focused ? authColors.focus : authColors.border : colors.border, borderRadius: auth ? 0 : 12, backgroundColor: auth ? 'transparent' : colors.surface }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label} country code: ${selected.name} ${selected.callingCode}`}
        accessibilityState={{ expanded: open }} aria-expanded={open} onPress={() => { setSearch(''); setOpen(true); }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48, paddingHorizontal: 10, borderRightWidth: 1, borderRightColor: colors.border }}>
        <SvgXml xml={selected.flag} width={22} height={15} />
        <Text style={{ color: auth ? authColors.ink : colors.ink, fontSize: uiScale.type.body }}>{selected.callingCode}</Text>
        <ChevronDown size={16} color={auth ? authColors.placeholder : colors.muted} />
      </Pressable>
      <TextInput accessibilityLabel={label} style={[ui.input, { flex: 1, minWidth: 0, borderWidth: 0, backgroundColor: 'transparent' }, auth && { color: authColors.ink, paddingHorizontal: uiScale.spacing[2] }]} value={value} onChangeText={onChange}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        placeholder="National number" placeholderTextColor={auth ? authColors.placeholder : colors.muted} keyboardType="phone-pad" autoComplete="tel-national" />
    </View>
      <GlassDialog visible={open} onDismiss={() => setOpen(false)}>
        <Dialog.Title style={{ marginTop: 24 }}>Select Country</Dialog.Title>
        <Dialog.Content>
          <TextInput accessibilityLabel={`Search ${label.toLowerCase()} countries`} style={ui.input} value={search}
            onChangeText={setSearch} placeholder="Search country or calling code" placeholderTextColor={colors.muted} autoCorrect={false} />
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 300, marginTop: 8 }} accessibilityLabel={`${label} country options`}>
            {options.length === 0 && <Text style={{ color: colors.muted, padding: 12 }}>No countries found.</Text>}
            {options.map((item) => <Pressable key={item.code} accessibilityRole="radio" accessibilityState={{ checked: item.code === country }}
              aria-checked={item.code === country} onPress={() => { onCountryChange(item.code); setOpen(false); }}
              style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: item.code === country ? colors.selected : 'transparent' }}>
              <Text style={{ color: item.code === country ? colors.teal : colors.ink, fontSize: uiScale.type.body }}>{item.name} ({item.callingCode})</Text>
            </Pressable>)}
          </ScrollView>
        </Dialog.Content>
        <Dialog.Actions><Button label="Cancel" secondary onPress={() => setOpen(false)} /></Dialog.Actions>
      </GlassDialog>
  </View>;
}
