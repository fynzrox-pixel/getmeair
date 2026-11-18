/*
This file is part of Getmeair Desktop,
a modified build of Telegram Desktop.

For license and copyright information please follow this link:
https://github.com/telegramdesktop/tdesktop/blob/master/LEGAL
*/
#include "getmeair/getmeair_ghost_mode.h"

#include "apiwrap.h"
#include "api/api_updates.h"
#include "base/unixtime.h"
#include "data/data_histories.h"
#include "data/data_session.h"
#include "history/history.h"
#include "main/main_session.h"

namespace Getmeair::Ghost {
namespace {

void Normalize(GhostConfig &config) {
	const auto now = base::unixtime::now();
	if (config.temporaryUntil && config.temporaryUntil <= now) {
		config.temporaryUntil = 0;
		config.enabled = false;
	}
}

void ApplyProfileFlags(GhostConfig &config, int profile) {
	config.profile = profile;
	switch (profile) {
	case 1: // Balanced: hide activity, keep read receipts.
		config.enabled = true;
		config.hideReadReceipts = false;
		config.hideTyping = true;
		config.hideRecording = true;
		config.hideUploads = true;
		config.hideOnline = true;
		break;
	case 2: // Stealth: hide everything Getmeair can suppress.
		config.enabled = true;
		config.hideReadReceipts = true;
		config.hideTyping = true;
		config.hideRecording = true;
		config.hideUploads = true;
		config.hideOnline = true;
		break;
	default: // Normal: behave like the official client.
		config.profile = 0;
		config.enabled = false;
		config.temporaryUntil = 0;
		config.hideReadReceipts = false;
		config.hideTyping = false;
		config.hideRecording = false;
		config.hideUploads = false;
		config.hideOnline = false;
		break;
	}
}

[[nodiscard]] bool FlagValue(const GhostConfig &config, Flag flag) {
	switch (flag) {
	case Flag::ReadReceipts: return config.hideReadReceipts;
	case Flag::Typing: return config.hideTyping;
	case Flag::Recording: return config.hideRecording;
	case Flag::Uploads: return config.hideUploads;
	case Flag::Online: return config.hideOnline;
	}
	return false;
}

[[nodiscard]] bool EffectiveEnabled(const GhostConfig &config) {
	const auto now = base::unixtime::now();
	if (config.temporaryUntil && config.temporaryUntil <= now) {
		return false;
	}
	return config.enabled;
}

[[nodiscard]] bool EffectiveEnabledFor(
		const GhostConfig &config,
		PeerId peerId) {
	const auto i = config.chatOverrides.constFind(peerId.value);
	if (i != config.chatOverrides.cend()) {
		return *i;
	}
	return EffectiveEnabled(config);
}

} // namespace

GhostConfig Config(not_null<Main::Session*> session) {
	auto result = Settings::Instance().ghost(AccountKey(session));
	Normalize(result);
	return result;
}

QString ProfileName(int profile) {
	switch (profile) {
	case 1: return u"Balanced"_q;
	case 2: return u"Stealth"_q;
	}
	return u"Normal"_q;
}

QString StatusText(not_null<Main::Session*> session) {
	const auto config = Config(session);
	if (!config.enabled) {
		return u"Ghost Mode is off."_q;
	}
	auto result = u"Ghost Mode: %1."_q.arg(ProfileName(config.profile));
	if (config.temporaryUntil) {
		const auto left = std::max(
			config.temporaryUntil - base::unixtime::now(),
			0);
		result += u" Temporary mode, %1 min left."_q.arg((left + 59) / 60);
	}
	return result;
}

bool Enabled(not_null<Main::Session*> session) {
	return EffectiveEnabled(Config(session));
}

bool EnabledFor(not_null<History*> history) {
	const auto config = Config(&history->owner().session());
	return EffectiveEnabledFor(config, history->peer->id);
}

bool Hides(not_null<Main::Session*> session, Flag flag) {
	const auto config = Config(session);
	return EffectiveEnabled(config) && FlagValue(config, flag);
}

bool HidesFor(not_null<History*> history, Flag flag) {
	const auto config = Config(&history->owner().session());
	return EffectiveEnabledFor(config, history->peer->id)
		&& FlagValue(config, flag);
}

void Update(
		not_null<Main::Session*> session,
		Fn<void(GhostConfig&)> mutate) {
	const auto key = AccountKey(session);
	auto config = Settings::Instance().ghost(key);
	Normalize(config);
	mutate(config);
	Settings::Instance().setGhost(key, config);
	FlushPending(session);
}

void SetEnabled(not_null<Main::Session*> session, bool enabled) {
	Update(session, [&](GhostConfig &config) {
		config.enabled = enabled;
		if (!enabled) {
			config.temporaryUntil = 0;
		} else if (!config.hideReadReceipts
			&& !config.hideTyping
			&& !config.hideRecording
			&& !config.hideUploads
			&& !config.hideOnline) {
			ApplyProfileFlags(config, 1);
		}
	});
}

void Toggle(not_null<Main::Session*> session) {
	SetEnabled(session, !Enabled(session));
}

void SetProfile(not_null<Main::Session*> session, int profile) {
	Update(session, [&](GhostConfig &config) {
		ApplyProfileFlags(config, profile);
	});
}

void SetTemporary(not_null<Main::Session*> session, int minutes) {
	Update(session, [&](GhostConfig &config) {
		if (minutes <= 0) {
			config.temporaryUntil = 0;
			config.enabled = false;
			return;
		}
		if (!config.hideReadReceipts
			&& !config.hideTyping
			&& !config.hideRecording
			&& !config.hideUploads
			&& !config.hideOnline) {
			ApplyProfileFlags(config, 1);
		}
		config.enabled = true;
		config.temporaryUntil = base::unixtime::now() + minutes * 60;
	});
}

void SetChatOverride(
		not_null<Main::Session*> session,
		PeerId peerId,
		std::optional<bool> enabled) {
	Update(session, [&](GhostConfig &config) {
		if (enabled.has_value()) {
			config.chatOverrides.insert(peerId.value, *enabled);
		} else {
			config.chatOverrides.remove(peerId.value);
		}
	});
}

void FlushPending(not_null<Main::Session*> session) {
	session->data().histories().resendPendingReads();
	session->api().updates().updateOnline(crl::now());
}

} // namespace Getmeair::Ghost
