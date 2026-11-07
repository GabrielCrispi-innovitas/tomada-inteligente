#include "storage.h"

#include <Preferences.h>

#include "config.h"

namespace {
Preferences prefs;
}

namespace storage {

void begin() { prefs.begin("plug", false); }

Persisted load() {
  Persisted p;
  p.absenceTimeoutS = prefs.getUInt("timeout", DEFAULT_ABSENCE_TIMEOUT_S);
  p.savedWh = prefs.getDouble("savedWh", 0);
  p.savedSeconds = prefs.getUInt("savedS", 0);
  return p;
}

void saveTimeout(uint32_t seconds) { prefs.putUInt("timeout", seconds); }

void saveSavings(double wh, uint32_t seconds) {
  prefs.putDouble("savedWh", wh);
  prefs.putUInt("savedS", seconds);
}

}  // namespace storage
