/*
This file is part of Getmeair Desktop,
a modified build of Telegram Desktop.

For license and copyright information please follow this link:
https://github.com/telegramdesktop/tdesktop/blob/master/LEGAL
*/
#include "settings/sections/settings_getmeair.h"

#include "settings/settings_common.h"
#include "settings/settings_common_session.h"

#include "base/unixtime.h"
#include "core/application.h"
#include "data/data_peer.h"
#include "dialogs/dialogs_key.h"
#include "getmeair/getmeair_ghost_mode.h"
#include "getmeair/getmeair_history.h"
#include "getmeair/getmeair_settings.h"
#include "getmeair/getmeair_streamer.h"
#include "main/main_session.h"
#include "ui/boxes/confirm_box.h"
#include "ui/boxes/single_choice_box.h"
#include "ui/layers/generic_box.h"
#include "ui/search_field_controller.h"
#include "ui/ui_utility.h"
#include "ui/vertical_list.h"
#include "ui/widgets/buttons.h"
#include "ui/widgets/labels.h"
#include "ui/wrap/vertical_layout.h"
#include "window/window_session_controller.h"
#include "styles/style_layers.h"
#include "styles/style_menu_icons.h"
#include "styles/style_settings.h"

namespace Settings {
namespace {

[[nodiscard]] QString FormatBytes(quint64 value) {
	if (value >= (1 << 20)) {
		return u"%1 MB"_q.arg(value / double(1 << 20), 0, 'f', 1);
	} else if (value >= 1024) {
		return u"%1 KB"_q.arg(value / 1024);
	}
	return u"%1 B"_q.arg(value);
}

[[nodiscard]] QString HistoryEntryText(
		const Getmeair::History::Entry &entry) {
	const auto kind = (entry.kind == Getmeair::History::Kind::Edited)
		? u"Edited message"_q
		: u"Deleted message"_q;
	const auto when = QDateTime::fromSecsSinceEpoch(
		entry.date
	).toString(u"dd MMM yyyy, HH:mm"_q);
	const auto peer = entry.peerName.isEmpty()
		? QString::number(entry.peerId)
		: entry.peerName;
	auto result = kind + u" \u00b7 "_q + peer + u" \u00b7 "_q + when;
	if (entry.kind == Getmeair::History::Kind::Edited) {
		result += u"\nOriginal version: "_q + entry.text;
		result += u"\nUpdated version: "_q + entry.newText;
	} else {
		result += u"\n"_q + entry.text;
	}
	return result;
}

not_null<Ui::SettingsButton*> AddToggle(
		not_null<Ui::VerticalLayout*> container,
		const QString &title,
		rpl::producer<bool> state,
		Fn<bool()> current,
		Fn<void(bool)> changed) {
	const auto button = container->add(object_ptr<Ui::SettingsButton>(
		container,
		rpl::single(title),
		st::settingsButtonNoIcon));
	button->toggleOn(std::move(state));
	button->toggledValue(
	) | rpl::filter([=](bool value) {
		return (value != current());
	}) | rpl::on_next([=](bool value) {
		changed(value);
	}, button->lifetime());
	return button;
}

// ---------------------------------------------------------------------------
// Getmeair Control Center
// ---------------------------------------------------------------------------

class GetmeairControl final : public Section<GetmeairControl> {
public:
	GetmeairControl(
		QWidget *parent,
		not_null<Window::SessionController*> controller);

