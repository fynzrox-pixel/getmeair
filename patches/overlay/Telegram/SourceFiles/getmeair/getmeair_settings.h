/*
This file is part of Getmeair Desktop,
a modified build of Telegram Desktop.

For license and copyright information please follow this link:
https://github.com/telegramdesktop/tdesktop/blob/master/LEGAL
*/
#pragma once

#include <rpl/rpl.h>

#include <QtCore/QHash>
#include <QtCore/QJsonObject>

namespace Main {
class Session;
} // namespace Main

namespace Getmeair {

// Ghost mode configuration of a single Getmeair account.
//
// The configuration is stored per Telegram account (stable user id),
// so switching between accounts keeps separate privacy settings.
struct GhostConfig {
	bool enabled = false;
	bool hideReadReceipts = false;
	bool hideTyping = false;
	bool hideRecording = false;
	bool hideUploads = false;
	bool hideOnline = false;

	// 0 - Normal, 1 - Balanced, 2 - Stealth.
	int profile = 0;

	// Unix time until which Ghost Mode is force-enabled.
	// Zero means "no temporary mode".
	int temporaryUntil = 0;

	// Per-chat overrides: peer id value -> enabled.
	// Missing entries inherit the account-wide `enabled` value.
	QHash<quint64, bool> chatOverrides;
};

// Local Message History (anti-recall) configuration.
struct HistoryConfig {
	bool saveDeleted = false;
	bool saveEdited = false;
	int retentionDays = 30;
	int maxMegabytes = 32;
};

// Streamer Mode is a global (application-wide) feature.
struct StreamerConfig {
	bool enabled = false;
	bool hideNames = true;
	bool hideNotificationText = true;
	bool hidePhoneNumbers = true;
	bool protectFromCapture = true;
};

// Persisted Getmeair settings.
//
// The file lives in the current working directory next to `tdata`:
//   <working-dir>/getmeair/settings.json
//
// It is intentionally *not* part of the regular Telegram settings file,
// so that the official client never sees or rewrites these values.
class Settings final {
public:
	static Settings &Instance();

	void load();

	[[nodiscard]] GhostConfig ghost(const QString &account);
	[[nodiscard]] HistoryConfig history(const QString &account);
	[[nodiscard]] StreamerConfig streamer();

	void setGhost(const QString &account, const GhostConfig &value);
	void setHistory(const QString &account, const HistoryConfig &value);
	void setStreamer(const StreamerConfig &value);

	// Fired after any Getmeair setting was changed and saved.
	[[nodiscard]] rpl::producer<> changes() const;

	[[nodiscard]] QString filePath() const;
	[[nodiscard]] QString directory() const;

private:
	void loadIfNeeded();
	void save();

	QHash<QString, GhostConfig> _ghost;
	QHash<QString, HistoryConfig> _history;
	StreamerConfig _streamer;
	bool _loaded = false;
	rpl::event_stream<> _changes;

};

// Stable per-account key used for all Getmeair local storage.
[[nodiscard]] QString AccountKey(not_null<Main::Session*> session);

} // namespace Getmeair
