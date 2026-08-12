@echo off
rem 【临时开发工具】以 watch 模式启动 API，日志追加到仓库根目录 api-dev.log
cd /d "%~dp0.."
echo [dev-restart-api] %date% %time% 启动 pnpm --filter @jincheng/api dev >> api-dev.log
call pnpm --filter @jincheng/api dev >> api-dev.log 2>&1
