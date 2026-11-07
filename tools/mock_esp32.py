#!/usr/bin/env python3
"""
ESP32 falso via Wi-Fi (WebSocket na porta 81) — sem dependências externas.

Fala exatamente o protocolo do firmware (docs/protocolo.md), para testar o
dashboard no modo Wi-Fi sem o hardware:

    python tools/mock_esp32.py            # porta 81
    python tools/mock_esp32.py --port 8181

No dashboard, digite "localhost" (ou "localhost:8181") no campo Wi-Fi.
Digite "p" + Enter no terminal para alternar a presença manualmente.
"""
import argparse
import base64
import hashlib
import json
import math
import random
import socket
import struct
import sys
import threading
import time

GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


# --------------------------------------------------------------------------- #
#  Mesma máquina de estados de firmware/lib/core/src/presence.cpp
# --------------------------------------------------------------------------- #
class Presence:
    def __init__(self, timeout_ms=0, debounce_ms=500, min_switch_ms=3000):
        self.timeout_ms, self.debounce_ms, self.min_switch_ms = timeout_ms, debounce_ms, min_switch_ms
        self.mode, self.relay, self.reason, self.presence = "auto", False, "boot", False
        self.raw_last, self.raw_since = False, 0
        self.ever_seen, self.last_presence = False, 0
        self.ever_switched, self.last_switch = False, 0

    def _apply(self, on, why, now, force):
        if on == self.relay:
            return False
        if not force and self.ever_switched and now - self.last_switch < self.min_switch_ms:
            return False
        self.relay, self.reason, self.last_switch, self.ever_switched = on, why, now, True
        return True

    def update(self, raw, now):
        if raw != self.raw_last:
            self.raw_last, self.raw_since = raw, now
        if self.raw_last != self.presence and now - self.raw_since >= self.debounce_ms:
            self.presence = self.raw_last
        if self.presence:
            self.last_presence, self.ever_seen = now, True
        if self.mode == "on":
            return self._apply(True, "manual", now, True)
        if self.mode == "off":
            return self._apply(False, "manual", now, True)
        if self.presence:
            return self._apply(True, "presence", now, False)
        if self.relay and (not self.ever_seen or now - self.last_presence >= self.timeout_ms):
            return self._apply(False, "absence", now, False)
        return False

    def set_mode(self, m, now):
        self.mode = m
        if m == "on":
            return self._apply(True, "manual", now, True)
        if m == "off":
            return self._apply(False, "manual", now, True)
        if self.relay:
            self.last_presence, self.ever_seen = now, True
        elif self.presence:
            return self._apply(True, "presence", now, True)
        return False

    def countdown_ms(self, now):
        if self.mode != "auto" or not self.relay or self.presence or not self.ever_seen:
            return 0
        return max(0, self.timeout_ms - (now - self.last_presence))


# --------------------------------------------------------------------------- #
#  WebSocket mínimo (RFC 6455): handshake + frames de texto
# --------------------------------------------------------------------------- #
class Client:
    def __init__(self, sock):
        self.sock = sock
        self.lock = threading.Lock()
        self.alive = True

    def send_text(self, text):
        data = text.encode()
        header = bytearray([0x81])
        n = len(data)
        if n < 126:
            header.append(n)
        elif n < 65536:
            header += bytes([126]) + struct.pack(">H", n)
        else:
            header += bytes([127]) + struct.pack(">Q", n)
        try:
            with self.lock:
                self.sock.sendall(bytes(header) + data)
        except OSError:
            self.alive = False

    def recv_frame(self):
        def read(n):
            buf = b""
            while len(buf) < n:
                chunk = self.sock.recv(n - len(buf))
                if not chunk:
                    raise ConnectionError
                buf += chunk
            return buf

        b1, b2 = read(2)
        opcode, masked, n = b1 & 0x0F, b2 & 0x80, b2 & 0x7F
        if n == 126:
            n = struct.unpack(">H", read(2))[0]
        elif n == 127:
            n = struct.unpack(">Q", read(8))[0]
        mask = read(4) if masked else b"\0\0\0\0"
        payload = bytes(b ^ mask[i % 4] for i, b in enumerate(read(n)))
        return opcode, payload


