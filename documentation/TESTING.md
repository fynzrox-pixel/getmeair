# Verification log — Getmeair

Date: 2026-11-17  
Environment: Windows 10, user session without administrator rights.

## Legend

- **PASS** — check was actually executed and observed.
- **PARTIAL** — partly verified, with a documented limitation.
- **NOT TESTED** — no reliable check was performed.

## 1. Compile from source

**NOT TESTED / BLOCKED.**

No MSVC, Windows SDK, CMake, Ninja, Qt, prepared libraries or initialized submodules are present. `Build_Getmeair.bat` therefore exits early with a diagnostic. See `build/BUILD_STATUS.md`.

## 2. Launch `build\Getmeair.exe`

**PASS.**

Command used:

```powershell
Start-Process -FilePath 'D:\Getmeair-dev\build\Getmeair.exe' -ArgumentList '-many' -WorkingDirectory 'D:\Getmeair-dev\build' -PassThru
```

Observed in `build\log.txt`:

- `Launched version: 7004004`
- `Executable dir: D:/Getmeair-dev/build/, name: Getmeair.exe`
- `AppUserModelID: Getmeair.GetmeairDesktop.aeb4d0895b501e8ac8294e73a8cbd180`
- `This is the only instance of Getmeair, starting server and app...`

Process remained alive. It was stopped by the test script.

## 3. Window title and visible UI

**PASS (window title), PARTIAL (full visual rebrand).**

After launching the installed copy and waiting 30 seconds, UI Automation reported:

- one top-level window for the process;
- `Name = Getmeair`;
- `Class = class MainWindow`;
- `IsOffscreen = false`.

Visible UI text elements included:

- `Getmeair Desktop`;
- `Start Messaging`;
- window controls.

Limitation: the prebuilt binary still contains the upstream welcome sentence `Welcome to the official Telegram Desktop app.` This sentence is fixed in the source localization, but the binary was not rebuilt. Screenshots were saved to `documentation\screenshots\`.

## 4. Logo / icon

**PARTIAL.**

Branding assets were generated and installed into the source resource tree by `assets\generate_branding.ps1` and `scripts\install_branding.ps1`:

- `assets\branding\logo.png`
- `assets\branding\logo.svg`
- `assets\branding\app_icon.ico`
- `assets\branding\splash.png`
- `assets\icons\app_icon_*.png`
- `assets\backgrounds\splash_background.png`

20 source art files were replaced and originals preserved in `patches\originals\art`.

The executable icon used by the prebuilt binary comes from its original external build; pixel-perfect equality with the newly generated icon was not verified.

## 5. Independence from Telegram Desktop

**PASS for paths/registry identity; PARTIAL for full side-by-side runtime test.**

Observed:

- Getmeair process name: `Getmeair`;
- Getmeair data created in `D:\Getmeair-dev\build\tdata` during the build-directory test;
- installed copy created `tdata` in its own install directory;
- `%APPDATA%\Getmeair` was created by the installer only;
- `%APPDATA%\Telegram Desktop` existed before and was not overwritten;
- Getmeair protocol key is `HKCU\Software\Classes\getmeair`, while `HKCU\Software\Classes\tg` remained the Telegram key;
- no Telegram Desktop process was launched or modified in this session.

A full runtime test with both applications open simultaneously was not performed.

## 6. Separate AppUserModelID

**PASS.**

Runtime log from the build copy:

```
AppUserModelID: Getmeair.GetmeairDesktop.aeb4d0895b501e8ac8294e73a8cbd180
```

Runtime log from the installed copy:

```
AppUserModelID: Getmeair.GetmeairDesktop.35d2d2ea4c6a9d96d825b9b7940b81a4
```

The hash suffix differs by install location, as expected in upstream Telegram Desktop code.

## 7. `getmeair://` protocol

**PASS.**

Registration command:

```bat
powershell -ExecutionPolicy Bypass -File D:\Getmeair-dev\scripts\register_protocol.ps1
```

Registry value after registration:

```
"D:\Getmeair-dev\build\Getmeair.exe" "%1"
```

Opening:

```
getmeair://resolve?domain=telegram
```

started a `Getmeair.exe` process. Log line:

```
Command line: ...\Getmeair.exe getmeair://resolve/?domain=telegram
```

After installing via the setup executable, the protocol command correctly pointed to the installed copy:

```
"C:\Users\...\AppData\Local\Programs\Getmeair\Getmeair.exe" "%1"
```

The current source also normalizes `getmeair://` to internal `tg://`, but this normalization is not present in the prebuilt binary.

## 8. Silent installer

**PASS.**

Command:

```bat
"D:\Getmeair-dev\installer\Getmeair Setup.exe" /S
```

Observed:

- exit code `0`;
- `%LOCALAPPDATA%\Programs\Getmeair\Getmeair.exe` created;
- `modules\x64\d3d\d3dcompiler_47.dll` created;
- Start Menu folder `Getmeair` with `Getmeair.lnk` and `Uninstall Getmeair.lnk`;
- desktop shortcut `Getmeair.lnk`;
- uninstall registry entry with `DisplayName = Getmeair`;
- protocol key registered to the installed executable.

Installer metadata:

- `FileVersion` / `ProductVersion`: `7.4.4.0`;
- `ProductName`: `Getmeair`;
- `CompanyName`: `Getmeair`;
- `FileDescription`: `Getmeair Setup`.

## 9. Installed application launch

**PASS.**

The installed executable started from `%LOCALAPPDATA%\Programs\Getmeair`, created `log.txt` and `tdata`, and exposed a visible window titled `Getmeair`.

Log extract:

```
Executable dir: .../AppData/Local/Programs/Getmeair/, name: Getmeair.exe
Working dir: .../AppData/Local/Programs/Getmeair/
AppUserModelID: Getmeair.GetmeairDesktop.35d2d2ea4c6a9d96d825b9b7940b81a4
Using DirectX compiler '...\modules\x64\d3d\d3dcompiler_47.dll'.
This is the only instance of Getmeair, starting server and app...
```

## 10. Uninstaller

**PASS.**

Command:

```bat
"D:\Getmeair-dev\installer\Getmeair Setup.exe" /uninstall
```

Observed:

- exit code `0`;
- Start Menu shortcuts removed;
- desktop shortcut removed;
- protocol key removed;
- uninstall registry key removed;
- `Getmeair.exe` and `modules` removed;
- runtime `tdata` intentionally preserved.

Test remnants were cleaned manually afterwards, and the protocol registration was restored to `D:\Getmeair-dev\build\Getmeair.exe`.

## 11. Critical errors

**PARTIAL.**

No fatal errors were found in the launch logs. The only warning was:

```
SetProcessDpiAwarenessContext() failed: ...
Qt's default DPI awareness context is DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2.
```

This is a non-critical Qt/DPI compatibility message. Long-term stability, crash behaviour and network error handling were not exhaustively tested.

## 12. Authorization

**NOT TESTED.**

No phone number, login code or API credentials were supplied. No attempt was made to authenticate.

## 13. Messages, groups, channels, calls, files, stickers, search, notifications

**NOT TESTED.**

These features depend on a successful login and live Telegram session. Since the binary is an unmodified-functionality Telegram Desktop derivative, the features are expected to exist, but this expectation was not verified in this environment.

## Conclusion

The distributed executable is genuinely runnable and the installer is genuinely functional. The remaining critical gap is that the executable was not rebuilt from the current edited source tree, so some source-level rebranding fixes are not reflected in the binary. Authorization and messaging remain unverified.
