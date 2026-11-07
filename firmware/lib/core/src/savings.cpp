#include "savings.h"

void SavingsTracker::update(bool relayOn, bool offByAbsence, float powerW, bool powerValid, uint32_t dtMs) {
  if (relayOn) {
    if (powerValid && powerW >= kMinLoadW) {
      refPowerW_ = (refPowerW_ <= 0.0f) ? powerW : refPowerW_ + kAlpha * (powerW - refPowerW_);
    }
    return;
  }
  if (offByAbsence) {
    savedMs_ += dtMs;
    savedWh_ += (double)refPowerW_ * (double)dtMs / 3600000.0;
  }
}
