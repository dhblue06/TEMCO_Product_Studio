// KIE API 图片生成服务
// 按官方文档实现：先创建任务 → 轮询/Webhook 获取结果
// 端点: POST /api/v1/jobs/createTask
// 查询: GET /api/v1/jobs/recordInfo?taskId=xxx

const KIE_CREATE_TASK_URL = 'https://api.kie.ai/api/v1/jobs/createTask';
const KIE_TASK_DETAIL_URL = 'https://api.kie.ai/api/v1/jobs/recordInfo';

export type KieModel =
  | 'nano-banana-2'
  | 'gpt-image-2-text-to-image'
  | 'gpt-image-2-image-to-image';

export interface KieConfig {
  apiKey: string;
  model: KieModel;
  callbackUrl?: string;
}

interface CreateTaskResponse {
  code: number;
  msg: string;
  data: {
    taskId: string;
  };
}

interface TaskDetailResponse {
  code: number;
  msg: string;
  data: {
    taskId: string;
    state: 'waiting' | 'queuing' | 'generating' | 'success' | 'fail';
    resultJson?: string;
    failCode?: string | null;
    failMsg?: string | null;
    creditsConsumed?: number;
  };
}

export class KieImageGenerator {
  private config: KieConfig;

  constructor(config: KieConfig) {
    this.config = config;
  }

  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * 创建 KIE 任务
   * 按文档格式提交: { model, callBackUrl?, input: { ... } }
   */
  async createTask(input: Record<string, any>): Promise<string> {
    const body: any = {
      model: this.config.model,
      input,
    };

    if (this.config.callbackUrl) {
      body.callBackUrl = this.config.callbackUrl;
    }

    const response = await fetch(KIE_CREATE_TASK_URL, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let errMsg = `KIE 创建任务失败: HTTP ${response.status}`;
      try {
        const errJson = await response.json() as any;
        if (errJson?.msg) errMsg += ` - ${errJson.msg}`;
        if (response.status === 402) {
          errMsg = `KIE 余额不足（402），请到 https://kie.ai 充值后使用`;
        }
      } catch {
        const errText = await response.text().catch(() => '');
        if (errText) errMsg += ` - ${errText.substring(0, 200)}`;
      }
      throw new Error(errMsg);
    }

    const result: CreateTaskResponse = await response.json() as CreateTaskResponse;

    if (result.code !== 200) {
      throw new Error(`KIE 错误: ${result.msg || JSON.stringify(result)}`);
    }

    return result.data.taskId;
  }

  /**
   * 查询任务详情
   */
  async queryTask(taskId: string): Promise<TaskDetailResponse['data']> {
    const url = `${KIE_TASK_DETAIL_URL}?taskId=${encodeURIComponent(taskId)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`KIE 查询失败: HTTP ${response.status}`);
    }

    const result: TaskDetailResponse = await response.json() as TaskDetailResponse;

    if (result.code !== 200) {
      throw new Error(`KIE 查询错误: ${result.msg || JSON.stringify(result)}`);
    }

    return result.data;
  }

  /**
   * 轮询等待任务完成
   * 建议：从 2-3 秒开始，逐步增加，15 分钟后超时
   */
  async waitForResult(taskId: string, maxWaitMs = 120000): Promise<string[]> {
    const startTime = Date.now();
    let pollInterval = 2000;

    while (Date.now() - startTime < maxWaitMs) {
      const taskData = await this.queryTask(taskId);

      switch (taskData.state) {
        case 'success': {
          if (taskData.resultJson) {
            try {
              const parsed = JSON.parse(taskData.resultJson);
              const urls = parsed.images || parsed.img_urls || parsed.urls || parsed.output || parsed.resultUrls || [];
              if (Array.isArray(urls)) return urls;
              if (typeof urls === 'string') return [urls];
              return [taskData.resultJson];
            } catch {
              return [taskData.resultJson];
            }
          }
          return [];
        }
        case 'fail':
          throw new Error(`KIE 生成失败: ${taskData.failMsg || taskData.failCode || '未知错误'}`);
        case 'waiting':
        case 'queuing':
        case 'generating':
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          pollInterval = Math.min(pollInterval + 1000, 5000);
          break;
        default:
          throw new Error(`KIE 未知状态: ${taskData.state}`);
      }
    }

    throw new Error(`KIE 生成超时（${maxWaitMs / 1000}秒）`);
  }

  /**
   * nano-banana-2: 文生图/图生图
   * input: { prompt, image_input?: string[], aspect_ratio?, resolution?, output_format? }
   */
  async nanoBanana2(params: {
    prompt: string;
    imageUrls?: string[];
    aspectRatio?: string;
    resolution?: string;
    outputFormat?: string;
  }): Promise<string[]> {
    const taskId = await this.createTask({
      prompt: params.prompt,
      image_input: params.imageUrls || [],
      aspect_ratio: params.aspectRatio || '1:1',
      resolution: params.resolution || '1K',
      output_format: params.outputFormat || 'png',
    });
    console.log(`[KIE] nano-banana-2 task created: ${taskId}`);
    return this.waitForResult(taskId);
  }

  /**
   * gpt-image-2-text-to-image: 文生图
   * input: { prompt, aspect_ratio? }
   */
  async gptImage2TextToImage(params: {
    prompt: string;
    aspectRatio?: string;
  }): Promise<string[]> {
    const taskId = await this.createTask({
      prompt: params.prompt,
      aspect_ratio: params.aspectRatio || '1:1',
    });
    console.log(`[KIE] gpt-image-2-text-to-image task created: ${taskId}`);
    return this.waitForResult(taskId);
  }

  /**
   * gpt-image-2-image-to-image: 图生图（精修/背景替换）
   * input: { prompt, input_urls: string[], aspect_ratio? }
   */
  async gptImage2ImageToImage(params: {
    prompt: string;
    inputUrls: string[];
    aspectRatio?: string;
  }): Promise<string[]> {
    const taskId = await this.createTask({
      prompt: params.prompt,
      input_urls: params.inputUrls,
      aspect_ratio: params.aspectRatio || '1:1',
    });
    console.log(`[KIE] gpt-image-2-image-to-image task created: ${taskId}`);
    return this.waitForResult(taskId);
  }
}

/**
 * 从数据库加载 KIE 配置
 */
export function loadKieConfig(): KieConfig | null {
  const { getDatabase } = require('../../database/database');
  const db = getDatabase();
  const get = (key: string) => {
    const row = db.prepare('SELECT value FROM api_settings WHERE key = ?').get(key);
    return row?.value || '';
  };

  const provider = get('image_provider');
  if (provider !== 'kie') return null;

  const apiKey = get('image_api_key');
  if (!apiKey) return null;

  return {
    apiKey,
    model: (get('image_model') || 'gpt-image-2-image-to-image') as KieModel,
  };
}
