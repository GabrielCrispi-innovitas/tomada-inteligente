#pragma once
// =============================================================================
//  CONFIGURAÇÃO DE HARDWARE — confira com a montagem antes de gravar!
//  Veja docs/ligacoes.md para o diagrama de ligação.
// =============================================================================

// ---- PZEM-004T v3 (UART2) ---------------------------------------------------
//  PZEM TX  -> ESP32 GPIO PZEM_RX_PIN
//  PZEM RX  -> ESP32 GPIO PZEM_TX_PIN
//  PZEM 5V  -> 5V (HLK-PM01) | PZEM GND -> GND
#define PZEM_RX_PIN 16
#define PZEM_TX_PIN 17

// ---- HLK-LD2410C (radar mmWave) ---------------------------------------------
//  Modo UART (recomendado — fornece distância e energia dos alvos):
//    LD2410 TX -> ESP32 GPIO RADAR_RX_PIN
//    LD2410 RX -> ESP32 GPIO RADAR_TX_PIN
//  Modo OUT (fallback — só presença sim/não):
//    LD2410 OUT -> ESP32 GPIO RADAR_OUT_PIN
//  Se a UART não responder no boot, o firmware usa automaticamente o pino OUT.
#define RADAR_RX_PIN 26
#define RADAR_TX_PIN 27
#define RADAR_OUT_PIN 25
#define RADAR_BAUD 256000

// ---- Relé (via transistor) --------------------------------------------------
#define RELAY_PIN 23
// Módulo/transistor que liga o relé com nível ALTO -> 0. Com nível BAIXO -> 1.
#define RELAY_ACTIVE_LOW 0

// ---- LED de status (LED azul da placa) --------------------------------------
#define STATUS_LED_PIN 2

// ---- Comportamento ----------------------------------------------------------
// 0 = a tomada segue o sensor: presença liga, sem presença desliga na hora.
// >0 = espera X s sem presença antes de desligar (ajustável pelo dashboard).
#define DEFAULT_ABSENCE_TIMEOUT_S 0
#define PRESENCE_DEBOUNCE_MS 500       // presença precisa ficar estável por X ms
#define MIN_SWITCH_INTERVAL_MS 3000    // intervalo mínimo entre comutações automáticas
#define TELEMETRY_INTERVAL_MS 1000     // envio de dados para o dashboard
#define METER_RETRY_MS 5000            // nova tentativa se o PZEM não responder
#define NVS_SAVE_INTERVAL_MS 300000UL  // salva totais na flash a cada 5 min
#define WATCHDOG_TIMEOUT_S 10

// ---- Rede -------------------------------------------------------------------
#define MDNS_HOSTNAME "smartplug"      // http://smartplug.local
#define WS_PORT 81