def handshake(sock):
    req = b""
    while b"\r\n\r\n" not in req:
        chunk = sock.recv(1024)
        if not chunk:
            return False
        req += chunk
    key = ""
    for line in req.decode(errors="ignore").split("\r\n"):
        if line.lower().startswith("sec-websocket-key:"):
            key = line.split(":", 1)[1].strip()
    if not key:
        return False
    accept = base64.b64encode(hashlib.sha1((key + GUID).encode()).digest()).decode()
    sock.sendall(
        (
            "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
            f"Sec-WebSocket-Accept: {accept}\r\n\r\n"
        ).encode()
    )
    return True


# --------------------------------------------------------------------------- #
#  Dispositivo simulado
# --------------------------------------------------------------------------- #
class Device:
    def __init__(self):
        self.t0 = time.monotonic()
        self.ctl = Presence()
        self.clients = []
        self.lock = threading.Lock()
        self.seq = 0
        self.kwh = 0.0
        self.saved_wh = 0.0
        self.saved_ms = 0.0
        self.ref_w = 0.0
        self.forced = None  # None = roteiro automático
        self.scene_present = True
        self.scene_until = time.monotonic() + random.uniform(20, 40)

    def now_ms(self):
        return int((time.monotonic() - self.t0) * 1000)

    def broadcast(self, obj):
        line = json.dumps(obj, separators=(",", ":"))
        for c in list(self.clients):
            c.send_text(line)
        self.clients = [c for c in self.clients if c.alive]

    def raw_presence(self):
        if self.forced is not None:
            return self.forced
        if time.monotonic() >= self.scene_until:
            self.scene_present = not self.scene_present
            self.scene_until = time.monotonic() + (random.uniform(25, 50) if self.scene_present else random.uniform(15, 35))
        return self.scene_present

    def info(self):
        return {"type": "info", "fw": "1.0.0-mock", "sim": True, "timeout": self.ctl.timeout_ms // 1000,
                "mode": self.ctl.mode, "wifi": True, "ip": "127.0.0.1", "host": "smartplug.local",
                "radar_uart": True, "meter_ok": True}

    def relay_event(self):
        self.broadcast({"type": "evt", "kind": "relay_on" if self.ctl.relay else "relay_off",
                        "reason": self.ctl.reason, "up": self.now_ms() // 1000})
        print(f"[relé] {'LIGADO ' if self.ctl.relay else 'DESLIGADO'} ({self.ctl.reason})")

    def handle(self, text):
        try:
            cmd = json.loads(text)
        except ValueError:
            return
        name = cmd.get("cmd", "")
        with self.lock:
            now = self.now_ms()
            if name == "mode" and cmd.get("value") in ("auto", "on", "off"):
                if self.ctl.set_mode(cmd["value"], now):
                    self.relay_event()
            elif name == "timeout" and isinstance(cmd.get("value"), int) and 0 <= cmd["value"] <= 3600:
                self.ctl.timeout_ms = cmd["value"] * 1000
            elif name == "reset_energy":
                self.kwh = self.saved_wh = self.saved_ms = 0
            elif name == "info":
                self.broadcast(self.info())
                return
            else:
                self.broadcast({"type": "ack", "cmd": name, "ok": False, "msg": "comando invalido"})
                return
        print(f"[cmd] {text}")
        self.broadcast({"type": "ack", "cmd": name, "ok": True})

    def run(self):
        last_tel = time.monotonic()
        while True:
            time.sleep(0.1)
            with self.lock:
                if self.ctl.update(self.raw_presence(), self.now_ms()):
                    self.relay_event()
                t = time.monotonic()
                if t - last_tel < 1.0:
                    continue
                dt_ms = (t - last_tel) * 1000
                last_tel = t
                self.broadcast(self.telemetry(t, dt_ms))

    def telemetry(self, t, dt_ms):
        on = self.ctl.relay
        v = 127 + math.sin(t / 37) * 1.8 + random.uniform(-0.3, 0.3)
        p = pf = 0.0
        if on:
            p = 96 + math.sin(t / 9) * 6 + (random.uniform(10, 35) if random.random() < 0.05 else 0) + random.uniform(-1.5, 1.5)
            pf = 0.92 + random.uniform(-0.02, 0.02)
            self.ref_w = p if self.ref_w <= 0 else self.ref_w + 0.05 * (p - self.ref_w)
        elif self.ctl.mode == "auto" and self.ctl.reason == "absence":
            self.saved_ms += dt_ms
            self.saved_wh += self.ref_w * dt_ms / 3_600_000
        self.kwh += p * dt_ms / 3_600_000 / 1000
        present = self.ctl.presence
        moving = present and int(t / 4) % 3 == 0
        self.seq += 1
        now = self.now_ms()
        return {
            "type": "tel", "seq": self.seq, "up": now // 1000,
            "v": round(v, 1), "i": round(p / (v * pf), 3) if pf else 0, "p": round(p, 1), "pf": round(pf, 2),
            "hz": 60.0, "kwh": round(self.kwh, 4),
            "presence": present, "moving": moving, "static": present and not moving,
            "dist": random.randint(90, 260) if present else 0,
            "e_mov": random.randint(40, 95) if moving else random.randint(0, 12),
            "e_sta": random.randint(30, 80) if present and not moving else random.randint(0, 15),
            "relay": on, "mode": self.ctl.mode, "reason": self.ctl.reason,
            "countdown": math.ceil(self.ctl.countdown_ms(now) / 1000), "timeout": self.ctl.timeout_ms // 1000,
            "saved_wh": round(self.saved_wh, 2), "saved_s": int(self.saved_ms // 1000), "ref_w": round(self.ref_w, 1),
            "meter_ok": True, "radar_ok": True, "rssi": random.randint(-64, -55),
        }


def serve_client(dev, sock, addr):
    try:
        if not handshake(sock):
            sock.close()
            return
        client = Client(sock)
        dev.clients.append(client)
        print(f"[ws] dashboard conectado: {addr[0]}")
        client.send_text(json.dumps(dev.info()))
        while client.alive:
            opcode, payload = client.recv_frame()
            if opcode == 0x8:  # close
                break
            if opcode == 0x9:  # ping -> pong
                with client.lock:
                    sock.sendall(bytes([0x8A, len(payload)]) + payload)
            elif opcode == 0x1:
                dev.handle(payload.decode(errors="ignore"))
    except (ConnectionError, OSError):
        pass
    finally:
        print(f"[ws] dashboard desconectado: {addr[0]}")
        try:
            sock.close()
        except OSError:
            pass


def stdin_loop(dev):
    for line in sys.stdin:
        if line.strip().lower() == "p":
            with dev.lock:
                dev.forced = not (dev.forced if dev.forced is not None else dev.scene_present)
            print(f"[presença] forçada: {'PESSOA NA SALA' if dev.forced else 'SALA VAZIA'}")
        elif line.strip().lower() == "a":
            dev.forced = None
            print("[presença] roteiro automático")


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # acentos corretos no terminal do Windows
    except AttributeError:
        pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", type=int, default=81)
    ap.add_argument("--host", default="0.0.0.0")
    args = ap.parse_args()

    dev = Device()
    threading.Thread(target=dev.run, daemon=True).start()
    threading.Thread(target=stdin_loop, args=(dev,), daemon=True).start()

    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind((args.host, args.port))
    srv.listen(4)
    print(f"ESP32 falso ouvindo em ws://localhost:{args.port}/  (p = alternar presença, a = roteiro automático)")
    try:
        while True:
            sock, addr = srv.accept()
            threading.Thread(target=serve_client, args=(dev, sock, addr), daemon=True).start()
    except KeyboardInterrupt:
        print("\nencerrado")


if __name__ == "__main__":
    main()
