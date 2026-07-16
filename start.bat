@echo off
cd /d "%~dp0"
echo Installing/checking dependencies...
pip install -r requirements.txt >nul 2>&1
echo.
python app.py
pause
