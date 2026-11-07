#include <unity.h>

#include "presence.h"
#include "savings.h"

static PresenceConfig cfg() {
  PresenceConfig c;
  c.absenceTimeoutMs = 10000;
  c.debounceMs = 500;
  c.minSwitchIntervalMs = 3000;
  return c;
}

void setUp() {}
void tearDown() {}

// Simula o loop chamando update a cada `step` ms entre [from, to).
static void run(PresenceController &pc, bool raw, uint32_t from, uint32_t to, uint32_t step = 100) {
  for (uint32_t t = from; t < to; t += step) pc.update(raw, t);
}

void test_boot_starts_off() {
  PresenceController pc(cfg());
  run(pc, false, 0, 20000);
  TEST_ASSERT_FALSE(pc.relayOn());
  TEST_ASSERT_EQUAL(Mode::Auto, pc.mode());
}

void test_presence_turns_on_after_debounce() {
  PresenceController pc(cfg());
  pc.update(true, 1000);
  TEST_ASSERT_FALSE(pc.relayOn());
  pc.update(true, 1400);
  TEST_ASSERT_FALSE(pc.relayOn());
  TEST_ASSERT_TRUE(pc.update(true, 1500));
  TEST_ASSERT_TRUE(pc.relayOn());
  TEST_ASSERT_EQUAL(SwitchReason::Presence, pc.lastReason());
}

void test_glitch_is_ignored() {
  PresenceController pc(cfg());
  pc.update(true, 1000);
  pc.update(false, 1200);  // pulso de 200 ms
  run(pc, false, 1300, 5000);
  TEST_ASSERT_FALSE(pc.relayOn());
}

void test_absence_timeout_turns_off() {
  PresenceController pc(cfg());
  run(pc, true, 0, 5000);
  TEST_ASSERT_TRUE(pc.relayOn());
  // Pessoa sai em t=5000; presença estável cai em 5500; timeout 10 s.
  run(pc, false, 5000, 15400);
  TEST_ASSERT_TRUE(pc.relayOn());
  TEST_ASSERT_TRUE(pc.countdownMs(15300) > 0);  // último update foi em 15300
  run(pc, false, 15400, 15600);
  TEST_ASSERT_FALSE(pc.relayOn());
  TEST_ASSERT_EQUAL(SwitchReason::Absence, pc.lastReason());
  TEST_ASSERT_TRUE(pc.offByAbsence());
  TEST_ASSERT_EQUAL_UINT32(0, pc.countdownMs(16000));
}

void test_return_cancels_countdown() {
  PresenceController pc(cfg());
  run(pc, true, 0, 5000);
  run(pc, false, 5000, 12000);
  run(pc, true, 12000, 13000);
  run(pc, false, 13000, 20000);
  TEST_ASSERT_TRUE(pc.relayOn());
}

void test_min_switch_interval() {
  PresenceConfig c = cfg();
  c.absenceTimeoutMs = 0;  // desliga assim que a presença some
  PresenceController pc(c);
  run(pc, true, 0, 600);   // liga em t=500
  TEST_ASSERT_TRUE(pc.relayOn());
  run(pc, false, 600, 2000);  // ausência estável em 1100, mas < 3 s desde a última comutação
  TEST_ASSERT_TRUE(pc.relayOn());
  run(pc, false, 2000, 3600);
  TEST_ASSERT_FALSE(pc.relayOn());
}

void test_manual_modes_override() {
  PresenceController pc(cfg());
  TEST_ASSERT_TRUE(pc.setMode(Mode::On, 100));
  TEST_ASSERT_TRUE(pc.relayOn());
  run(pc, false, 100, 60000);
  TEST_ASSERT_TRUE(pc.relayOn());
  TEST_ASSERT_TRUE(pc.setMode(Mode::Off, 60000));
  run(pc, true, 60000, 70000);
  TEST_ASSERT_FALSE(pc.relayOn());
  TEST_ASSERT_FALSE(pc.offByAbsence());
}

