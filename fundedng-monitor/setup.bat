@echo off
title FundedNG Monitor — Setup

echo =======================================
echo  FundedNG Equity Monitor Setup
echo =======================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH.
    echo Please install Python 3.11+ from https://python.org
    echo Make sure to check "Add to PATH" during installation.
    pause
    exit /b 1
)

echo [OK] Python found:
python --version
echo.

echo Installing dependencies...
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [ERROR] pip install failed.
    pause
    exit /b 1
)

echo.
echo [OK] Dependencies installed successfully.
echo.
echo =======================================
echo  Setup complete!
echo =======================================
echo.
echo Next steps:
echo  1. Copy .env.example to .env
echo  2. Fill in your Supabase and API credentials
echo  3. Run run_monitor.bat to test
echo.
pause
