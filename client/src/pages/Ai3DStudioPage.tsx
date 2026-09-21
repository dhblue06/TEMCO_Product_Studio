import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { pipeline, RawImage } from '@huggingface/transformers';
import JSZip from 'jszip';
import * as THREE from 'three';
import { useI18n } from '../i18n';
import './Ai3DStudioPage.css';

type DepthMap = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

type NormalizedRect = { x: number; y: number; w: number; h: number };

type DepthEstimator = (input: RawImage | HTMLCanvasElement) => Promise<{ depth: RawImage }>;

let estimatorPromise: Promise<DepthEstimator> | null = null;

const MODEL_ID = 'onnx-community/depth-anything-v2-small';

async function loadEstimator(onProgress: (message: string) => void): Promise<DepthEstimator> {
  if (!estimatorPromise) {
    const device = 'gpu' in navigator ? 'webgpu' : 'wasm';
    onProgress(device === 'webgpu' ? 'WebGPU' : 'WASM');
    estimatorPromise = pipeline('depth-estimation', MODEL_ID, {
      device,
      dtype: device === 'webgpu' ? 'fp16' : 'q8',
      progress_callback: (event: { status?: string; file?: string; progress?: number }) => {
        if (event.status === 'progress' && typeof event.progress === 'number') {
          onProgress(`${Math.round(event.progress)}%`);
        } else if (event.status) {
          onProgress(event.status);
        }
      },
    } as never) as unknown as Promise<DepthEstimator>;
  }

  try {
    return await estimatorPromise;
  } catch (error) {
    estimatorPromise = null;
    if ('gpu' in navigator) {
      onProgress('WASM');
      estimatorPromise = pipeline('depth-estimation', MODEL_ID, {
        device: 'wasm',
        dtype: 'q8',
      } as never) as unknown as Promise<DepthEstimator>;
      return estimatorPromise;
    }
    throw error;
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function canvasBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('无法生成图片')), type, quality);
  });
}

function imageBlob(file: File, type = 'image/jpeg'): Promise<Blob> {
  if (file.type === type) return Promise.resolve(file);
  return createImageBitmap(file).then((bitmap) => {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    bitmap.close();
    return canvasBlob(canvas, type, 0.92);
  });
}

function renderDepthCanvas(
  canvas: HTMLCanvasElement,
  map: DepthMap,
  invert: boolean,
  contrast: number,
  blur: number,
) {
  canvas.width = map.width;
  canvas.height = map.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const output = ctx.createImageData(map.width, map.height);
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  for (let i = 0; i < map.data.length; i += 1) {
    const raw = invert ? 255 - map.data[i] : map.data[i];
    const value = Math.max(0, Math.min(255, factor * (raw - 128) + 128));
    const p = i * 4;
    output.data[p] = value;
    output.data[p + 1] = value;
    output.data[p + 2] = value;
    output.data[p + 3] = 255;
  }
  const source = document.createElement('canvas');
  source.width = map.width;
  source.height = map.height;
  source.getContext('2d')!.putImageData(output, 0, 0);
  ctx.filter = blur ? `blur(${blur}px)` : 'none';
  ctx.drawImage(source, 0, 0);
  ctx.filter = 'none';
}

function protectDepthArea(map: DepthMap, rect: NormalizedRect | null): DepthMap {
  if (!rect) return map;
  const output = new Uint8ClampedArray(map.data);
  const left = Math.max(0, Math.floor(rect.x * map.width));
  const top = Math.max(0, Math.floor(rect.y * map.height));
  const right = Math.min(map.width, Math.ceil((rect.x + rect.w) * map.width));
  const bottom = Math.min(map.height, Math.ceil((rect.y + rect.h) * map.height));
  let total = 0;
  let count = 0;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      total += map.data[y * map.width + x];
      count += 1;
    }
  }
  const flatValue = count ? Math.round(total / count) : 128;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) output[y * map.width + x] = flatValue;
  }
  return { ...map, data: output };
}

function protectDepthAreas(map: DepthMap, rects: NormalizedRect[]): DepthMap {
  return rects.reduce((current, rect) => protectDepthArea(current, rect), map);
}

