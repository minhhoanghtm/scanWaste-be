import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { api, ApiError, Tokens } from './api';
import { useAuth } from './AuthProvider';
import { Button, Field, Icon, Notice, Page, ui } from '../shared/ui';

type Challenge = { registrationId?: string; loginChallengeId?: string; email: string; retryAfter?: number };
export default function LoginScreen() {
 const auth = useAuth();
 const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset'>('login');
 const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [phone, setPhone] = useState('');
 const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [otp, setOtp] = useState('');
 const [challenge, setChallenge] = useState<Challenge | null>(null); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [wait, setWait] = useState(0);
 useEffect(() => { if (!wait) return; const timer = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(timer); }, [wait]);
 if (auth.signedIn && auth.user) return <Redirect href="/" />;
 async function submit() {
  if (busy) return; setBusy(true); setMessage('');
  try {
   if (challenge) {
    if (!/^\d{6}$/.test(otp)) throw new Error('Nhập mã OTP gồm 6 chữ số.');
    const route = challenge.registrationId ? '/auth/register/verify' : '/auth/login/verify';
    const result = await api<Tokens>(route, { body: { ...(challenge.registrationId ? { registrationId: challenge.registrationId } : { loginChallengeId: challenge.loginChallengeId }), otp } });
    await auth.finish(result); router.replace('/'); return;
   }
   if (mode === 'forgot') { await api('/auth/password/forgot', { body: { email: email.trim() } }); setMode('reset'); setWait(60); setMessage('Nếu email hợp lệ, mã đặt lại mật khẩu sẽ được gửi đến bạn.'); return; }
   if (mode === 'reset') { if (password !== confirm) throw new Error('Mật khẩu xác nhận chưa khớp.'); await api('/auth/password/reset', { body: { email: email.trim(), otp, password, confirmPassword: confirm } }); setMode('login'); setPassword(''); setConfirm(''); setOtp(''); setMessage('Đã đặt lại mật khẩu. Bạn có thể đăng nhập.'); return; }
   if (!email.trim() || !password) throw new Error('Vui lòng nhập tài khoản và mật khẩu.');
   if (mode === 'register' && password !== confirm) throw new Error('Mật khẩu xác nhận chưa khớp.');
   const data = await api<Challenge>(mode === 'register' ? '/auth/register' : '/auth/login', { body: mode === 'register' ? { name: name.trim(), email: email.trim(), phone, password, confirmPassword: confirm } : { identifier: email.trim(), password } });
   setChallenge(data); setOtp(''); setPassword(''); setConfirm(''); setWait(data.retryAfter || 60);
  } catch (error) { setMessage(error instanceof Error ? error.message : 'Không đăng nhập được.'); if (error instanceof ApiError && error.code === 'OTP_COOLDOWN') setWait(error.retryAfter); }
  finally { setBusy(false); }
 }
 async function resend() {
  if (!challenge || wait || busy) return; setBusy(true); setMessage('');
  try { await api(challenge.registrationId ? '/auth/register/resend' : '/auth/login/resend', { body: challenge.registrationId ? { registrationId: challenge.registrationId } : { loginChallengeId: challenge.loginChallengeId } }); setWait(60); }
  catch (error) { setMessage((error as Error).message); if (error instanceof ApiError && error.code === 'OTP_COOLDOWN') setWait(error.retryAfter); } finally { setBusy(false); }
 }
 const title = challenge ? 'Xác minh tài khoản' : mode === 'register' ? 'Bắt đầu hành trình xanh' : mode === 'forgot' ? 'Quên mật khẩu' : mode === 'reset' ? 'Đặt lại mật khẩu' : 'Chào mừng trở lại!';
 return <Page title={title} subtitle={challenge ? `Nhập mã OTP gửi đến ${challenge.email}` : 'Phân loại thông minh · Sống xanh mỗi ngày'}><View style={ui.card}><Icon name={challenge ? 'email-check-outline' : 'leaf-circle-outline'} size={48} />{challenge ? <Field label="Mã OTP" value={otp} onChangeText={setOtp} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" /> : <>
 {mode === 'register' && <Field label="Họ và tên" value={name} onChangeText={setName} maxLength={100} autoComplete="name" />}
 <Field label={mode === 'login' ? 'Email hoặc số điện thoại' : 'Email'} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
 {mode === 'register' && <Field label="Số điện thoại" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />}
 {mode === 'reset' && <Field label="Mã OTP" value={otp} onChangeText={setOtp} keyboardType="number-pad" maxLength={6} />}
 {mode !== 'forgot' && <Field label={mode === 'reset' ? 'Mật khẩu mới' : 'Mật khẩu'} value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />}
 {(mode === 'register' || mode === 'reset') && <Field label="Xác nhận mật khẩu" value={confirm} onChangeText={setConfirm} secureTextEntry />}</>}
 <Notice text={message} error />
 <Button title={challenge ? 'Xác minh & tiếp tục' : mode === 'register' ? 'Tạo tài khoản' : mode === 'forgot' ? 'Gửi mã xác nhận' : mode === 'reset' ? 'Lưu mật khẩu mới' : 'Đăng nhập'} onPress={submit} busy={busy} />
 {challenge ? <><Button secondary title={wait ? `Gửi lại mã sau ${wait}s` : 'Gửi lại mã'} disabled={wait > 0} busy={busy} onPress={resend} /><Button secondary title="Đổi tài khoản" disabled={busy} onPress={() => { setChallenge(null); setOtp(''); setMessage(''); }} /></> : <View style={ui.spread}><Pressable accessibilityRole="button" onPress={() => { setMode(mode === 'login' ? 'register' : 'login'); setMessage(''); }}><Text style={ui.link}>{mode === 'login' ? 'Tạo tài khoản mới' : 'Về đăng nhập'}</Text></Pressable>{mode === 'login' && <Pressable accessibilityRole="button" onPress={() => { setMode('forgot'); setMessage(''); }}><Text style={ui.link}>Quên mật khẩu?</Text></Pressable>}</View>}
 </View></Page>;
}