	[[nodiscard]] rpl::producer<QString> title() override;

private:
	void setupContent();

};

GetmeairControl::GetmeairControl(
	QWidget *parent,
	not_null<Window::SessionController*> controller)
: Section(parent, controller) {
	setupContent();
}

rpl::producer<QString> GetmeairControl::title() {
	return rpl::single(u"Getmeair"_q);
}

void GetmeairControl::setupContent() {
	const auto content = Ui::CreateChild<Ui::VerticalLayout>(this);
	const auto session = &controller()->session();

	Ui::AddSkip(content);
	Ui::AddSubsectionTitle(content, rpl::single(u"Getmeair Control Center"_q));

	const auto addSection = [&](
			const QString &text,
			Type target,
			const style::icon *icon) {
		const auto button = AddButtonWithIcon(
			content,
			rpl::single(text),
			st::settingsButton,
			{ icon });
		button->addClickHandler([=] {
			showOther(target);
		});
	};
	addSection(u"Getmeair Ghost Mode"_q, GhostModeId(), &st::menuIconLock);
	addSection(
		u"Getmeair Message History"_q,
		MessageHistoryId(),
		&st::menuIconShowInFolder);
	addSection(
		u"Getmeair Streamer Mode"_q,
		StreamerModeId(),
		&st::menuIconProfile);

	Ui::AddSkip(content);
	Ui::AddDividerText(
		content,
		rpl::single(
			Getmeair::Ghost::StatusText(session)
		) | rpl::then(
			Getmeair::Settings::Instance().changes()
			| rpl::map([=] {
				return Getmeair::Ghost::StatusText(session);
			})
		));

	Ui::AddDividerText(
		content,
		rpl::single(
			Getmeair::Streamer::Enabled()
				? u"Streamer Mode is on."_q
				: u"Streamer Mode is off."_q
		) | rpl::then(
			Getmeair::Settings::Instance().changes()
			| rpl::map([] {
				return Getmeair::Streamer::Enabled()
					? u"Streamer Mode is on."_q
					: u"Streamer Mode is off."_q;
			})
		));

	Ui::AddSkip(content);
	Ui::AddDividerText(
		content,
		rpl::single(
			u"Ghost Mode hides outgoing activity client-side. It is not "
			"anonymity: sending messages, reactions and calls still "
			"reveals that you are active."_q));

	Ui::ResizeFitChild(this, content);
}

// ---------------------------------------------------------------------------
// Getmeair Ghost Mode
// ---------------------------------------------------------------------------

class GetmeairGhost final : public Section<GetmeairGhost> {
public:
	GetmeairGhost(
		QWidget *parent,
		not_null<Window::SessionController*> controller);

	[[nodiscard]] rpl::producer<QString> title() override;

private:
	void setupContent();
	void apply(Fn<void(Getmeair::GhostConfig&)> mutate);

