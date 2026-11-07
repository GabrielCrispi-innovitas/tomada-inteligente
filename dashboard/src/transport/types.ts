import type { Command, DeviceMessage } from '../lib/protocol'

export type TransportKind = 'usb' | 'wifi' | 'demo'
export type ConnState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'

export interface TransportHandlers {
  onMessage: (m: DeviceMessage) => void
  onStatus: (s: ConnState, detail?: string) => void
  onRawLine?: (line: string) => void
}

export interface Transport {
  readonly kind: TransportKind
  connect(): Promise<void>
  disconnect(): Promise<void>
  send(c: Command): Promise<void>
}
