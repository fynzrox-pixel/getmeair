@echo off
setlocal
set "ROOT=%~dp0"

if exist "%ROOT%build\Getmeair.exe" (
  start "" /D "%ROOT%build" "%ROOT%build\Getmeair.exe" %*
  exit /b 0
)

echo Getmeair.exe was not found in %ROOT%build
echo Run Build_Getmeair.bat first, or place a compiled Getmeair.exe there.
exit /b 1
