# Ligações e teste no hardware

> ⚠️ **Rede elétrica (127/220 V) mata.** Faça as ligações com tudo **desligado da tomada**.
> O lado de alta tensão (entrada da rede, relé, PZEM, HLK-PM01/PM03) não deve ser tocado com o circuito energizado.

## Pinagem padrão do firmware

Os pinos ficam em [`firmware/include/config.h`](../firmware/include/config.h). **Confiram com a montagem de vocês**: se algum fio estiver em outro GPIO, troquem só o número lá.

| Módulo | Pino do módulo | ESP32 (HW-394) | Observação |
|---|---|---|---|
| **PZEM-004T v3** | TX | **GPIO 16** (RX2) | UART2, 9600 baud |
| | RX | **GPIO 17** (TX2) | |
| | 5V / GND | 5V / GND | alimentado pelo HLK-PM01 |
| **HLK-LD2410C** | TX | **GPIO 26** | UART1, 256000 baud (modo completo) |
| | RX | **GPIO 27** | |
| | OUT | **GPIO 25** | alternativa: só presença sim/não |
| | VCC / GND | 5V / GND | o LD2410C aceita 5 V |
| **Relé (via transistor)** | base do transistor (pelo resistor) | **GPIO 23** | nível ALTO liga o relé |
| LED da placa | — | GPIO 2 | acende junto com a tomada |

- **Basta ligar o OUT do radar, ou a UART, ou os dois.** No boot o firmware tenta a UART. Se ela não responder, passa a usar o pino OUT sozinho. Com a UART ligada, o dashboard mostra também a distância e se a pessoa está parada ou andando.
- **Se o relé ficar invertido** (liga quando deveria desligar), mudem `RELAY_ACTIVE_LOW` para `1` no `config.h`.
- Evitem os GPIOs 0, 2, 12 e 15 para entradas: eles interferem no boot do ESP32.

## Comportamento

- **Presença detectada → a tomada liga.**
- **O sensor parou de detectar → a tomada desliga.** Por padrão é na hora (atraso 0 s).
- Há só um filtro de 0,5 s contra ruído do sensor e um intervalo mínimo de 3 s entre comutações, para o relé não ficar "batendo". O próprio LD2410C também segura a presença por alguns segundos depois que a pessoa sai.
- Pelo dashboard dá para:
  - escolher um atraso (10 s, 30 s, 1 min, 5 min). Ele fica salvo no ESP32;
  - forçar **Sempre ligada** ou **Sempre desligada**.

## Gravar o firmware

1. Instale o **VS Code** e a extensão **PlatformIO IDE**.
2. Abra a pasta `firmware/` no VS Code.
3. *(Opcional, para Wi-Fi)* Copie `include/secrets.example.h` para `include/secrets.h` e preencha o nome e a senha da rede.
4. Conecte o ESP32 no USB e clique em **Upload** (seta →) na barra do PlatformIO.
   - Se não encontrar a porta, instale o driver **CH340** (o chip USB do HW-394).
   - Se travar em `Connecting...`, segure o botão **BOOT** da placa até começar a gravar.

**Sem os sensores em mãos?** Grave o ambiente **`esp32dev-sim`**: o ESP32 gera dados simulados de presença e consumo. Serve para testar o dashboard e o relé com só a placa.
```
pio run -e esp32dev-sim -t upload
```

## Checklist de teste na bancada

1. **Serial Monitor** do PlatformIO, em 115200 baud: tem que aparecer uma linha JSON por segundo, começando com `{"type":"tel",...}`.
   - `"meter_ok":false` → o PZEM não responde. Confiram TX/RX (cruzados), o 5 V e se o PZEM está ligado na rede (ele só responde com tensão AC na entrada).
   - `"radar_ok":false` → a UART do radar não responde. Funciona pelo pino OUT, mas sem distância.
2. **Feche o Serial Monitor** (a porta USB só pode ser aberta por um programa de cada vez).
3. Abra o dashboard no **Chrome ou Edge** e clique em **Conectar USB**. Escolha a porta do ESP32 (`USB-SERIAL CH340`).
4. Fique na frente do radar. O dashboard tem que mostrar "Pessoa detectada" e **Ligada**, e o relé tem que estalar.
5. Saia do alcance (ou cubra o radar). Em poucos segundos: **Desligada** com "Sem presença: desligada automaticamente".
6. Teste os botões **Sempre ligada** e **Sempre desligada**, depois volte para **Automático**.
7. Ligue uma carga conhecida (por exemplo uma lâmpada de 9 W ou um ventilador) e confira se a **potência** no dashboard bate com a da etiqueta.
8. Ao fim do teste, use **Baixar sessão (CSV)** e **Baixar resumo diário (CSV)** para anexar os dados ao relatório (seção 6, Validação).
