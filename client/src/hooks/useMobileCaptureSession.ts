// 手机采集会话 Hook（文档 8.1：登录 + 采集会话管理 + localStorage 持久化）
import { useCallback, useEffect, useState } from 'react';
import { mobileCaptureApi, setMobileToken, getMobileToken } from '../services/api';
import { MobileSession } from '../types/mobileCapture';

interface AuthState {
  token: string | null;
  operatorName: string;
  deviceName: string;
}

export function useMobileCaptureSession() {
  const [auth, setAuth] = useState<AuthState>(() => {
    try {
      return JSON.parse(localStorage.getItem('mobile_capture_auth') || 'null') || { token: null, operatorName: '', deviceName: '' };
    } catch { return { token: null, operatorName: '', deviceName: '' }; }
  });
  const [session, setSession] = useState<MobileSession | null>(() => {
    try {
      return JSON.parse(localStorage.getItem('mobile_capture_session') || 'null');
    } catch { return null; }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 恢复已登录 token
  useEffect(() => {
    const saved = getMobileToken();
    if (saved && !auth.token) {
      const savedAuth = localStorage.getItem('mobile_capture_auth');
      if (savedAuth) setAuth(JSON.parse(savedAuth));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 401 失效同步：authRequest 收到 401 时会清掉 localStorage 的 token，
  // 这里检测到「auth 有 token 但 localStorage 已被清」→ 自动回到未登录状态（显示登录界面）
  useEffect(() => {
    if (auth.token && !getMobileToken()) {
      setAuth({ token: null, operatorName: '', deviceName: '' });
      localStorage.removeItem('mobile_capture_auth');
      localStorage.removeItem('mobile_capture_session');
      setSession(null);
    }
  }, [auth.token]);

  // 事件驱动：后端返回 401 时（token 失效/被服务端清除），立即回到登录界面
  useEffect(() => {
    const onExpired = () => {
      setAuth({ token: null, operatorName: '', deviceName: '' });
      localStorage.removeItem('mobile_capture_auth');
      localStorage.removeItem('mobile_capture_session');
      setSession(null);
    };
    window.addEventListener('mobile-auth-expired', onExpired);
    return () => window.removeEventListener('mobile-auth-expired', onExpired);
  }, []);

  const persistAuth = useCallback((next: AuthState) => {
    setAuth(next);
    localStorage.setItem('mobile_capture_auth', JSON.stringify(next));
    setMobileToken(next.token);
  }, []);

  const persistSession = useCallback((s: MobileSession | null) => {
    setSession(s);
    if (s) localStorage.setItem('mobile_capture_session', JSON.stringify(s));
    else localStorage.removeItem('mobile_capture_session');
  }, []);

  /** PIN 登录（8.1） */
  const login = useCallback(async (pin: string, operatorName: string, deviceName: string, areaCode: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await mobileCaptureApi.login(pin, operatorName, deviceName, areaCode);
      if (!res.success) throw new Error(res.error || '登录失败');
      const d = res.data;
      persistAuth({ token: d.token, operatorName: d.operatorName, deviceName: d.deviceName });
      return d;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [persistAuth]);

  const logout = useCallback(() => {
    persistAuth({ token: null, operatorName: '', deviceName: '' });
    persistSession(null);
  }, [persistAuth, persistSession]);

  /** 创建/恢复采集会话（8.1） */
  const startSession = useCallback(async (areaCode: string, notes: string, continueExisting: boolean = true) => {
    setLoading(true);
    setError('');
    try {
      // 若已有 active 会话，可选择继续
      if (continueExisting && session && session.status === 'active') return session;

      const res = await mobileCaptureApi.createSession(areaCode, notes);
      if (!res.success) throw new Error(res.error || '创建会话失败');
      const s = res.data as MobileSession;
      persistSession(s);
      return s;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [session, persistSession]);

  /** 完成会话 */
  const completeSession = useCallback(async (id: number) => {
    const res = await mobileCaptureApi.completeSession(id);
    if (res.success) {
      persistSession(null);
    }
    return res;
  }, [persistSession]);

  const cancelSession = useCallback(async (id: number) => {
    const res = await mobileCaptureApi.cancelSession(id);
    if (res.success) persistSession(null);
    return res;
  }, [persistSession]);

  const setCurrentSession = useCallback((s: MobileSession | null) => persistSession(s), [persistSession]);

  return {
    auth, session, loading, error,
    login, logout, startSession, completeSession, cancelSession, setCurrentSession,
  };
}

export default useMobileCaptureSession;
