/*
This file is part of Getmeair Desktop,
a modified build of Telegram Desktop.

For license and copyright information please follow this link:
https://github.com/telegramdesktop/tdesktop/blob/master/LEGAL
*/
#pragma once

#include "getmeair/getmeair_settings.h"

#include <rpl/rpl.h>

#include <QtCore/QDate>

class HistoryItem;

namespace Getmeair::History {

enum class Kind {
	Deleted,
	Edited,
};

struct Entry {
	Kind kind = Kind::Deleted;
	quint64 peerId = 0;
	qint64 msgId = 0;
	quint64 fromId = 0;
	qint32 date = 0;
	qint32 savedAt = 0;
	QString peerName;
	QString fromName;
	QString text;
	QString newText;
};

struct Filter {
	QString query;
	quint64 peerId = 0;
	quint64 fromId = 0;
	std::optional<QDate> from;
	std::optional<QDate> till;
	std::optional<Kind> kind;
};

// Hooks, called from the regular Telegram data pipeline.
void ArchiveDeleted(not_null<HistoryItem*> item);
void ArchiveEdited(not_null<HistoryItem*> item, const QString &oldText);

[[nodiscard]] HistoryConfig Config(not_null<Main::Session*> session);
void SetConfig(
	not_null<Main::Session*> session,
	const HistoryConfig &config);

// Read / manage the local archive.
[[nodiscard]] std::vector<Entry> Load(
	not_null<Main::Session*> session,
	const Filter &filter,
	int limit = 200);
[[nodiscard]] int Count(not_null<Main::Session*> session);
[[nodiscard]] quint64 TotalBytes(not_null<Main::Session*> session);
void Clear(not_null<Main::Session*> session);

[[nodiscard]] QString FilePath(not_null<Main::Session*> session);

} // namespace Getmeair::History
