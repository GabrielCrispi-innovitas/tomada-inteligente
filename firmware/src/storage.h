#pragma once
#include <Arduino.h>

struct Persisted {
  uint32_t absenceTimeoutS;
  double savedWh;
  uint32_t savedSeconds;
};

namespace storage {
void begin();
Persisted load();
void saveTimeout(uint32_t seconds);
void saveSavings(double wh, uint32_t seconds);
}  // namespace storage
