#pragma once
#include <stdint.h>

// Estima a energia economizada: enquanto o relé está desligado por ausência,
// soma a potência que o equipamento consumia quando estava ligado (média móvel).
class SavingsTracker {
 public:
  // dtMs: tempo desde a última chamada. powerValid=false se o medidor falhou.
  void update(bool relayOn, bool offByAbsence, float powerW, bool powerValid, uint32_t dtMs);

  double savedWh() const { return savedWh_; }
  float referencePowerW() const { return refPowerW_; }
  uint32_t savedSeconds() const { return (uint32_t)(savedMs_ / 1000ULL); }

  void restore(double savedWh, uint32_t savedSeconds) { savedWh_ = savedWh; savedMs_ = (uint64_t)savedSeconds * 1000ULL; }
  void reset() { savedWh_ = 0; savedMs_ = 0; }

  static constexpr float kMinLoadW = 0.5f;   // abaixo disso consideramos "sem carga"
  static constexpr float kAlpha = 0.05f;     // suavização da média (≈20 amostras)

 private:
  double savedWh_ = 0;
  uint64_t savedMs_ = 0;
  float refPowerW_ = 0;
};
