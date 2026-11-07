#include "comm.h"

#include <ESPmDNS.h>
#include <WebSocketsServer.h>
#include <WiFi.h>

#include "config.h"

#if __has_include("secrets.h")
#include "secrets.h"
#define HAS_WIFI 1
#else
#define HAS_WIFI 0
#endif

namespace {
comm::CommandHandler cmdHandler = nullptr;
comm::ClientHandler clientHandler = nullptr;

char serialBuf[256];
size_t serialLen = 0;

#if HAS_WIFI
WebSocketsServer ws(WS_PORT);
bool mdnsStarted = false;
bool clientJustConnected = false;

void onWsEvent(uint8_t num, WStype_t type, uint8_t *payload, size_t length) {
  (void)num;
  switch (type) {
    case WStype_CONNECTED:
      clientJustConnected = true;
      break;
    case WStype_TEXT:
      if (cmdHandler && length < 256) {
        char buf[256];
        memcpy(buf, payload, length);
        buf[length] = '\0';
        cmdHandler(buf);
      }
      break;
    default:
      break;
  }
}
#endif

void pollSerial() {
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (serialLen > 0) {
        serialBuf[serialLen] = '\0';
        if (cmdHandler) cmdHandler(serialBuf);
        serialLen = 0;
      }
    } else if (serialLen < sizeof(serialBuf) - 1) {
      serialBuf[serialLen++] = c;
    } else {
      serialLen = 0;  // linha longa demais: descarta
    }
  }
}
}  // namespace

namespace comm {

void begin(CommandHandler onCommand, ClientHandler onClientConnected) {
  cmdHandler = onCommand;
  clientHandler = onClientConnected;
#if HAS_WIFI
  WiFi.mode(WIFI_STA);
  WiFi.setHostname(MDNS_HOSTNAME);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);  // não bloqueia
  ws.begin();
  ws.onEvent(onWsEvent);
#endif
}

void loop() {
  pollSerial();
#if HAS_WIFI
  ws.loop();
  if (WiFi.status() == WL_CONNECTED && !mdnsStarted) {
    if (MDNS.begin(MDNS_HOSTNAME)) {
      MDNS.addService("ws", "tcp", WS_PORT);
      mdnsStarted = true;
    }
  }
  if (clientJustConnected) {
    clientJustConnected = false;
    if (clientHandler) clientHandler();
  }
#endif
}

void broadcast(const char *line) {
  Serial.println(line);
#if HAS_WIFI
  if (ws.connectedClients() > 0) ws.broadcastTXT(line);
#endif
}

bool wifiEnabled() { return HAS_WIFI; }

bool wifiConnected() {
#if HAS_WIFI
  return WiFi.status() == WL_CONNECTED;
#else
  return false;
#endif
}

String ipAddress() { return wifiConnected() ? WiFi.localIP().toString() : String(""); }

int rssi() { return wifiConnected() ? WiFi.RSSI() : 0; }

uint8_t wsClients() {
#if HAS_WIFI
  return ws.connectedClients();
#else
  return 0;
#endif
}

}  // namespace comm
