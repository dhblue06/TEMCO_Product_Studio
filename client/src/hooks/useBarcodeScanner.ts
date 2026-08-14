// 扫码 Hook（文档 26：优先 BarcodeDetector，fallback ZXing）
// 实时摄像头需要 HTTPS/localhost（secure context），HTTP 局域网下回退为拍照扫码
import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';

const SUPPORTED_FORMATS = ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code'];
const MAX_DECODE_DIMENSION = 1500; // 解码前缩小的最大边长（ZXing 处理大图极慢）
const NATIVE_TIMEOUT_MS = 3000;   // BarcodeDetector 3 秒无结果 → 转 ZXing（仅作 fallback 触发，不影响最终识别）
const PHOTO_PICK_TIMEOUT_MS = 120000; // 兜底：仅在“拍照选择照片”阶段防止永久等待；解码本身不设超时

/** secure context（HTTPS 或 localhost）下才可用实时摄像头 */
function hasLiveCamera(): boolean {
  return !!(
    (window.isSecureContext || ['localhost', '127.0.0.1'].includes(window.location.hostname)) &&
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  );
}

/** 给 Promise 加超时，超时后 reject（不会真的中断原 Promise，但调用方不再等待） */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); },
    );
  });
}

function detectNativeBarcode(source: HTMLVideoElement | HTMLImageElement): Promise<string | null> {
  return new Promise((resolve) => {
    if (!('BarcodeDetector' in window)) {
      resolve(null);
      return;
    }
    try {
      const detector = new (window as any).BarcodeDetector({ formats: SUPPORTED_FORMATS });
      withTimeout<any[]>(detector.detect(source), NATIVE_TIMEOUT_MS)
        .then((results: any[]) => {
          const r = results?.[0];
          resolve(r?.rawValue || null);
        })
        .catch(() => resolve(null));
    } catch {
      resolve(null);
    }
  });
}

/** 把图片缩小到 MAX_DECODE_DIMENSION 以内并返回 <img> 元素（供 BarcodeDetector / ZXing 解码） */
async function downscaleToImage(img: HTMLImageElement, maxDim = MAX_DECODE_DIMENSION): Promise<HTMLImageElement> {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const w = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
  const h = Math.max(1, Math.round((img.naturalHeight || 1) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.drawImage(img, 0, 0, w, h);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const small = new Image();
  await new Promise<void>((resolve, reject) => {
    small.onload = () => resolve();
    small.onerror = () => reject(new Error('image decode failed'));
    small.src = dataUrl;
  });
  return small;
}

/** 从图片元素解码：先缩小（规避手机大图解码慢/卡死），BarcodeDetector 优先（带超时），ZXing 兜底（带超时） */
async function decodeFromImage(img: HTMLImageElement): Promise<string | null> {
  let small: HTMLImageElement;
  try {
    small = await downscaleToImage(img);
  } catch {
    small = img;
  }

  // 1) 原生 BarcodeDetector（快）
  const native = await detectNativeBarcode(small);
  if (native) return native;

  // 2) ZXing fallback（不设超时，识别到底；图片已缩小，正常几秒内完成）
  try {
    const reader = new BrowserMultiFormatReader();
    const result = await reader.decodeFromImageElement(small);
    return result?.getText?.() || null;
  } catch {
    return null;
  }
}

export interface BarcodeScannerState {
  active: boolean;
  liveSupported: boolean;
  error: string;
}

/**
 * 扫码。返回控制方法与状态。
 * - liveSupported 为 true 时可用「实时扫码」（start/stop + videoRef）
 * - 任何环境都可用「拍照扫码」（capturePhotoScan：调系统相机拍一张，从图片解码）
 */
export function useBarcodeScanner(onDetected: (text: string) => void) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [liveSupported, setLiveSupported] = useState(() => hasLiveCamera());
  const [error, setError] = useState('');
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  const stop = useCallback(() => {
    setActive(false);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const start = useCallback(async () => {
    setError('');
    if (!hasLiveCamera()) {
      setLiveSupported(false);
      setError('当前环境不支持实时摄像头（需 HTTPS 或 localhost），请使用下方「拍照扫码」');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      setActive(true);

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      await video.play().catch(() => {});

      if ('BarcodeDetector' in window) {
        // 原生 BarcodeDetector：rAF 循环
        let running = true;
        let lastDetect = 0;
        const loop = async () => {
          if (!running) return;
          const now = Date.now();
          if (video.readyState >= 2 && now - lastDetect > 250) {
            lastDetect = now;
            const value = await detectNativeBarcode(video);
            if (value && running) {
              onDetectedRef.current(value);
              // 检测到后短暂暂停避免重复触发
              await new Promise(r => setTimeout(r, 1200));
            }
          }
          requestAnimationFrame(loop);
        };
        loop();
      } else {
        // ZXing fallback
        const reader = new BrowserMultiFormatReader();
        reader.decodeFromVideoDevice(undefined, video, (result) => {
          if (result && result.getText()) {
            onDetectedRef.current(result.getText());
          }
        });
      }
    } catch (e: any) {
      setError(e?.message || '无法访问摄像头，请使用拍照扫码或手动输入');
    }
  }, []);

  /**
   * 拍照扫码（文档 9.1 同款方案）：调起系统相机拍摄条码照片，
   * 缩小后从照片中解码 EAN/Code128/QR。HTTP 局域网环境下可用。
   * 返回识别到的条码文本；未识别/超时返回 null。
   */
  const capturePhotoScan = useCallback((): Promise<string | null> => {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value: string | null) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.setAttribute('capture', 'environment');

      // 兜底：仅防止“拍照选择照片”阶段永久等待（120 秒），解码本身无超时
      const totalTimer = window.setTimeout(() => finish(null), PHOTO_PICK_TIMEOUT_MS);

      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) { window.clearTimeout(totalTimer); finish(null); return; }
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = async () => {
          try {
            const text = await decodeFromImage(img);
            URL.revokeObjectURL(url);
            window.clearTimeout(totalTimer);
            if (text) onDetectedRef.current(text);
            finish(text);
          } catch {
            URL.revokeObjectURL(url);
            window.clearTimeout(totalTimer);
            finish(null);
          }
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          window.clearTimeout(totalTimer);
          finish(null);
        };
        img.src = url;
      };
      input.oncancel = () => {
        window.clearTimeout(totalTimer);
        finish(null);
      };
      input.click();
    });
  }, []);

  useEffect(() => {
    return stop;
  }, [stop]);

  return { videoRef, start, stop, active, liveSupported, error, capturePhotoScan };
}

export default useBarcodeScanner;
