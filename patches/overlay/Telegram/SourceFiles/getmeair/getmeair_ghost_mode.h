/*
This file is part of Getmeair Desktop,
a modified build of Telegram Desktop.

For license and copyright information please follow this link:
https://github.com/telegramdesktop/tdesktop/blob/master/LEGAL
*/
#pragma once

#include "getmeair/getmeair_settings.h"

#include <rpl/rpl.h>

class History;

namespace Getmeair::Ghost {

enum class Flag {
	ReadReceipts,
	Typing,
	Recording,
	Uploads,
	Online,
};

// Common helpers.
[[nodiscard]] GhostConfig Config(not_null<Main::Session*> session);
[[nodiscard]] QString ProfileName(int profile);
[[nodiscard]] QString StatusText(not_null<Main::Session*> session);

// Effective values, taking temporary mode and per-chat overrides
// into account. These are cheap and can be called from hot paths.
[[nodiscard]] bool Enabled(not_null<Main::Session*> session);
[[nodiscard]] bool EnabledFor(not_null<History*> history);
[[nodiscard]] bool Hides(not_null<Main::Session*> session, Flag flag);
[[nodiscard]] bool HidesFor(not_null<History*> history, Flag flag);

// Mutations. Every mutation is persisted immediately and fires
// Getmeair::Settings::Instance().changes().
void Update(not_null<Main::Session*> session, Fn<void(GhostConfig&)> mutate);
void SetEnabled(not_null<Main::Session*> session, bool enabled);
void Toggle(not_null<Main::Session*> session);
void SetProfile(not_null<Main::Session*> session, int profile);
void SetTemporary(not_null<Main::Session*> session, int minutes);
void SetChatOverride(
	not_null<Main::Session*> session,
	PeerId peerId,
	std::optional<bool> enabled);

// Re-evaluates pending outgoing activity after a Ghost Mode change:
// flushes postponed read receipts and refreshes the online status.
void FlushPending(not_null<Main::Session*> session);

} // namespace Getmeair::Ghost