function protectPosterTextBand(map: DepthMap, enabled: boolean): DepthMap {
  if (!enabled || !map.width || !map.height) return map;
  const source = document.createElement('canvas');
  const blurred = document.createElement('canvas');
  source.width = map.width;
  source.height = map.height;
  blurred.width = map.width;
  blurred.height = map.height;
  const sourceContext = source.getContext('2d');
  const blurredContext = blurred.getContext('2d');
  if (!sourceContext || !blurredContext) return map;
  const sourceImage = sourceContext.createImageData(map.width, map.height);
  for (let i = 0; i < map.data.length; i += 1) {
    const p = i * 4;
    sourceImage.data[p] = map.data[i];
    sourceImage.data[p + 1] = map.data[i];
    sourceImage.data[p + 2] = map.data[i];
    sourceImage.data[p + 3] = 255;
  }
  sourceContext.putImageData(sourceImage, 0, 0);
  // 保留顶部背景的远近渐变，只消除文字笔画造成的高频深度变化。
  blurredContext.filter = `blur(${Math.max(16, Math.round(map.width / 34))}px)`;
  blurredContext.drawImage(source, 0, 0);
  blurredContext.filter = 'none';
  const blurredImage = blurredContext.getImageData(0, 0, map.width, map.height);
  const output = new Uint8ClampedArray(map.data);
  const blendStart = Math.floor(map.height * 0.36);
  const blendEnd = Math.floor(map.height * 0.54);
  for (let y = 0; y < blendEnd; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const index = y * map.width + x;
      const blurredValue = blurredImage.data[index * 4];
      if (y <= blendStart) {
        output[index] = blurredValue;
      } else {
        const ratio = Math.min(1, (y - blendStart) / Math.max(1, blendEnd - blendStart));
        output[index] = Math.round(blurredValue * (1 - ratio) + map.data[index] * ratio);
      }
    }
  }
  return { ...map, data: output };
}

function stabilizeDepthRange(map: DepthMap): DepthMap {
  if (!map.width || !map.height) return map;
  const output = new Uint8ClampedArray(map.data.length);
  // Keep a small safety margin, but preserve enough contrast for visible parallax.
  // The previous 90..170 range made the exported map almost flat.
  for (let i = 0; i < map.data.length; i += 1) {
    output[i] = Math.round(18 + (map.data[i] / 255) * 219);
  }
  return { ...map, data: output };
}

function renderParallaxFallback(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  map: DepthMap,
  pointer: { x: number; y: number },
  strength: number,
) {
  const width = Math.min(image.naturalWidth, 1000);
  const height = Math.round(width * image.naturalHeight / image.naturalWidth);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);
  const bands = 64;
  const xTilt = pointer.x * strength * 80;
  const yTilt = pointer.y * strength * 34;
  for (let band = 0; band < bands; band += 1) {
    const sy = Math.floor(image.naturalHeight * band / bands);
    const nextSy = Math.max(sy + 1, Math.floor(image.naturalHeight * (band + 1) / bands));
    const depthY = Math.min(map.height - 1, Math.floor(map.height * (band + 0.5) / bands));
    let depthTotal = 0;
    let depthSamples = 0;
    for (let sampleX = 0; sampleX < map.width; sampleX += Math.max(8, Math.floor(map.width / 48))) {
      depthTotal += map.data[depthY * map.width + sampleX] || 128;
      depthSamples += 1;
    }
    const depth = (depthSamples ? depthTotal / depthSamples : 128) / 255;
    const dx = (depth - 0.5) * xTilt;
    const dy = (depth - 0.5) * yTilt;
    const destY = Math.floor(height * band / bands);
    const destH = Math.max(1, Math.ceil(height / bands) + 1);
    ctx.drawImage(image, 0, sy, image.naturalWidth, nextSy - sy, dx, destY + dy, width, destH);
  }
}

