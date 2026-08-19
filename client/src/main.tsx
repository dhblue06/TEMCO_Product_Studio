import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import MobileCapturePage from './pages/MobileCapturePage'
import MobileCaptureReviewPage from './pages/MobileCaptureReviewPage'
import MobileInventoryPage from './pages/MobileInventoryPage'
import InventoryDashboardPage from './pages/InventoryDashboardPage'
import MobileStockReportPage from './pages/MobileStockReportPage'
import MobileHubPage from './pages/MobileHubPage'
import { LanguageProvider } from './i18n'
import { ToastProvider } from './components/ui/ToastProvider'
import { ConfirmProvider } from './components/ui/ConfirmProvider'
import './index.css'

// 路径路由：
// /mobile                手机端角色入口（商品采集/缺货上报/仓库盘点）
// /mobile-capture        手机采集端（局域网访问）
// /mobile-capture-review 电脑采集审核端
// /mobile-inventory      手机快速盘点
// /mobile-stock          手机缺货上报
const path = window.location.pathname;
let RootComponent: React.ComponentType = App;
if (path.startsWith('/mobile-inventory')) {
  RootComponent = MobileInventoryPage;
} else if (path.startsWith('/inventory')) {
  RootComponent = InventoryDashboardPage;
} else if (path.startsWith('/mobile-stock')) {
  RootComponent = MobileStockReportPage;
} else if (path.startsWith('/mobile-capture-review')) {
  RootComponent = () => <MobileCaptureReviewPage onClose={() => { window.location.href = '/'; }} />;
} else if (path.startsWith('/mobile-capture')) {
  RootComponent = MobileCapturePage;
} else if (path === '/mobile' || path === '/mobile/') {
  // 精确匹配，避免误吞 /mobile-capture 等
  RootComponent = MobileHubPage;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      <ConfirmProvider>
        <LanguageProvider>
          <RootComponent />
        </LanguageProvider>
      </ConfirmProvider>
    </ToastProvider>
  </React.StrictMode>,
)
