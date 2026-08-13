@echo off
cd /d %~dp0apps\api
npx wrangler d1 execute malupets-db --file=../../database/migrations/02_inventory_pos.sql --remote
