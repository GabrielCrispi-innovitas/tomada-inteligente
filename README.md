# Tomada Inteligente: monitoramento de energia com sensor de presença

Projeto UPx (Facens, 2026): **Monitoramento inteligente de energia: uma abordagem integrada com dashboard analítico e sensores de ocupação**.

Uma tomada que **liga sozinha quando detecta uma pessoa** (radar mmWave HLK-LD2410C) e **desliga quando o ambiente fica vazio**. Ela também mede o consumo (PZEM-004T) e mostra tudo num dashboard em tempo real, com a economia gerada em kWh, R$ e CO₂.

```
 rede AC ──► HLK-PM01/PM03 ──► 5 V / 3,3 V
                │
 HLK-LD2410C ──►│ ESP32 ──► relé ──► carga
 PZEM-004T  ◄──►│   │
                    ├── USB (Web Serial) ──┐
                    └── Wi-Fi (WebSocket) ─┴──► dashboard (navegador)
```

## Estrutura

| Pasta | Conteúdo |
|---|---|
| [`firmware/`](firmware) | Código do ESP32 em C++ (Arduino + PlatformIO) |
| [`dashboard/`](dashboard) | Painel web (React + TypeScript + Vite) |
| [`tools/mock_esp32.py`](tools/mock_esp32.py) | ESP32 falso via Wi-Fi para testar sem hardware (Python, sem dependências) |
| [`docs/ligacoes.md`](docs/ligacoes.md) | Pinagem, gravação do firmware e checklist de teste na bancada |
| [`docs/protocolo.md`](docs/protocolo.md) | Formato das mensagens entre o ESP32 e o dashboard |

## Dashboard

```bash
cd dashboard
npm install
npm run dev        # abre em http://localhost:5180
```

- Abre em **modo demonstração**: um ESP32 virtual que roda a mesma lógica do firmware. Os botões "Pessoa na sala" e "Sala vazia" simulam o ambiente.
- **Conectar USB:** plugue o ESP32 e escolha a porta COM. Funciona no **Chrome ou Edge**.
- **Wi-Fi:** digite o IP mostrado no Serial Monitor (ou `smartplug.local`) e clique em Wi-Fi.
  - O GitHub Pages usa HTTPS, e o navegador bloqueia `ws://` em páginas HTTPS. Para Wi-Fi, rode o dashboard localmente (`npm run dev`). O USB funciona nos dois casos.
- O histórico diário fica salvo no navegador (IndexedDB) e pode ser exportado em CSV.

O que o painel mostra:
- estado da tomada (**Ligada / Desligada**) e o motivo;
- radar de presença;
- potência em tempo real;
- linha do tempo de presença × tomada;
- energia por dia;
- economia projetada, CO₂ evitado e retorno do investimento;
- histórico de acionamentos;
- ajustes (atraso para desligar, tarifa, modo manual).

## Firmware

Veja [`docs/ligacoes.md`](docs/ligacoes.md). Resumo:

```bash
cd firmware
pio run -e esp32dev -t upload        # firmware real
pio run -e esp32dev-sim -t upload    # firmware com sensores simulados
pio device monitor                   # ver o JSON na serial
```

Wi-Fi é opcional: copie `include/secrets.example.h` para `include/secrets.h` e preencha a rede. Sem esse arquivo, tudo funciona pelo USB.

## Testes

```bash
cd dashboard && npm test             # protocolo, cálculo de energia, máquina de estados, app completo
cd firmware  && pio test -e native   # máquina de estados do relé (precisa de gcc; roda no CI)
python tools/mock_esp32.py --port 8181   # depois conecte o dashboard em "localhost:8181"
```

O GitHub Actions compila o firmware (real e simulado), roda os testes e publica o dashboard no GitHub Pages a cada push na `main`.

## Equipe

Felipe Roris Fontes · Gabriel Coelho Crispi · Renan Piqueras Braz · Lucas de Moraes · Mateus Lima Delaroli · Pedro Augusto de Moura
