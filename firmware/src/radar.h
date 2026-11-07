#pragma once
#include <Arduino.h>

struct RadarReading {
  bool presence = false;
  bool moving = false;
  bool stationary = false;
  uint16_t distanceCm = 0;     // distância do alvo principal
  uint8_t movingEnergy = 0;    // 0-100
  uint8_t stationaryEnergy = 0;
  bool uartOk = false;         // false -> usando pino OUT (fallback)
};

namespace radar {
void begin();
RadarReading read();  // não bloqueante
}  // namespace radar