export default function Ai3DStudioPage() {
  const { lang, setLang } = useI18n();
  const isZh = lang === 'zh';
  const inputRef = useRef<HTMLInputElement>(null);
  const originalImageRef = useRef<HTMLImageElement | null>(null);
  const depthCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const webglReadyRef = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [imageAspect, setImageAspect] = useState(1);
  const [depthMap, setDepthMap] = useState<DepthMap | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'processing' | 'ready' | 'error'>('idle');
  const [statusDetail, setStatusDetail] = useState('');
  const [error, setError] = useState('');
  const [strength, setStrength] = useState(0.45);
  const [contrast, setContrast] = useState(0);
  const [blur, setBlur] = useState(0);
  const [invert, setInvert] = useState(false);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [protectMode, setProtectMode] = useState(false);
  const [protectedRects, setProtectedRects] = useState<NormalizedRect[]>([]);
  const [protectDraftRect, setProtectDraftRect] = useState<NormalizedRect | null>(null);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const protectGestureRef = useRef<{ mode: 'draw' | 'move'; start: { x: number; y: number }; base: NormalizedRect | null } | null>(null);
  const [autoTextProtect, setAutoTextProtect] = useState(true);
  const [manualMode, setManualMode] = useState(false);
  const [brushSize, setBrushSize] = useState(70);
  const [manualDepthMap, setManualDepthMap] = useState<DepthMap | null>(null);
  const manualGestureRef = useRef<{ startX: number; startY: number; base: DepthMap } | null>(null);
  const [autoMotion, setAutoMotion] = useState(true);

  const effectiveDepthMap = useMemo(() => {
    const base = protectPosterTextBand(depthMap || { data: new Uint8ClampedArray(), width: 0, height: 0 }, autoTextProtect);
    return stabilizeDepthRange(manualDepthMap || protectDepthAreas(base, protectedRects));
  }, [autoTextProtect, depthMap, manualDepthMap, protectedRects]);

  const renderOutputs = useCallback(() => {
    if (!depthMap) return;
    if (depthCanvasRef.current) renderDepthCanvas(depthCanvasRef.current, effectiveDepthMap, invert, contrast, blur);
    if (!webglReadyRef.current && previewCanvasRef.current && originalImageRef.current) {
      renderParallaxFallback(previewCanvasRef.current, originalImageRef.current, effectiveDepthMap, pointer, strength * 2.4);
    }
  }, [blur, contrast, depthMap, effectiveDepthMap, invert, pointer, strength]);

  useEffect(() => { renderOutputs(); }, [renderOutputs]);

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    const image = originalImageRef.current;
    if (!canvas || !image || !effectiveDepthMap.width || !effectiveDepthMap.height) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
    } catch {
      webglReadyRef.current = false;
      return;
    }

    const imageWidth = image.naturalWidth;
    const imageHeight = image.naturalHeight;
    const aspect = imageWidth / imageHeight;
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 10);
    camera.position.z = 2;
    const geometry = new THREE.PlaneGeometry(aspect * 2, 2, 192, 192);
    const imageTexture = new THREE.Texture(image);
    imageTexture.colorSpace = THREE.SRGBColorSpace;
    imageTexture.minFilter = THREE.LinearFilter;
    imageTexture.magFilter = THREE.LinearFilter;
    imageTexture.needsUpdate = true;

    const depthCanvas = document.createElement('canvas');
    depthCanvas.width = effectiveDepthMap.width;
    depthCanvas.height = effectiveDepthMap.height;
    const depthContext = depthCanvas.getContext('2d');
    if (!depthContext) {
      renderer.dispose();
      geometry.dispose();
      imageTexture.dispose();
      return;
    }
    const depthPixels = depthContext.createImageData(effectiveDepthMap.width, effectiveDepthMap.height);
    for (let i = 0; i < effectiveDepthMap.data.length; i += 1) {
      const pixel = i * 4;
      const value = effectiveDepthMap.data[i];
      depthPixels.data[pixel] = value;
      depthPixels.data[pixel + 1] = value;
      depthPixels.data[pixel + 2] = value;
      depthPixels.data[pixel + 3] = 255;
    }
    depthContext.putImageData(depthPixels, 0, 0);
    const depthTexture = new THREE.CanvasTexture(depthCanvas);
    depthTexture.minFilter = THREE.LinearFilter;
    depthTexture.magFilter = THREE.LinearFilter;

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uImage: { value: imageTexture },
        uDepth: { value: depthTexture },
        uPointer: { value: new THREE.Vector2(pointerRef.current.x, pointerRef.current.y) },
        uTexel: { value: new THREE.Vector2(1 / effectiveDepthMap.width, 1 / effectiveDepthMap.height) },
        uStrength: { value: strength },
        uInvert: { value: invert ? 1 : 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uImage;
        uniform sampler2D uDepth;
        uniform vec2 uPointer;
        uniform vec2 uTexel;
        uniform float uStrength;
        uniform float uInvert;
        varying vec2 vUv;

        float readDepth(vec2 uv) {
          float value = texture2D(uDepth, uv).r;
          return uInvert > 0.5 ? 1.0 - value : value;
        }

        void main() {
          float depth = readDepth(vUv);
          float left = readDepth(vUv - vec2(uTexel.x, 0.0));
          float right = readDepth(vUv + vec2(uTexel.x, 0.0));
          float top = readDepth(vUv + vec2(0.0, uTexel.y));
          float bottom = readDepth(vUv - vec2(0.0, uTexel.y));
          float edge = abs(right - left) + abs(top - bottom);

          // Near objects move more, while strong depth discontinuities are
          // damped to reduce halos around product packaging and letters.
          float nearDepth = pow(clamp(depth, 0.0, 1.0), 1.65);
          float edgeFactor = 1.0 - smoothstep(0.08, 0.28, edge) * 0.72;
          float amount = (0.035 + uStrength * 0.075) * nearDepth * edgeFactor;
          vec2 displacedUv = clamp(vUv - uPointer * amount, vec2(0.002), vec2(0.998));
          gl_FragColor = texture2D(uImage, displacedUv);
        }
      `,
    });
    scene.add(new THREE.Mesh(geometry, material));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(imageWidth, imageHeight, false);
    renderer.setClearColor(0x101827, 1);
    webglReadyRef.current = true;

    let frame = 0;
    const animate = () => {
      const currentPointer = pointerRef.current;
      material.uniforms.uPointer.value.set(currentPointer.x, currentPointer.y);
      material.uniforms.uStrength.value = strength;
      material.uniforms.uInvert.value = invert ? 1 : 0;
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      webglReadyRef.current = false;
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      imageTexture.dispose();
      depthTexture.dispose();
    };
  }, [depthMap, effectiveDepthMap, imageUrl, invert, strength]);

  useEffect(() => {
    if (!autoMotion || !depthMap) return;
    let animationFrame = 0;
    const startedAt = performance.now();
    const animate = (now: number) => {
      const elapsed = (now - startedAt) / 1000;
      const nextPointer = { x: Math.sin(elapsed * 1.25) * 0.82, y: Math.cos(elapsed * 0.9) * 0.22 };
      pointerRef.current = nextPointer;
      setPointer(nextPointer);
      animationFrame = requestAnimationFrame(animate);
    };
    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [autoMotion, depthMap]);

  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);

  const processFile = async (nextFile: File) => {
    if (!nextFile.type.startsWith('image/')) {
      setError(isZh ? '请选择 JPG、PNG 或 WebP 图片。' : 'Elige una imagen JPG, PNG o WebP.');
      return;
    }
    if (nextFile.size > 20 * 1024 * 1024) {
      setError(isZh ? '图片不能超过 20 MB。' : 'La imagen no puede superar 20 MB.');
      return;
    }
    setError('');
    setProtectedRects([]);
    setProtectDraftRect(null);
    setProtectMode(false);
    setManualDepthMap(null);
    setManualMode(false);
    setFile(nextFile);
    const nextUrl = URL.createObjectURL(nextFile);
    setImageUrl(nextUrl);
    setStatus('loading');
    setStatusDetail(isZh ? '正在加载 AI 模型…' : 'Cargando modelo de IA…');
    const image = new Image();
    image.onload = async () => {
      originalImageRef.current = image;
      setImageAspect(image.naturalWidth / Math.max(1, image.naturalHeight));
      try {
        const estimator = await loadEstimator((detail) => setStatusDetail(`${isZh ? '模型' : 'Modelo'} ${detail}`));
        setStatus('processing');
        setStatusDetail(isZh ? '正在生成深度图…' : 'Generando mapa de profundidad…');
        const result = await estimator(await RawImage.fromBlob(nextFile));
        const depth = result.depth;
        const depthData = depth.data;
        const channels = depth.channels;
        const grayscale = new Uint8ClampedArray(depth.width * depth.height);
        for (let i = 0; i < grayscale.length; i += 1) grayscale[i] = depthData[i * channels] ?? 128;
        setDepthMap({ data: grayscale, width: depth.width, height: depth.height });
        setStatus('ready');
        setStatusDetail(isZh ? '已完成，本地处理' : 'Listo, procesado localmente');
      } catch (err) {
        console.error(err);
        setStatus('error');
        setStatusDetail('');
        setError(isZh ? '模型加载或深度生成失败，请刷新后重试。' : 'No se pudo cargar el modelo o generar la profundidad.');
      }
    };
    image.onerror = () => { setStatus('error'); setError(isZh ? '图片无法读取。' : 'No se pudo leer la imagen.'); };
    image.src = nextUrl;
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0];
    if (nextFile) void processFile(nextFile);
    event.target.value = '';
  };

  const downloadDepth = async () => {
    if (depthCanvasRef.current) downloadBlob(await canvasBlob(depthCanvasRef.current), 'temco-depth-map.png');
  };

  const downloadOriginal = async () => {
    if (file) downloadBlob(await imageBlob(file), 'temco-original.jpg');
  };

  const downloadZip = async () => {
    if (!file || !depthCanvasRef.current || !previewCanvasRef.current) return;
    const zip = new JSZip();
    const facebookDepthCanvas = document.createElement('canvas');
    // Do not add a large blur here. Facebook needs the foreground/background
    // separation in the depth map; only the user's explicit blur is applied.
    renderDepthCanvas(facebookDepthCanvas, effectiveDepthMap, invert, contrast, blur);
    const exportBase = (file.name.replace(/\.[^.]+$/, '') || 'temco-3d').replace(/[^a-zA-Z0-9_-]+/g, '_');
    zip.file(`${exportBase}.jpg`, await imageBlob(file));
    zip.file(`${exportBase}_depth.png`, await canvasBlob(facebookDepthCanvas));
    zip.file('depth-map-preview.png', await canvasBlob(depthCanvasRef.current));
    zip.file('3d-preview.jpg', await canvasBlob(previewCanvasRef.current, 'image/jpeg', 0.92));
    zip.file('README.txt', `TEMCO AI 3D Studio\nDepth Anything V2 Small\nProcessed locally in the browser.\nPoster text protection: ${autoTextProtect ? 'enabled' : 'disabled'}.\nManual text/logo protection areas: ${protectedRects.length}.\nThe Facebook pair uses matching names: ${exportBase}.jpg + ${exportBase}_depth.png.\nUpload both files together for the Facebook 3D photo.`);
    downloadBlob(await zip.generateAsync({ type: 'blob' }), 'temco-ai-3d-export.zip');
  };

  const handlePreviewMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const nextPointer = { x: ((event.clientX - rect.left) / rect.width - 0.5) * 2, y: ((event.clientY - rect.top) / rect.height - 0.5) * 2 };
    pointerRef.current = nextPointer;
    setPointer(nextPointer);
  };

  const getDepthPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!depthMap) return null;
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(depthMap.width - 1, Math.floor((event.clientX - rect.left) / rect.width * depthMap.width))),
      y: Math.max(0, Math.min(depthMap.height - 1, Math.floor((event.clientY - rect.top) / rect.height * depthMap.height))),
    };
  };

  const handleDepthAdjustDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!manualMode || !depthMap) return;
    const point = getDepthPoint(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const base = manualDepthMap || protectDepthAreas(protectPosterTextBand(depthMap, autoTextProtect), protectedRects);
    manualGestureRef.current = { startX: point.x, startY: point.y, base: { ...base, data: new Uint8ClampedArray(base.data) } };
  };

  const handleDepthAdjustMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const gesture = manualGestureRef.current;
    if (!manualMode || !gesture || !depthMap) return;
    const point = getDepthPoint(event);
    if (!point) return;
    const delta = Math.max(-90, Math.min(90, (gesture.startY - point.y) * 1.4));
    const output = new Uint8ClampedArray(gesture.base.data);
    const radius = Math.max(4, Math.round(brushSize / 2));
    const left = Math.max(0, point.x - radius);
    const right = Math.min(depthMap.width - 1, point.x + radius);
    const top = Math.max(0, point.y - radius);
    const bottom = Math.min(depthMap.height - 1, point.y + radius);
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        const distance = Math.hypot(x - point.x, y - point.y);
        if (distance > radius) continue;
        const falloff = 1 - distance / radius;
        const index = y * depthMap.width + x;
        output[index] = Math.max(0, Math.min(255, Math.round(gesture.base.data[index] + delta * falloff)));
      }
    }
    setManualDepthMap({ ...gesture.base, data: output });
  };

  const handleDepthAdjustUp = () => {
    manualGestureRef.current = null;
  };

  const getNormalizedPoint = (event: React.PointerEvent<HTMLDivElement>) => {
    const image = event.currentTarget.querySelector('img');
    const rect = image?.getBoundingClientRect() || event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  };

  const handleProtectDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!protectMode) return;
    const point = getNormalizedPoint(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    const current = protectDraftRect;
    const inside = current && point.x >= current.x && point.x <= current.x + current.w && point.y >= current.y && point.y <= current.y + current.h;
    protectGestureRef.current = { mode: inside ? 'move' : 'draw', start: point, base: inside ? current : null };
    setSelectionStart(point);
    if (!inside) setProtectDraftRect(null);
  };

  const handleProtectMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = protectGestureRef.current;
    if (!protectMode || !selectionStart || !gesture) return;
    const point = getNormalizedPoint(event);
    if (gesture.mode === 'draw') {
      setProtectDraftRect({
        x: Math.min(selectionStart.x, point.x),
        y: Math.min(selectionStart.y, point.y),
        w: Math.abs(point.x - selectionStart.x),
        h: Math.abs(point.y - selectionStart.y),
      });
      return;
    }
    const base = gesture.base;
    if (!base) return;
    setProtectDraftRect({
      ...base,
      x: Math.max(0, Math.min(1 - base.w, base.x + point.x - gesture.start.x)),
      y: Math.max(0, Math.min(1 - base.h, base.y + point.y - gesture.start.y)),
    });
  };

  const handleProtectUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!protectMode || !selectionStart) return;
    handleProtectMove(event);
    setSelectionStart(null);
    protectGestureRef.current = null;
  };

  const nudgeProtectDraft = (dx: number, dy: number) => {
    setProtectDraftRect((current) => current ? {
      ...current,
      x: Math.max(0, Math.min(1 - current.w, current.x + dx)),
      y: Math.max(0, Math.min(1 - current.h, current.y + dy)),
    } : current);
  };

  const saveProtectDraft = () => {
    if (!protectDraftRect || protectDraftRect.w < 0.01 || protectDraftRect.h < 0.01) return;
    setProtectedRects((current) => [...current, protectDraftRect]);
    setProtectDraftRect(null);
    setManualDepthMap(null);
    setSelectionStart(null);
    protectGestureRef.current = null;
  };

  const clearProtection = () => {
    setProtectedRects([]);
    setProtectDraftRect(null);
    setProtectMode(false);
    setSelectionStart(null);
    protectGestureRef.current = null;
  };

  const title = isZh ? 'TEMCO AI 3D Studio' : 'TEMCO AI 3D Studio';
  return (
    <div className="ai3d-page">
      <header className="ai3d-header">
        <div>
          <div className="ai3d-kicker">TEMCO PRODUCT STUDIO · LOCAL AI</div>
          <h1>{title}</h1>
          <p>{isZh ? '把产品图片转换为深度图和 3D 视差预览。图片默认不会上传服务器。' : 'Convierte imágenes de producto en mapas de profundidad y previews 3D. Tus imágenes se procesan localmente.'}</p>
        </div>
        <div className="ai3d-header-actions">
          <button type="button" className="ai3d-ghost-button" onClick={() => setLang(isZh ? 'es' : 'zh')}>{isZh ? 'Español' : '中文'}</button>
          <button type="button" className="ai3d-ghost-button" onClick={() => { window.location.href = '/'; }}>{isZh ? '返回工作台' : 'Volver al estudio'}</button>
        </div>
      </header>

      <main className="ai3d-main">
        {!file ? (
          <section className="ai3d-upload-panel">
            <div className="ai3d-upload-icon">✦</div>
            <h2>{isZh ? '上传一张产品图片' : 'Sube una imagen de producto'}</h2>
            <p>{isZh ? '支持 JPG、PNG、WebP，最大 20 MB。AI 在浏览器本地运行。' : 'JPG, PNG o WebP, máximo 20 MB. La IA se ejecuta en tu navegador.'}</p>
            <button type="button" className="ai3d-primary-button" onClick={() => inputRef.current?.click()}>{isZh ? '选择图片' : 'Elegir imagen'}</button>
            <input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} />
          </section>
        ) : (
          <>
            <section className="ai3d-toolbar">
              <div className="ai3d-file-info"><strong>{file.name}</strong><span>{statusDetail || (status === 'ready' ? 'Ready' : 'Processing')}</span></div>
              <button type="button" className="ai3d-ghost-button" onClick={() => { if (file) void processFile(file); }}>{isZh ? '重新生成深度图' : 'Regenerar profundidad'}</button>
              <button type="button" className="ai3d-ghost-button" onClick={() => inputRef.current?.click()}>{isZh ? '更换图片' : 'Cambiar imagen'}</button>
              <input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} />
            </section>
            {error && <div className="ai3d-error">{error}</div>}
            <section className="ai3d-workspace">
              <div className="ai3d-view-card"><div className="ai3d-view-label">{isZh ? '原图' : 'Original'}{protectMode && <span className="ai3d-protect-hint"> · {isZh ? '每次拖动新增区域，框内拖动移动当前区域' : 'cada arrastre añade una zona'}</span>}</div><div className={`ai3d-image-frame ${protectMode ? 'ai3d-selectable-frame' : ''}`} style={{ aspectRatio: imageAspect }} onPointerDown={handleProtectDown} onPointerMove={handleProtectMove} onPointerUp={handleProtectUp} onPointerCancel={handleProtectUp}>{imageUrl && <img src={imageUrl} alt="Original" />}{protectedRects.map((rect, index) => <div key={`saved-${index}`} className="ai3d-protect-rect" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }} />)}{protectDraftRect && <div className="ai3d-protect-rect pending" style={{ left: `${protectDraftRect.x * 100}%`, top: `${protectDraftRect.y * 100}%`, width: `${protectDraftRect.w * 100}%`, height: `${protectDraftRect.h * 100}%` }} />}</div></div>
              <div className="ai3d-view-card"><div className="ai3d-view-label">{isZh ? '深度图' : 'Mapa de profundidad'}{manualMode && <span className="ai3d-protect-hint"> · {isZh ? '上下拖动调节深度' : 'arrastra arriba o abajo'}</span>}</div><div className={`ai3d-image-frame ai3d-checker ${manualMode ? 'ai3d-adjustable-frame' : ''}`} style={{ aspectRatio: imageAspect }}><canvas ref={depthCanvasRef} onPointerDown={handleDepthAdjustDown} onPointerMove={handleDepthAdjustMove} onPointerUp={handleDepthAdjustUp} onPointerCancel={handleDepthAdjustUp} /></div></div>
              <div className="ai3d-view-card ai3d-preview-card"><div className="ai3d-view-label">{isZh ? '3D 视差预览' : 'Preview 3D parallax'}</div><div className="ai3d-image-frame ai3d-preview-frame" style={{ aspectRatio: imageAspect }}><canvas ref={previewCanvasRef} onPointerMove={handlePreviewMove} onPointerLeave={() => { const nextPointer = { x: 0, y: 0 }; pointerRef.current = nextPointer; setPointer(nextPointer); }} /></div></div>
            </section>
            <section className="ai3d-controls">
              <label><span>{isZh ? '深度强度' : 'Intensidad'}</span><input type="range" min="0" max="1.5" step="0.01" value={strength} onChange={(e) => setStrength(Number(e.target.value))} /><output>{strength.toFixed(2)}</output></label>
              <label><span>{isZh ? '对比度' : 'Contraste'}</span><input type="range" min="-100" max="100" step="1" value={contrast} onChange={(e) => setContrast(Number(e.target.value))} /><output>{contrast}</output></label>
              <label><span>{isZh ? '边缘模糊' : 'Desenfoque'}</span><input type="range" min="0" max="8" step="1" value={blur} onChange={(e) => setBlur(Number(e.target.value))} /><output>{blur}px</output></label>
              <label className="ai3d-check-control"><input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} /><span>{isZh ? '反转深度' : 'Invertir profundidad'}</span></label>
              <label className="ai3d-check-control"><input type="checkbox" checked={autoTextProtect} onChange={(e) => setAutoTextProtect(e.target.checked)} /><span>{isZh ? '自动保护海报文字' : 'Proteger texto del póster'}</span></label>
              <label className="ai3d-check-control"><input type="checkbox" checked={autoMotion} onChange={(e) => setAutoMotion(e.target.checked)} /><span>{isZh ? '自动运动预览' : 'Movimiento automático'}</span></label>
              <button type="button" className={protectMode ? 'ai3d-tool-button active' : 'ai3d-tool-button'} onClick={() => { setProtectMode((value) => !value); setProtectDraftRect(null); }}>{protectMode ? (isZh ? '退出编辑' : 'Salir de edición') : (isZh ? `编辑保护区域${protectedRects.length ? ` (${protectedRects.length})` : ''}` : `Editar protección${protectedRects.length ? ` (${protectedRects.length})` : ''}`)}</button>
              {protectMode && <div className="ai3d-protection-editor"><span>{protectDraftRect ? (isZh ? '当前区域：框内拖动或微调' : 'Zona actual: arrastra o ajusta') : (isZh ? '拖动原图添加新的保护区域' : 'Arrastra para añadir una zona')}</span>{protectDraftRect && <><div className="ai3d-nudge-grid"><button type="button" title={isZh ? '向上移动' : 'Mover arriba'} onClick={() => nudgeProtectDraft(0, -0.01)}>↑</button><button type="button" title={isZh ? '向左移动' : 'Mover izquierda'} onClick={() => nudgeProtectDraft(-0.01, 0)}>←</button><button type="button" title={isZh ? '向右移动' : 'Mover derecha'} onClick={() => nudgeProtectDraft(0.01, 0)}>→</button><button type="button" title={isZh ? '向下移动' : 'Mover abajo'} onClick={() => nudgeProtectDraft(0, 0.01)}>↓</button></div><button type="button" className="ai3d-save-protection" onClick={saveProtectDraft}>{isZh ? '保存当前区域' : 'Guardar zona'}</button></>}</div>}
              {protectMode && (protectDraftRect || protectedRects.length > 0) && <button type="button" className="ai3d-tool-button" onClick={clearProtection}>{isZh ? '清除全部保护区' : 'Quitar todas'}</button>}
              <button type="button" className={manualMode ? 'ai3d-tool-button active' : 'ai3d-tool-button'} onClick={() => { setManualMode((value) => !value); manualGestureRef.current = null; }}>{manualMode ? (isZh ? '完成手动调节' : 'Terminar ajuste') : (isZh ? '手动调节深度' : 'Ajustar profundidad')}</button>
              {manualMode && <label className="ai3d-brush-control"><span>{isZh ? '画笔' : 'Pincel'}</span><input type="range" min="20" max="180" step="5" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} /><output>{brushSize}px</output></label>}
              {manualDepthMap && <button type="button" className="ai3d-tool-button" onClick={() => setManualDepthMap(null)}>{isZh ? '撤销手动调整' : 'Deshacer ajuste'}</button>}
            </section>
            <section className="ai3d-export-panel">
              <div><strong>{isZh ? '导出结果' : 'Exportar resultados'}</strong><small>{isZh ? '当前图片和深度图均在本地生成。' : 'La imagen y el mapa se generan localmente.'}</small></div>
              <div className="ai3d-export-actions"><button type="button" onClick={() => void downloadDepth()} disabled={!depthMap}>{isZh ? '下载深度 PNG' : 'Descargar Depth PNG'}</button><button type="button" onClick={() => void downloadOriginal()}>{isZh ? '下载原图 JPG' : 'Descargar original JPG'}</button><button type="button" className="ai3d-primary-button" onClick={() => void downloadZip()} disabled={!depthMap}>{isZh ? '导出 3D ZIP' : 'Exportar ZIP 3D'}</button></div>
            </section>
          </>
        )}
        {status === 'loading' && <div className="ai3d-loading"><span className="ai3d-spinner" />{isZh ? '首次使用需要下载模型，之后会使用浏览器缓存。' : 'La primera vez se descarga el modelo y después queda en caché.'}</div>}
      </main>
    </div>
  );
}
