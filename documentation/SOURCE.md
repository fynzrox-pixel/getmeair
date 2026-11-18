# Source tree connection

## Current layout

```
D:\Getmeair-dev\source  ->  D:\tdesktop-dev
```

`source` is a Windows directory junction (symbolic link at the filesystem level). It points to the official Telegram Desktop source tree located at `D:\tdesktop-dev`.

This approach was chosen because:

- all project-owned files remain inside `D:\Getmeair-dev`, as required;
- the very large upstream source tree is not duplicated;
- the original source at `D:\tdesktop-dev` is not deleted or damaged.

Files edited through the junction are physically stored in `D:\tdesktop-dev`. The upstream checkout has no `.git` metadata and all 38 git submodules are empty, so it cannot currently be built directly.

## Preserving original files

- Original art replaced by branding is saved in `D:\Getmeair-dev\patches\originals\art`.
- The original Inno Setup script was replaced by a Getmeair version; the upstream version can be restored from an official tdesktop checkout of version 7.4.4.
- No secrets are stored in the source tree. `api_credentials.generated.h` is ignored.

## Moving the project to another machine

1. Copy `D:\Getmeair-dev` without following the `source` junction, or recreate it as an empty directory.
2. Clone official Telegram Desktop 7.4.4 with submodules into `D:\Getmeair-dev\source` (or point the junction to that clone).
3. Run:
   - `config\apply_api.ps1`;
   - `scripts\install_branding.ps1`;
   - `scripts\brand_localization.ps1`.
4. Apply the source edits listed in `documentation\CHANGES.md` if they are not already present in the copied tree.
5. Run `Build_Getmeair.bat` from a Visual Studio Native Tools prompt.
