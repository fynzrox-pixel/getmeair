"""Getmeair plugin SDK for Python 3.10+.

A plugin is a separate process. The Getmeair plugin host starts it and speaks
JSON-RPC 2.0 over stdin/stdout. The plugin never receives direct access to the
Getmeair client process memory.

Example:

    from getmeair_plugin import Plugin

    plugin = Plugin()

    @plugin.on_event
    def on_event(params):
        plugin.log("event: " + params.get("name", ""))
        return {"ok": True}

    plugin.run()
"""

from __future__ import annotations

import json
import sys
import threading
from typing import Any, Callable, Dict, Optional


class Plugin:
    def __init__(self) -> None:
        self._next_id = 1
        self._pending: Dict[int, threading.Event] = {}
        self._responses: Dict[int, Any] = {}
        self._lock = threading.Lock()
        self._handlers: Dict[str, Callable[[Dict[str, Any]], Any]] = {}
        self._running = True

    def on_initialize(self, fn: Callable[[Dict[str, Any]], Any]) -> Callable:
        self._handlers["initialize"] = fn
        return fn

    def on_event(self, fn: Callable[[Dict[str, Any]], Any]) -> Callable:
        self._handlers["event"] = fn
        return fn

    def on_command(self, fn: Callable[[Dict[str, Any]], Any]) -> Callable:
        self._handlers["command"] = fn
        return fn

    def on_menu(self, fn: Callable[[Dict[str, Any]], Any]) -> Callable:
        self._handlers["menu.list"] = fn
        return fn

    def on_notification(self, fn: Callable[[Dict[str, Any]], Any]) -> Callable:
        self._handlers["notification"] = fn
        return fn

    def _send(self, payload: Dict[str, Any]) -> None:
        sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
        sys.stdout.flush()

    def notify(self, method: str, params: Optional[Dict[str, Any]] = None) -> None:
        self._send({"jsonrpc": "2.0", "method": method, "params": params or {}})

    def log(self, message: str) -> None:
        self.notify("log", {"message": str(message)[:4000]})

    def request(self, method: str, params: Optional[Dict[str, Any]] = None,
                timeout: float = 15.0) -> Any:
        with self._lock:
            request_id = self._next_id
            self._next_id += 1
            event = threading.Event()
            self._pending[request_id] = event
        self._send({
            "jsonrpc": "2.0",
            "id": request_id,
            "method": method,
            "params": params or {},
        })
        if not event.wait(timeout):
            raise TimeoutError(f"Plugin host request timed out: {method}")
        with self._lock:
            self._pending.pop(request_id, None)
            return self._responses.pop(request_id, None)

    def storage_get(self, key: str) -> Any:
        result = self.request("storage.get", {"key": key})
        return result.get("value") if isinstance(result, dict) else None

    def storage_set(self, key: str, value: Any) -> Any:
        return self.request("storage.set", {"key": key, "value": value})

    def storage_delete(self, key: str) -> Any:
        return self.request("storage.delete", {"key": key})

    def register_command(self, command: Dict[str, Any]) -> None:
        self.notify("command.registered", command)

    def register_menu(self, items: list) -> None:
        self.notify("menu.items", {"items": items})

    def _handle_line(self, line: str) -> None:
        line = line.strip()
        if not line:
            return
        message = json.loads(line)
        if "id" in message and ("result" in message or "error" in message):
            with self._lock:
                event = self._pending.get(message["id"])
                if event is not None:
                    self._responses[message["id"]] = message.get("result")
                    event.set()
            return
        method = message.get("method")
        if not method:
            return
        if method == "shutdown":
            self._send({"jsonrpc": "2.0", "id": message.get("id"), "result": {"ok": True}})
            self._running = False
            return
        handler = self._handlers.get(method)
        try:
            result = handler(message.get("params") or {}) if handler else {"ok": True}
        except Exception as exc:  # noqa: BLE001 - report to host, do not crash silently
            self._send({
                "jsonrpc": "2.0",
                "id": message.get("id"),
                "error": {"code": -32000, "message": str(exc)},
            })
            return
        self._send({"jsonrpc": "2.0", "id": message.get("id"), "result": result})

    def run(self) -> None:
        for line in sys.stdin:
            if not self._running:
                break
            try:
                self._handle_line(line)
            except Exception as exc:  # noqa: BLE001
                self.log(f"unhandled plugin error: {exc}")
