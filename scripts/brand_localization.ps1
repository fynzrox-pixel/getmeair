param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'

$langs = Join-Path $ProjectRoot 'source\Telegram\Resources\langs'
$english = Join-Path $langs 'lang.strings'

$globalReplacements = @{
    'Telegram Desktop' = 'Getmeair'
}

$englishReplacements = @{
    '"lng_update_telegram" = "Update Telegram";' = '"lng_update_telegram" = "Update Getmeair";'
    '"lng_settings_add_sendto" = "Place Telegram in \"Send to\" menu";' = '"lng_settings_add_sendto" = "Place Getmeair in \"Send to\" menu";'
    '"lng_passcode_winhello_unlock" = "Telegram wants to unlock with Windows Hello.";' = '"lng_passcode_winhello_unlock" = "Getmeair wants to unlock with Windows Hello.";'
    '"lng_passcode_unlock_about" = "Unlock Telegram to continue.";' = '"lng_passcode_unlock_about" = "Unlock Getmeair to continue.";'
    '"lng_settings_export_data" = "Export Telegram data";' = '"lng_settings_export_data" = "Export Getmeair data";'
    '"lng_message_unsupported" = "This message is not supported by your version of Telegram.' = '"lng_message_unsupported" = "This message is not supported by your version of Getmeair.'
    '"lng_unsupported_message_text" = "Update Telegram to view this message";' = '"lng_unsupported_message_text" = "Update Getmeair to view this message";'
    '"lng_unsupported_block_text" = "Update Telegram to view this part of the message";' = '"lng_unsupported_block_text" = "Update Getmeair to view this part of the message";'
    '"lng_theme_editor_need_unlock" = "You need to unlock Telegram to save your theme.";' = '"lng_theme_editor_need_unlock" = "You need to unlock Getmeair to save your theme.";'
    '"lng_passport_app_out_of_date" = "Sorry, your Telegram app is out of date and can''t handle this request. Please update Telegram.";' = '"lng_passport_app_out_of_date" = "Sorry, your Getmeair app is out of date and can''t handle this request. Please update Getmeair.";'
    '"lng_screen_reader_bar_text" = "Telegram is working in Screen Reader mode.";' = '"lng_screen_reader_bar_text" = "Getmeair is working in Screen Reader mode.";'
    '"lng_screen_reader_confirm_text" = "Telegram detected accessibility software' = '"lng_screen_reader_confirm_text" = "Getmeair detected accessibility software'
    'the way Telegram user interface works.' = 'the way Getmeair user interface works.'
    'If you do not use Screen Reader software with Telegram,' = 'If you do not use Screen Reader software with Getmeair,'
    '"lng_stories_unsupported" = "This story is not supported\nby your version of Telegram.";' = '"lng_stories_unsupported" = "This story is not supported\nby your version of Getmeair.";'
    '"lng_mac_menu_show" = "Show Telegram";' = '"lng_mac_menu_show" = "Show Getmeair";'
}

$files = Get-ChildItem -File -LiteralPath $langs -Filter '*.strings'
foreach ($file in $files) {
    $text = [System.IO.File]::ReadAllText($file.FullName)
    foreach ($key in $globalReplacements.Keys) {
        $text = $text.Replace($key, $globalReplacements[$key])
    }
    if ($file.FullName -eq $english) {
        foreach ($key in $englishReplacements.Keys) {
            $text = $text.Replace($key, $englishReplacements[$key])
        }
    }
    [System.IO.File]::WriteAllText($file.FullName, $text, [System.Text.UTF8Encoding]::new($false))
}

Write-Output "Updated $($files.Count) language files."
