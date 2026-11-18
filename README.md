# Getmeair Desktop

Getmeair — самостоятельный десктопный мессенджер для Windows, собранный на базе официального исходного кода Telegram Desktop 7.4.4. Проект использует оригинальную инфраструктуру Telegram и сохраняет функциональность клиента, но имеет собственное имя, иконки, исполняемый файл, данные, ярлыки и регистрацию протокола `getmeair://`.

> **Важно.** В каталоге `build` лежит реально запускаемый ребрендированный бинарник, полученный из `D:\Getmeair.zip`. Он **не был скомпилирован из текущих отредактированных исходников** этого проекта: на этой машине нет MSVC/Windows SDK/Qt/зависимостей. Текущие правки исходного кода подготовлены к сборке, но сами собраны не были. Подробности — `build/BUILD_STATUS.md` и `documentation/TESTING.md`.

---

## 1. Быстрый запуск

### Из проекта

```bat
D:\Getmeair-dev\Start_Getmeair.bat
```

Скрипт запускает:

```
D:\Getmeair-dev\build\Getmeair.exe
```

### Прямой запуск

```
D:\Getmeair-dev\build\Getmeair.exe
```

### Портативная версия

```
D:\Getmeair-dev\build\Getmeair-Portable.zip
```

Распакуйте архив в любую папку и запустите `Getmeair.exe`. Портативная версия создаёт папку `TelegramForcePortable` и хранит данные внутри неё.

---

## 2. Установка на Windows

Готовый установщик:

```
D:\Getmeair-dev\installer\Getmeair Setup.exe
```

Это настоящий установщик, собранный из исходника `installer\GetmeairInstaller.cs` с помощью встроенного компилятора .NET Framework. Он не является заглушкой и не требует Inno Setup.

### Обычная установка

1. Запустите `Getmeair Setup.exe`.
2. При необходимости измените папку установки.
3. Нажмите **Install**.

По умолчанию приложение устанавливается в:

```
%LOCALAPPDATA%\Programs\Getmeair
```

Установщик создаёт:

- `Getmeair.exe` и `modules\x64\d3d\d3dcompiler_47.dll`;
- ярлык в меню «Пуск» → `Getmeair`;
- ярлык на рабочем столе;
- ярлык «Uninstall Getmeair»;
- запись в `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Getmeair`;
- регистрацию `getmeair://` в `HKCU\Software\Classes\getmeair`.

### Тихая установка

```bat
"D:\Getmeair-dev\installer\Getmeair Setup.exe" /S
```

### Удаление

Через «Параметры» → «Приложения» или командой:

```bat
"D:\Getmeair-dev\installer\Getmeair Setup.exe" /uninstall
```

Удаление не стирает данные мессенджера — папка `tdata` сохраняется намеренно.

---

## 3. Где хранятся данные

Getmeair полностью отделён от обычного Telegram Desktop:

| Элемент | Getmeair | Обычный Telegram Desktop |
|---|---|---|
| Исполняемый файл | `Getmeair.exe` | `Telegram.exe` |
| Папка данных при запуске из проекта | `D:\Getmeair-dev\build\tdata` | `%APPDATA%\Telegram Desktop\tdata` |
| Папка данных после установки | `%LOCALAPPDATA%\Programs\Getmeair\tdata` | `%APPDATA%\Telegram Desktop\tdata` |
| Портативная папка | `TelegramForcePortable\tdata` | `TelegramForcePortable\tdata` Telegram |
| AppUserModelID | `Getmeair.GetmeairDesktop.<hash>` | `Telegram.TelegramDesktop...` |
| Протокол | `getmeair://` | `tg://` |
| Раздел реестра | `HKCU\Software\Classes\getmeair` | `HKCU\Software\Classes\tg` |

На Windows обычная (не Store) сборка Telegram Desktop по умолчанию использует папку рядом с EXECUTE-файлом. Поэтому после установки Getmeair пишет данные в папку установки, а не в `%APPDATA%\Getmeair`. Это всё равно отдельно от Telegram Desktop.

---

## 4. Протокол `getmeair://`

Регистрация для текущего пользователя:

```bat
powershell -ExecutionPolicy Bypass -File D:\Getmeair-dev\scripts\register_protocol.ps1
```

Удаление регистрации:

```bat
powershell -ExecutionPolicy Bypass -File D:\Getmeair-dev\scripts\register_protocol.ps1 -Unregister
```

Проверка:

```
getmeair://resolve?domain=telegram
```

В исходном коде `getmeair://` нормализуется во внутренний `tg://` обработчик, чтобы не ломать совместимость с серверной логикой и внутренними ссылками Telegram.

---

## 5. API ID и API HASH

Getmeair использует официальный Telegram API. Для **сборки из исходников** нужны ваши собственные `API_ID` и `API_HASH`.

