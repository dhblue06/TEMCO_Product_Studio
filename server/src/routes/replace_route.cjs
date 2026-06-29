const fs = require('fs');
let c = fs.readFileSync('upload.ts', 'utf8');

// The route to replace
const oldCode = `// 列出产品文件夹内的文件
router.get('/files/product/:reference', (req: Request, res: Response) => {
  try {
    const { reference } = req.params;
    const folder = getProductFolder(reference);

    if (!fs.existsSync(folder)) {
      return res.json({ success: true, data: { reference, files: [], folderPath: folder } });
    }

    const files = fs.readdirSync(folder)
      .filter(f => /\\.(jpg|jpeg|png|webp|gif)$/i.test(f))
      .map(f => {
        const stat = fs.statSync(path.join(folder, f));
        return {
          name: f,
          size: stat.size,
          sizeKB: Math.round(stat.size / 1024),
          modified: stat.mtime,
          url: \`/api/upload/file/product/\${encodeURIComponent(reference)}/\${encodeURIComponent(f)}\`,
        };
      })
      .sort((a, b) => b.modified.getTime() - a.modified.getTime());

    res.json({ success: true, data: { reference, files, total: files.length, folderPath: folder } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});`;

const newCode = `// 列出产品文件夹内的文件（浏览器返回 HTML，API 返回 JSON）
router.get('/files/product/:reference', (req: Request, res: Response) => {
  try {
    const { reference } = req.params;
    const folder = getProductFolder(reference);
    const accept = req.headers.accept || '';

    // 浏览器直接访问返回 HTML 页面
    if (accept.includes('text/html')) {
      const files: { name: string; sizeKB: number; time: string }[] = [];
      if (fs.existsSync(folder)) {
        const names = fs.readdirSync(folder)
          .filter(f => /\\.(jpg|jpeg|png|webp|gif)$/i.test(f))
          .sort((a, b) => {
            const sa = fs.statSync(path.join(folder, a));
            const sb = fs.statSync(path.join(folder, b));
            return sb.mtime.getTime() - sa.mtime.getTime();
          });
        for (const name of names) {
          const stat = fs.statSync(path.join(folder, name));
          files.push({ name, sizeKB: Math.round(stat.size / 1024), time: stat.mtime.toLocaleString() });
        }
      }

      const html = \`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>📂 \${reference} 图片文件夹</title>
<style>
body{font-family:sans-serif;background:#1a1a2e;color:#ccc;margin:0;padding:20px}
h1{color:white;font-size:18px;margin-bottom:4px}
h2{color:#666;font-size:13px;font-weight:normal;margin-bottom:16px}
.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}
.item{background:#2a2a3e;border-radius:8px;overflow:hidden;text-align:center}
.item img{width:100%;height:140px;object-fit:cover;display:block}
.item .info{padding:6px 8px;font-size:11px;color:#aaa;word-break:break-all}
.item .info .name{color:#8be9fd;margin-bottom:2px}
a{color:#8be9fd;text-decoration:none}
.empty{text-align:center;padding:40px;color:#666}
.empty .icon{font-size:48px;margin-bottom:12px}
.btn{display:inline-block;background:#444;color:#8be9fd;padding:6px 14px;border-radius:4px;font-size:13px;margin-bottom:16px;margin-right:8px}
</style></head><body>
<h1>📂 \${reference} 的产品文件夹</h1>
<h2>\${folder}</h2>
<a class="btn" href="javascript:history.back()">← 返回</a>
<a class="btn" href="/api/upload/files/browse">全部图片</a>
\${files.length === 0 ? '<div class="empty"><div class="icon">📂</div>该产品文件夹为空，上传图片后会显示在这里</div>' : \`<div style="margin-bottom:10px;font-size:13px;color:#666">共 \${files.length} 个文件</div>
<div class="gallery">\${files.map(f => \`
  <div class="item">
    <a href="/api/upload/file/product/\${encodeURIComponent(reference)}/\${encodeURIComponent(f.name)}" target="_blank">
      <img src="/api/upload/file/product/\${encodeURIComponent(reference)}/\${encodeURIComponent(f.name)}" loading="lazy" onerror="this.alt='加载失败'">
    </a>
    <div class="info">
      <div class="name">\${f.name}</div>
      <div>\${f.sizeKB}KB · \${f.time}</div>
    </div>
  </div>\`).join('')}</div>\`}
</body></html>\`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(html);
    }

    // API 调用返回 JSON
    if (!fs.existsSync(folder)) {
      return res.json({ success: true, data: { reference, files: [], folderPath: folder } });
    }

    const fileList = fs.readdirSync(folder)
      .filter(f => /\\.(jpg|jpeg|png|webp|gif)$/i.test(f))
      .map(f => {
        const stat = fs.statSync(path.join(folder, f));
        return {
          name: f,
          size: stat.size,
          sizeKB: Math.round(stat.size / 1024),
          modified: stat.mtime,
          url: \`/api/upload/file/product/\${encodeURIComponent(reference)}/\${encodeURIComponent(f)}\`,
        };
      })
      .sort((a, b) => b.modified.getTime() - a.modified.getTime());

    res.json({ success: true, data: { reference, files: fileList, total: fileList.length, folderPath: folder } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});`;

const idx = c.indexOf(oldCode);
if (idx === -1) {
  console.log('NOT FOUND');
  process.exit(1);
}
c = c.substring(0, idx) + newCode + c.substring(idx + oldCode.length);
fs.writeFileSync('upload.ts', c, 'utf8');
console.log('REPLACED');
