@echo off
title TicketX Localhost Server
echo =======================================================
echo   TicketX - Safe Ticket Reselling Platform Prototype
echo =======================================================
echo.
echo Starting server on http://localhost:3000 ...
echo Press Ctrl+C anytime to stop.
echo.
cd /d "%~dp0"
node server.js
pause
