// 手机采集页面（文档 7 / 8 / 9 / 10 / 11 / 14）
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMobileCaptureSession } from '../hooks/useMobileCaptureSession';
import { useI18n, LangSwitch } from '../i18n';
import { mobileCaptureApi, getMobileToken } from '../services/api';
import SessionStart from '../components/mobileCapture/SessionStart';
import ProductScanner from '../components/mobileCapture/ProductScanner';
import ProductSearch from '../components/mobileCapture/ProductSearch';
import ProductSummary from '../components/mobileCapture/ProductSummary';
import CameraCapture from '../components/mobileCapture/CameraCapture';
import CaptureImageCard from '../components/mobileCapture/CaptureImageCard';
import ImageRoleSelector from '../components/mobileCapture/ImageRoleSelector';
import ColorSelector from '../components/mobileCapture/ColorSelector';
import ColorSwatch, { DEFAULT_COLOR_HEX } from '../components/mobileCapture/ColorSwatch';
import InventoryInput, { InventoryRow } from '../components/mobileCapture/InventoryInput';
import PhoneModelSelector, { SelectedPhoneModel } from '../components/mobileCapture/PhoneModelSelector';
import UploadQueue, { UploadQueueItem } from '../components/mobileCapture/UploadQueue';
import AudioNoteRecorder from '../components/mobileCapture/AudioNoteRecorder';
import { ProductMatchCandidate, CaptureStatusInfo, MatchResult, MobileCapture, MobileCaptureImage, MobileSession } from '../types/mobileCapture';
import { IMAGE_ROLES, roleLabel } from '../services/mobileColors';
import { prestashopApi } from '../services/api';
import { useToast } from '../components/ui/ToastProvider';
import { useConfirm } from '../components/ui/ConfirmProvider';

type Tab = 'scan' | 'search';

interface PendingFile {
  id: string;
  file: File;
  previewUrl: string;
}

