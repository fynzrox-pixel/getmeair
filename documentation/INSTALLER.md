# Getmeair installer

## Files

- Source: `installer\GetmeairInstaller.cs`
- Payload archive: `installer\payload.zip`
- Build log: `installer\build_installer.log`
- Result: `installer\Getmeair Setup.exe`

The setup executable embeds the payload as a .NET manifest resource, so it is self-contained.

## Build

```bat
powershell -ExecutionPolicy Bypass -File D:\Getmeair-dev\scripts\build_installer.ps1
```

Requirements: Windows 10/11 with built-in `tar.exe` and .NET Framework 4.x (both present on standard Windows installations).

## Commands

| Command | Action |
|---|---|
| `Getmeair Setup.exe` | Graphical installation wizard. |
| `Getmeair Setup.exe /S` | Silent installation. |
| `Getmeair Setup.exe /D=C:\Path\Getmeair` | Custom install directory (works with or without `/S`). |
| `Getmeair Setup.exe /uninstall` | Remove installed files, shortcuts and protocol registration. |

## What it installs

- `Getmeair.exe`
- `modules\x64\d3d\d3dcompiler_47.dll`
- Start Menu folder `Getmeair`
- `Getmeair.lnk` on the desktop
- `Uninstall Getmeair.lnk` in Start Menu
- `getmeair://` protocol handler under `HKCU\Software\Classes\getmeair`
- Uninstall entry `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Getmeair`

## Data safety

The uninstaller removes application binaries, shortcuts and registry entries. It intentionally keeps `tdata` and `log.txt` in the install directory so that messages and settings are not destroyed.

To remove all data manually, delete the install folder after uninstalling. Do not delete `%APPDATA%\Telegram Desktop`.

## Inno Setup variant

A full Inno Setup script for the official source build exists at:

```
D:\Getmeair-dev\source\Telegram\build\setup.iss
```

It was not compiled here because Inno Setup is not installed. The delivered setup executable uses the independent .NET-based installer described above.