	rpl::variable<Getmeair::GhostConfig> _config;

};

GetmeairGhost::GetmeairGhost(
	QWidget *parent,
	not_null<Window::SessionController*> controller)
: Section(parent, controller) {
	_config = Getmeair::Ghost::Config(&controller->session());
	setupContent();
}

rpl::producer<QString> GetmeairGhost::title() {
	return rpl::single(u"Getmeair Ghost Mode"_q);
}

void GetmeairGhost::apply(Fn<void(Getmeair::GhostConfig&)> mutate) {
	const auto session = &controller()->session();
	Getmeair::Ghost::Update(session, std::move(mutate));
	_config = Getmeair::Ghost::Config(session);
}

void GetmeairGhost::setupContent() {
	const auto content = Ui::CreateChild<Ui::VerticalLayout>(this);
	const auto session = &controller()->session();

	const auto stateFor = [=](bool Getmeair::GhostConfig::*member) {
		return _config.value() | rpl::map([=](
				const Getmeair::GhostConfig &config) {
			return config.*member;
		});
	};

	Ui::AddSkip(content);
	Ui::AddSubsectionTitle(content, rpl::single(u"Quick control"_q));

	AddToggle(
		content,
		u"Enable Ghost Mode"_q,
		_config.value() | rpl::map([](const Getmeair::GhostConfig &config) {
			return config.enabled;
		}),
		[=] { return _config.current().enabled; },
		[=](bool value) {
			apply([=](Getmeair::GhostConfig &config) {
				config.enabled = value;
				if (!value) {
					config.temporaryUntil = 0;
				}
			});
		});

	const auto profile = AddButtonWithLabel(
		content,
		rpl::single(u"Profile"_q),
		_config.value() | rpl::map([](const Getmeair::GhostConfig &config) {
			return Getmeair::Ghost::ProfileName(config.profile);
		}),
		st::settingsButtonNoIcon);
	profile->addClickHandler([=] {
		controller()->show(Box([=](not_null<Ui::GenericBox*> box) {
			const auto options = std::vector<QString>{
				u"Normal"_q,
				u"Balanced"_q,
				u"Stealth"_q,
			};
			SingleChoiceBox(box, {
				.title = rpl::single(u"Ghost Mode profile"_q),
				.options = options,
				.initialSelection = _config.current().profile,
				.callback = [=](int index) {
					Getmeair::Ghost::SetProfile(session, index);
					_config = Getmeair::Ghost::Config(session);
				},
			});
		}));
	});

	Ui::AddSkip(content);
	Ui::AddSubsectionTitle(content, rpl::single(u"Hide my activity"_q));

	AddToggle(
		content,
		u"Hide read receipts"_q,
		stateFor(&Getmeair::GhostConfig::hideReadReceipts),
		[=] { return _config.current().hideReadReceipts; },
		[=](bool value) {
			apply([=](Getmeair::GhostConfig &config) {
				config.hideReadReceipts = value;
			});
		});

	AddToggle(
		content,
		u"Hide typing status"_q,
		stateFor(&Getmeair::GhostConfig::hideTyping),
		[=] { return _config.current().hideTyping; },
		[=](bool value) {
			apply([=](Getmeair::GhostConfig &config) {
				config.hideTyping = value;
			});
		});

	AddToggle(
		content,
		u"Hide voice recording status"_q,
		stateFor(&Getmeair::GhostConfig::hideRecording),
		[=] { return _config.current().hideRecording; },
		[=](bool value) {
			apply([=](Getmeair::GhostConfig &config) {
				config.hideRecording = value;
			});
		});

	AddToggle(
		content,
		u"Hide file upload status"_q,
		stateFor(&Getmeair::GhostConfig::hideUploads),
		[=] { return _config.current().hideUploads; },
		[=](bool value) {
			apply([=](Getmeair::GhostConfig &config) {
				config.hideUploads = value;
			});
		});

	AddToggle(
		content,
		u"Hide online status"_q,
		stateFor(&Getmeair::GhostConfig::hideOnline),
		[=] { return _config.current().hideOnline; },
		[=](bool value) {
			apply([=](Getmeair::GhostConfig &config) {
				config.hideOnline = value;
			});
		});

	Ui::AddSkip(content);
	Ui::AddSubsectionTitle(content, rpl::single(u"Temporary mode"_q));

	const auto temporary = [&](const QString &text, int minutes) {
		const auto button = AddButtonWithIcon(
			content,
			rpl::single(text),
			st::settingsButtonNoIcon);
		button->addClickHandler([=] {
			Getmeair::Ghost::SetTemporary(session, minutes);
			_config = Getmeair::Ghost::Config(session);
		});
	};
	temporary(u"Enable for 15 minutes"_q, 15);
	temporary(u"Enable for 1 hour"_q, 60);
	temporary(u"Disable temporary mode"_q, 0);

	Ui::AddSkip(content);
	Ui::AddSubsectionTitle(content, rpl::single(u"Per-chat exceptions"_q));

	const auto key = controller()->activeChatCurrent();
	const auto peer = key.peer();
	if (peer) {
		Ui::AddDividerText(
			content,
			rpl::single(u"Current chat: "_q + peer->name()));

		const auto exclude = AddButtonWithIcon(
			content,
			rpl::single(u"Disable Ghost Mode in this chat"_q),
			st::settingsButtonNoIcon);
		exclude->addClickHandler([=] {
			Getmeair::Ghost::SetChatOverride(session, peer->id, false);
			_config = Getmeair::Ghost::Config(session);
		});

		const auto force = AddButtonWithIcon(
			content,
			rpl::single(u"Always enable Ghost Mode in this chat"_q),
			st::settingsButtonNoIcon);
		force->addClickHandler([=] {
			Getmeair::Ghost::SetChatOverride(session, peer->id, true);
			_config = Getmeair::Ghost::Config(session);
		});

		const auto reset = AddButtonWithIcon(
			content,
			rpl::single(u"Reset this chat override"_q),
			st::settingsButtonNoIcon);
		reset->addClickHandler([=] {
			Getmeair::Ghost::SetChatOverride(
				session,
				peer->id,
				std::nullopt);
			_config = Getmeair::Ghost::Config(session);
		});
	} else {
		Ui::AddDividerText(
			content,
			rpl::single(
				u"Open a chat to configure a per-chat exception."_q));
	}

	Ui::AddSkip(content);
	Ui::AddDividerText(
		content,
		rpl::single(
			u"Ghost Mode suppresses outgoing activity packets. It cannot "
			"make you invisible on the server side and it does not "
			"affect messages that were already sent."_q));

	Ui::ResizeFitChild(this, content);
}

// ---------------------------------------------------------------------------
// Getmeair Message History
// ---------------------------------------------------------------------------

class GetmeairHistory final : public Section<GetmeairHistory> {
public:
	GetmeairHistory(
		QWidget *parent,
		not_null<Window::SessionController*> controller);

