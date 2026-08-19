import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { initializeDatabase } from './database/database';

import productsRouter from './routes/products';
import settingsRouter from './routes/settings';
import sheetRouter from './routes/sheet';
import driveRouter from './routes/drive';
import copyRouter from './routes/copy';
import imagesRouter from './routes/images';
import aiImagesRouter from './routes/aiImages';
import importRouter from './routes/import';
import exportRouter from './routes/export';
import uploadRouter from './routes/upload';
import prestashopRouter from './routes/prestashop';
import websiteImportRouter from './routes/websiteImport';
import productListImportRouter from './routes/productListImport';
import categoriesRouter from './routes/categories';
import productImagesRouter from './routes/productImages';
import mobileCaptureRouter from './routes/mobileCapture';
import { maybeSyncPhoneModelCatalog } from './services/mobileCapture/phoneModelService';
import { inventoryRouter } from './routes/inventory';
import cajaCheckRouter from './routes/cajaCheck';
import stockReportRouter from './routes/stockReport';

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(morgan('dev'));

// 初始化数据库
initializeDatabase();

// API 路由
app.use('/api/products', productsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/sheet', sheetRouter);
app.use('/api/drive', driveRouter);
app.use('/api/copy', copyRouter);
app.use('/api/images', imagesRouter);
app.use('/api/ai-images', aiImagesRouter);
app.use('/api/import', importRouter);
app.use('/api/export', exportRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/prestashop', prestashopRouter);
app.use('/api/website-import', websiteImportRouter);
app.use('/api/product-lookup', websiteImportRouter);
app.use('/api/product-list-import', productListImportRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/product-images', productImagesRouter);
app.use('/api/mobile-capture', mobileCaptureRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/caja-check', cajaCheckRouter);
app.use('/api/stock-report', stockReportRouter);

// 根路径提示
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>TEMCO Product Studio</title></head>
      <body style="font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;background:#f5f6fa;margin:0">
        <div style="text-align:center">
          <h1 style="color:#1a1a2e">🚀 TEMCO Product Studio</h1>
          <p style="color:#6b7280">后端 API 运行正常</p>
          <div style="margin-top:24px">
            <a href="http://localhost:5173" style="display:inline-block;padding:12px 24px;background:#1677ff;color:white;text-decoration:none;border-radius:8px;font-size:16px">
              🔗 打开前端界面 (localhost:5173)
            </a>
          </div>
          <div style="margin-top:16px;font-size:13px;color:#9ca3af">
            <p>API 端点: <code>/api/products</code> <code>/api/drive</code> <code>/api/copy</code> <code>/api/images</code></p>
          </div>
        </div>
      </body>
    </html>
  `);
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 静态文件服务（生产环境）
if (process.env.NODE_ENV === 'production') {
  const clientBuildPath = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientBuildPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

// 全局错误处理
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? '内部服务器错误' : err.message
  });
});

app.listen(PORT, () => {
  console.log(`🚀 TEMCO Product Studio Server running on http://localhost:${PORT}`);
  console.log(`📦 API: http://localhost:${PORT}/api`);
  // 启动时自动同步网站手机型号（手机壳点货目录），失败不阻塞服务
  maybeSyncPhoneModelCatalog().then(r => {
    if (r) console.log(`📱 手机型号目录已同步网站：新增/更新 ${r.added}，移除 ${r.removed}，总计 ${r.total}`);
    else console.log('📱 手机型号目录无需同步（10 分钟内已同步过）');
  }).catch(e => {
    console.warn(`📱 手机型号目录同步失败（使用现有目录）: ${e.message}`);
  });
});

export default app;
