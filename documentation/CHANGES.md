# Change log — Getmeair

All project-owned files are under `D:\Getmeair-dev`. Source edits are applied through the `source` junction to `D:\tdesktop-dev`.

## 1. Project identity and core constants

| File | Change |
|---|---|
| `source\Telegram\SourceFiles\core\version.h` | `AppName = "Getmeair"`, `AppFile = "getmeair"`, unique `AppId = {6F2A1C34-...}`, `AppNameOld = "GetmeairLegacy"` so Telegram data is never migrated. |
| `source\CMakeLists.txt` | Project description `Getmeair Desktop messenger`, homepage `https://getmeair.com`. |
| `source\Telegram\CMakeLists.txt` | Executable output name `Getmeair`; conditional generated API credentials; `G_LOG_DOMAIN="Getmeair"`. |
| `source\Telegram\SourceFiles\config.h` | Supports generated API credentials header; removed test API fallback; unique `cGUIDStr = {2C8B7A19-...}`. |
| `source\.gitignore` | Ignores `core\api_credentials.generated.h`. |

## 2. User-facing interface and localization

| File | Change |
|---|---|
| `source\Telegram\SourceFiles\core\launcher.cpp` | `QApplication::setApplicationName(u"Getmeair")`. |
| `source\Telegram\SourceFiles\boxes\about_box.cpp` | About box title `Getmeair`. |
| `source\Telegram\SourceFiles\window\main_window.cpp` | Window title `Getmeair`. |
| `source\Telegram\SourceFiles\window\window_saved_windows.cpp` | Saved-window title `Getmeair`. |
| `source\Telegram\SourceFiles\window\window_restore_shell.cpp` | Restore-shell title `Getmeair`. |
| `source\Telegram\SourceFiles\window\window_main_menu.cpp` | Main menu link label/URL `Getmeair` / `https://getmeair.com`. |
| `source\Telegram\SourceFiles\window\notifications_manager_default.cpp` | Hidden-name notification title `Getmeair`. |
| `source\Telegram\SourceFiles\window\notifications_manager.cpp` | Notification title uses `AppName`. |
| `source\Telegram\SourceFiles\api\api_authorizations.cpp` | Desktop session label `Getmeair`. |
| `source\Telegram\SourceFiles\settings\sections\settings_notifications.cpp` | Notification preview title `Getmeair`. |
| `source\Telegram\SourceFiles\intro\intro_start.cpp` | Start screen title `Getmeair`. |
| `source\Telegram\SourceFiles\core\crash_report_window.cpp` | Crash-report titles and messages rebranded. |
| `source\Telegram\SourceFiles\core\external_control.cpp` | Local automation warning mentions Getmeair. |
| `source\Telegram\SourceFiles\core\file_utilities.cpp` | Default download folder fallback `Getmeair Lite`. |
| `source\Telegram\Resources\langs\lang.strings` | App-name strings replaced with Getmeair; About text updated. |
| `source\Telegram\Resources\langs\cloud_lang.strings` | App-name strings replaced with Getmeair. |

## 3. Windows identity, protocol and updater

| File | Change |
|---|---|
| `source\Telegram\SourceFiles\core\application.cpp` | Registers `getmeair://` instead of `tg://`; normalizes incoming `getmeair://` URLs to internal `tg://`; `Getmeair Link` protocol name; `getmeair` short app name; updated option description. |
| `source\Telegram\SourceFiles\platform\win\windows_app_user_model_id.cpp` | AUMID bases `Getmeair.GetmeairDesktop...`; shortcut names `Getmeair\Getmeair.lnk`; removed Telegram shortcut fallback. |
| `source\Telegram\SourceFiles\platform\win\specific_win.cpp` | Autorun/send-to helper names and log messages use Getmeair; data path derives from `AppName`. |
| `source\Telegram\SourceFiles\settings\settings_codes.cpp` | Added `registergetmeair` settings code. |
| `source\Telegram\SourceFiles\_other\updater_win.cpp` | Unique uninstall registry GUID; publisher/name/icon group/URL/program folder rebranded. |
| `source\Telegram\Resources\winrc\Updater.rc` | Updater metadata Getmeair. |
| `source\Telegram\Resources\winrc\Telegram.rc` | Executable version metadata Getmeair. |

## 4. Build system and installer script

| File | Change |
|---|---|
| `source\Telegram\cmake\telegram_options.cmake` | Generated API credentials support; test credentials removed; clear error if credentials missing. |
| `source\Telegram\build\build.bat` | `BinaryName=Getmeair`; Getmeair setup/portable/update artifact names. |
| `source\Telegram\build\test_package.bat` | `BinaryName=Getmeair`. |
| `source\Telegram\build\setup.iss` | Rewritten Inno Setup script: `Getmeair.exe`, Getmeair AppId, publisher, URL, icons, shortcuts, `getmeair://` registry entries, Getmeair data cleanup. |

## 5. Branding assets

| Path | Change |
|---|---|
| `assets\generate_branding.ps1` | Generates original Getmeair logo, icon and splash assets in multiple sizes (16–1024). |
| `assets\branding\logo.png`, `logo.svg`, `app_icon.ico`, `splash.png` | Original Getmeair branding. |
| `assets\icons\app_icon_*.png`, `app_icon.ico` | Multi-size icon set. |
| `assets\backgrounds\splash_background.png` | Splash background. |
| `patches\originals\art\` | 20 original Telegram art files backed up before replacement. |
| `scripts\install_branding.ps1` | Installs 20 branded resources into `source\Telegram\Resources\art`. |
| `scripts\brand_localization.ps1` | Rebrands user-facing strings in both language files. |

## 6. API configuration

| File | Change |
|---|---|
| `config\api.env.example` | Example `API_ID` / `API_HASH` with placeholders and security notes. |
| `config\apply_api.ps1` | Validates credentials, writes ignored generated header, never logs secrets. |
| `config\branding.env` | Application name/file/publisher/homepage values. |
| `documentation\API_SETUP.md` | Full credential setup and security instructions. |

## 7. Root scripts and documentation

| File | Change |
|---|---|
| `Build_Getmeair.bat` | Checks toolchain/submodules, applies API config and branding, builds with CMake/Ninja, copies output, builds installer. |
| `Start_Getmeair.bat` | Launches `build\Getmeair.exe` from the correct directory. |
| `scripts\register_protocol.ps1` | Registers/unregisters `getmeair://` for the current user. |
| `scripts\build_installer.ps1` | Creates payload ZIP and compiles the self-contained installer with .NET Framework `csc.exe`. |
| `scripts\package_portable.ps1` | Creates `build\Getmeair-Portable.zip`. |
| `installer\GetmeairInstaller.cs` | Source of the real Windows installer: silent install, uninstall, shortcuts, protocol, registry. |
| `installer\Getmeair Setup.exe` | Compiled installer deliverable. |
| `README.md` | Main project documentation. |
| `build\BUILD_STATUS.md` | Honest build/provenance status. |
| `documentation\TESTING.md` | Executed and not-executed verification checks. |
| `documentation\CHANGES.md` | This file. |
| `.gitignore` | Ignores secrets and generated/installer payload files. |
