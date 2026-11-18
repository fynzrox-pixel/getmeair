@echo off
setlocal enabledelayedexpansion
set "ROOT=%~dp0"
cd /d "%ROOT%"

echo ============================================
echo  Getmeair build
echo ============================================

set "MISSING="
for %%T in (cmake.exe ninja.exe cl.exe git.exe python.exe) do (
  where %%T >nul 2>&1
  if errorlevel 1 set "MISSING=!MISSING! %%T"
)
if not "%MISSING%"=="" (
  echo Missing required tools:%MISSING%
  echo Install Visual Studio 2026 with the C++ workload, Windows SDK 10.0.26100.0,
  echo CMake, Ninja, Git and Python 3.10, then run this script from a
  echo Native Tools Command Prompt for VS 2026.
  exit /b 1
)

if not exist "%ROOT%source\cmake\validate_special_target.cmake" (
  echo Telegram Desktop cmake_helpers submodule is not initialized.
  echo Run: git -C "%ROOT%source" submodule update --init --recursive
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%config\apply_api.ps1"
if errorlevel 1 exit /b 1

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\install_branding.ps1"
if errorlevel 1 exit /b 1

if not exist "%ROOT%build\out" mkdir "%ROOT%build\out"

cmake -S "%ROOT%source" -B "%ROOT%build\out" -G Ninja -DCMAKE_BUILD_TYPE=Release -DDESKTOP_APP_ENABLE_LTO=OFF
if errorlevel 1 exit /b 1

cmake --build "%ROOT%build\out" --config Release --target Telegram
if errorlevel 1 exit /b 1

if exist "%ROOT%build\out\Release\Getmeair.exe" (
  copy /Y "%ROOT%build\out\Release\Getmeair.exe" "%ROOT%build\Getmeair.exe" >nul
) else if exist "%ROOT%build\out\Getmeair.exe" (
  copy /Y "%ROOT%build\out\Getmeair.exe" "%ROOT%build\Getmeair.exe" >nul
) else (
  echo Build finished but Getmeair.exe was not found.
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\build_installer.ps1"
if errorlevel 1 exit /b 1

echo Build output: %ROOT%build\Getmeair.exe
echo Installer:    %ROOT%installer\Getmeair Setup.exe
exit /b 0
