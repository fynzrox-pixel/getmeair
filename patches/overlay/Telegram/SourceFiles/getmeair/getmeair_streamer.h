/*
This file is part of Getmeair Desktop,
a modified build of Telegram Desktop.

For license and copyright information please follow this link:
https://github.com/telegramdesktop/tdesktop/blob/master/LEGAL
*/
#pragma once

#include "getmeair/getmeair_settings.h"

#include <rpl/rpl.h>

class PeerData;

namespace Getmeair::Streamer {

[[nodiscard]] StreamerConfig Config();
void Update(Fn<void(StreamerConfig&)> mutate);
void SetEnabled(bool enabled);
void Toggle();

[[nodiscard]] bool Enabled();
[[nodiscard]] bool HidesNames();
[[nodiscard]] bool HidesNotificationText();
[[nodiscard]] bool HidesPhoneNumbers();

// Applies to every window through Core::ScreenshotProtection.
[[nodiscard]] rpl::producer<bool> CaptureProtectionValue();

// Replaces a peer name / message text with a neutral representation.
[[nodiscard]] QString RedactedPeerName(
	not_null<PeerData*> peer,
	const QString &original);
[[nodiscard]] QString RedactText(const QString &text);
[[nodiscard]] QString HiddenMessageText();
[[nodiscard]] QString WindowTitle();

} // namespace Getmeair::Streamer