1. Получите их на <https://my.telegram.org/apps> (раздел API Development Tools).
2. Скопируйте `config\api.env.example` в `config\api.env`.
3. Заполните значения:

```dotenv
API_ID=123456
API_HASH=0123456789abcdef0123456789abcdef
```

4. Примените конфигурацию:

```bat
powershell -ExecutionPolicy Bypass -File D:\Getmeair-dev\config\apply_api.ps1
```

Скрипт проверяет формат, генерирует `source\Telegram\SourceFiles\core\api_credentials.generated.h` и ничего не выводит в логи. Файл `api.env` и сгенерированный заголовок добавлены в `.gitignore`.

Подробности: `documentation/API_SETUP.md`.

> Не публикуйте `API_HASH` в GitHub, архивах и логах. Не используйте тестовые или выдуманные учётные данные для релизной сборки.

---

## 6. Ребрендинг и ресурсы

Структура ресурсов:

```
assets/
  branding/
    logo.png
    logo.svg
    app_icon.ico
    splash.png
  icons/
  backgrounds/
```

Логотип и иконки созданы специально для Getmeair сценарием `assets\generate_branding.ps1`.

Установка ресурсов в исходный код:

```bat
powershell -ExecutionPolicy Bypass -File D:\Getmeair-dev\scripts\install_branding.ps1
```

Оригинальные иконки Telegram Desktop сохраняются в `patches\originals\art`.

Основные пользовательские строки переведены сценарием `scripts\brand_localization.ps1`.

---

## 7. Сборка из исходного кода

Официальные требования для этой версии Telegram Desktop:

- Visual Studio 2026;
- Windows SDK `10.0.26100.0`;
- MSVC toolset `14.44` (`-vcvars_ver=14.44`);
- CMake 3.25–3.31;
- Ninja;
- Git;
- Python 3.10;
- инициализированные подмодули;
- подготовленные зависимости через `Telegram\build\prepare\win.bat`;
- ваши `API_ID` и `API_HASH`.

Команда сборки:

```bat
D:\Getmeair-dev\Build_Getmeair.bat
```

Скрипт проверяет инструменты, применяет API-конфигурацию, устанавливает брендинг, запускает CMake/Ninja, копирует результат в `build\Getmeair.exe` и собирает установщик.

На текущей машине сборка **не выполнена**: нет Visual Studio/MSVC/Windows SDK/Qt, подмодули исходника пусты, а реальные API-данные не предоставлены. См. `build/BUILD_STATUS.md`.

---

## 8. Структура проекта

```
D:\Getmeair-dev
    source              -> junction на D:\tdesktop-dev
    assets
        branding
        icons
        backgrounds
    config
    patches
    scripts
    build
    installer
    documentation
    README.md
    Build_Getmeair.bat
    Start_Getmeair.bat
```

`source` — символическая ссылка Windows (junction) на официальный исходный код в `D:\tdesktop-dev`. Это сделано, чтобы не копировать огромное дерево исходников. Все проектные файлы находятся в `D:\Getmeair-dev`; правки исходника применяются через эту ссылку.

---

## 9. Проверки

Выполненные проверки перечислены в `documentation/TESTING.md`. Кратко:

- запуск `Getmeair.exe` из `build` и из папки установки — выполнено;
- заголовок окна `Getmeair` — подтверждён через UI Automation;
- AppUserModelID `Getmeair.GetmeairDesktop...` — подтверждён в логе;
- раздельное хранение данных с Telegram Desktop — проверено;
- `getmeair://` — проверён запуск через протокол;
- тихая установка и удаление установщика — проверены;
- критических ошибок в логе при запуске не обнаружено, кроме предупреждения DPI.

Не проверено:

- компиляция из исходного кода;
- авторизация и отправка/получение сообщений (нет учётных данных и API-ключей);
- полное визуальное сравнение всех экранов;
- запуск обычного Telegram Desktop рядом в этой сессии.

---

## 10. Известные ограничения

1. `build\Getmeair.exe` — реальный рабочий бинарник, но собран вне этой машины и не содержит всех текущих правок исходника. В интерфейсе осталась строка `Welcome to the official Telegram Desktop app.` — она исправлена в исходнике, но не в бинарнике.
2. Установщик собран на базе того же бинарника, поэтому наследует это ограничение.
3. Полная пересборка требует установки Visual Studio 2026 и зависимостей.
4. Авторизация и обмен сообщениями не тестировались в этой среде.
5. Inno Setup недоступен; установщик собран через встроенный .NET Framework компилятор.

---

## 11. Правовая информация

Getmeair основан на Telegram Desktop, распространяемом по лицензии GPLv3. Сохраняйте уведомления об авторстве и лицензии. Используйте только официальный Telegram API и не пытайтесь обходить ограничения сервера.
