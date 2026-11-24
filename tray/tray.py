#!/usr/bin/env python3
"""
Crom YouTube Studio — System Tray Controller
Gerencia o servidor Node local, exibe status em tempo real na bandeja do sistema
(AyatanaAppIndicator3 com fallback para Gtk.StatusIcon) e garante instância única.
"""

import argparse
import glob
import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
ASSETS_DIR = REPO_ROOT / "assets"
ICON_ON = ASSETS_DIR / "crom-tray.png"
ICON_OFF = ASSETS_DIR / "crom-tray-off.png"
ICON_LOGO = ASSETS_DIR / "crom-logo.png"
SERVER_SCRIPT = REPO_ROOT / "src" / "server.mjs"
SYNC_SCRIPT = REPO_ROOT / "src" / "sync.mjs"

SOCKET_PATH = os.environ.get("CROM_STUDIO_TRAY_SOCK") or "/tmp/crom-youtube-studio-tray.sock"
SERVER_LOG = Path("/tmp/crom-youtube-studio-server.log")

DEFAULT_WORKSPACE_ROOT = str(Path.home() / "Documentos" / "Youtube")
DEFAULT_KDENLIVE_ROOT = str(Path.home() / "Vídeos" / "Youtube-kdenlive")


def resolve_node_bin() -> str:
    """Resolve o binário Node.js preferindo instalações >=20 (.local/bin, nvm) antes de /usr/bin."""
    candidates = []
    env_node = os.environ.get("CROM_STUDIO_NODE")
    if env_node:
        candidates.append(env_node)

    home = Path.home()
    candidates.append(str(home / ".local" / "bin" / "node"))

    nvm_bins = sorted(
        glob.glob(str(home / ".nvm" / "versions" / "node" / "v*" / "bin" / "node")),
        reverse=True,
    )
    candidates.extend(nvm_bins)

    which_node = shutil.which("node")
    if which_node:
        candidates.append(which_node)

    for candidate in candidates:
        if candidate and os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    return "node"


def build_runtime_env(node_bin: str) -> dict:
    """Monta ambiente para subprocessos garantindo ~/.local/bin e o diretório do node no PATH."""
    env = os.environ.copy()
    extra_dirs = [str(Path.home() / ".local" / "bin")]
    node_dir = str(Path(node_bin).parent)
    if node_dir and node_dir != ".":
        extra_dirs.insert(0, node_dir)

    current_path = env.get("PATH", "/usr/local/bin:/usr/bin:/bin")
    parts = [p for p in current_path.split(":") if p]
    for d in reversed(extra_dirs):
        if os.path.isdir(d) and d not in parts:
            parts.insert(0, d)
    env["PATH"] = ":".join(parts)
    return env


def load_config() -> dict:
    """Lê config.local.json (ou config.example.json) sem modificar arquivos de configuração."""
    cfg = {
        "port": 4173,
        "host": "127.0.0.1",
        "defaultChannel": "mrj",
        "kdenliveRoot": DEFAULT_KDENLIVE_ROOT,
        "workspaceRoot": DEFAULT_WORKSPACE_ROOT,
        "channels": {},
    }
    for name in ("config.local.json", "config.example.json"):
        cfg_file = REPO_ROOT / name
        if cfg_file.is_file():
            try:
                with cfg_file.open("r", encoding="utf-8") as fh:
                    raw = json.load(fh)
                if isinstance(raw, dict):
                    cfg.update({k: v for k, v in raw.items() if v is not None})
                break
            except Exception:
                pass

    # Deduz pasta raiz dos roteiros caso workspacePath esteja configurado
    channels = cfg.get("channels") or {}
    if isinstance(channels, dict):
        for ch in channels.values():
            ws = (ch or {}).get("workspacePath")
            if ws and not ws.startswith("./") and os.path.isabs(ws):
                cfg["workspaceRoot"] = str(Path(ws).parent)
                break

    if not cfg.get("kdenliveRoot") or str(cfg["kdenliveRoot"]).startswith("./"):
        if os.path.isdir(DEFAULT_KDENLIVE_ROOT):
            cfg["kdenliveRoot"] = DEFAULT_KDENLIVE_ROOT

    return cfg


