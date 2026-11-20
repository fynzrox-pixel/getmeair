/*
This file is part of Getmeair Desktop,
a modified build of Telegram Desktop.

For license and copyright information please follow this link:
https://github.com/telegramdesktop/tdesktop/blob/master/LEGAL
*/
#include "getmeair/getmeair_history.h"

#include "settings.h"

#include "base/unixtime.h"
#include "data/data_peer.h"
#include "data/data_session.h"
#include "history/history.h"
#include "history/history_item.h"
#include "main/main_session.h"

#include <QtCore/QFile>
#include <QtCore/QFileInfo>
#include <QtCore/QJsonDocument>
#include <QtCore/QJsonObject>
#include <QtCore/QSaveFile>

namespace Getmeair::History {
namespace {

constexpr auto kMaxRecordsToRead = 50000;

[[nodiscard]] QString KindToString(Kind kind) {
	return (kind == Kind::Edited) ? u"edited"_q : u"deleted"_q;
}

[[nodiscard]] Kind KindFromString(const QString &value) {
	return (value == u"edited"_q) ? Kind::Edited : Kind::Deleted;
}

[[nodiscard]] QJsonObject EntryToJson(const Entry &entry) {
	auto result = QJsonObject();
	result.insert(u"kind"_q, KindToString(entry.kind));
	result.insert(u"peer_id"_q, QString::number(entry.peerId));
	result.insert(u"msg_id"_q, QString::number(entry.msgId));
	result.insert(u"from_id"_q, QString::number(entry.fromId));
	result.insert(u"date"_q, entry.date);
	result.insert(u"saved_at"_q, entry.savedAt);
	result.insert(u"peer_name"_q, entry.peerName);
	result.insert(u"from_name"_q, entry.fromName);
	result.insert(u"text"_q, entry.text);
	result.insert(u"new_text"_q, entry.newText);
	return result;
}

[[nodiscard]] std::optional<Entry> EntryFromJson(const QJsonObject &value) {
	if (value.isEmpty()) {
		return std::nullopt;
	}
	auto result = Entry();
	result.kind = KindFromString(value.value(u"kind"_q).toString());
	result.peerId = value.value(
		u"peer_id"_q).toString().toULongLong();
	result.msgId = value.value(
		u"msg_id"_q).toString().toLongLong();
	result.fromId = value.value(
		u"from_id"_q).toString().toULongLong();
	result.date = value.value(u"date"_q).toInt();
	result.savedAt = value.value(u"saved_at"_q).toInt();
	result.peerName = value.value(u"peer_name"_q).toString();
	result.fromName = value.value(u"from_name"_q).toString();
	result.text = value.value(u"text"_q).toString();
	result.newText = value.value(u"new_text"_q).toString();
	if (!result.savedAt) {
		return std::nullopt;
	}
	return result;
}

[[nodiscard]] bool Archiveable(not_null<HistoryItem*> item) {
	if (!item->isRegular()
		|| item->isEphemeral()
		|| item->isScheduled()
		|| item->isBusinessShortcut()
		|| item->isWelcomeTemplate()
		|| item->isSavedMusicItem()) {
		return false;
	}
	// Never keep anything that is protected by self-destruct timers.
	if (item->mediaDestroyAt() != 0 || item->isTtlCoveredMedia()) {
		return false;
	}
	return true;
}

[[nodiscard]] Entry MakeEntry(Kind kind, not_null<HistoryItem*> item) {
	auto result = Entry();
	result.kind = kind;
	result.peerId = item->history()->peer->id.value;
	result.msgId = item->id.bare;
	result.fromId = item->from()->id.value;
	result.date = item->date();
	result.savedAt = base::unixtime::now();
	result.peerName = item->history()->peer->name();
	result.fromName = item->from()->name();
	result.text = item->originalText().text;
	return result;
}

[[nodiscard]] bool AlreadyArchived(const QString &key) {
	static auto recent = QSet<QString>();
	if (recent.size() > 4096) {
		recent.clear();
	}
	if (recent.contains(key)) {
		return true;
	}
	recent.insert(key);
	return false;
}

[[nodiscard]] QString FilePathFor(const QString &accountKey) {
	return Settings::Instance().directory()
		+ u"/history_"_q
		+ accountKey
		+ u".jsonl"_q;
}

[[nodiscard]] std::vector<Entry> ReadEntries(const QString &path) {
	auto result = std::vector<Entry>();
	auto file = QFile(path);
	if (!file.open(QIODevice::ReadOnly)) {
		return result;
	}
	auto lineNumber = 0;
	while (!file.atEnd() && lineNumber < kMaxRecordsToRead) {
		const auto line = file.readLine().trimmed();
		++lineNumber;
		if (line.isEmpty()) {
			continue;
		}
		const auto document = QJsonDocument::fromJson(line);
		if (const auto entry = EntryFromJson(document.object())) {
			result.push_back(*entry);
		}
	}
	return result;
}

void Rewrite(const QString &path, const std::vector<Entry> &entries) {
	auto file = QSaveFile(path);
	if (!file.open(QIODevice::WriteOnly)) {
		return;
	}
	for (const auto &entry : entries) {
		file.write(QJsonDocument(
			EntryToJson(entry)).toJson(QJsonDocument::Compact));
		file.write("\n");
	}
	file.commit();
	QFile::setPermissions(
		path,
		QFileDevice::ReadOwner | QFileDevice::WriteOwner);
}

void TrimIfNeeded(
		not_null<Main::Session*> session,
		const HistoryConfig &config) {
	const auto path = FilePath(session);
	const auto info = QFileInfo(path);
	if (!info.exists()) {
		return;
	}
	const auto now = base::unixtime::now();
	const auto minSavedAt = qint64(now)
		- qint64(config.retentionDays) * 86400;
	const auto overSize = (info.size()
		> (qint64(config.maxMegabytes) << 20));

	static auto lastPrunedDay = QDate();
	const auto today = QDate::currentDate();
	const auto pruneByDate = (lastPrunedDay != today);
	if (!overSize && !pruneByDate) {
		return;
	}
	lastPrunedDay = today;

	auto entries = ReadEntries(path);
	const auto before = int(entries.size());
	entries.erase(
		std::remove_if(
			entries.begin(),
			entries.end(),
			[&](const Entry &entry) {
				return qint64(entry.savedAt) < minSavedAt;
			}),
		entries.end());
	if (overSize && !entries.empty()) {
		const auto keep = int(entries.size()) / 2 + 1;
		const auto remove = int(entries.size()) - keep;
		if (remove > 0) {
			entries.erase(entries.begin(), entries.begin() + remove);
		}
	}
	if (int(entries.size()) != before) {
		Rewrite(path, entries);
	}
}

void Append(not_null<Main::Session*> session, Entry entry) {
	const auto config = Settings::Instance().history(AccountKey(session));
	QDir().mkpath(Settings::Instance().directory());

	auto file = QFile(FilePath(session));
	if (!file.open(QIODevice::Append | QIODevice::WriteOnly)) {
		return;
	}
	file.write(QJsonDocument(
		EntryToJson(entry)).toJson(QJsonDocument::Compact));
	file.write("\n");
	file.close();

	TrimIfNeeded(session, config);
}

[[nodiscard]] bool Matches(const Entry &entry, const Filter &filter) {
	if (filter.kind && entry.kind != *filter.kind) {
		return false;
	}
	if (filter.peerId && entry.peerId != filter.peerId) {
		return false;
	}
	if (filter.fromId && entry.fromId != filter.fromId) {
		return false;
	}
	const auto date = QDateTime::fromSecsSinceEpoch(entry.date).date();
	if (filter.from && date < *filter.from) {
		return false;
	}
	if (filter.till && date > *filter.till) {
		return false;
	}
	if (!filter.query.isEmpty()) {
		const auto words = filter.query.split(
			QRegularExpression(u"\\s+"_q),
			Qt::SkipEmptyParts);
		const auto haystack = (entry.text
			+ u'\n'
			+ entry.newText
			+ u'\n'
			+ entry.peerName
			+ u'\n'
			+ entry.fromName).toCaseFolded();
		for (const auto &word : words) {
			if (!haystack.contains(word.toCaseFolded())) {
				return false;
			}
		}
	}
	return true;
}

} // namespace

QString FilePath(not_null<Main::Session*> session) {
	return FilePathFor(AccountKey(session));
}

HistoryConfig Config(not_null<Main::Session*> session) {
	return Settings::Instance().history(AccountKey(session));
}

void SetConfig(
		not_null<Main::Session*> session,
		const HistoryConfig &config) {
	Settings::Instance().setHistory(AccountKey(session), config);
}

void ArchiveDeleted(not_null<HistoryItem*> item) {
	if (!Archiveable(item)) {
		return;
	}
	const auto session = &item->history()->owner().session();
	const auto config = Settings::Instance().history(AccountKey(session));
	if (!config.saveDeleted) {
		return;
	}
	auto entry = MakeEntry(Kind::Deleted, item);
	if (entry.text.trimmed().isEmpty()) {
		return;
	}
	const auto key = KindToString(entry.kind)
		+ u':'
		+ QString::number(entry.peerId)
		+ u':'
		+ QString::number(entry.msgId);
	if (AlreadyArchived(key)) {
		return;
	}
	Append(session, std::move(entry));
}

void ArchiveEdited(not_null<HistoryItem*> item, const QString &oldText) {
	if (!Archiveable(item) || oldText.isEmpty()) {
		return;
	}
	const auto session = &item->history()->owner().session();
	const auto config = Settings::Instance().history(AccountKey(session));
	if (!config.saveEdited) {
		return;
	}
	auto entry = MakeEntry(Kind::Edited, item);
	entry.text = oldText;
	entry.newText = item->originalText().text;
	if (entry.text == entry.newText) {
		return;
	}
	const auto key = KindToString(entry.kind)
		+ u':'
		+ QString::number(entry.peerId)
		+ u':'
		+ QString::number(entry.msgId)
		+ u':'
		+ QString::number(qHash(entry.text));
	if (AlreadyArchived(key)) {
		return;
	}
	Append(session, std::move(entry));
}

std::vector<Entry> Load(
		not_null<Main::Session*> session,
		const Filter &filter,
		int limit) {
	const auto config = Settings::Instance().history(AccountKey(session));
	const auto path = FilePath(session);
	auto entries = ReadEntries(path);
	if (entries.empty()) {
		return {};
	}
	const auto minSavedAt = qint64(base::unixtime::now())
		- qint64(config.retentionDays) * 86400;

	auto result = std::vector<Entry>();
	result.reserve(std::min(int(entries.size()), limit));
	for (auto i = entries.rbegin(); i != entries.rend(); ++i) {
		if (qint64(i->savedAt) < minSavedAt) {
			continue;
		}
		if (!Matches(*i, filter)) {
			continue;
		}
		result.push_back(*i);
		if (int(result.size()) >= limit) {
			break;
		}
	}
	return result;
}

int Count(not_null<Main::Session*> session) {
	return int(ReadEntries(FilePath(session)).size());
}

quint64 TotalBytes(not_null<Main::Session*> session) {
	const auto info = QFileInfo(FilePath(session));
	return info.exists() ? quint64(info.size()) : 0;
}

void Clear(not_null<Main::Session*> session) {
	QFile::remove(FilePath(session));
}

} // namespace Getmeair::History
