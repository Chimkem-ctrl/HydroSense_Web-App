import { useEffect, useState } from 'react';
import { FlatList, Linking, Pressable, Text, TextInput, View, useWindowDimensions } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Dialog } from 'react-native-paper';
import { ChevronDown, Eye, EyeOff } from 'lucide-react-native';
import { ADDRESS_PROVINCES, EMPTY_SIGNUP_ADDRESS, addressBarangays, addressCities, formatSignupPhone } from '@hydrosense/shared';
import type { PhoneCountryCode } from '@hydrosense/shared';
import type { RootStackParamList } from './navigation';
import { Brand, Button, Card, createFormStyles, GlassDialog, Page } from './components/ui';
import { PhoneField } from './components/PhoneField';
import { authColors, uiScale, useTheme } from './theme';
import { useSession } from './state';
import { API_BASE_URL, API_KEY } from './services/client';
import { authenticate, HATCHERIES, requestAccount, requestPasswordReset, resendVerification, validateSignIn } from './services/auth';
import type { SignUpValues } from './services/auth';

type Props<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;

function AuthField({ label, value, onChange, placeholder, secure, keyboard }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  secure?: boolean;
  keyboard?: 'default' | 'email-address' | 'phone-pad';
}) {
  const { colors } = useTheme();
  const ui = createFormStyles(colors);
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState(false);
  return <View style={[ui.formField, { marginBottom: 0 }]}>
    <Text style={[ui.label, { color: authColors.ink }]}>{label}</Text>
    <View style={{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: focused ? authColors.focus : authColors.border }}>
      <TextInput accessibilityLabel={label} style={[ui.input, { flex: 1, borderWidth: 0, borderRadius: 0, paddingHorizontal: 0, color: authColors.ink, backgroundColor: 'transparent' }]} value={value} onChangeText={onChange}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        placeholder={placeholder} placeholderTextColor={authColors.placeholder} keyboardType={keyboard ?? 'default'} secureTextEntry={secure && !showPassword}
        autoCapitalize={secure || keyboard === 'email-address' ? 'none' : 'sentences'}
        autoCorrect={!secure && keyboard !== 'email-address'} />
      {secure && <Pressable accessibilityRole="button" accessibilityLabel={`${showPassword ? 'Hide' : 'Show'} ${label.toLowerCase()}`} onPress={() => setShowPassword((shown) => !shown)} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
        {showPassword ? <EyeOff size={20} color={authColors.placeholder} /> : <Eye size={20} color={authColors.placeholder} />}
      </Pressable>}
    </View>
  </View>;
}

function AuthIntro({ title, detail, formTitle }: { title: string; detail?: string; formTitle?: string }) {
  return <>
    <Brand auth />
    <View style={{ gap: uiScale.spacing[3] }}>
      <Text style={{ color: authColors.ink, fontSize: 28, lineHeight: 34, fontWeight: '700' }}>{title}</Text>
      {detail && <Text style={{ color: authColors.muted, fontSize: uiScale.type.body, lineHeight: 25 }}>{detail}</Text>}
    </View>
    {formTitle && <Text style={{ color: authColors.ink, fontSize: 20, fontWeight: '600' }}>{formTitle}</Text>}
  </>;
}

function Message({ text }: { text: string }) {
  const { colors } = useTheme();
  return text ? <Text accessibilityRole="alert" style={{ color: colors.critical, fontSize: uiScale.type.caption, lineHeight: 18 }}>{text}</Text> : null;
}