export default function MobileCapturePage() {
  const { t } = useI18n();
  const { toast, success, error: toastError, info: toastInfo, warning: toastWarning } = useToast();
  const { confirm } = useConfirm();
  const { auth, session, error, login, logout, startSession, completeSession, cancelSession, setCurrentSession } = useMobileCaptureSession();

  // 会话选择状态
  const [sessionList, setSessionList] = useState<MobileSession[]>([]);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [showNewSessionForm, setShowNewSessionForm] = useState(false);
  const [draftTasks, setDraftTasks] = useState<any[]>([]);

  // 主采集状态
  const [tab, setTab] = useState<Tab>('scan');
  const [candidate, setCandidate] = useState<ProductMatchCandidate | null>(null);
  const [captureStatus, setCaptureStatus] = useState<CaptureStatusInfo | null>(null);
  const [capture, setCapture] = useState<MobileCapture | null>(null);
  const [images, setImages] = useState<MobileCaptureImage[]>([]);
  const [productColors, setProductColors] = useState<string[]>([]);
  const [inventoryRows, setInventoryRows] = useState<InventoryRow[]>([]);
  // 手机壳点货：手机型号（按品牌分组，型号×颜色，仅统计不同步网站）
  const [phoneModelGroups, setPhoneModelGroups] = useState<{ brand: string; models: string[] }[]>([]);
  const [syncingModels, setSyncingModels] = useState(false);
  const [selectedModels, setSelectedModels] = useState<SelectedPhoneModel[]>([]);
  const phoneModelsSaveTimer = useRef<number | null>(null);
  // 产品固定颜色：点型号自动勾选
  const [fixedColors, setFixedColors] = useState<string[]>([]);
  const [showFixedColorsEditor, setShowFixedColorsEditor] = useState(false);
  const [editingFixedColors, setEditingFixedColors] = useState<string[]>([]);
  const [savingFixedColors, setSavingFixedColors] = useState(false);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [duplicatePrompt, setDuplicatePrompt] = useState<CaptureStatusInfo['activeCapture'] | null>(null);

  // 待上传文件
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [uploadTarget, setUploadTarget] = useState<{ fileId: string; role: string; colors: string[] } | null>(null);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [networkOk, setNetworkOk] = useState(true);
  // 网站现有变体颜色（与审核端同步的变体一致）
  const [websiteColors, setWebsiteColors] = useState<string[]>([]);
  // 网站颜色名 → hex 色值（点货色块显示用）
  const [websiteColorHex, setWebsiteColorHex] = useState<Record<string, string>>({});
  // 网站颜色名 → 纹理小图片 URL（上传了图片的颜色用）
  const [websiteColorTexture, setWebsiteColorTexture] = useState<Record<string, string>>({});

  // 新增产品（扫码/搜索无匹配时）
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [newProductPrefill, setNewProductPrefill] = useState<{ ean13?: string; serialNumber?: string }>({});

  // 搜索结果记忆（用于从产品详情返回列表，避免重新搜索）
  const [lastSearchResult, setLastSearchResult] = useState<MatchResult | null>(null);
  const [showSearchResult, setShowSearchResult] = useState(false);

  const objectUrlsRef = useRef<string[]>([]);

  // 加载网站颜色属性值（失败则回退默认常用色）
  useEffect(() => {
    let mounted = true;
    prestashopApi.getOptionValues('color').then(res => {
      if (mounted && res.success && res.data?.length) {
        setWebsiteColors(res.data.map((v: any) => v.name));
        const hex: Record<string, string> = {};
        const texture: Record<string, string> = {};
        for (const v of res.data as any[]) {
          if (v.color && !hex[v.name]) hex[v.name] = v.color;
          if (v.textureUrl && !texture[v.name]) texture[v.name] = v.textureUrl;
        }
        setWebsiteColorHex(hex);
        setWebsiteColorTexture(texture);
      }
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  // 加载手机型号目录（手机壳点货统计用，按品牌分组）
  useEffect(() => {
    let mounted = true;
    mobileCaptureApi.getPhoneModels().then(res => {
      if (mounted && res.success && Array.isArray(res.data)) setPhoneModelGroups(res.data);
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  // 网络状态检测（文档 7.1）
  useEffect(() => {
    const check = () => {
      fetch('/api/health').then(r => setNetworkOk(r.ok)).catch(() => setNetworkOk(false));
    };
    check();
    const t = window.setInterval(check, 15000);
    return () => window.clearInterval(t);
  }, []);

  // 加载会话列表
  const loadSessions = useCallback(async () => {
    try {
      const res = await mobileCaptureApi.getSessions('active');
      if (res.success) setSessionList(res.data || []);
    } catch { /* 忽略 */ }
  }, []);

  // 加载本操作员的未完成/待审核任务（草稿/已提交/退回，手机端可继续或删除）
  const loadDraftTasks = useCallback(async () => {
    if (!auth.token) return;
    try {
      const res = await mobileCaptureApi.getCaptures({ captureStatus: 'draft,submitted,rejected', operator: auth.operatorName, pageSize: 50 });
      if (res.success && Array.isArray(res.data)) setDraftTasks(res.data);
    } catch { /* 忽略 */ }
  }, [auth.token, auth.operatorName]);

  // 删除未提交任务（草稿，删除后不可恢复）
  const handleDeleteDraft = useCallback(async (taskId: number) => {
    const ok = await confirm(t('task.deleteConfirm'), { title: t('task.deleteTitle') || '删除任务', danger: true });
    if (!ok) return;
    try {
      const res = await mobileCaptureApi.deleteCapture(taskId);
      if (res.success) {
        success(t('task.deleted'), { vibrate: true });
        loadDraftTasks();
      } else {
        toastError(res.error || t('task.deleteFail'));
      }
    } catch (e: any) {
      toastError(t('task.deleteFail') + ': ' + e.message);
    }
  }, [t, loadDraftTasks, confirm, success, toastError]);

  // 删除当前正在采集的任务
  const handleDeleteCurrent = async () => {
    if (!capture) return;
    const ok = await confirm(t('task.deleteCurrentConfirm'), { title: t('task.deleteTitle') || '删除任务', danger: true });
    if (!ok) return;
    try {
      const res = await mobileCaptureApi.deleteCapture(capture.id);
      if (res.success) {
        success(t('task.deleted'), { vibrate: true });
        resetCurrent();
        setShowSessionPicker(true);
        loadDraftTasks();
      } else {
        toastError(res.error || t('task.deleteFail'));
      }
    } catch (e: any) {
      toastError(t('task.deleteFail') + ': ' + e.message);
    }
  };

  // 删除会话（级联删除其下所有任务，不可恢复）
  const handleDeleteSession = async (s: MobileSession) => {
    const n = s.capture_count || 0;
    const msg = n > 0
      ? t('session.deleteConfirmWithTasks').replace('{code}', s.session_code).replace('{n}', String(n))
      : t('session.deleteConfirm').replace('{code}', s.session_code);
    const ok = await confirm(msg, { title: t('session.deleteTitle') || '删除会话', danger: true });
    if (!ok) return;
    try {
      const res = await mobileCaptureApi.deleteSession(s.id);
      if (res.success) {
        success(t('session.deleted'), { vibrate: true });
        loadSessions();
        loadDraftTasks();
      } else {
        toastError(res.error || t('session.deleteFail'));
      }
    } catch (e: any) {
      toastError(t('session.deleteFail') + ': ' + e.message);
    }
  };

  // auth 就绪（表单登录 或 localStorage 恢复）→ 显示会话选择 + 加载会话/未提交任务
  useEffect(() => {
    if (auth.token) {
      setShowSessionPicker(true);
      loadSessions();
      loadDraftTasks();
    }
  }, [auth.token, loadSessions, loadDraftTasks]);

  // 已有活跃会话时自动恢复
  useEffect(() => {
    if (auth.token && session) {
      // 校验会话仍 active
      mobileCaptureApi.getSession(session.id).then(res => {
        if (res.success && res.data.status !== 'active') {
          setCurrentSession(null);
        }
      }).catch(() => {});
    }
  }, [auth.token, session, setCurrentSession]);

  const handleLoggedIn = async () => {
    setShowSessionPicker(true);
    await loadSessions();
    // 未提交任务由 loadDraftTasks（auth 就绪 effect）加载，避免闭包捕获旧 auth 导致 operator 缺失
    // 登录后加载手机型号目录（需手机 token）
    mobileCaptureApi.getPhoneModels().then(res => {
      if (res.success && Array.isArray(res.data)) setPhoneModelGroups(res.data);
    }).catch(() => {});
  };

  // 手动刷新手机型号（强制与网站同步，新加分类立即生效）
  const refreshPhoneModels = async () => {
    setSyncingModels(true);
    try {
      await mobileCaptureApi.syncPhoneModels();
      const res = await mobileCaptureApi.getPhoneModels();
      if (res.success && Array.isArray(res.data)) setPhoneModelGroups(res.data);
    } catch { /* 忽略 */ }
    finally { setSyncingModels(false); }
  };

  // 勾选手机型号：立即更新 + 防抖自动保存（避免离开界面后丢失）
  const handlePhoneModelsChange = (models: SelectedPhoneModel[]) => {
    setSelectedModels(models);
    if (!capture) return;
    if (phoneModelsSaveTimer.current) window.clearTimeout(phoneModelsSaveTimer.current);
    phoneModelsSaveTimer.current = window.setTimeout(() => {
      mobileCaptureApi.savePhoneModels(capture.id, models.map(m => ({ brand: '', model: m.model, colors: m.colors }))).catch(() => {});
    }, 800);
  };

  // 保存产品固定颜色
  const saveFixedColors = async (colors: string[]) => {
    if (!candidate) return;
    setSavingFixedColors(true);
    try {
      const res = await mobileCaptureApi.saveFixedColors(candidate.productId, colors);
      if (res.success) {
        setFixedColors(colors);
        setShowFixedColorsEditor(false);
        success(t('alert.saved') || '已保存', { vibrate: true });
      } else {
        toastError(res.error || t('alert.saveFixedFail'));
      }
    } catch (e: any) {
      toastError(t('alert.saveFixedFail') + ': ' + e.message);
    } finally {
      setSavingFixedColors(false);
    }
  };

  // === 选择产品 ===
  const handleSelectProduct = useCallback(async (c: ProductMatchCandidate, result?: MatchResult | null) => {
    // 记住搜索结果（有候选列表时），供返回按钮恢复
    if (result?.candidates?.length) {
      setLastSearchResult(result);
      setShowSearchResult(false);
    }
    setCandidate(c);
    setFixedColors(c.fixedColors || []);
    setCaptureStatus(null);
    try {
      const res = await mobileCaptureApi.getCaptureStatus(c.productId);
      if (res.success) {
        setCaptureStatus(res.data);
        if (res.data.activeCapture) {
          // 已有未完成采集任务 → 弹窗（继续/新建/取消）
          setDuplicatePrompt(res.data.activeCapture);
        } else if (res.data.product.lastCapture) {
          // 已采集过（已审核/已同步）→ 提示后确认是否新建
          const last = res.data.product.lastCapture;
          const ok = await confirm(
            t('alert.alreadyCaptured').replace('{st}', last.status).replace('{tm}', (last.createdAt || '').slice(0, 16).replace('T', ' ')),
            { title: t('alert.alreadyCapturedTitle') || '重新采集' }
          );
          if (ok) await createNewCapture(c);
          else resetCurrent();
        } else {
          await createNewCapture(c);
        }
      }
    } catch (e: any) {
      toastError(t('capture.loadFail') + ': ' + e.message);
    }
    // 注意：createNewCapture / resetCurrent 在调用时解析（前向引用），不列入依赖数组
  }, [session, t, confirm, toastError]); // 依赖 session：闭包需使用当前会话

  // 创建新采集任务
  const createNewCapture = useCallback(async (c: ProductMatchCandidate) => {
    if (!session) { toastWarning(t('alert.needSession'), { vibrate: true }); return null; }
    setLoading(true);
    try {
      const res = await mobileCaptureApi.createCapture({
        sessionId: session.id,
        productId: c.productId,
        prestashopProductId: c.prestashopId ? parseInt(c.prestashopId, 10) || 0 : 0,
        serialNumber: c.serialNumber,
        reference: c.reference,
        ean13: c.ean13,
        model: c.model,
      });
      if (res.success) {
        setCapture(res.data);
        setImages([]);
        setProductColors([]);
        setInventoryRows([]);
        setNotes('');
        return res.data;
      }
      if (res.error === 'duplicate') {
        setDuplicatePrompt(res.data);
        return null;
      }
      toastError(res.error || t('alert.createFail'));
      return null;
    } catch (e: any) {
      toastError(t('alert.createTaskFail') + ': ' + e.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [session, t, toastError]);

  // 继续原任务（8.5）
  const continueExisting = useCallback(async (captureId: number) => {
    setDuplicatePrompt(null);
    setLoading(true);
    try {
      const res = await mobileCaptureApi.getCapture(captureId);
      if (res.success) {
        const d = res.data;
        setCapture(d);
        // 构造候选信息，确保从任意入口（含未提交任务列表）进入都显示产品详情与点货区
        setCandidate({
          productId: d.product_id,
          reference: d.reference || '',
          name: d.product_name || '',
          model: d.model || '',
          ean13: d.ean13 || '',
          serialNumber: d.serial_number || '',
          brand: d.brand || '',
          category: d.category || '',
          prestashopId: d.prestashop_product_id ? String(d.prestashop_product_id) : '',
          price: d.price ?? null,
          soldOut: d.product_sold_out ?? false,
          fixedColors: (() => { try { const a = JSON.parse(d.product_fixed_colors || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } })(),
          matchMethod: 'task',
          matchedValue: '',
          confidence: 1,
        } as any);
        setFixedColors((() => { try { const a = JSON.parse(d.product_fixed_colors || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } })());
        setImages(d.images || []);
        const colors: string[] = Array.from(new Set<string>([
          ...((d.colors && JSON.parse(d.colors)) || []),
          ...(d.images || []).flatMap((i: any) => (i.color_names || '').split(',').map((s: string) => s.trim()).filter(Boolean)),
        ]));
        setProductColors(colors);
        setInventoryRows((d.inventory || []).map((i: any) => ({ colorName: i.color_name, quantity: i.quantity, countType: i.count_type })));
        setNotes(d.notes || '');
        // 回填手机型号（点货统计，型号×颜色）
        try {
          const pm = d.phone_models ? JSON.parse(d.phone_models) : [];
          setSelectedModels(Array.isArray(pm)
            ? pm.map((x: any) => ({ model: x.model || '', colors: Array.isArray(x.colors) ? x.colors : [] }))
            : []);
        } catch { setSelectedModels([]); }
      }
    } catch (e: any) {
      toastError(t('alert.loadTaskFail') + ': ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // === 拍照 → 待上传列表 ===
  const handleFiles = useCallback((files: File[]) => {
    const items = files.map(file => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const previewUrl = URL.createObjectURL(file);
      objectUrlsRef.current.push(previewUrl);
      return { id, file, previewUrl };
    });
    setPendingFiles(prev => [...prev, ...items]);
  }, []);

  // 打开上传设置对话框
  const openUploadDialog = (fileId: string) => {
    setUploadTarget({ fileId, role: 'front', colors: [] });
  };

  // 确认上传
  const confirmUpload = async () => {
    if (!uploadTarget || !capture) return;
    const pf = pendingFiles.find(p => p.id === uploadTarget.fileId);
    if (!pf) { setUploadTarget(null); return; }
    const queueId = pf.id;
    // 保留 file 引用：失败后可自动/手动重试（成功或取消时释放）
    setUploadQueue(prev => [...prev, { id: queueId, filename: pf.file.name, role: uploadTarget.role, status: 'uploading', previewUrl: pf.previewUrl, file: pf.file }]);
    setPendingFiles(prev => prev.filter(p => p.id !== queueId));
    setUploadTarget(null);
    try {
      const res = await mobileCaptureApi.uploadImage(capture.id, pf.file, {
        role: uploadTarget.role,
        colors: uploadTarget.colors,
        sequence: images.length + 1,
      });
      if (res.success) {
        setUploadQueue(prev => prev.map(q => q.id === queueId ? { ...q, status: 'done', file: undefined } : q));
        if (res.duplicate) {
          toastWarning(t('alert.dupPhoto'));
        } else {
          setImages(prev => [...prev, res.data]);
          // 若图片带颜色，同步到产品颜色池
          if (uploadTarget.colors.length > 0) {
            setProductColors(prev => Array.from(new Set([...prev, ...uploadTarget.colors])));
          }
        }
      } else {
        setUploadQueue(prev => prev.map(q => q.id === queueId ? { ...q, status: 'failed', error: res.error || t('alert.uploadFail') } : q));
      }
    } catch (e: any) {
      setUploadQueue(prev => prev.map(q => q.id === queueId ? { ...q, status: 'failed', error: e.message } : q));
    }
  };

  /** 真正重试失败的上传（文件对象保留在队列里，无需重新拍照） */
  const retryUpload = async (id: string) => {
    if (!capture) return;
    const item = uploadQueue.find(q => q.id === id);
    if (!item || !item.file) {
      toastInfo(t('alert.retakePhoto'));
      setUploadQueue(prev => prev.filter(q => q.id !== id));
      return;
    }
    setUploadQueue(prev => prev.map(q => q.id === id ? { ...q, status: 'uploading', error: undefined } : q));
    try {
      const res = await mobileCaptureApi.uploadImage(capture.id, item.file!, {
        role: item.role,
        colors: [],
        sequence: images.length + 1,
      });
      if (res.success) {
        setUploadQueue(prev => prev.map(q => q.id === id ? { ...q, status: 'done', file: undefined } : q));
        if (res.duplicate) toastWarning(t('alert.dupPhoto'));
        else setImages(prev => [...prev, res.data]);
      } else {
        setUploadQueue(prev => prev.map(q => q.id === id ? { ...q, status: 'failed', error: res.error || t('alert.uploadFail') } : q));
        toastError(t('alert.uploadFail'), { vibrate: true });
      }
    } catch (e: any) {
      setUploadQueue(prev => prev.map(q => q.id === id ? { ...q, status: 'failed', error: e.message } : q));
      toastError(t('alert.uploadFail') + ': ' + e.message, { vibrate: true });
    }
  };

  // === 保存 ===
  const saveDraft = async (): Promise<boolean> => {
    if (!capture) return false;
    setSaving(true);
    try {
      await mobileCaptureApi.updateCaptureDraft(capture.id, { notes, colors: productColors });
      await mobileCaptureApi.saveInventory(capture.id, inventoryRows.map(r => ({
        colorName: r.colorName, quantity: r.countType === 'exact' || r.countType === 'estimated' ? r.quantity : null, countType: r.countType,
      })));
      await mobileCaptureApi.savePhoneModels(capture.id, selectedModels.map(m => ({ brand: '', model: m.model, colors: m.colors })));
      return true;
    } catch (e: any) {
      toastError(t('alert.saveFail') + ': ' + e.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  // 若任务已提交/审核过，先重新打开为草稿再继续（避免“submitted 无法提交”）
  const ensureDraft = async (): Promise<boolean> => {
    if (!capture) return false;
    try {
      const status = captureStatus?.activeCapture?.capture_status;
      if (status && status !== 'draft') {
        const r = await mobileCaptureApi.reopenCapture(capture.id, session?.id);
        if (!r.success) { toastError(r.message || t('alert.reopenFailMsg')); return false; }
        // 刷新本地状态（已重新打开为 draft）
        const st = await mobileCaptureApi.getCaptureStatus(capture.product_id);
        if (st.success) setCaptureStatus(st.data);
      }
      return true;
    } catch (e: any) {
      toastError(t('alert.reopenFail') + ': ' + e.message);
      return false;
    }
  };

  const submit = async () => {
    if (!capture) return;
    if (!await ensureDraft()) return;
    if (!await saveDraft()) return;
    if (images.length === 0) {
      const ok = await confirm(t('capture.noPhotoConfirm'), { title: t('capture.noPhotoTitle') || '提交确认', danger: false });
      if (!ok) return;
    }
    try {
      const res = await mobileCaptureApi.submitCapture(capture.id);
      if (res.success) {
        success(t('alert.submitted'), { vibrate: true });
        resetCurrent();
      } else {
        toastError(res.message || t('capture.submitFail'));
      }
    } catch (e: any) {
      toastError(t('capture.submitFail') + ': ' + e.message);
    }
  };

  // {t('capture.saveAndNext')}（文档 14）
  const saveAndNext = async () => {
    if (!capture) return;
    if (!await ensureDraft()) return;
    if (!await saveDraft()) return;
    if (images.length === 0) {
      toastWarning(t('alert.needPhoto'), { vibrate: true });
      return;
    }
    try {
      const res = await mobileCaptureApi.submitCapture(capture.id);
      if (res.success) {
        success(t('alert.submitted'), { vibrate: true });
        resetCurrent();
      } else {
        toastError(res.message || t('capture.submitFail'));
      }
    } catch (e: any) {
      toastError(t('capture.submitFail') + ': ' + e.message);
    }
  };

  const resetCurrent = () => {
    setCandidate(null);
    setCapture(null);
    setImages([]);
    setProductColors([]);
    setInventoryRows([]);
    setNotes('');
    setSelectedModels([]);
    setFixedColors([]);
    setShowFixedColorsEditor(false);
    setCaptureStatus(null);
    setPendingFiles([]);
    setUploadQueue([]);
  };

  // 清理 object URLs
  useEffect(() => {
    return () => { objectUrlsRef.current.forEach(u => URL.revokeObjectURL(u)); };
  }, []);

  // ===== 渲染 =====

  // 未登录
  if (!auth.token) {
    return (
      <MobileShell networkOk={networkOk}>
        <SessionStart
          loading={loading}
          error={error}
          hasActiveSession={false}
          onStart={async (pin, op, dev, area) => {
            await login(pin, op, dev, area);
            await handleLoggedIn();
          }}
        />
      </MobileShell>
    );
  }

  // 已登录但无活跃会话（或选择会话）
  if (!session || showSessionPicker) {
    return (
      <MobileShell networkOk={networkOk}>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 420, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>{t('session.title')}</h2>
            <button type="button" className="btn btn-sm" onClick={logout}>{t('session.logout')}</button>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {t('session.operator')}：{auth.operatorName} · {auth.deviceName}
          </div>

          {/* 新建会话：sticky 常驻顶部，避免会话列表长时往下拉很久 */}
          <div style={{ position: 'sticky', top: 36, zIndex: 40, background: 'var(--bg-primary)', margin: '0 -20px', padding: '8px 20px', borderBottom: '1px solid var(--border-color)' }}>
            <button type="button" className="btn btn-cta" style={{ width: '100%', padding: 12, fontSize: 15 }} onClick={() => setShowNewSessionForm(v => !v)}>
              {showNewSessionForm ? '− ' + t('session.collapse') : t('session.new')}
            </button>
            {showNewSessionForm && (
              <NewSessionForm
                onStart={async (area, note) => {
                  const s = await startSession(area, note, false);
                  if (s) {
                    setShowSessionPicker(false);
                    setShowNewSessionForm(false);
                  }
                }}
                loading={loading}
              />
            )}
          </div>

          {/* 我的任务：草稿 / 已提交 / 退回（手机端可继续或删除） */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px dashed var(--border-color)', paddingTop: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              {t('session.myTasksTitle').replace('{n}', String(draftTasks.length))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('session.myTasksHint')}</div>
            {draftTasks.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>{t('session.noDraft')}</div>
            )}
            {draftTasks.map(task => {
              const st = task.capture_status;
              const meta = st === 'submitted'
                ? { label: t('task.statusSubmitted'), color: '#3b82f6', bg: 'rgba(59,130,246,.08)' }
                : st === 'rejected'
                  ? { label: t('task.statusRejected'), color: '#dc2626', bg: 'rgba(220,38,38,.08)' }
                  : { label: t('task.statusDraft'), color: '#f59e0b', bg: 'rgba(245,158,11,.08)' };
              return (
                <div key={task.id} style={{ position: 'relative' }}>
                  <button type="button"
                    onClick={async () => {
                      // 进入任务所属会话（若不在当前会话列表则构造）
                      const owner = sessionList.find(s => s.id === task.session_id);
                      if (owner) setCurrentSession(owner);
                      else setCurrentSession({ id: task.session_id, session_code: task.session_code, operator_name: task.operator_name, area_code: '', capture_count: 0 } as any);
                      setShowSessionPicker(false);
                      await continueExisting(task.id);
                    }}
                    style={{ textAlign: 'left', width: '100%', padding: '10px 44px 10px 12px', borderRadius: 8, border: `1px solid ${meta.color}66`, background: meta.bg, cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.product_name || task.reference}</div>
                      <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: `${meta.color}1a`, color: meta.color }}>{meta.label}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {task.reference}{task.serial_number ? ' · ' + task.serial_number : ''} · {task.session_code} · {task.created_at?.slice(0, 16).replace('T', ' ')}
                    </div>
                    <div style={{ fontSize: 12, color: meta.color, fontWeight: 600, marginTop: 2 }}>
                      {st === 'draft' ? t('session.continueTask') : t('task.viewTask')}
                    </div>
                  </button>
                  {/* 删除任务（不要的进程直接删，不可恢复） */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleDeleteDraft(task.id); }}
                    aria-label={t('task.delete')}
                    title={t('task.delete')}
                    style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', fontSize: 18, cursor: 'pointer', color: '#dc2626', padding: '8px 6px', lineHeight: 1 }}
                  >
                    🗑
                  </button>
                </div>
              );
            })}
          </div>

          {sessionList.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('session.activeTitle')}：</div>
              {sessionList.map(s => (
                <div key={s.id} style={{ position: 'relative' }}>
                  <button type="button" onClick={() => { setCurrentSession(s); setShowSessionPicker(false); }}
                    style={{ textAlign: 'left', width: '100%', padding: '10px 44px 10px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', cursor: 'pointer' }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{s.session_code}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.operator_name} · {s.area_code || t('session.noArea')} · {t('session.tasks')} {s.capture_count || 0} · {s.created_at?.slice(0, 16).replace('T', ' ')}</div>
                  </button>
                  {/* 删除会话（连带其下任务，不可恢复） */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleDeleteSession(s); }}
                    aria-label={t('task.delete')}
                    title={t('task.delete')}
                    style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', fontSize: 18, cursor: 'pointer', color: '#dc2626', padding: '8px 6px', lineHeight: 1 }}
                  >
                    🗑
                  </button>
                </div>
              ))}
            </div>
          )}

        </div>
      </MobileShell>
    );
  }

  // 主采集界面
  return (
    <MobileShell networkOk={networkOk}>
      {/* 顶部：操作员/会话（渐变蓝 + 安全区） */}
      <div className="mobile-topbar mobile-safe-top" style={{ padding: '10px 16px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>📱 TEMCO Mobile Capture</span>
          <span style={{ fontSize: 11, opacity: .92 }}>{session.session_code} · {auth.operatorName}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span title={networkOk ? t('network.connected') : t('network.disconnected')} style={{ width: 10, height: 10, borderRadius: 10, background: networkOk ? '#4ade80' : '#f87171', boxShadow: networkOk ? '0 0 0 3px rgba(74,222,128,.25)' : '0 0 0 3px rgba(248,113,113,.25)' }} />
          {uploadQueue.some(q => q.status === 'pending' || q.status === 'failed') && (
            <span style={{ fontSize: 11, background: 'rgba(255,255,255,.22)', padding: '2px 8px', borderRadius: 10 }}>
              {t('queue.pendingCount')} {uploadQueue.filter(q => q.status !== 'done').length}
            </span>
          )}
          <button type="button" onClick={() => { setShowSessionPicker(true); loadSessions(); loadDraftTasks(); }} style={{ background: 'rgba(255,255,255,.18)', color: '#fff', border: '1px solid rgba(255,255,255,.35)', borderRadius: 8, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}>{t('session.btn')}</button>
        </div>
      </div>

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 90 }}>
        {/* 扫描 / 搜索切换 */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={() => setTab('scan')} className={tab === 'scan' ? 'btn btn-primary btn-sm' : 'btn btn-sm'}>{t('tab.scan')}</button>
          <button type="button" onClick={() => setTab('search')} className={tab === 'search' ? 'btn btn-primary btn-sm' : 'btn btn-sm'}>{t('tab.search')}</button>
          {candidate && (
            <button type="button" className="btn btn-sm" onClick={resetCurrent}>{t('tab.clear')}</button>
          )}
        </div>

        {!candidate ? (
          <>
            {tab === 'scan' ? (
              <ProductScanner onDetected={(code) => {
                // 扫码结果：EAN → 序列号 → Reference → 型号（8.3）
                mobileCaptureApi.searchProduct(code).then(res => {
                  if (res.success && res.data.match) {
                    handleSelectProduct(res.data.match);
                  } else if (res.success && res.data.candidates?.length === 1) {
                    handleSelectProduct(res.data.candidates[0]);
                  } else if (res.success && res.data.candidates?.length > 1) {
                    toastWarning(t('capture.multiMatch'), { vibrate: true });
                    setTab('search');
                  } else {
                    // 未找到 → 弹新增产品表单（扫码自动填条形码）
                    setNewProductPrefill({ ean13: code });
                    setShowNewProduct(true);
                  }
                }).catch(e => toastError(t('capture.queryFail') + ': ' + e.message));
              }} />
            ) : (
              <ProductSearch
                onSelect={handleSelectProduct}
                onManualCode={(code) => {
                  mobileCaptureApi.searchProduct(code).then(res => {
                    if (res.success && res.data.match) handleSelectProduct(res.data.match, res.data);
                    else if (res.success && res.data.candidates?.length > 0) {
                      toastInfo(t('capture.pickFromCandidates'));
                    } else {
                      setNewProductPrefill({ ean13: code });
                      setShowNewProduct(true);
                    }
                  });
                }}
                onAddNew={() => { setNewProductPrefill({}); setShowNewProduct(true); }}
                initialResult={showSearchResult ? lastSearchResult : null}
              />
            )}
          </>
        ) : (
          <>
            {/* 从搜索结果进入时，提供返回按钮（无需重新搜索） */}
            {lastSearchResult && (lastSearchResult.candidates?.length ?? 0) > 0 && (
              <button
                type="button"
                className="btn btn-sm"
                style={{ alignSelf: 'flex-start', borderColor: 'var(--accent)', color: 'var(--accent)' }}
                onClick={() => {
                  resetCurrent();
                  setTab('search');
                  setShowSearchResult(true);
                }}
              >
                {t('back.toResults')}
              </button>
            )}

            <ProductSummary candidate={candidate} captureStatus={captureStatus} loading={loading}
              onRefreshStatus={() => { if (candidate) handleSelectProduct(candidate); }} />

            {/* 重复采集提示（8.5） */}
            {duplicatePrompt && (
              <div style={{ padding: 12, borderRadius: 10, border: '1px solid #f59e0b', background: '#fef3c7', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#92400e' }}>{t('capture.duplicateTitle')}</div>
                <div style={{ fontSize: 12, color: '#78350f' }}>
                  {t('capture.duplicateCreated')}：{duplicatePrompt.created_at} · {t('product.images')} {duplicatePrompt.image_count}{duplicatePrompt.colors ? ` · ${duplicatePrompt.colors}` : ''}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => continueExisting(duplicatePrompt.id)}>{t('capture.duplicateContinue')}</button>
                  <button type="button" className="btn btn-sm" onClick={() => { setDuplicatePrompt(null); createNewCapture(candidate); }}>{t('capture.duplicateNew')}</button>
                  <button type="button" className="btn btn-sm" onClick={() => { setDuplicatePrompt(null); resetCurrent(); }}>{t('common.cancel')}</button>
                </div>
              </div>
            )}

            {capture && !duplicatePrompt && (
              <>
                {/* 拍照 */}
                <CameraCapture onFiles={handleFiles} uploading={uploadQueue.some(q => q.status === 'uploading')} disabled={!capture} />

                {/* 待上传设置 */}
                {pendingFiles.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('capture.pendingFiles').replace('{n}', String(pendingFiles.length))}：</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 6 }}>
                      {pendingFiles.map(pf => (
                        <button key={pf.id} type="button" onClick={() => openUploadDialog(pf.id)}
                          style={{ border: '1px solid var(--border-color)', borderRadius: 10, overflow: 'hidden', padding: 0, cursor: 'pointer', background: 'var(--bg-secondary)' }}>
                          <img src={pf.previewUrl} alt="" style={{ width: '100%', height: 80, objectFit: 'cover', display: 'block' }} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <UploadQueue items={uploadQueue} onRetry={retryUpload} />

                {/* 已上传图片 */}
                {images.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('capture.uploaded').replace('{n}', String(images.length))}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                      {images.map(img => (
                        <CaptureImageCard
                          key={img.id}
                          image={img}
                          imageUrl={`/api/mobile-capture/images/${img.id}/file?token=${encodeURIComponent(getMobileToken() || '')}`}
                          onDeleted={(id) => setImages(prev => prev.filter(i => i.id !== id))}
                          onUpdated={() => {}}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* 颜色标注（文档 10） */}
                <div className="ui-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="ui-section-title">{t('capture.colors')}</div>
                  <ColorSelector selected={productColors} onChange={setProductColors} options={websiteColors} colorHex={websiteColorHex} colorTexture={websiteColorTexture} />
                </div>

                {/* 库存录入（文档 11） */}
                <div className="ui-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="ui-section-title">{t('capture.inventory')}</div>
                  <InventoryInput colors={productColors} rows={inventoryRows} onChange={setInventoryRows} />
                </div>

                {/* 手机壳点货：手机型号（按品牌分组，仅统计不同步网站） */}
                <div className="ui-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* 产品固定颜色：点型号自动勾选 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div className="ui-section-title" style={{ marginBottom: 0 }}>{t('capture.fixedColors')}</div>
                      <button type="button" className="btn btn-sm" onClick={() => { setEditingFixedColors(fixedColors); setShowFixedColorsEditor(v => !v); }} style={{ fontSize: 11 }}>
                        {t('capture.fixedColorsEdit')}
                      </button>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 8px' }}>{t('capture.fixedColorsHint')}</div>
                    {fixedColors.length === 0 ? (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('capture.fixedColorsEmpty')}</div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {fixedColors.map(c => {
                          const hex = websiteColorHex?.[c] || DEFAULT_COLOR_HEX[c] || '';
                          return (
                            <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '5px 10px 5px 8px', borderRadius: 16, background: 'var(--accent-light, rgba(59,130,246,.15))', color: 'var(--accent)', fontWeight: 600 }}>
                              <ColorSwatch hex={hex} textureUrl={websiteColorTexture?.[c] || ''} selected={false} size={15} />
                              {c}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {showFixedColorsEditor && (
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <ColorSelector selected={editingFixedColors} onChange={setEditingFixedColors} multiple options={websiteColors} />
                        <button type="button" className="btn btn-cta" disabled={savingFixedColors} onClick={() => saveFixedColors(editingFixedColors)} style={{ padding: 10 }}>
                          {savingFixedColors ? t('common.loading') : t('capture.fixedColorsSave')}
                        </button>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div className="ui-section-title" style={{ marginBottom: 0 }}>{t('capture.phoneModels')}</div>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={syncingModels}
                      onClick={refreshPhoneModels}
                      style={{ fontSize: 11, padding: '3px 10px' }}
                    >
                      {syncingModels ? t('common.loading') : '🔄 ' + t('phone.refresh')}
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('capture.phoneModelsHint')}</div>
                  {phoneModelGroups.length > 0 ? (
                    <PhoneModelSelector groups={phoneModelGroups} selected={selectedModels} onChange={handlePhoneModelsChange} defaultColors={fixedColors} colorOptions={websiteColors} colorHex={websiteColorHex} colorTexture={websiteColorTexture} />
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 8, border: '1px dashed var(--border-color)', borderRadius: 8 }}>{t('capture.loadingModels')}</div>
                  )}
                </div>

                {/* 备注（文档 12） */}
                <div className="ui-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="ui-section-title">{t('capture.notes')}</div>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder={t('capture.notesPh')}
                    rows={3}
                    className="mobile-field"
                    style={{ resize: 'vertical' }}
                  />
                  <AudioNoteRecorder captureId={capture.id} />
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* 底部固定操作栏（文档 7.1 / 14，含安全区适配） */}
      {capture && !duplicatePrompt && (
        <div className="mobile-bottom-bar">
          <button type="button" onClick={handleDeleteCurrent} disabled={saving} aria-label={t('task.delete')} title={t('task.delete')}
            style={{ flex: 0.5, minHeight: 46, color: '#dc2626', border: '1px solid #dc2626', background: 'var(--bg-primary)', borderRadius: 10, fontSize: 15, cursor: 'pointer' }}>
            🗑
          </button>
          <button type="button" className="btn mobile-btn" onClick={saveDraft} disabled={saving} style={{ flex: 1 }}>{t('capture.saveDraft')}</button>
          <button type="button" className="btn mobile-btn" onClick={submit} disabled={saving} style={{ flex: 1 }}>{t('capture.submit')}</button>
          <button type="button" className="btn btn-cta mobile-btn" onClick={saveAndNext} disabled={saving} style={{ flex: 1.4 }}>
            {saving ? t('common.loading') : t('capture.saveAndNext')}
          </button>
        </div>
      )}

      {/* 上传设置对话框 */}
      {uploadTarget && (
        <UploadDialog
          target={uploadTarget}
          onChange={setUploadTarget}
          onConfirm={confirmUpload}
          onCancel={() => setUploadTarget(null)}
          options={websiteColors}
          colorHex={websiteColorHex}
          colorTexture={websiteColorTexture}
        />
      )}

      {/* 新增产品对话框（扫码/搜索无匹配时） */}
      {showNewProduct && session && (
        <NewProductModal
          key={JSON.stringify(newProductPrefill)}
          prefill={newProductPrefill}
          websiteColors={websiteColors}
          colorHex={websiteColorHex}
          colorTexture={websiteColorTexture}
          sessionId={session.id}
          onClose={() => setShowNewProduct(false)}
          onCreated={(cap, cand, colors) => {
            setCapture(cap);
            setCandidate(cand);
            setProductColors(colors);
            setImages([]);
            setInventoryRows([]);
            setNotes('');
            setCaptureStatus(null);
            setShowNewProduct(false);
            setNewProductPrefill({});
            success(t('capture.addedAlert').replace('{ref}', cand.reference), { vibrate: true });
          }}
        />
      )}
    </MobileShell>
  );
}

// ===== 子组件 =====

function MobileShell({ networkOk, children }: { networkOk: boolean; children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="mobile-safe-top" style={{ minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)', maxWidth: 480, margin: '0 auto', position: 'relative', paddingBottom: 40 }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 50, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px 0', background: 'var(--bg-primary)' }}>
        <button
          type="button"
          onClick={() => { window.location.href = '/mobile'; }}
          style={{ border: '1px solid var(--border-color)', background: 'var(--bg-hover)', borderRadius: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: 'var(--text-secondary)' }}
          title="返回入口 / Volver al menú"
        >
          🏠 {t('hub.backHome')}
        </button>
        <LangSwitch />
      </div>
      {children}
    </div>
  );
}

function NewSessionForm({ onStart, loading }: { onStart: (area: string, notes: string) => Promise<void>; loading: boolean }) {
  const { t } = useI18n();
  const [area, setArea] = useState('');
  const [notes, setNotes] = useState('');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8, paddingTop: 12, borderTop: '1px dashed var(--border-color)' }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('session.new')}</div>
      <input value={area} onChange={e => setArea(e.target.value)} placeholder={t('session.name')} style={fieldStyle} />
      <input value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('capture.notesPh')} style={fieldStyle} />
      <button type="button" className="btn btn-cta" disabled={loading} onClick={() => onStart(area.trim(), notes.trim())} style={{ padding: 12 }}>
        {loading ? t('common.loading') : t('session.new')}
      </button>
    </div>
  );
}

const fieldStyle: React.CSSProperties = {
  padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)',
  fontSize: 14, background: 'var(--bg-secondary)', color: 'var(--text-primary)',
};

function UploadDialog({ target, onChange, onConfirm, onCancel, options, colorHex, colorTexture }: {
  target: { fileId: string; role: string; colors: string[] };
  onChange: (t: { fileId: string; role: string; colors: string[] }) => void;
  onConfirm: () => void;
  onCancel: () => void;
  options?: string[];
  colorHex?: Record<string, string>;
  colorTexture?: Record<string, string>;
}) {
  const { t } = useI18n();
  const role = target.role;
  const needColor = role === 'single_color';
  const allowMultiColor = role === 'all_colors';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 500, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ background: 'var(--bg-primary)', width: '100%', maxWidth: 480, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{t('upload.photoRole')}</div>
        <ImageRoleSelector value={role} onChange={(r) => onChange({ ...target, role: r })} />

        {(needColor || allowMultiColor) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{t(needColor ? 'upload.colorRequired' : 'upload.colorsIncluded')}</div>
            <ColorSelector selected={target.colors} onChange={(colors) => onChange({ ...target, colors })} multiple={allowMultiColor} options={options} colorHex={colorHex} colorTexture={colorTexture} />
            {needColor && target.colors.length === 0 && (
              <div style={{ fontSize: 12, color: '#dc2626' }}>{t('upload.singleColorNeed')}</div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn" onClick={onCancel} style={{ flex: 1, padding: 12 }}>{t('common.cancel')}</button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onConfirm}
            disabled={needColor && target.colors.length === 0}
            style={{ flex: 1.5, padding: 12 }}
          >
            {t('upload.submitRole').replace('{role}', t('img.role.' + role))}
          </button>
        </div>
      </div>
    </div>
  );
}

// === 新增产品对话框（扫码/搜索无匹配时） ===
function NewProductModal({ prefill, websiteColors, colorHex, colorTexture, sessionId, onClose, onCreated }: {
  prefill: { ean13?: string; serialNumber?: string };
  websiteColors?: string[];
  colorHex?: Record<string, string>;
  colorTexture?: Record<string, string>;
  sessionId: number;
  onClose: () => void;
  onCreated: (cap: MobileCapture, cand: ProductMatchCandidate, colors: string[]) => void;
}) {
  const [name, setName] = useState('');
  const [serialNumber, setSerialNumber] = useState(prefill.serialNumber || '');
  const [ean13, setEan13] = useState(prefill.ean13 || '');
  const [reference, setReference] = useState('');
  const [price, setPrice] = useState('');
  const [colors, setColors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const { t } = useI18n();
  const { error: toastError, warning: toastWarning, success } = useToast();

  const submit = async () => {
    if (!name.trim()) { toastWarning(t('new.fillName'), { vibrate: true }); return; }
    setSaving(true);
    try {
      const res = await mobileCaptureApi.createMobileProduct({
        name: name.trim(),
        serialNumber: serialNumber.trim(),
        ean13: ean13.trim(),
        reference: reference.trim(),
        price: price ? parseFloat(price) : null,
      });
      if (!res.success) { toastError(res.error || t('new.fail')); return; }
      const product = res.data;
      const capRes = await mobileCaptureApi.createCapture({
        sessionId,
        productId: product.id,
        prestashopProductId: 0,
        serialNumber: product.serial_number,
        reference: product.reference,
        ean13: product.ean13,
        model: product.model,
        colors,
      });
      if (!capRes.success) { toastError(capRes.error || t('alert.createTaskFail')); return; }
      const cand: ProductMatchCandidate = {
        productId: product.id,
        reference: product.reference,
        name: product.name,
        model: product.model,
        serialNumber: product.serial_number,
        ean13: product.ean13,
        prestashopId: '',
        brand: product.brand || '',
        category: product.category || '',
        matchMethod: 'manual_add',
        matchedValue: product.reference,
        confidence: 1,
      };
      onCreated(capRes.data, cand, colors);
    } catch (e: any) {
      toastError(t('new.fail') + ': ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)',
    fontSize: 14, background: 'var(--bg-secondary)', color: 'var(--text-primary)', width: '100%',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      <div style={{ background: 'var(--bg-primary)', width: '100%', maxWidth: 480, maxHeight: '92vh', borderRadius: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* 固定头部 */}
        <div style={{ padding: '14px 16px 0', display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{t('new.title')}</div>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              aria-label={t('common.close')}
              style={{ border: 'none', background: 'var(--bg-hover)', borderRadius: 8, width: 30, height: 30, fontSize: 16, cursor: 'pointer', color: 'var(--text-secondary)', flexShrink: 0 }}
            >
              ✕
            </button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {t('new.hint')}
          </div>
        </div>

        {/* 可滚动内容区 */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('new.name')}</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder={t('new.namePh')} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('new.serial')}</label>
            <input value={serialNumber} onChange={e => setSerialNumber(e.target.value)} placeholder={t('new.serial')} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('new.ean')}</label>
            <input value={ean13} onChange={e => setEan13(e.target.value)} placeholder={t('new.ean')} style={inputStyle} inputMode="numeric" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('new.reference')}</label>
            <input value={reference} onChange={e => setReference(e.target.value)} placeholder={t('new.reference')} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('new.price')}</label>
            <input value={price} onChange={e => setPrice(e.target.value)} placeholder="如：29.90" type="number" step="0.01" style={inputStyle} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('new.colors')}</label>
            <div style={{ maxHeight: 200, overflowY: 'auto', borderRadius: 8, border: '1px solid var(--border-color)', padding: 8 }}>
              <ColorSelector selected={colors} onChange={setColors} multiple options={websiteColors} colorHex={colorHex} colorTexture={colorTexture} />
            </div>
          </div>
        </div>

        {/* 固定底部按钮 */}
        <div style={{ display: 'flex', gap: 8, padding: '10px 16px 14px', borderTop: '1px solid var(--border-color)', flexShrink: 0 }}>
          <button type="button" className="btn" onClick={onClose} disabled={saving} style={{ flex: 1, padding: 12 }}>{t('common.cancel')}</button>
          <button type="button" className="btn btn-cta" onClick={submit} disabled={saving} style={{ flex: 1.5, padding: 12 }}>
            {saving ? t('common.loading') : t('new.create')}
          </button>
        </div>
      </div>
    </div>
  );
}