	[[nodiscard]] rpl::producer<QString> title() override;
	[[nodiscard]] base::weak_qptr<Ui::RpWidget> createPinnedToTop(
		not_null<QWidget*> parent) override;

private:
	void setupContent();
	void refresh();
	void apply(Fn<void(Getmeair::HistoryConfig&)> mutate);

	std::unique_ptr<Ui::SearchFieldController> _searchController;
	QString _query;
	Ui::VerticalLayout *_list = nullptr;
	rpl::variable<Getmeair::HistoryConfig> _config;
	rpl::variable<QString> _status;

};

GetmeairHistory::GetmeairHistory(
	QWidget *parent,
	not_null<Window::SessionController*> controller)
: Section(parent, controller) {
	_config = Getmeair::History::Config(&controller->session());
	setupContent();
}

rpl::producer<QString> GetmeairHistory::title() {
	return rpl::single(u"Getmeair Message History"_q);
}

base::weak_qptr<Ui::RpWidget> GetmeairHistory::createPinnedToTop(
		not_null<QWidget*> parent) {
	auto search = CreateSectionSearchRow(parent, _query);
	_searchController = std::move(search.controller);
	const auto row = search.row;
	_searchController->queryChanges(
	) | rpl::on_next([=](QString query) {
		_query = std::move(query);
		refresh();
	}, row->lifetime());
	return base::make_weak(row);
}

void GetmeairHistory::apply(
		Fn<void(Getmeair::HistoryConfig&)> mutate) {
	const auto session = &controller()->session();
	auto config = Getmeair::History::Config(session);
	mutate(config);
	Getmeair::History::SetConfig(session, config);
	_config = Getmeair::History::Config(session);
	refresh();
}

void GetmeairHistory::setupContent() {
	const auto content = Ui::CreateChild<Ui::VerticalLayout>(this);
	const auto session = &controller()->session();

	Ui::AddSkip(content);
	Ui::AddSubsectionTitle(content, rpl::single(u"Local archive"_q));

	AddToggle(
		content,
		u"Save deleted messages"_q,
		_config.value() | rpl::map([](
				const Getmeair::HistoryConfig &config) {
			return config.saveDeleted;
		}),
		[=] { return _config.current().saveDeleted; },
		[=](bool value) {
			apply([=](Getmeair::HistoryConfig &config) {
				config.saveDeleted = value;
			});
		});

	AddToggle(
		content,
		u"Save previous versions of edited messages"_q,
		_config.value() | rpl::map([](
				const Getmeair::HistoryConfig &config) {
			return config.saveEdited;
		}),
		[=] { return _config.current().saveEdited; },
		[=](bool value) {
			apply([=](Getmeair::HistoryConfig &config) {
				config.saveEdited = value;
			});
		});

	const auto retention = AddButtonWithLabel(
		content,
		rpl::single(u"Keep history for"_q),
		_config.value() | rpl::map([](const Getmeair::HistoryConfig &config) {
			return u"%1 days"_q.arg(config.retentionDays);
		}),
		st::settingsButtonNoIcon);
	retention->addClickHandler([=] {
		controller()->show(Box([=](not_null<Ui::GenericBox*> box) {
			const auto options = std::vector<QString>{
				u"7 days"_q,
				u"30 days"_q,
				u"90 days"_q,
				u"365 days"_q,
			};
			const auto values = std::vector<int>{ 7, 30, 90, 365 };
			auto initial = 1;
			for (auto i = 0; i != int(values.size()); ++i) {
				if (values[i] == _config.current().retentionDays) {
					initial = i;
				}
			}
			SingleChoiceBox(box, {
				.title = rpl::single(u"Keep history for"_q),
				.options = options,
				.initialSelection = initial,
				.callback = [=](int index) {
					if (index < 0 || index >= int(values.size())) {
						return;
					}
					apply([=](Getmeair::HistoryConfig &config) {
						config.retentionDays = values[index];
					});
				},
			});
		}));
	});

	const auto size = AddButtonWithLabel(
		content,
		rpl::single(u"Storage limit"_q),
		_config.value() | rpl::map([](const Getmeair::HistoryConfig &config) {
			return u"%1 MB"_q.arg(config.maxMegabytes);
		}),
		st::settingsButtonNoIcon);
	size->addClickHandler([=] {
		controller()->show(Box([=](not_null<Ui::GenericBox*> box) {
			const auto options = std::vector<QString>{
				u"16 MB"_q,
				u"32 MB"_q,
				u"64 MB"_q,
				u"128 MB"_q,
			};
			const auto values = std::vector<int>{ 16, 32, 64, 128 };
			auto initial = 1;
			for (auto i = 0; i != int(values.size()); ++i) {
				if (values[i] == _config.current().maxMegabytes) {
					initial = i;
				}
			}
			SingleChoiceBox(box, {
				.title = rpl::single(u"Storage limit"_q),
				.options = options,
				.initialSelection = initial,
				.callback = [=](int index) {
					if (index < 0 || index >= int(values.size())) {
						return;
					}
					apply([=](Getmeair::HistoryConfig &config) {
						config.maxMegabytes = values[index];
					});
				},
			});
		}));
	});

	const auto clear = AddButtonWithIcon(
		content,
		rpl::single(u"Clear local message archive"_q),
		st::settingsButtonNoIcon);
	clear->addClickHandler([=] {
		controller()->show(Ui::MakeConfirmBox({
			.text = u"Delete all locally saved deleted and edited "
				"messages? This cannot be undone."_q,
			.confirmed = [=] {
				Getmeair::History::Clear(session);
				refresh();
			},
			.confirmText = u"Clear"_q,
		}));
	});

	Ui::AddSkip(content);
	Ui::AddDividerText(content, _status.value());

	Ui::AddSkip(content);
	Ui::AddSubsectionTitle(content, rpl::single(u"Archive entries"_q));

	_list = content->add(object_ptr<Ui::VerticalLayout>(content));

	refresh();

	Ui::ResizeFitChild(this, content);
}

void GetmeairHistory::refresh() {
	if (!_list) {
		return;
	}
	const auto session = &controller()->session();
	auto filter = Getmeair::History::Filter();
	filter.query = _query;
	const auto entries = Getmeair::History::Load(session, filter, 40);

	_list->detachRows();
	if (entries.empty()) {
		_list->add(object_ptr<Ui::FlatLabel>(
			_list,
			rpl::single(u"No saved entries."_q),
			st::boxLabel));
	} else {
		for (const auto &entry : entries) {
			_list->add(object_ptr<Ui::FlatLabel>(
				_list,
				rpl::single(HistoryEntryText(entry)),
				st::boxLabel));
		}
		if (int(entries.size()) == 40) {
			_list->add(object_ptr<Ui::FlatLabel>(
				_list,
				rpl::single(u"Showing the 40 newest matches."_q),
				st::boxLabel));
		}
	}
	_status = u"Stored: %1 entries, %2."_q.arg(
		Getmeair::History::Count(session)
	).arg(FormatBytes(Getmeair::History::TotalBytes(session)));
}

// ---------------------------------------------------------------------------
// Getmeair Streamer Mode
// ---------------------------------------------------------------------------

class GetmeairStreamer final : public Section<GetmeairStreamer> {
public:
	GetmeairStreamer(
		QWidget *parent,
		not_null<Window::SessionController*> controller);

