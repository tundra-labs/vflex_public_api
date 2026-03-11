---
title: MIDI Communication Protocol
parent: lib.vflex Documentation
nav_order: 1
---

# MIDI Communication Protocol

## Connection

The library uses the [Web MIDI API](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API) (`navigator.requestMIDIAccess()`) to discover and connect to the device. It scans all available MIDI inputs and outputs for a port whose name contains **"vflex"** (case-insensitive). Both an input (for receiving responses) and an output (for sending commands) must be found for a successful connection.

## Framing Protocol

MIDI messages are limited to 7-bit data values per byte. The VFLEX protocol works around this by splitting each 8-bit data byte into two 7-bit MIDI data fields (high nibble and low nibble), and using standard MIDI status bytes as framing delimiters:

| MIDI Status Byte | Meaning         | Description |
|-------------------|-----------------|-------------|
| `0x80` (Note Off) | **Start frame** | Signals the beginning of a new message. Data bytes are ignored. |
| `0x90` (Note On)  | **Data byte**   | Carries one byte of payload. `d1` = high nibble, `d2` = low nibble. The original byte is reconstructed as `(d1 << 4) \| d2`. |
| `0xA0` (Aftertouch)| **End frame**   | Signals the end of the message. Triggers response processing. |

A 20 ms delay is inserted between each MIDI packet to ensure reliable delivery.

## Command Packet Structure

Each command sent to the device is a byte array with the following structure:

| Byte Index | Field     | Description |
|------------|-----------|-------------|
| 0          | Length    | Total length of the packet (preamble + payload) |
| 1          | Command   | Command ID with optional flag bits (see below) |
| 2+         | Payload   | Command-specific data (variable length) |

**Command byte flags:**

| Bit   | Mask   | Meaning |
|-------|--------|---------|
| Bit 7 | `0x80` | **Write** — set when writing a value to the device |
| Bit 6 | `0x40` | **Scratchpad** — set for scratchpad (temporary) writes |
| Bits 0-5 | `0x3F` | **Command ID** — the actual command identifier |

## Response Handling

Responses from the device use the same framing protocol. The library reassembles incoming data bytes until an end frame (`0xA0`) is received, then parses the response. The command ID in the response (masked to 6 bits) is matched against the last sent command to generate an acknowledgment.

The library uses a polling-based ACK mechanism with a configurable timeout (default 1500 ms for commands).