def run_check() -> int:
    """Valida dependências GTK/AyatanaAppIndicator3 e arquivos essenciais sem abrir GUI."""
    errors = []
    try:
        import gi  # type: ignore

        gi.require_version("Gtk", "3.0")
        gi.require_version("AyatanaAppIndicator3", "0.1")
        from gi.repository import AyatanaAppIndicator3, Gtk  # noqa: F401
    except Exception as exc:
        errors.append(f"Erro ao importar GTK/AyatanaAppIndicator3: {exc}")

    for label, path in (
        ("assets/crom-tray.png", ICON_ON),
        ("assets/crom-tray-off.png", ICON_OFF),
        ("src/server.mjs", SERVER_SCRIPT),
    ):
        if not path.is_file():
            errors.append(f"Arquivo obrigatório ausente: {label} ({path})")

    if errors:
        for err in errors:
            print(f"[ERRO] {err}", file=sys.stderr)
        return 1

    print("TRAY CHECK OK")
    return 0


def send_socket_command(command: str, timeout: float = 1.5):
    """Tenta enviar um comando para a instância ativa do tray via socket UNIX."""
    if not os.path.exists(SOCKET_PATH):
        return None
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.settimeout(timeout)
    try:
        sock.connect(SOCKET_PATH)
        sock.sendall((command.strip() + "\n").encode("utf-8"))
        chunks = []
        while True:
            data = sock.recv(4096)
            if not data:
                break
            chunks.append(data)
            if b"\n" in data:
                break
        return b"".join(chunks).decode("utf-8", errors="replace").strip()
    except (FileNotFoundError, ConnectionRefusedError):
        return None
    except OSError:
        return None
    finally:
        sock.close()


