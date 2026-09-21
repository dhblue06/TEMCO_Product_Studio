/** Bound both connection and response-body time; cancelled writes may have reached the server. */
export async function fetchWithTimeout(input: RequestInfo | URL, options: RequestInit = {}, timeoutMs = options.method && options.method !== 'GET' ? 180000 : 20000): Promise<Response> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timer = setTimeout(cancel, timeoutMs);
  try {
    const response = await fetch(input, { ...options, signal: controller.signal });
    const body = await response.blob();
    return new Response([204, 205, 304].includes(response.status) ? null : body, {
      status: response.status, statusText: response.statusText, headers: response.headers,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw Object.assign(new Error(options.signal?.aborted
        ? '操作已暂停，未完成内容仍保存在手机中'
        : '连接超时，请检查仓库 Wi-Fi 后重试；已保存的记录不会丢失'), { name: 'AbortError' });
    }
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
  }
}
