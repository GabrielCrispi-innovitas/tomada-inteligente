#include "meter.h"

#include "config.h"

#ifndef SIMULATE
#include <PZEM004Tv30.h>

namespace {
PZEM004Tv30 *pzem = nullptr;
MeterReading last;
uint32_t nextTryMs = 0;
}  // namespace

namespace meter {

void begin() { pzem = new PZEM004Tv30(Serial2, PZEM_RX_PIN, PZEM_TX_PIN); }

MeterReading read(bool /*relayOn*/) {
  uint32_t now = millis();
  if (!last.ok && now < nextTryMs) return last;

  MeterReading r;
  r.voltage = pzem->voltage();  // a 1ª chamada lê todos os registradores (cache interno)
  if (isnan(r.voltage)) {
    last = MeterReading();
    nextTryMs = now + METER_RETRY_MS;
    return last;
  }
  r.current = pzem->current();
  r.power = pzem->power();
  r.energyKwh = pzem->energy();
  r.frequency = pzem->frequency();
  r.pf = pzem->pf();
  r.ok = !isnan(r.current) && !isnan(r.power);
  last = r;
  return r;
}

bool resetEnergy() { return pzem && pzem->resetEnergy(); }

}  // namespace meter

#else  // ===================== SIMULAÇÃO =====================

namespace {
double energyWh = 0;
uint32_t lastMs = 0;
float baseLoad = 96.0f;
}  // namespace

namespace meter {
void begin() { lastMs = millis(); }

MeterReading read(bool relayOn) {
  uint32_t now = millis();
  float dtH = (now - lastMs) / 3600000.0f;
  lastMs = now;

  MeterReading r;
  r.ok = true;
  r.voltage = 127.0f + sinf(now / 37000.0f) * 1.8f + random(-30, 30) / 100.0f;
  r.frequency = 60.0f + random(-2, 3) / 100.0f;
  if (relayOn) {
    float wave = sinf(now / 9000.0f) * 6.0f;
    float spike = random(0, 100) < 4 ? random(10, 35) : 0;
    r.power = baseLoad + wave + spike + random(-150, 150) / 100.0f;
    r.pf = 0.92f + random(-2, 3) / 100.0f;
  } else {
    r.power = 0;
    r.pf = 0;
  }
  r.current = (r.pf > 0) ? r.power / (r.voltage * r.pf) : 0;
  energyWh += r.power * dtH;
  r.energyKwh = energyWh / 1000.0;
  return r;
}

bool resetEnergy() {
  energyWh = 0;
  return true;
}
}  // namespace meter
#endif