function AddressPicker({ label, value, options, disabled, onChange }: { label: string; value: string; options: readonly { id: string; name: string }[]; disabled?: boolean; onChange: (value: string) => void }) {
  const { colors } = useTheme();
  const ui = createFormStyles(colors);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = options.find((option) => option.id === value);
  return <View style={[ui.formField, { marginBottom: 0 }]}>
    <Text style={[ui.label, { color: authColors.ink }]}>{label}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${selected?.name ?? 'Select'}`} accessibilityState={{ disabled, expanded: open }} disabled={disabled}
      onPress={() => { setSearch(''); setOpen(true); }} style={[ui.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', opacity: disabled ? 0.5 : 1, borderWidth: 0, borderBottomWidth: 1, borderColor: authColors.border, borderRadius: 0, paddingHorizontal: 0, backgroundColor: 'transparent' }]}>
      <Text style={{ color: selected ? authColors.ink : authColors.placeholder, flex: 1 }}>{selected?.name ?? `Select ${label.toLowerCase()}`}</Text><ChevronDown size={20} color={authColors.placeholder} />
    </Pressable>
    <GlassDialog visible={open} onDismiss={() => setOpen(false)}>
      <Dialog.Title style={{ marginTop: 24 }}>{label}</Dialog.Title><Dialog.Content>
        <TextInput accessibilityLabel={`Search ${label}`} style={ui.input} value={search} onChangeText={setSearch} placeholder="Search" placeholderTextColor={colors.muted} />
        <FlatList style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled" data={options.filter((option) => option.name.toLowerCase().includes(search.toLowerCase()))}
          keyExtractor={(item) => item.id} renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => { onChange(item.id); setOpen(false); }} style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: uiScale.spacing[4] }}><Text style={{ color: colors.ink, fontSize: uiScale.type.body }}>{item.name}</Text></Pressable>} />
      </Dialog.Content><Dialog.Actions><Button label="Cancel" secondary onPress={() => setOpen(false)} /></Dialog.Actions>
    </GlassDialog>
  </View>;
}

export function LoginScreen({ navigation, route }: Props<'Login'>) {
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    const issue = validateSignIn(email, password);
    if (issue) { setError(issue); return; }
    setError('');
    setBusy(true);
    try {
      const result = await authenticate(API_BASE_URL, API_KEY, email, password);
      if ('status' in result) navigation.navigate('PendingApproval');
      else await signIn(result.user, result.accessToken);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return <Page auth>
    <Card auth>
      <AuthIntro title="Welcome Back" detail="Sign in to manage water quality monitoring and keep your hatchery records up to date." formTitle="Sign in" />
      {route.params?.verified === '1' && <Text accessibilityLiveRegion="polite" style={{ color: authColors.accent }}>Email verified. You can now sign in.</Text>}
      {DATA_MODE === 'mock' && <Text style={{ color: authColors.muted }}>Sign in with your account. Monitoring data in this preview is sample data.</Text>}
        <AuthField label="Email" value={email} onChange={setEmail} keyboard="email-address" placeholder="Enter your email" />
        <AuthField label="Password" value={password} onChange={setPassword} secure placeholder="Enter your password" />
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => navigation.navigate('ForgotPassword')} style={{ minHeight: 48, alignSelf: 'flex-end', justifyContent: 'center', paddingHorizontal: uiScale.spacing[2] }}><Text style={{ color: authColors.accent, fontWeight: '700' }}>Forgot password?</Text></Pressable>
        <Button label={busy ? 'Signing in…' : 'Sign in'} disabled={busy} onPress={() => void submit()} />
        <Pressable accessibilityRole="link" accessibilityLabel="New here? Sign up" disabled={busy} onPress={() => navigation.navigate('SignUp')} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: authColors.muted, textAlign: 'center', fontSize: 14 }}>New here? <Text style={{ color: authColors.accent, fontWeight: '700' }}>Sign up</Text></Text>
        </Pressable>
      <Message text={error} />
    </Card>
  </Page>;
}

const initialValues: SignUpValues = {
  firstName: '', lastName: '', employeeId: '', phone: '', email: '',
  hatcheryId: '', requestedRole: 'operator', address: EMPTY_SIGNUP_ADDRESS, emergencyContactName: '',
  emergencyContactPhone: '', password: '', confirmPassword: '', termsAccepted: false,
};

export function SignUpScreen({ navigation }: Props<'SignUp'>) {
  const { colors } = useTheme();
  const ui = createFormStyles(colors);
  const { width } = useWindowDimensions();
  const [values, setValues] = useState<SignUpValues>(initialValues);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showTerms, setShowTerms] = useState(false);
  const [hatcheryOpen, setHatcheryOpen] = useState(false);
  const [phoneCountry, setPhoneCountry] = useState<PhoneCountryCode>('PH');
  const [emergencyCountry, setEmergencyCountry] = useState<PhoneCountryCode>('PH');
  function setField<K extends keyof SignUpValues>(key: K, value: SignUpValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setError('');
  }
  async function submit() {
    setError('');
    setBusy(true);
    try {
      const phone = formatSignupPhone(phoneCountry, values.phone);
      const emergencyContactPhone = formatSignupPhone(emergencyCountry, values.emergencyContactPhone);
      if (values.phone.trim() && !phone) throw new Error('Enter a valid national contact number for the selected country.');
      if (values.emergencyContactPhone.trim() && !emergencyContactPhone) throw new Error('Enter a valid national emergency contact number for the selected country.');
      const result = await requestAccount(API_BASE_URL, API_KEY, { ...values, phone: phone ?? '', emergencyContactPhone: emergencyContactPhone ?? '' });
      if (result.status === 'verify-email') navigation.replace('VerifyEmail', { email: result.email });
      else navigation.replace('PendingApproval');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return <Page auth>
    <Card auth>
      <AuthIntro title="Let's Get Started" detail="Create a HydroSense account to monitor water quality and work with your hatchery team." formTitle="Sign up" />
      <View style={{ flexDirection: width >= 600 ? 'row' : 'column', gap: 12 }}>
        <View style={{ flex: 1 }}><AuthField label="First name" value={values.firstName} onChange={(v) => setField('firstName', v)} placeholder="First name" /></View>
        <View style={{ flex: 1 }}><AuthField label="Last name" value={values.lastName} onChange={(v) => setField('lastName', v)} placeholder="Last name" /></View>
      </View>
      <AuthField label="Employee / staff ID" value={values.employeeId} onChange={(v) => setField('employeeId', v)} placeholder="Employee / staff ID" />
      <PhoneField auth label="Contact number" value={values.phone} country={phoneCountry} onChange={(v) => setField('phone', v)} onCountryChange={(country) => { setPhoneCountry(country); setError(''); }} />
      <AuthField label="Work email" value={values.email} onChange={(v) => setField('email', v)} keyboard="email-address" placeholder="name@example.com" />
      <View style={ui.formField}>
        <Text style={[ui.label, { color: authColors.ink }]}>Subscribed hatchery</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Subscribed hatchery: ${HATCHERIES.find((item) => item.id === values.hatcheryId)?.name ?? 'Select a subscribed hatchery'}`}
          accessibilityValue={{ text: HATCHERIES.find((item) => item.id === values.hatcheryId)?.name ?? 'Select a subscribed hatchery' }}
          accessibilityState={{ expanded: hatcheryOpen }}
          aria-expanded={hatcheryOpen}
          onPress={() => setHatcheryOpen((open) => !open)}
          style={[ui.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderWidth: 0, borderBottomWidth: 1, borderColor: authColors.border, borderRadius: 0, paddingHorizontal: 0, backgroundColor: 'transparent' }]}
        >
          <Text style={{ color: values.hatcheryId ? authColors.ink : authColors.placeholder, fontSize: 16, flex: 1 }}>
            {HATCHERIES.find((item) => item.id === values.hatcheryId)?.name ?? 'Select a subscribed hatchery'}
          </Text>
          <ChevronDown size={20} color={authColors.placeholder} />
        </Pressable>
        {hatcheryOpen && <View accessibilityRole="radiogroup" accessibilityLabel="Subscribed hatchery options" style={{ backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderRadius: 12, overflow: 'hidden' }}>
          {[{ id: '', name: 'Select a subscribed hatchery' }, ...HATCHERIES].map((hatchery) => <Pressable
            key={hatchery.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: values.hatcheryId === hatchery.id }}
            aria-checked={values.hatcheryId === hatchery.id}
            onPress={() => { setField('hatcheryId', hatchery.id); setHatcheryOpen(false); }}
            style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: values.hatcheryId === hatchery.id ? colors.selected : 'transparent' }}
          >
            <Text style={{ color: values.hatcheryId === hatchery.id ? colors.teal : authColors.ink, fontSize: 15 }}>{hatchery.name}</Text>
          </Pressable>)}
        </View>}
      </View>
      <AddressPicker label="Requested role" value={values.requestedRole} options={[
        { id: 'admin', name: 'Admin' }, { id: 'manager', name: 'Manager' }, { id: 'operator', name: 'Operator' },
      ]} onChange={(requestedRole) => setField('requestedRole', requestedRole as SignUpValues['requestedRole'])} />
      <AddressPicker label="Country" value={values.address.country} options={[{ id: 'PH', name: 'Philippines' }]} onChange={(country) => setField('address', { ...values.address, country, province: '', city: '', barangay: '' })} />
      <AddressPicker label="Province / region" value={values.address.province} disabled={!values.address.country} options={ADDRESS_PROVINCES} onChange={(province) => setField('address', { ...values.address, province, city: '', barangay: '' })} />
      <AddressPicker label="City / municipality / district" value={values.address.city} disabled={!values.address.province} options={addressCities(values.address.province)} onChange={(city) => setField('address', { ...values.address, city, barangay: '' })} />
      <AddressPicker label="Barangay" value={values.address.barangay} disabled={!values.address.city} options={addressBarangays(values.address.city)} onChange={(barangay) => setField('address', { ...values.address, barangay })} />
      <AuthField label="Street address" value={values.address.street} onChange={(street) => setField('address', { ...values.address, street })} placeholder="House number and street" />
      <AuthField label="Emergency contact name" value={values.emergencyContactName} onChange={(v) => setField('emergencyContactName', v)} placeholder="Full name" />
      <PhoneField auth label="Emergency contact number" value={values.emergencyContactPhone} country={emergencyCountry} onChange={(v) => setField('emergencyContactPhone', v)} onCountryChange={(country) => { setEmergencyCountry(country); setError(''); }} />
      <AuthField label="Password" value={values.password} onChange={(v) => setField('password', v)} secure placeholder="At least 8 characters" />
      <AuthField label="Confirm password" value={values.confirmPassword} onChange={(v) => setField('confirmPassword', v)} secure placeholder="Re-enter your password" />
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: uiScale.spacing[1] }}>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: values.termsAccepted }} onPress={() => setField('termsAccepted', !values.termsAccepted)} style={{ minHeight: 48, justifyContent: 'center', paddingVertical: uiScale.spacing[2] }}>
          <Text style={{ color: authColors.ink }}>{values.termsAccepted ? '[x]' : '[ ]'} I have read and agree to the</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setShowTerms(true)} style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: uiScale.spacing[2] }}><Text style={{ color: authColors.accent, fontWeight: '700' }}>Terms and Conditions</Text></Pressable>
      </View>
      <Message text={error} />
      <Button label={busy ? 'Submitting…' : 'Sign up'} disabled={busy} onPress={() => void submit()} />
      <Pressable accessibilityRole="link" accessibilityLabel="Already a member? Sign in here" disabled={busy} onPress={() => navigation.navigate('Login')} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: authColors.muted, textAlign: 'center' }}>Already a member? <Text style={{ color: authColors.accent, fontWeight: '700' }}>Sign in here</Text></Text>
      </Pressable>
    </Card>
    <GlassDialog visible={showTerms} onDismiss={() => setShowTerms(false)}>
      <Dialog.Title style={{ marginTop: 24 }}>Terms and Conditions</Dialog.Title>
      <Dialog.Content>
        <Text>The web app currently provides the following demo terms:</Text>
        <Text style={{ marginTop: 10 }}>This is a demonstration application. Account details and password hashes are saved in this browser only. There is no server-side authentication or account recovery. Do not enter real passwords or sensitive personal information.</Text>
        <Text style={{ marginTop: 10, color: colors.critical }}>These demo terms do not describe this mobile form: it sends account details to the configured backend. Production terms have not been provided.</Text>
      </Dialog.Content>
      <Dialog.Actions><Button label="Close" secondary onPress={() => setShowTerms(false)} /></Dialog.Actions>
    </GlassDialog>
  </Page>;
}