	[[nodiscard]] rpl::producer<QString> title() override;

private:
	void setupContent();

};

GetmeairStreamer::GetmeairStreamer(
	QWidget *parent,
	not_null<Window::SessionController*> controller)
: Section(parent, controller) {
	setupContent();
}

rpl::producer<QString> GetmeairStreamer::title() {
	return rpl::single(u"Getmeair Streamer Mode"_q);
}

void GetmeairStreamer::setupContent() {
	const auto content = Ui::CreateChild<Ui::VerticalLayout>(this);

	Ui::AddSkip(content);
	Ui::AddSubsectionTitle(content, rpl::single(u"Streamer Mode"_q));

	AddToggle(
		content,
		u"Enable Streamer Mode"_q,
		rpl::single(Getmeair::Streamer::Enabled()),
		[] { return Getmeair::Streamer::Enabled(); },
		[](bool value) {
			Getmeair::Streamer::SetEnabled(value);
		});

	AddToggle(
		content,
		u"Hide user names in notifications"_q,
		rpl::single(Getmeair::Streamer::Config().hideNames),
		[] { return Getmeair::Streamer::Config().hideNames; },
		[](bool value) {
			Getmeair::Streamer::Update([=](
					Getmeair::StreamerConfig &config) {
				config.hideNames = value;
			});
		});

	AddToggle(
		content,
		u"Hide notification text"_q,
		rpl::single(Getmeair::Streamer::Config().hideNotificationText),
		[] { return Getmeair::Streamer::Config().hideNotificationText; },
		[](bool value) {
			Getmeair::Streamer::Update([=](
					Getmeair::StreamerConfig &config) {
				config.hideNotificationText = value;
			});
		});

	AddToggle(
		content,
		u"Hide phone numbers"_q,
		rpl::single(Getmeair::Streamer::Config().hidePhoneNumbers),
		[] { return Getmeair::Streamer::Config().hidePhoneNumbers; },
		[](bool value) {
			Getmeair::Streamer::Update([=](
					Getmeair::StreamerConfig &config) {
				config.hidePhoneNumbers = value;
			});
		});

	AddToggle(
		content,
		u"Block screen capture of Getmeair windows"_q,
		rpl::single(Getmeair::Streamer::Config().protectFromCapture),
		[] { return Getmeair::Streamer::Config().protectFromCapture; },
		[](bool value) {
			Getmeair::Streamer::Update([=](
					Getmeair::StreamerConfig &config) {
				config.protectFromCapture = value;
			});
			Core::App().updateWindowTitles();
		});

	Ui::AddSkip(content);
	Ui::AddDividerText(
		content,
		rpl::single(
			u"Streamer Mode hides window titles, notification texts and "
			"phone numbers, and asks the system to exclude Getmeair "
			"windows from screen capture. Capture exclusion may not work "
			"with every capture method or platform."_q));

	Ui::ResizeFitChild(this, content);
}

} // namespace

Type GetmeairId() {
	return GetmeairControl::Id();
}

Type GhostModeId() {
	return GetmeairGhost::Id();
}

Type MessageHistoryId() {
	return GetmeairHistory::Id();
}

Type StreamerModeId() {
	return GetmeairStreamer::Id();
}

} // namespace Settings
