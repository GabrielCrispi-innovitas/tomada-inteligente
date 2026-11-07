#pragma once
#include <Arduino.h>

struct MeterReading {
  bool ok = false;
  float voltage = NAN;    // V
  float current = NAN;    // A
  float power = NAN;      // W
  float energyKwh = NAN;  // kWh (acumulado no próprio PZEM)
  float frequency = NAN;  // Hz
  float pf = NAN;         // fator de potência
};

namespace meter {
void begin();
// Chamar ~1x/s. Se o PZEM não responde, tenta de novo só a cada METER_RETRY_MS
// para não travar o loop com timeouts.
MeterReading read(bool relayOn);
bool resetEnergy();
}  // namespace meter
