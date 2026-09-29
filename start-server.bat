@echo off
title YouTube Downloader Server
cd /d "%~dp0"
echo Starting YouTube Downloader...
echo.
start http://localhost:3001
npm start
