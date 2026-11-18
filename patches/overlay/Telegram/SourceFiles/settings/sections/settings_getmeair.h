/*
This file is part of Getmeair Desktop,
a modified build of Telegram Desktop.

For license and copyright information please follow this link:
https://github.com/telegramdesktop/tdesktop/blob/master/LEGAL
*/
#pragma once

#include "settings/settings_type.h"

namespace Settings {

[[nodiscard]] Type GetmeairId();
[[nodiscard]] Type GhostModeId();
[[nodiscard]] Type MessageHistoryId();
[[nodiscard]] Type StreamerModeId();

} // namespace Settings