export function PendingApprovalScreen({ navigation }: Props<'PendingApproval'>) {
  return <Page auth><Card auth><AuthIntro title="Request submitted" detail="Your account is awaiting administrator approval. You can sign in after your request is approved." />
    <Pressable accessibilityRole="link" onPress={() => navigation.popTo('Login')} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: authColors.accent }}>Back to Sign In</Text></Pressable>
  </Card></Page>;
}

export function ForgotPasswordScreen({ navigation }: Props<'ForgotPassword'>) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  async function submit() {
    setError('');
    setSent(false);
    setBusy(true);
    try {
      await requestPasswordReset(API_BASE_URL, API_KEY, email);
      setSent(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to send password reset.');
    } finally {
      setBusy(false);
    }
  }
  return <Page auth><Card auth><AuthIntro title="Reset your password" detail="Enter your email address and we'll help you get back in." />
    <AuthField label="Email" value={email} onChange={setEmail} keyboard="email-address" placeholder="Enter your email" />
    <Message text={error} />
    {sent && <Text style={{ color: authColors.accent }}>Password reset instructions have been sent.</Text>}
    <Button label={busy ? 'Sending…' : 'Send Reset Link'} disabled={busy} onPress={() => void submit()} />
    <Pressable accessibilityRole="link" disabled={busy} onPress={() => navigation.popTo('Login')} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: authColors.accent }}>Back to Sign In</Text></Pressable>
  </Card></Page>;
}

