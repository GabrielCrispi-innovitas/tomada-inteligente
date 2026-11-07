// =============================================================================
//  Tomada Inteligente — UPx Facens 2026
//  Liga/desliga a carga conforme a presença (HLK-LD2410C), mede o consumo
//  (PZEM-004T) e envia telemetria JSON via USB Serial e WebSocket.
//  Protocolo: docs/protocolo.md
// =============================================================================
#include <Arduino.h>
#include <ArduinoJson.h>
#include <esp_task_wdt.h>

#include "config.h"
#include "comm.h"
#include "meter.h"
#include "presence.h"
#include "radar.h"
#include "savings.h"
#include "storage.h"

#ifndef FW_VERSION
#define FW_VERSION "dev"
#endif

namespace {
PresenceController presence;
SavingsTracker savings;
RadarReading radarNow;
MeterReading meterNow;

uint32_t lastTelemetryMs = 0;
uint32_t lastSaveMs = 0;
uint32_t lastSavingsMs = 0;
uint32_t seq = 0;

void writeRelay(bool on) {
  bool level = RELAY_ACTIVE_LOW ? !on : on;
  digitalWrite(RELAY_PIN, level ? HIGH : LOW);
  digitalWrite(STATUS_LED_PIN, on ? HIGH : LOW);
}

// Arredonda; grava null se o valor for inválido (NaN não é JSON válido).
void putNum(JsonDocument &doc, const char *key, float v, int decimals) {
  if (isnan(v) || isinf(v)) {
    doc[key] = nullptr;
    return;
  }
  float m = powf(10.0f, (float)decimals);
  doc[key] = roundf(v * m) / m;
}

void send(JsonDocument &doc) {
  char out[512];
  size_t n = serializeJson(doc, out, sizeof(out));
  if (n > 0 && n < sizeof(out)) comm::broadcast(out);
}

void sendEvent(const char *kind, const char *detail) {
  JsonDocument doc;
  doc["type"] = "evt";
  doc["kind"] = kind;
  doc["reason"] = detail;
  doc["up"] = millis() / 1000;
  send(doc);
}

void sendInfo() {
  JsonDocument doc;
  doc["type"] = "info";
  doc["fw"] = FW_VERSION;
#ifdef SIMULATE
  doc["sim"] = true;
#else
  doc["sim"] = false;
#endif
  doc["timeout"] = presence.absenceTimeoutMs() / 1000;
  doc["mode"] = modeToString(presence.mode());
  doc["wifi"] = comm::wifiEnabled();
  doc["ip"] = comm::ipAddress();
  doc["host"] = MDNS_HOSTNAME ".local";
  doc["radar_uart"] = radarNow.uartOk;
  doc["meter_ok"] = meterNow.ok;
  send(doc);
}

void sendAck(const char *cmd, bool ok, const char *msg = nullptr) {
  JsonDocument doc;
  doc["type"] = "ack";
  doc["cmd"] = cmd;
  doc["ok"] = ok;
  if (msg) doc["msg"] = msg;
  send(doc);
}

void sendTelemetry() {
  uint32_t now = millis();
  JsonDocument doc;
  doc["type"] = "tel";
  doc["seq"] = seq++;
  doc["up"] = now / 1000;
  putNum(doc, "v", meterNow.voltage, 1);
  putNum(doc, "i", meterNow.current, 3);
  putNum(doc, "p", meterNow.power, 1);
  putNum(doc, "pf", meterNow.pf, 2);
  putNum(doc, "hz", meterNow.frequency, 1);
  putNum(doc, "kwh", meterNow.energyKwh, 4);
  doc["presence"] = presence.presence();
  doc["moving"] = radarNow.moving;
  doc["static"] = radarNow.stationary;
  doc["dist"] = radarNow.distanceCm;
  doc["e_mov"] = radarNow.movingEnergy;
  doc["e_sta"] = radarNow.stationaryEnergy;
  doc["relay"] = presence.relayOn();
  doc["mode"] = modeToString(presence.mode());
  doc["reason"] = reasonToString(presence.lastReason());
  doc["countdown"] = (presence.countdownMs(now) + 999) / 1000;
  doc["timeout"] = presence.absenceTimeoutMs() / 1000;
  putNum(doc, "saved_wh", (float)savings.savedWh(), 2);
  doc["saved_s"] = savings.savedSeconds();
  putNum(doc, "ref_w", savings.referencePowerW(), 1);
  doc["meter_ok"] = meterNow.ok;
  doc["radar_ok"] = radarNow.uartOk;
  doc["rssi"] = comm::rssi();
  send(doc);
}

void onRelayChanged() {
  writeRelay(presence.relayOn());
  sendEvent(presence.relayOn() ? "relay_on" : "relay_off", reasonToString(presence.lastReason()));
}

void handleCommand(const char *line) {
  JsonDocument doc;
  if (deserializeJson(doc, line)) return;  // ignora o que não for JSON
  const char *cmd = doc["cmd"] | "";

  if (strcmp(cmd, "mode") == 0) {
    Mode m;
    if (!modeFromString(doc["value"] | "", m)) return sendAck(cmd, false, "valor invalido");
    if (presence.setMode(m, millis())) onRelayChanged();
    sendAck(cmd, true);
  } else if (strcmp(cmd, "timeout") == 0) {
    long s = doc["value"] | -1L;
    if (s < 0 || s > 3600) return sendAck(cmd, false, "use 0..3600 s");
    presence.setAbsenceTimeoutMs((uint32_t)s * 1000UL);
    storage::saveTimeout((uint32_t)s);
    sendAck(cmd, true);
  } else if (strcmp(cmd, "reset_energy") == 0) {
    bool ok = meter::resetEnergy();
    savings.reset();
    storage::saveSavings(0, 0);
    sendAck(cmd, ok);
  } else if (strcmp(cmd, "info") == 0) {
    sendInfo();
  } else {
    sendAck(cmd, false, "comando desconhecido");
  }
}
}  // namespace

void setup() {
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(STATUS_LED_PIN, OUTPUT);
  writeRelay(false);  // estado seguro no boot

  Serial.begin(115200);
  delay(50);

  storage::begin();
  Persisted p = storage::load();
  presence.setAbsenceTimeoutMs(p.absenceTimeoutS * 1000UL);
  savings.restore(p.savedWh, p.savedSeconds);

  radar::begin();
  meter::begin();
  comm::begin(handleCommand, sendInfo);

  esp_task_wdt_init(WATCHDOG_TIMEOUT_S, true);
  esp_task_wdt_add(nullptr);

  meterNow = meter::read(false);
  sendInfo();
  lastSavingsMs = millis();
}

void loop() {
  esp_task_wdt_reset();
  uint32_t now = millis();

  comm::loop();

  radarNow = radar::read();
  if (presence.update(radarNow.presence, now)) onRelayChanged();

  if (now - lastTelemetryMs >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryMs = now;
    meterNow = meter::read(presence.relayOn());
    savings.update(presence.relayOn(), presence.offByAbsence(), meterNow.power, meterNow.ok,
                   now - lastSavingsMs);
    lastSavingsMs = now;
    sendTelemetry();
  }

  if (now - lastSaveMs >= NVS_SAVE_INTERVAL_MS) {
    lastSaveMs = now;
    storage::saveSavings(savings.savedWh(), savings.savedSeconds());
  }

  delay(10);
}
