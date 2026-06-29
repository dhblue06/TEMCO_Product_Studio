@echo off
echo 正在停止 TEMCO 服务...
taskkill /f /im node.exe >nul 2>&1
echo 已停止所有 Node.js 进程
pause
