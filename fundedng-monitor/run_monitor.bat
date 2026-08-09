@echo off
REM FundedNG Equity Monitor - Silent launcher
REM Uses py.exe (Python launcher) which is a system-wide install

cd /d "C:\Users\Gray Empire\fundedng\fundedng-monitor"

py -3 -u equity_monitor.py >> "C:\Users\Gray Empire\fundedng\fundedng-monitor\task_errors.log" 2>&1
