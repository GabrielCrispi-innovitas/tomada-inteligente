#include "presence.h"

#include <string.h>

const char *modeToString(Mode m) {
  switch (m) {
    case Mode::On: return "on";
    case Mode::Off: return "off";
    default: return "auto";
  }
}

bool modeFromString(const char *s, Mode &out) {
  if (!s) return false;
  if (strcmp(s, "auto") == 0) { out = Mode::Auto; return true; }
  if (strcmp(s, "on") == 0) { out = Mode::On; return true; }
  if (strcmp(s, "off") == 0) { out = Mode::Off; return true; }
  return false;
}

const char *reasonToString(SwitchReason r) {
  switch (r) {
    case SwitchReason::Presence: return "presence";
    case SwitchReason::Absence: return "absence";
    case SwitchReason::Manual: return "manual";
    default: return "boot";
  }
}

PresenceController::PresenceController(const PresenceConfig &cfg) : cfg_(cfg) {}

bool PresenceController::applyRelay(bool on, SwitchReason why, uint32_t nowMs, bool force) {
  if (on == relay_) return false;
  // Subtração sem sinal -> seguro no overflow do millis() (~49 dias).
  if (!force && everSwitched_ && (uint32_t)(nowMs - lastSwitchMs_) < cfg_.minSwitchIntervalMs) return false;
  relay_ = on;
  reason_ = why;
  lastSwitchMs_ = nowMs;
  everSwitched_ = true;
  return true;
}

bool PresenceController::update(bool rawPresence, uint32_t nowMs) {
  // --- debounce ---
  if (rawPresence != rawLast_) {
    rawLast_ = rawPresence;
    rawSinceMs_ = nowMs;
  }
  if (rawLast_ != stablePresence_ && (uint32_t)(nowMs - rawSinceMs_) >= cfg_.debounceMs) {
    stablePresence_ = rawLast_;
  }
  if (stablePresence_) {
    lastPresenceMs_ = nowMs;
    everSeen_ = true;
  }

  // --- decisão ---
  switch (mode_) {
    case Mode::On: return applyRelay(true, SwitchReason::Manual, nowMs, true);
    case Mode::Off: return applyRelay(false, SwitchReason::Manual, nowMs, true);
    case Mode::Auto:
    default:
      if (stablePresence_) return applyRelay(true, SwitchReason::Presence, nowMs, false);
      if (relay_ && (!everSeen_ || (uint32_t)(nowMs - lastPresenceMs_) >= cfg_.absenceTimeoutMs)) {
        return applyRelay(false, SwitchReason::Absence, nowMs, false);
      }
      return false;
  }
}

bool PresenceController::setMode(Mode m, uint32_t nowMs) {
  mode_ = m;
  if (m == Mode::On) return applyRelay(true, SwitchReason::Manual, nowMs, true);
  if (m == Mode::Off) return applyRelay(false, SwitchReason::Manual, nowMs, true);
  // Voltando para AUTO: reinicia a contagem de ausência a partir de agora,
  // para não desligar no mesmo instante em que o usuário escolheu AUTO.
  if (relay_) {
    lastPresenceMs_ = nowMs;
    everSeen_ = true;
  } else if (stablePresence_) {
    return applyRelay(true, SwitchReason::Presence, nowMs, true);
  }
  return false;
}

uint32_t PresenceController::countdownMs(uint32_t nowMs) const {
  if (mode_ != Mode::Auto || !relay_ || stablePresence_ || !everSeen_) return 0;
  uint32_t elapsed = nowMs - lastPresenceMs_;
  return elapsed >= cfg_.absenceTimeoutMs ? 0 : cfg_.absenceTimeoutMs - elapsed;
}