export function VerifyEmailScreen({ navigation, route }: Props<'VerifyEmail'>) {
  const email = route.params?.email?.trim() ?? '';
  const [deadline, setDeadline] = useState(() => Date.now() + 60_000);
  const [now, setNow] = useState(Date.now);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));

  useEffect(() => {
    if (!email) navigation.replace('SignUp');
  }, [email, navigation]);
  useEffect(() => {
    if (remaining === 0) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [remaining > 0]);

  async function resend() {
    if (busy || remaining > 0) return;
    const started = Date.now();
    setNow(started);
    setDeadline(started + 60_000);
    setBusy(true);
    setMessage('');
    try {
      await resendVerification(API_BASE_URL, API_KEY, email);
      setMessage('Verification email sent.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to resend verification email.');
    } finally {
      setBusy(false);
    }
  }

  if (!email) return null;
  return <Page auth><Card auth>
    <AuthIntro title="Check your inbox" detail={`We sent a verification link to ${email}.`} formTitle="Verify your email" />
    <Text style={{ color: authColors.muted, fontSize: uiScale.type.body, lineHeight: 25 }}>The link expires in 24 hours. Check your spam folder if you don't see it.</Text>
    {/@(gmail\.com|googlemail\.com)$/i.test(email) && <Button label="Open Gmail" onPress={() => {
      void Linking.openURL('https://mail.google.com').catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Unable to open Gmail.'));
    }} />}
    <Button label={busy ? 'Sending…' : remaining ? `Resend in ${remaining}s` : 'Resend verification email'} disabled={busy || remaining > 0} onPress={() => void resend()} />
    {message ? <Text accessibilityLiveRegion="polite" style={{ color: authColors.muted }}>{message}</Text> : null}
    <Pressable accessibilityRole="link" onPress={() => navigation.popTo('Login')} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: authColors.accent }}>Back to sign in</Text></Pressable>
  </Card></Page>;
}
