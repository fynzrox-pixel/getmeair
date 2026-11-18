/*
This file is part of Getmeair Desktop,
a modified build of Telegram Desktop.

For license and copyright information please follow this link:
https://github.com/telegramdesktop/tdesktop/blob/master/LEGAL
*/
#include "getmeair/getmeair_settings.h"

#include "settings.h"

#include "base/unixtime.h"
#include "data/data_user.h"
#include "main/main_session.h"

#include <QtCore/QFile>
#include <QtCore/QJsonDocument>
#include <QtCore/QJsonArray>
#include <QtCore/QJsonValue>
#include <QtCore/QSaveFile>

namespace Getmeair {
namespace {

constexpr auto kSettingsVersion = 1;

[[nodiscard]] QString NumberKey(quint64 value) {
	return QString::number(value);
}

[[nodiscard]] QJsonObject GhostToJson(const GhostConfig &value) {
	auto result = QJsonObject();
	result.insert(u"enabled"_q, value.enabled);
	result.insert(u"hide_read_receipts"_q, value.hideReadReceipts);
	result.insert(u"hide_typing"_q, value.hideTyping);
	result.insert(u"hide_recording"_q, value.hideRecording);
	result.insert(u"hide_uploads"_q, value.hideUploads);
	result.insert(u"hide_online"_q, value.hideOnline);
	result.insert(u"profile"_q, value.profile);
	result.insert(u"temporary_until"_q, value.temporaryUntil);

	auto overrides = QJsonObject();
	for (auto i = value.chatOverrides.cbegin();
		i != value.chatOverrides.cend();
		++i) {
		overrides.insert(NumberKey(i.key()), i.value());
	}
	result.insert(u"chat_overrides"_q, overrides);
	return result;
}

[[nodiscard]] GhostConfig GhostFromJson(const QJsonObject &value) {
	auto result = GhostConfig();
	result.enabled = value.value(u"enabled"_q).toBool(false);
	result.hideReadReceipts = value.value(
		u"hide_read_receipts"_q).toBool(false);
	result.hideTyping = value.value(u"hide_typing"_q).toBool(false);
	result.hideRecording = value.value(u"hide_recording"_q).toBool(false);
	result.hideUploads = value.value(u"hide_uploads"_q).toBool(false);
	result.hideOnline = value.value(u"hide_online"_q).toBool(false);
	result.profile = value.value(u"profile"_q).toInt(0);
	result.temporaryUntil = value.value(
		u"temporary_until"_q).toInt(0);

	const auto overrides = value.value(u"chat_overrides"_q).toObject();
	for (auto i = overrides.begin(); i != overrides.end(); ++i) {
		auto ok = false;
		const auto key = i.key().toULongLong(&ok);
		if (ok) {
			result.chatOverrides.insert(key, i.value().toBool(false));
		}
	}
	return result;
}

[[nodiscard]] QJsonObject HistoryToJson(const HistoryConfig &value) {
	auto result = QJsonObject();
	result.insert(u"save_deleted"_q, value.saveDeleted);
	result.insert(u"save_edited"_q, value.saveEdited);
	result.insert(u"retention_days"_q, value.retentionDays);
	result.insert(u"max_megabytes"_q, value.maxMegabytes);
	return result;
}

[[nodiscard]] HistoryConfig HistoryFromJson(const QJsonObject &value) {
	auto result = HistoryConfig();
	result.saveDeleted = value.value(u"save_deleted"_q).toBool(false);
	result.saveEdited = value.value(u"save_edited"_q).toBool(false);
	result.retentionDays = value.value(u"retention_days"_q).toInt(30);
	result.maxMegabytes = value.value(u"max_megabytes"_q).toInt(32);
	if (result.retentionDays <= 0) {
		result.retentionDays = 30;
	}
	if (result.maxMegabytes <= 0) {
		result.maxMegabytes = 32;
	}
	return result;
}

[[nodiscard]] QJsonObject StreamerToJson(const StreamerConfig &value) {
	auto result = QJsonObject();
	result.insert(u"enabled"_q, value.enabled);
	result.insert(u"hide_names"_q, value.hideNames);
	result.insert(u"hide_notification_text"_q, value.hideNotificationText);
	result.insert(u"hide_phone_numbers"_q, value.hidePhoneNumbers);
	result.insert(u"protect_from_capture"_q, value.protectFromCapture);
	return result;
}

[[nodiscard]] StreamerConfig StreamerFromJson(const QJsonObject &value) {
	auto result = StreamerConfig();
	result.enabled = value.value(u"enabled"_q).toBool(false);
	result.hideNames = value.value(u"hide_names"_q).toBool(true);
	result.hideNotificationText = value.value(
		u"hide_notification_text"_q).toBool(true);
	result.hidePhoneNumbers = value.value(
		u"hide_phone_numbers"_q).toBool(true);
	result.protectFromCapture = value.value(
		u"protect_from_capture"_q).toBool(true);
	return result;
}

} // namespace

Settings &Settings::Instance() {
	static auto instance = Settings();
	return instance;
}

QString Settings::directory() const {
	return cWorkingDir() + u"getmeair"_q;
}

QString Settings::filePath() const {
	return directory() + u"/settings.json"_q;
}

void Settings::load() {
	loadIfNeeded();
}

void Settings::loadIfNeeded() {
	if (_loaded) {
		return;
	}
	_loaded = true;

	auto file = QFile(filePath());
	if (!file.exists() || !file.open(QIODevice::ReadOnly)) {
		return;
	}
	const auto document = QJsonDocument::fromJson(file.readAll());
	if (!document.isObject()) {
		return;
	}
	const auto root = document.object();
	if (root.value(u"version"_q).toInt(1) > kSettingsVersion) {
		// Never interpret files written by a newer Getmeair version.
		return;
	}
	const auto accounts = root.value(u"accounts"_q).toObject();
	for (auto i = accounts.begin(); i != accounts.end(); ++i) {
		const auto entry = i.value().toObject();
		_ghost.insert(i.key(), GhostFromJson(
			entry.value(u"ghost"_q).toObject()));
		_history.insert(i.key(), HistoryFromJson(
			entry.value(u"history"_q).toObject()));
	}
	_streamer = StreamerFromJson(root.value(u"streamer"_q).toObject());
}

GhostConfig Settings::ghost(const QString &account) {
	loadIfNeeded();
	return _ghost.value(account);
}

HistoryConfig Settings::history(const QString &account) {
	loadIfNeeded();
	return _history.value(account);
}

StreamerConfig Settings::streamer() {
	loadIfNeeded();
	return _streamer;
}

void Settings::setGhost(const QString &account, const GhostConfig &value) {
	loadIfNeeded();
	_ghost.insert(account, value);
	save();
	_changes.fire({});
}

void Settings::setHistory(const QString &account, const HistoryConfig &value) {
	loadIfNeeded();
	_history.insert(account, value);
	save();
	_changes.fire({});
}

void Settings::setStreamer(const StreamerConfig &value) {
	loadIfNeeded();
	_streamer = value;
	save();
	_changes.fire({});
}

rpl::producer<> Settings::changes() const {
	return _changes.events();
}

void Settings::save() {
	QDir().mkpath(directory());

	auto accounts = QJsonObject();
	auto keys = _ghost.keys();
	for (const auto &key : _history.keys()) {
		if (!keys.contains(key)) {
			keys.push_back(key);
		}
	}
	for (const auto &key : keys) {
		auto entry = QJsonObject();
		if (_ghost.contains(key)) {
			entry.insert(u"ghost"_q, GhostToJson(_ghost.value(key)));
		}
		if (_history.contains(key)) {
			entry.insert(u"history"_q, HistoryToJson(_history.value(key)));
		}
		accounts.insert(key, entry);
	}

	auto root = QJsonObject();
	root.insert(u"version"_q, kSettingsVersion);
	root.insert(u"streamer"_q, StreamerToJson(_streamer));
	root.insert(u"accounts"_q, accounts);

	auto file = QSaveFile(filePath());
	if (!file.open(QIODevice::WriteOnly)) {
		return;
	}
	file.write(QJsonDocument(root).toJson(QJsonDocument::Indented));
	if (!file.commit()) {
		return;
	}
	QFile::setPermissions(
		filePath(),
		QFileDevice::ReadOwner | QFileDevice::WriteOwner);
}

QString AccountKey(not_null<Main::Session*> session) {
	return QString::number(session->user()->id.bare);
}

} // namespace Getmeair
