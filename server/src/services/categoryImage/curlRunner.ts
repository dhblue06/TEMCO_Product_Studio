import { spawn } from 'child_process';

export interface CurlResult {
  statusCode: number;
  body: string;
  stderr: string;
  exitCode: number;
}

export function runCurl(args: string[]): Promise<CurlResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('curl', args, {
      windowsHide: true,
      shell: false,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString('utf8');
    });

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString('utf8');
    });

    child.on('error', (error) => {
      reject(new Error(`无法启动 curl: ${error.message}`));
    });

    child.on('close', (exitCode) => {
      const normalizedExitCode = exitCode ?? -1;

      if (normalizedExitCode !== 0) {
        reject(new Error(
          `curl 执行失败\n退出码: ${normalizedExitCode}\nstderr: ${stderr || '(空)'}\nstdout: ${stdout || '(空)'}`
        ));
        return;
      }

      const lines = stdout.trimEnd().split(/\r?\n/);
      const statusLine = lines.pop() ?? '0';
      const statusCode = parseInt(statusLine, 10) || 0;
      const body = lines.join('\n');

      resolve({ statusCode, body, stderr, exitCode: normalizedExitCode });
    });
  });
}

export function isImageAlreadyExists(result: CurlResult): boolean {
  const message = `${result.body}\n${result.stderr}`.toLowerCase();
  return (
    result.statusCode === 409 ||
    message.includes('this image already exists') ||
    message.includes('image already exists') ||
    message.includes('already exists') ||
    message.includes('please use the put method')
  );
}

export function isSuccessfulStatus(statusCode: number): boolean {
  return statusCode >= 200 && statusCode < 300;
}
