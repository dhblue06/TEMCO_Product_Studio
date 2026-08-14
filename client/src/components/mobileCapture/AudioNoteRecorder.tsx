// 语音备注录制（文档 12.2：第一版只保存音频，不做识别）
import React, { useEffect, useRef, useState } from 'react';
import { mobileCaptureApi } from '../../services/api';
import { useI18n } from '../../i18n';

interface Props {
  captureId: number;
  onSaved?: (note: any) => void;
}

export function AudioNoteRecorder({ captureId, onSaved }: Props) {
  const { t } = useI18n();
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [saving, setSaving] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const maxSeconds = 120;

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      mediaRef.current?.stream?.getTracks?.().forEach(t => t.stop());
    };
  }, []);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => { stream.getTracks().forEach(t => t.stop()); };
      recorder.start();
      mediaRef.current = recorder;
      setRecording(true);
      setSeconds(0);
      timerRef.current = window.setInterval(() => {
        setSeconds(s => {
          if (s + 1 >= maxSeconds) { stop(); return s; }
          return s + 1;
        });
      }, 1000);
    } catch (e: any) {
      alert(t('audio.noMic') + ': ' + e.message);
    }
  };

  const stop = async () => {
    const recorder = mediaRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    if (timerRef.current) window.clearInterval(timerRef.current);
    setRecording(false);

    const duration = seconds;
    recorder.onstop = async () => {
      streamCleanup(recorder);
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      if (blob.size === 0) return;
      setSaving(true);
      try {
        const res = await mobileCaptureApi.uploadAudioNote(captureId, blob, `note_${Date.now()}.webm`, duration);
        if (res.success && onSaved) onSaved(res.data);
      } catch (e: any) {
        alert(t('audio.uploadFail') + ': ' + e.message);
      } finally {
        setSaving(false);
      }
    };
    recorder.stop();
  };

  const streamCleanup = (r: MediaRecorder) => {
    try { r.stream?.getTracks?.().forEach((t: MediaStreamTrack) => t.stop()); } catch {}
  };

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        type="button"
        onClick={recording ? stop : start}
        disabled={saving}
        className={recording ? 'btn' : 'btn btn-sm'}
        style={{ background: recording ? '#dc2626' : undefined, color: recording ? '#fff' : undefined, padding: '8px 12px' }}
      >
        {recording ? t('audio.stop') : t('audio.record')}
      </button>
      {recording && <span style={{ color: '#dc2626', fontSize: 13 }}>● {fmt(seconds)}</span>}
      {saving && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{t('audio.uploading')}</span>}
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('capture.voice')}</span>
    </div>
  );
}

export default AudioNoteRecorder;
