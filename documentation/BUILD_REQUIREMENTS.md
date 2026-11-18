# Getmeair — Build Requirements

To compile Getmeair 0.1.1 from the modified source, install the following
on Windows 10/11 (x64).

## Required tools

1. Visual Studio 2022 Build Tools (or VS 2022 Community)
   - Workload: "Desktop development with C++"
   - Components: MSVC v143 x64/x86 build tools, Windows 10/11 SDK
     (10.0.22621 or newer), CMake tools for Visual Studio.
   - Official: https://visualstudio.microsoft.com/downloads/
     (Build Tools: https://visualstudio.microsoft.com/visual-cpp-build-tools/)

2. CMake 3.24+
   - Official: https://cmake.org/download/

3. Ninja 1.11+
   - Official releases: https://github.com/ninja-build/ninja/releases

4. Git 2.40+
   - Official: https://git-scm.com/download/win
   - Needed to initialise tdesktop submodules.

5. Python 3.10+ (real interpreter, not the WindowsApps stub)
   - Official: https://www.python.org/downloads/
   - Required by some tdesktop build scripts.

6. Qt 6.x (exact version pinned by the tdesktop source tree; check
   Telegram/CMakeLists.txt and the upstream tdesktop 7.4.4 build docs)
   - Official: https://www.qt.io/download-qt-installer
   - Install the MSVC x64 kit and the following modules: Core, Gui,
     Widgets, Network, Svg, Multimedia, WebEngine (as required by tdesktop).

7. Inno Setup 6 (for the installer)
   - Official: https://jrsoftware.org/isinfo.php

## Source preparation

The tdesktop submodules (lib_base, lib_ui, lib_rpl, etc.) must be
populated. From D:\Getmeair-dev (or D:\tdesktop-dev):

    git submodule update --init --recursive

Do NOT delete or damage D:\tdesktop-dev. D:\Getmeair-dev\source is a
junction to it.

## Build steps (after toolchain install)

1. Open "x64 Native Tools Command Prompt for VS 2022".
2. cd D:\Getmeair-dev\source\Telegram
3. cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release ...
   (add Qt path via CMAKE_PREFIX_PATH)
4. cmake --build build --target Telegram --parallel
5. The resulting binary is Telegram.exe; rename/copy to Getmeair.exe.

## Run tests

Server:
    cd /d D:\Getmeair-dev\server && node --test test\*.test.mjs

Plugin host:
    cd /d D:\Getmeair-dev\plugin-host && node --test test\*.test.mjs
