@echo off
cd /d %~dp0apps\api
npx wrangler deploy
cd /d %~dp0
npx wrangler pages deploy apps/web --project-name=malupets
