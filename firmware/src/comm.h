#pragma once
#include <Arduino.h>

// Camada de comunicação: USB Serial + WebSocket (Wi-Fi).
// Os dois canais transportam exatamente as mesmas linhas JSON.
namespace comm {

using CommandHandler = void (*)(const char *line);
using ClientHandler = void (*)();

void begin(CommandHandler onCommand, ClientHandler onClientConnected);
void loop();                       // chamar a cada iteração
void broadcast(const char *line);  // envia para Serial + todos os clientes WS

bool wifiEnabled();
bool wifiConnected();
String ipAddress();
int rssi();
uint8_t wsClients();

}  // namespace comm
