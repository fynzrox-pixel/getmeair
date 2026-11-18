/*
This file is part of Getmeair Desktop,
a modified build of Telegram Desktop.

For license and copyright information please follow this link:
https://github.com/telegramdesktop/tdesktop/blob/master/LEGAL
*/
#include "getmeair/getmeair_streamer.h"

#include "core/application.h"
#include "data/data_peer.h"

namespace Getmeair::Streamer {
namespace {

[[nodiscard]] bool CaptureProtectionActive() {
	const auto config = Config();
	return config.enabled && config.protectFromCapture;
}

[[nodiscard]] QString PeerKindName(not_null<PeerData*> peer) {
	if (peer->isUser()) {
		return u"User"_q;
	} else if (peer->isChat()) {
		return u"Group"_q;
	} else if (peer->isChannel()) {
		return u"Channel"_q;
	}
	return u"Chat"_q;
}

} // namespace

StreamerConfig Config() {
	return Settings::Instance().streamer();
}

void Update(Fn<void(StreamerConfig&)> mutate) {
	auto config = Config();
	mutate(config);
	Settings::Instance().setStreamer(config);
}

bool Enabled() {
	return Config().enabled;
}

bool HidesNames() {
	const auto config = Config();
	return config.enabled && config.hideNames;
}

bool HidesNotificationText() {
	const auto config = Config();
	return config.enabled && config.hideNotificationText;
}

bool HidesPhoneNumbers() {
	const auto config = Config();
	return config.enabled && config.hidePhoneNumbers;
}

void SetEnabled(bool enabled) {
	auto config = Config();
	if (config.enabled == enabled) {
		return;
	}
	config.enabled = enabled;
	Settings::Instance().setStreamer(config);
	Core::App().updateWindowTitles();
}

void Toggle() {
	SetEnabled(!Enabled());
}

rpl::producer<bool> CaptureProtectionValue() {
	return rpl::single(
		CaptureProtectionActive()
	) | rpl::then(
		Settings::Instance().changes()
		| rpl::map([] {
			return CaptureProtectionActive();
		})
	) | rpl::type_erased;
}

QString RedactedPeerName(
		not_null<PeerData*> peer,
		const QString &original) {
	if (!HidesNames()) {
		return original;
	}
	const auto value = peer->id.value;
	const auto mixed = quint32(value ^ (value >> 32));
	return PeerKindName(peer)
		+ u" #"_q
		+ QString::number(2000 + (mixed % 8000));
}

QString RedactText(const QString &text) {
	if (!HidesPhoneNumbers()) {
		return text;
	}
	static const auto expression = QRegularExpression(
		u"\\+?\\d[\\d\\s\\-()]{6,}\\d"_q);
	auto result = text;
	result.replace(expression, u"[number hidden]"_q);
	return result;
}

QString HiddenMessageText() {
	if (HidesNotificationText()) {
		return u"Message hidden (Streamer Mode)"_q;
	}
	return RedactText(u"New message"_q);
}

QString WindowTitle() {
	return u"Getmeair"_q;
}

} // namespace Getmeair::Streamer
