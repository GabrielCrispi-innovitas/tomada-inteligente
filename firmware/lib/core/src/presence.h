#pragma once
#include <stdint.h>

// Lógica pura, sem dependência do Arduino -> testável no PC (pio test -e native).

enum class Mode : uint8_t { Auto = 0, On = 1, Off = 2 };
enum class SwitchReason : uint8_t { Boot = 0, Presence, Absence, Manual };

const char *modeToString(Mode m);
bool modeFromString(const char *s, Mode &out);
const char *reasonToString(SwitchReason r);

struct PresenceConfig {
  uint32_t absenceTimeoutMs = 60000;
  uint32_t debounceMs = 500;
  uint32_t minSwitchIntervalMs = 3000;
};

class PresenceController {
 public:
  explicit PresenceController(const PresenceConfig &cfg = PresenceConfig());

  // Chame a cada loop com a leitura bruta do sensor. Retorna true se o relé mudou.
  bool update(bool rawPresence, uint32_t nowMs);

  // Troca de modo é imediata (intenção explícita do usuário). Retorna true se o relé mudou.
  bool setMode(Mode m, uint32_t nowMs);
  void setAbsenceTimeoutMs(uint32_t ms) { cfg_.absenceTimeoutMs = ms; }

  bool relayOn() const { return relay_; }
  bool presence() const { return stablePresence_; }
  Mode mode() const { return mode_; }
  SwitchReason lastReason() const { return reason_; }
  uint32_t absenceTimeoutMs() const { return cfg_.absenceTimeoutMs; }

  // Relé desligado por ausência (base do cálculo de economia).
  bool offByAbsence() const { return !relay_ && mode_ == Mode::Auto && reason_ == SwitchReason::Absence; }

  // Milissegundos até o desligamento automático (0 se não houver contagem ativa).
  uint32_t countdownMs(uint32_t nowMs) const;

 private:
  bool applyRelay(bool on, SwitchReason why, uint32_t nowMs, bool force);

  PresenceConfig cfg_;
  Mode mode_ = Mode::Auto;
  bool relay_ = false;
  SwitchReason reason_ = SwitchReason::Boot;

  bool rawLast_ = false;
  uint32_t rawSinceMs_ = 0;
  bool stablePresence_ = false;

  bool everSeen_ = false;
  uint32_t lastPresenceMs_ = 0;
  bool everSwitched_ = false;
  uint32_t lastSwitchMs_ = 0;
};