void test_back_to_auto_restarts_countdown() {
  PresenceController pc(cfg());
  pc.setMode(Mode::On, 0);
  run(pc, false, 0, 30000);
  pc.setMode(Mode::Auto, 30000);
  TEST_ASSERT_TRUE(pc.relayOn());
  run(pc, false, 30000, 39000);
  TEST_ASSERT_TRUE(pc.relayOn());
  run(pc, false, 39000, 40200);
  TEST_ASSERT_FALSE(pc.relayOn());
}

void test_millis_overflow() {
  PresenceController pc(cfg());
  uint32_t start = 0xFFFFFFFFu - 3000u;
  for (uint32_t i = 0; i < 2000; i += 100) pc.update(true, start + i);
  TEST_ASSERT_TRUE(pc.relayOn());
  for (uint32_t i = 2000; i < 2000 + 12000; i += 100) pc.update(false, start + i);  // atravessa o zero
  TEST_ASSERT_FALSE(pc.relayOn());
}

void test_zero_delay_mirrors_sensor() {
  PresenceConfig c = cfg();
  c.absenceTimeoutMs = 0;  // padrão do firmware: segue o sensor
  PresenceController pc(c);
  run(pc, true, 0, 1000);
  TEST_ASSERT_TRUE(pc.relayOn());
  run(pc, true, 1000, 10000);
  run(pc, false, 10000, 10600);  // sensor desligou -> 0,5 s de debounce -> desliga
  TEST_ASSERT_FALSE(pc.relayOn());
  TEST_ASSERT_EQUAL(SwitchReason::Absence, pc.lastReason());
  run(pc, true, 10600, 14200);   // pessoa volta -> liga de novo (após 3 s de intervalo mínimo)
  TEST_ASSERT_TRUE(pc.relayOn());
}

void test_mode_strings() {
  Mode m;
  TEST_ASSERT_TRUE(modeFromString("on", m));
  TEST_ASSERT_EQUAL(Mode::On, m);
  TEST_ASSERT_FALSE(modeFromString("xyz", m));
  TEST_ASSERT_FALSE(modeFromString(nullptr, m));
  TEST_ASSERT_EQUAL_STRING("auto", modeToString(Mode::Auto));
}

void test_savings_accumulates_only_when_off_by_absence() {
  SavingsTracker s;
  for (int i = 0; i < 100; i++) s.update(true, false, 100.0f, true, 1000);
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 100.0f, s.referencePowerW());
  TEST_ASSERT_EQUAL_DOUBLE(0.0, s.savedWh());
  // 1 hora desligado por ausência -> 100 Wh
  for (int i = 0; i < 3600; i++) s.update(false, true, 0.0f, true, 1000);
  TEST_ASSERT_DOUBLE_WITHIN(0.01, 100.0, s.savedWh());
  TEST_ASSERT_EQUAL_UINT32(3600, s.savedSeconds());
  // Desligado manualmente não conta
  for (int i = 0; i < 3600; i++) s.update(false, false, 0.0f, true, 1000);
  TEST_ASSERT_DOUBLE_WITHIN(0.01, 100.0, s.savedWh());
}

void test_savings_ignores_invalid_power() {
  SavingsTracker s;
  s.update(true, false, 80.0f, true, 1000);
  s.update(true, false, 9999.0f, false, 1000);  // leitura inválida
  s.update(true, false, 0.1f, true, 1000);      // standby desprezível
  TEST_ASSERT_FLOAT_WITHIN(0.01f, 80.0f, s.referencePowerW());
}

int main(int, char **) {
  UNITY_BEGIN();
  RUN_TEST(test_boot_starts_off);
  RUN_TEST(test_presence_turns_on_after_debounce);
  RUN_TEST(test_glitch_is_ignored);
  RUN_TEST(test_absence_timeout_turns_off);
  RUN_TEST(test_return_cancels_countdown);
  RUN_TEST(test_min_switch_interval);
  RUN_TEST(test_manual_modes_override);
  RUN_TEST(test_back_to_auto_restarts_countdown);
  RUN_TEST(test_millis_overflow);
  RUN_TEST(test_zero_delay_mirrors_sensor);
  RUN_TEST(test_mode_strings);
  RUN_TEST(test_savings_accumulates_only_when_off_by_absence);
  RUN_TEST(test_savings_ignores_invalid_power);
  return UNITY_END();
}
