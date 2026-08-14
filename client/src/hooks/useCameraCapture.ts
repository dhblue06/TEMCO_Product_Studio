// 拍照 Hook（文档 9.1：<input type="file" accept="image/*" capture="environment">）
import { useCallback, useRef } from 'react';

/**
 * 调用手机后置摄像头拍照或从相册选择。
 * trigger() 弹出系统相机/相册；onFiles 回调返回所选 File 列表。
 */
export function useCameraCapture(onFiles: (files: File[]) => void) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const trigger = useCallback((capture: boolean = true) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (capture) input.setAttribute('capture', 'environment');
    input.multiple = true;
    input.onchange = () => {
      const files = Array.from(input.files || []);
      if (files.length > 0) onFiles(files);
    };
    inputRef.current = input;
    input.click();
  }, [onFiles]);

  return { trigger, inputRef };
}

export default useCameraCapture;
