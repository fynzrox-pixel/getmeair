# Getmeair AI Integration Notes

Status: architecture prepared; no live AI provider is wired into the C++
client yet (no network calls, no API keys stored).

## Planned architecture

Settings -> Getmeair AI section (to be added) with:

- Provider selection (OpenAI-compatible, Google Gemini, custom).
- User-supplied API key (never stored in plain text; use OS keyring).
- Model selection.
- Max request size.
- Privacy toggle: disable sending conversations to the provider.

Features (user-triggered only, never automatic):

- Translate a message.
- Summarise a long conversation.
- Help writing / correct a message.
- Generate text.
- Explain a selected message.
- Translate voice transcripts.
- Answer questions about a selected message.

## Privacy rules

- No conversation is sent to an AI provider without an explicit user
  action.
- API keys are not stored in the client EXE or in plain text settings.
- A privacy toggle disables all AI network activity.

## Current state

The backend (`D:\Getmeair-dev\server`) and plugin host
(`D:\Getmeair-dev\plugin-host`) are in place. AI features can be delivered
either as built-in modules or as `.getmeair-plugin` extensions using the
plugin IPC API. No fake AI responses are shipped.
