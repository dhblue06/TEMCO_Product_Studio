import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import MobileCapturePage from './pages/MobileCapturePage'
import MobileCaptureReviewPage from './pages/MobileCaptureReviewPage'
import MobileInventoryPage from './pages/MobileInventoryPage'
import InventoryDashboardPage from './pages/InventoryDashboardPage'
import { LanguageProvider } from './i18n'
import './index.css'

// 路径路由：
// /mobile-capture        手机采集端（局域网访问）
// /mobile-capture-review 电脑采集审核端
// /mobile-inventory      手机快速盘点
// /inventory             电脑仓库盘点
const path = window.location.pathname;
let RootComponent: React.ComponentType = App;
if (path.startsWith('/mobile-inventory')) {
  RootComponent = MobileInventoryPage;
} else if (path.startsWith('/inventory')) {
  RootComponent = InventoryDashboardPage;
} else if (path.startsWith('/mobile-capture-review')) {
  RootComponent = () => <MobileCaptureReviewPage onClose={() => { window.location.href = '/'; }} />;
} else if (path.startsWith('/mobile-capture')) {
  RootComponent = MobileCapturePage;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LanguageProvider>
      <RootComponent />
    </LanguageProvider>
  </React.StrictMode>,
)