def notify_desktop(title: str, body: str) -> None:
    """Envia notificação desktop discreta quando notify-send estiver disponível."""
    notifier = shutil.which("notify-send")
    if not notifier:
        return
    try:
        args = [notifier, "-a", "Crom YouTube Studio"]
        if ICON_LOGO.is_file():
            args.extend(["-i", str(ICON_LOGO)])
        args.extend([title, body])
        subprocess.Popen(
            args,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
    except Exception:
        pass


def open_target(target: str) -> None:
    """Abre URL ou pasta local via xdg-open sem bloquear a UI."""
    opener = shutil.which("xdg-open") or shutil.which("gio")
    if not opener:
        notify_desktop("Crom YouTube Studio", f"Não foi possível encontrar xdg-open para abrir: {target}")
        return
    cmd = [opener, "open", target] if Path(opener).name == "gio" else [opener, target]
    try:
        subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
    except Exception as exc:
        notify_desktop("Crom YouTube Studio", f"Falha ao abrir {target}: {exc}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Ícone na bandeja do sistema para o Crom YouTube Studio."
    )
    parser.add_argument("--check", action="store_true", help="Valida dependências e sai.")
    parser.add_argument("--no-autostart", action="store_true", help="Não inicia o servidor automaticamente ao abrir.")
    parser.add_argument("--open", action="store_true", help="Abre o navegador no Studio após iniciar.")
    parser.add_argument("--no-open", action="store_true", help="Não abre o navegador ao acionar uma instância existente.")
    parser.add_argument("--canal", choices=["mrj", "crom"], default=None, help="Canal alvo ao abrir o Studio.")
    parser.add_argument("--port", type=int, default=None, help="Porta HTTP do servidor local.")
    parser.add_argument("--host", default=None, help="Host HTTP do servidor local.")
    parser.add_argument("--send", default=None, help="Envia comando para a instância ativa (ex.: status, open:mrj, quit).")
    args = parser.parse_args()

    if args.check:
        return run_check()

    cfg = load_config()
    host = args.host or str(cfg.get("host") or "127.0.0.1")
    port = int(args.port or cfg.get("port") or 4173)
    default_channel = args.canal or str(cfg.get("defaultChannel") or "mrj")
    if default_channel not in ("mrj", "crom"):
        default_channel = "mrj"

    # Single-instance check before loading GTK windowing
    if args.send:
        reply = send_socket_command(args.send)
        if reply is None:
            print("Nenhuma instância ativa do tray encontrada.", file=sys.stderr)
            return 1
        print(reply)
        return 0

    existing_cmd = f"open:{default_channel}" if (args.open or not args.no_open) else "start"
    existing_reply = send_socket_command(existing_cmd)
    if existing_reply is not None:
        print(existing_reply)
        return 0

    # Remove socket órfão antes de assumir instância principal
    try:
        if os.path.exists(SOCKET_PATH):
            os.unlink(SOCKET_PATH)
    except OSError:
        pass

    import gi  # type: ignore

    gi.require_version("Gtk", "3.0")
    from gi.repository import GLib, Gtk  # type: ignore

    try:
        gi.require_version("AyatanaAppIndicator3", "0.1")
        from gi.repository import AyatanaAppIndicator3  # type: ignore
    except Exception:
        AyatanaAppIndicator3 = None  # type: ignore

    class CromStudioTray:
        def __init__(self) -> None:
            self.host = host
            self.port = port
            self.default_channel = default_channel
            self.workspace_root = str(cfg.get("workspaceRoot") or DEFAULT_WORKSPACE_ROOT)
            self.kdenlive_root = str(cfg.get("kdenliveRoot") or DEFAULT_KDENLIVE_ROOT)
            self.node_bin = resolve_node_bin()
            self.runtime_env = build_runtime_env(self.node_bin)
            self.runtime_env["PORT"] = str(self.port)
            self.runtime_env["HOST"] = self.host

            self.managed_proc: subprocess.Popen | None = None
            self.proc_lock = threading.Lock()
            self.sync_lock = threading.Lock()
            self.is_syncing = False
            self.is_running = False
            self.quitting = False
            self.sock_server: socket.socket | None = None

            self.indicator = None
            self.status_icon = None

            self.menu = self._build_menu()
            self._init_tray_icon()
            self._start_socket_server()

            # Verificação imediata e periódica de saúde
            self._poll_health_async()
            GLib.timeout_add_seconds(3, self._on_health_timer)

            if not args.no_autostart:
                if args.open:
                    self.open_channel(self.default_channel)
                else:
                    threading.Thread(target=self.ensure_server_started, daemon=True).start()
            elif args.open:
                self.open_channel(self.default_channel)

        def _build_menu(self):
            menu = Gtk.Menu()

            self.item_status = Gtk.MenuItem(label="○ Serviço Web: Verificando...")
            self.item_status.set_sensitive(False)
            menu.append(self.item_status)

            self.item_open_mrj = Gtk.MenuItem(label="Abrir Studio — MrJ (@Mrj-crom)")
            self.item_open_mrj.connect("activate", lambda *_: self.open_channel("mrj"))
            menu.append(self.item_open_mrj)

            self.item_open_crom = Gtk.MenuItem(label="Abrir Studio — Crom (@crom_run)")
            self.item_open_crom.connect("activate", lambda *_: self.open_channel("crom"))
            menu.append(self.item_open_crom)

            menu.append(Gtk.SeparatorMenuItem())

            self.item_start = Gtk.MenuItem(label="▶ Iniciar Serviço Web")
            self.item_start.connect("activate", lambda *_: threading.Thread(target=self.ensure_server_started, daemon=True).start())
            menu.append(self.item_start)

            self.item_stop = Gtk.MenuItem(label="■ Parar Serviço Web")
            self.item_stop.connect("activate", lambda *_: threading.Thread(target=self.stop_server, daemon=True).start())
            menu.append(self.item_stop)

            self.item_restart = Gtk.MenuItem(label="↻ Reiniciar Serviço Web")
            self.item_restart.connect("activate", lambda *_: threading.Thread(target=self.restart_server, daemon=True).start())
            menu.append(self.item_restart)

            self.item_sync = Gtk.MenuItem(label="↻ Sincronizar Markdown + YouTube RSS")
            self.item_sync.connect("activate", lambda *_: self.run_sync_youtube())
            menu.append(self.item_sync)

            menu.append(Gtk.SeparatorMenuItem())

            item_roteiros = Gtk.MenuItem(label=f"Abrir Pasta de Roteiros ({self.workspace_root})")
            item_roteiros.connect("activate", lambda *_: self._open_directory(self.workspace_root))
            menu.append(item_roteiros)

            item_kdenlive = Gtk.MenuItem(label=f"Abrir Fábrica Kdenlive ({self.kdenlive_root})")
            item_kdenlive.connect("activate", lambda *_: self._open_directory(self.kdenlive_root))
            menu.append(item_kdenlive)

            item_repo = Gtk.MenuItem(label="Abrir Pasta do Projeto GitHub")
            item_repo.connect("activate", lambda *_: self._open_directory(str(REPO_ROOT)))
            menu.append(item_repo)

            menu.append(Gtk.SeparatorMenuItem())

            item_quit = Gtk.MenuItem(label="✕ Sair (encerrar serviço e fechar ícone)")
            item_quit.connect("activate", lambda *_: self.quit_app())
            menu.append(item_quit)

            menu.show_all()
            return menu

        def _init_tray_icon(self) -> None:
            if AyatanaAppIndicator3 is not None:
                try:
                    ind = AyatanaAppIndicator3.Indicator.new(
                        "crom-youtube-studio",
                        "crom-tray-off",
                        AyatanaAppIndicator3.IndicatorCategory.APPLICATION_STATUS,
                    )
                    ind.set_icon_theme_path(str(ASSETS_DIR))
                    ind.set_title("Crom YouTube Studio")
                    ind.set_status(AyatanaAppIndicator3.IndicatorStatus.ACTIVE)
                    ind.set_icon_full("crom-tray-off", "Crom YouTube Studio (Parado)")
                    ind.set_menu(self.menu)
                    self.indicator = ind
                    return
                except Exception as exc:
                    print(f"[warn] Falha ao iniciar AyatanaAppIndicator3, usando Gtk.StatusIcon: {exc}", file=sys.stderr)

            icon = Gtk.StatusIcon.new_from_file(str(ICON_OFF))
            icon.set_tooltip_text("Crom YouTube Studio")
            icon.connect("popup-menu", self._on_status_icon_popup)
            icon.connect("activate", lambda *_: self.open_channel(self.default_channel))
            icon.set_visible(True)
            self.status_icon = icon

        def _on_status_icon_popup(self, icon, button: int, activate_time: int) -> None:
            self.menu.popup(None, None, Gtk.StatusIcon.position_menu, icon, button, activate_time)

        def _open_directory(self, folder_path: str) -> None:
            if os.path.isdir(folder_path):
                open_target(folder_path)
            else:
                notify_desktop("Crom YouTube Studio", f"Pasta não encontrada: {folder_path}")

        def check_health(self) -> bool:
            url = f"http://{self.host}:{self.port}/api/health"
            req = urllib.request.Request(url, method="GET")
            try:
                with urllib.request.urlopen(req, timeout=0.7) as resp:
                    if resp.status != 200:
                        return False
                    raw = resp.read(2048).decode("utf-8", errors="replace")
                    data = json.loads(raw)
                    return bool(data.get("ok", True))
            except (urllib.error.URLError, TimeoutError, ValueError, OSError):
                return False

        def _on_health_timer(self) -> bool:
            if self.quitting:
                return False
            self._poll_health_async()
            return True

        def _poll_health_async(self) -> None:
            def worker() -> None:
                healthy = self.check_health()
                GLib.idle_add(self._apply_health_state, healthy)

            threading.Thread(target=worker, daemon=True).start()

        def _apply_health_state(self, healthy: bool) -> bool:
            self.is_running = healthy
            if healthy:
                self.item_status.set_label(f"● Serviço Web: Ativo (:{self.port})")
                self.item_start.set_sensitive(False)
                self.item_stop.set_sensitive(True)
                self.item_restart.set_sensitive(True)
                self._set_icon(True)
            else:
                self.item_status.set_label("○ Serviço Web: Parado")
                self.item_start.set_sensitive(True)
                self.item_stop.set_sensitive(False)
                self.item_restart.set_sensitive(False)
                self._set_icon(False)
            return False

        def _set_icon(self, active: bool) -> None:
            icon_name = "crom-tray" if active else "crom-tray-off"
            icon_file = str(ICON_ON if active else ICON_OFF)
            desc = f"Crom YouTube Studio — {'Ativo' if active else 'Parado'} (:{self.port})"
            if self.indicator is not None:
                self.indicator.set_icon_full(icon_name, desc)
            elif self.status_icon is not None:
                self.status_icon.set_from_file(icon_file)
                self.status_icon.set_tooltip_text(desc)

        def ensure_data_ready(self) -> None:
            data_js = REPO_ROOT / "data" / "data.js"
            if not data_js.is_file() and SYNC_SCRIPT.is_file():
                try:
                    subprocess.run(
                        [self.node_bin, str(SYNC_SCRIPT)],
                        cwd=str(REPO_ROOT),
                        env=self.runtime_env,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        timeout=30,
                    )
                except Exception:
                    pass

        def ensure_server_started(self) -> bool:
            if self.check_health():
                GLib.idle_add(self._apply_health_state, True)
                return True

            with self.proc_lock:
                if self.managed_proc is not None and self.managed_proc.poll() is None:
                    pass
                else:
                    if not SERVER_SCRIPT.is_file():
                        notify_desktop("Crom YouTube Studio", f"Servidor ausente: {SERVER_SCRIPT}")
                        return False
                    self.ensure_data_ready()
                    try:
                        log_fh = SERVER_LOG.open("a", encoding="utf-8")
                        self.managed_proc = subprocess.Popen(
                            [self.node_bin, str(SERVER_SCRIPT)],
                            cwd=str(REPO_ROOT),
                            env=self.runtime_env,
                            stdout=log_fh,
                            stderr=subprocess.STDOUT,
                            start_new_session=True,
                        )
                        log_fh.close()
                    except Exception as exc:
                        notify_desktop("Crom YouTube Studio", f"Falha ao iniciar servidor: {exc}")
                        return False

            deadline = time.monotonic() + 8.0
            while time.monotonic() < deadline and not self.quitting:
                if self.check_health():
                    GLib.idle_add(self._apply_health_state, True)
                    return True
                with self.proc_lock:
                    if self.managed_proc is not None and self.managed_proc.poll() is not None:
                        break
                time.sleep(0.15)

            healthy = self.check_health()
            GLib.idle_add(self._apply_health_state, healthy)
            if not healthy:
                notify_desktop("Crom YouTube Studio", f"Servidor não respondeu na porta {self.port}. Veja {SERVER_LOG}")
            return healthy

        def stop_server(self) -> None:
            stopped_any = False
            with self.proc_lock:
                proc = self.managed_proc
                self.managed_proc = None
            if proc is not None and proc.poll() is None:
                stopped_any = True
                try:
                    proc.terminate()
                    proc.wait(timeout=3.0)
                except subprocess.TimeoutExpired:
                    try:
                        proc.kill()
                        proc.wait(timeout=1.0)
                    except Exception:
                        pass
                except Exception:
                    pass

            if not stopped_any and not self.quitting and self.check_health():
                notify_desktop(
                    "Crom YouTube Studio",
                    f"O servidor na porta {self.port} foi iniciado fora da bandeja.",
                )

            if not self.quitting:
                GLib.idle_add(self._apply_health_state, self.check_health())

        def restart_server(self) -> None:
            self.stop_server()
            time.sleep(0.25)
            self.ensure_server_started()

        def open_channel(self, channel: str) -> None:
            target_channel = channel if channel in ("mrj", "crom") else self.default_channel
            url = f"http://{self.host}:{self.port}/?canal={target_channel}"

            def worker() -> None:
                if self.ensure_server_started():
                    open_target(url)

            threading.Thread(target=worker, daemon=True).start()

        def run_sync_youtube(self) -> None:
            if self.is_syncing:
                return

            def worker() -> None:
                with self.sync_lock:
                    self.is_syncing = True
                    GLib.idle_add(self._set_sync_ui, True)
                    try:
                        proc = subprocess.run(
                            [self.node_bin, str(SYNC_SCRIPT), "--youtube"],
                            cwd=str(REPO_ROOT),
                            env=self.runtime_env,
                            capture_output=True,
                            text=True,
                            timeout=90,
                        )
                        if proc.returncode == 0:
                            notify_desktop("Crom YouTube Studio", "Markdown + YouTube RSS sincronizados com sucesso.")
                        else:
                            msg = (proc.stderr or proc.stdout or "erro desconhecido").strip().splitlines()[-1:]
                            detail = msg[0] if msg else "erro desconhecido"
                            notify_desktop("Crom YouTube Studio", f"Falha na sincronização: {detail}")
                    except Exception as exc:
                        notify_desktop("Crom YouTube Studio", f"Erro ao sincronizar: {exc}")
                    finally:
                        self.is_syncing = False
                        GLib.idle_add(self._set_sync_ui, False)

            threading.Thread(target=worker, daemon=True).start()

        def _set_sync_ui(self, syncing: bool) -> bool:
            if syncing:
                self.item_sync.set_label("↻ Sincronizando Markdown + YouTube RSS...")
                self.item_sync.set_sensitive(False)
            else:
                self.item_sync.set_label("↻ Sincronizar Markdown + YouTube RSS")
                self.item_sync.set_sensitive(True)
            return False

        def _start_socket_server(self) -> None:
            srv = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            srv.bind(SOCKET_PATH)
            try:
                os.chmod(SOCKET_PATH, 0o600)
            except OSError:
                pass
            srv.listen(8)
            srv.settimeout(1.0)
            self.sock_server = srv

            def accept_loop() -> None:
                while not self.quitting:
                    try:
                        conn, _ = srv.accept()
                    except socket.timeout:
                        continue
                    except OSError:
                        break
                    try:
                        conn.settimeout(2.0)
                        raw = conn.recv(1024).decode("utf-8", errors="replace").strip()
                        reply = self._handle_socket_command(raw)
                        conn.sendall((reply + "\n").encode("utf-8"))
                    except Exception as exc:
                        try:
                            conn.sendall((json.dumps({"ok": False, "error": str(exc)}) + "\n").encode("utf-8"))
                        except Exception:
                            pass
                    finally:
                        conn.close()

            threading.Thread(target=accept_loop, daemon=True).start()

        def _handle_socket_command(self, cmd: str) -> str:
            normalized = (cmd or "status").strip().lower()
            if normalized in ("status", "ping"):
                return json.dumps({
                    "ok": True,
                    "running": self.check_health(),
                    "port": self.port,
                    "host": self.host,
                    "pid": os.getpid(),
                })
            if normalized == "open":
                GLib.idle_add(self.open_channel, self.default_channel)
                return json.dumps({"ok": True, "action": "open", "canal": self.default_channel})
            if normalized.startswith("open:"):
                ch = normalized.split(":", 1)[1].strip() or self.default_channel
                if ch not in ("mrj", "crom"):
                    ch = self.default_channel
                GLib.idle_add(self.open_channel, ch)
                return json.dumps({"ok": True, "action": "open", "canal": ch})
            if normalized == "start":
                threading.Thread(target=self.ensure_server_started, daemon=True).start()
                return json.dumps({"ok": True, "action": "start"})
            if normalized == "stop":
                threading.Thread(target=self.stop_server, daemon=True).start()
                return json.dumps({"ok": True, "action": "stop"})
            if normalized == "restart":
                threading.Thread(target=self.restart_server, daemon=True).start()
                return json.dumps({"ok": True, "action": "restart"})
            if normalized == "sync":
                GLib.idle_add(self.run_sync_youtube)
                return json.dumps({"ok": True, "action": "sync"})
            if normalized == "quit":
                GLib.idle_add(self.quit_app)
                return json.dumps({"ok": True, "action": "quit"})
            return json.dumps({"ok": False, "error": f"comando desconhecido: {cmd}"})

        def quit_app(self) -> None:
            if self.quitting:
                return
            self.quitting = True
            if self.sock_server is not None:
                try:
                    self.sock_server.close()
                except OSError:
                    pass
                self.sock_server = None
            try:
                if os.path.exists(SOCKET_PATH):
                    os.unlink(SOCKET_PATH)
            except OSError:
                pass
            self.stop_server()
            Gtk.main_quit()

    tray = CromStudioTray()

    def handle_signal(*_args) -> bool:
        tray.quit_app()
        return False

    if hasattr(GLib, "unix_signal_add"):
        GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, signal.SIGINT, handle_signal)
        GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, signal.SIGTERM, handle_signal)
    else:
        signal.signal(signal.SIGINT, lambda *_: GLib.idle_add(tray.quit_app))
        signal.signal(signal.SIGTERM, lambda *_: GLib.idle_add(tray.quit_app))

    Gtk.main()
    return 0


if __name__ == "__main__":
    sys.exit(main())
