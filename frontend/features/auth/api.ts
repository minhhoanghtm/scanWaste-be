import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { z } from 'zod';

const host = Platform.OS === 'web' ? (typeof window !== 'undefined' ? window.location.hostname : 'localhost') : (Constants.expoConfig?.hostUri?.split(':')[0] || '127.0.0.1');
export const API_ORIGIN = (process.env.EXPO_PUBLIC_API_URL || `http://${host}:5000`).replace(/\/$/, '');
export const assetUrl = (value?: string) => value?.startsWith('/uploads/') ? `${API_ORIGIN}${value}` : undefined;
export const ProfileSchema = z.object({ id: z.string(), name: z.string(), email: z.string(), phone: z.string().default(''), role: z.string(), avatarUrl: z.string().default(''), emailVerified: z.boolean().default(false), totalPoints: z.number().nonnegative().default(0), spentPoints: z.number().nonnegative().default(0), availablePoints: z.number().nonnegative().default(0), totalClassifications: z.number().default(0), currentStreak: z.number().default(0), tier: z.string().default('Bronze'), createdAt: z.string().optional(), badges: z.array(z.object({ id: z.string().optional(), name: z.string(), description: z.string().optional(), earnedAt: z.string().optional() })).default([]) });
export type Profile = z.infer<typeof ProfileSchema>;
const TokensSchema = z.object({ token: z.string(), refreshToken: z.string() });
export type Tokens = z.infer<typeof TokensSchema>;
let tokens: Tokens | null = null;
let generation = 0;
let refreshing: Promise<void> | null = null;
let onExpired = () => {};
const messages: Record<string, string> = { INVALID_CREDENTIALS: 'Email/SĐT hoặc mật khẩu không chính xác.', INVALID_OTP: 'Mã OTP không đúng hoặc đã hết hạn.', OTP_COOLDOWN: 'Vui lòng đợi trước khi gửi lại mã.', EMAIL_EXISTS: 'Email đã được đăng ký.', PHONE_EXISTS: 'Số điện thoại đã được đăng ký.', TOO_MANY_REQUESTS: 'Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.', EMAIL_NOT_CONFIGURED: 'Máy chủ chưa cấu hình gửi email OTP.', AUTH_STORE_UNAVAILABLE: 'Dịch vụ đăng nhập đang gián đoạn.', SESSION_REVOKED: 'Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.', TOKEN_EXPIRED: 'Phiên đã hết hạn. Vui lòng đăng nhập lại.', FILE_TOO_LARGE: 'Ảnh quá lớn. Vui lòng chọn ảnh tối đa 5 MB.' };
export class ApiError extends Error { constructor(public code: string, message: string, public status = 0, public retryAfter = 60) { super(message); } }
async function persist(value: Tokens | null) { if (Platform.OS !== 'web') { if (value) await SecureStore.setItemAsync('ecosort-session', JSON.stringify(value)); else await SecureStore.deleteItemAsync('ecosort-session'); } }
export async function setSession(value: Tokens | null) { generation++; tokens = value ? TokensSchema.parse(value) : null; await persist(tokens); }
export function sessionExpired(handler: () => void) { onExpired = handler; return () => { onExpired = () => {}; }; }
export async function restoreSession() { if (Platform.OS === 'web') return false; const raw = await SecureStore.getItemAsync('ecosort-session'); if (!raw) return false; try { tokens = TokensSchema.parse(JSON.parse(raw)); generation++; return true; } catch { await persist(null); return false; } }
export async function api<T = unknown>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal; retry?: boolean } = {}): Promise<T> {
 const started = generation;
 const controller = new AbortController();
 const abort = () => controller.abort();
 options.signal?.addEventListener('abort', abort);
 if (options.signal?.aborted) controller.abort();
 const timer = setTimeout(abort, 30000);
 let response: Response;
 try { response = await fetch(`${API_ORIGIN}/api${path}`, { method: options.method || (options.body === undefined ? 'GET' : 'POST'), signal: controller.signal, headers: { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(tokens ? { Authorization: `Bearer ${tokens.token}` } : {}) }, ...(options.body === undefined ? {} : { body: options.body instanceof FormData ? options.body : JSON.stringify(options.body) }) }); }
 catch { throw new ApiError('NETWORK_ERROR', 'Không kết nối được máy chủ. Vui lòng kiểm tra kết nối rồi thử lại.'); }
 finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
 const payload = await response.json();
 if (response.status === 401 && payload.code === 'TOKEN_EXPIRED' && tokens && options.retry !== false) {
  if (!refreshing) {
   const previous = tokens;
   refreshing = api<Tokens>('/auth/refresh', { body: { refreshToken: previous.refreshToken }, retry: false }).then(async next => {
    if (started !== generation) throw new ApiError('SESSION_CHANGED', 'Phiên đăng nhập đã thay đổi.');
    tokens = TokensSchema.parse(next); await persist(tokens);
   }).catch(async error => { if (started === generation) { await setSession(null); onExpired(); } throw error; }).finally(() => { refreshing = null; });
  }
  await refreshing; return api<T>(path, { ...options, retry: false });
 }
 if (!response.ok) {
  if (response.status === 401 && started === generation && tokens && !path.startsWith('/auth/login')) { await setSession(null); onExpired(); }
  const detail = Array.isArray(payload.errors) ? payload.errors.filter((x: unknown) => typeof x === 'string').join('. ') : '';
  throw new ApiError(payload.code || 'API_ERROR', messages[payload.code] || detail || payload.message || 'Không thực hiện được. Vui lòng thử lại.', response.status, Number(response.headers.get('retry-after')) || 60);
 }
 if (started !== generation) throw new ApiError('SESSION_CHANGED', 'Phiên đăng nhập đã thay đổi.');
 return payload.data as T;
}
