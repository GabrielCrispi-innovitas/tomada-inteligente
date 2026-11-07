# Protocolo ESP32 ↔ dashboard

Uma mensagem **JSON por linha** (terminada em `\n`). O formato é idêntico nos dois canais:

- **USB:** serial a 115200 baud (8N1). O dashboard usa a Web Serial API.
- **Wi-Fi:** WebSocket em `ws://<ip-do-esp32>:81/` ou `ws://smartplug.local:81/`. Cada mensagem é um frame de texto.

Linhas que não são JSON (mensagens de boot do ESP32, logs) são ignoradas pelo dashboard.

## ESP32 → dashboard

### `tel`: telemetria (1 vez por segundo)

```json
{"type":"tel","seq":12,"up":42,"v":127.3,"i":0.812,"p":96.4,"pf":0.93,"hz":60.0,"kwh":0.8421,
 "presence":true,"moving":false,"static":true,"dist":142,"e_mov":5,"e_sta":61,
 "relay":true,"mode":"auto","reason":"presence","countdown":0,"timeout":0,
 "saved_wh":12.5,"saved_s":340,"ref_w":95.8,"meter_ok":true,"radar_ok":true,"rssi":-60}
```

| Campo | Unidade | Descrição |
|---|---|---|
| `seq`, `up` | –, s | contador de mensagens e tempo desde o boot |
| `v`, `i`, `p` | V, A, W | tensão, corrente e potência ativa (`null` se o PZEM não responder) |
| `pf`, `hz` | –, Hz | fator de potência e frequência |
| `kwh` | kWh | energia acumulada no próprio PZEM |
| `presence` | bool | presença **filtrada** (é o que comanda o relé) |
| `moving`, `static` | bool | tipo de alvo detectado pelo LD2410C |
| `dist` | cm | distância do alvo (0 sem alvo ou no modo pino OUT) |
| `e_mov`, `e_sta` | 0–100 | intensidade do sinal do alvo em movimento / parado |
| `relay` | bool | **estado da tomada** (true = ligada) |
| `mode` | `auto` \| `on` \| `off` | modo atual |
| `reason` | `boot` \| `presence` \| `absence` \| `manual` | motivo da última comutação |
| `countdown` | s | tempo até desligar (só quando há atraso configurado) |
| `timeout` | s | atraso configurado (0 = desliga na hora) |
| `saved_wh`, `saved_s` | Wh, s | energia evitada e tempo desligada por ausência |
| `ref_w` | W | potência média do aparelho ligado (base do cálculo de economia) |
| `meter_ok`, `radar_ok` | bool | saúde do PZEM e da UART do radar |
| `rssi` | dBm | sinal do Wi-Fi (0 se desconectado) |

### `evt`: comutação do relé

```json
{"type":"evt","kind":"relay_off","reason":"absence","up":57}
```

### `info`: dados do firmware

Enviado no boot, quando um cliente WebSocket conecta e quando o dashboard manda `{"cmd":"info"}`.

```json
{"type":"info","fw":"1.0.0","sim":false,"timeout":0,"mode":"auto","wifi":true,
 "ip":"192.168.0.50","host":"smartplug.local","radar_uart":true,"meter_ok":true}
```

### `ack`: resposta a um comando

```json
{"type":"ack","cmd":"timeout","ok":false,"msg":"use 0..3600 s"}
```

## Dashboard → ESP32 (comandos)

| Comando | Efeito |
|---|---|
| `{"cmd":"mode","value":"auto"}` | volta a seguir o sensor de presença |
| `{"cmd":"mode","value":"on"}` | força a tomada ligada |
| `{"cmd":"mode","value":"off"}` | força a tomada desligada |
| `{"cmd":"timeout","value":30}` | espera 30 s sem presença antes de desligar (0–3600; fica salvo na flash) |
| `{"cmd":"reset_energy"}` | zera o kWh do PZEM e o contador de economia |
| `{"cmd":"info"}` | pede a mensagem `info` |

Dá para testar pelo Serial Monitor do PlatformIO: digite o JSON e aperte Enter.
