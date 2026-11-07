#include "radar.h"

#include "config.h"

#ifndef SIMULATE
#include <ld2410.h>

namespace {
ld2410 sensor;
bool uartMode = false;
uint32_t lastFrameMs = 0;
RadarReading last;
}  // namespace

namespace radar {

void begin() {
  pinMode(RADAR_OUT_PIN, INPUT_PULLDOWN);
  Serial1.begin(RADAR_BAUD, SERIAL_8N1, RADAR_RX_PIN, RADAR_TX_PIN);
  delay(300);
  uartMode = sensor.begin(Serial1, true);
  lastFrameMs = millis();
}

RadarReading read() {
  if (uartMode) {
    sensor.read();
    if (sensor.isConnected()) {
      lastFrameMs = millis();
      last.uartOk = true;
      last.moving = sensor.movingTargetDetected();
      last.stationary = sensor.stationaryTargetDetected();
      last.presence = sensor.presenceDetected();
      last.movingEnergy = sensor.movingTargetEnergy();
      last.stationaryEnergy = sensor.stationaryTargetEnergy();
      last.distanceCm = last.moving ? sensor.movingTargetDistance()
                                    : (last.stationary ? sensor.stationaryTargetDistance() : 0);
      return last;
    }
    // Sem quadros há mais de 3 s -> considera a UART perdida e usa o pino OUT.
    if (millis() - lastFrameMs < 3000) return last;
  }
  RadarReading r;
  r.uartOk = false;
  r.presence = digitalRead(RADAR_OUT_PIN) == HIGH;
  r.stationary = r.presence;
  last = r;
  return r;
}

}  // namespace radar

#else  // ===================== SIMULAÇÃO =====================

namespace {
uint32_t phaseUntil = 0;
bool present = true;
float dist = 150;
float target = 150;
}  // namespace

namespace radar {
void begin() { randomSeed(esp_random()); }

RadarReading read() {
  uint32_t now = millis();
  if (now >= phaseUntil) {
    present = !present;
    // presença: 40-120 s | ausência: 70-150 s (ultrapassa o timeout padrão de 60 s)
    phaseUntil = now + (present ? random(40000, 120000) : random(70000, 150000));
  }
  if (random(0, 100) < 3) target = random(60, 380);
  dist += (target - dist) * 0.05f;

  RadarReading r;
  r.uartOk = true;
  r.presence = present;
  if (present) {
    r.moving = (now / 4000) % 3 == 0;
    r.stationary = !r.moving;
    r.distanceCm = (uint16_t)dist;
    r.movingEnergy = r.moving ? random(40, 95) : random(0, 15);
    r.stationaryEnergy = r.stationary ? random(30, 80) : random(0, 20);
  }
  return r;
}
}  // namespace radar
#endif
