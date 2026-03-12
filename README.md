# lib.vflex.app

## What is VFLEX?

VFLEX is a universal USB-C power adapter that converts any USB-C Power Delivery charger into a configurable power solution. Set the exact voltage your device needs, plug into a USB-C PD charger or power bank, and power everything from legacy electronics to modern gear. It supports standard (SPR) and extended (EPR) power ranges, including PPS and AVS modes.

## Get the hardware

The **VFLEX Base** is available for $8.00 USD from Werewolf.

- [Buy VFLEX Base](https://werewolf.us/products/vflex-base)
- [Datasheet](https://werewolf.us/vflex/base/datasheet)
- [User Manual](https://werewolf.us/vflex/user-manual)

## Official VFLEX App

Looking for a full-featured app? The official VFLEX app includes additional features beyond this developer library and is available on web, iOS, and Android.

- [VFLEX Web App](https://vflex.app)
- [iOS App](https://werewolf.us/vflex-ios)
- [Android App](https://werewolf.us/vflex-android)

## About this library

To ensure the long term viability of VFLEX and encourage community development, we're sharing `lib.vflex.js`. This JavaScript library documents the VFLEX communication protocol and provides a Web MIDI API interface for configuring voltage, current, and reading device diagnostics — all from the browser. We love when people build cool stuff with our hardware!

- [Source Code](https://github.com/tundra-labs/lib.vflex)
- [Configuration Tool](https://lib.vflex.app/vflex-tool.html)
- [Debug Tool](https://lib.vflex.app/vflex-debug.html)

## MIDI Communication Protocol

### Connection

The library uses the [Web MIDI API](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API) (`navigator.requestMIDIAccess()`) to discover and connect to the device. It scans all available MIDI inputs and outputs for a port whose name contains **"vflex"** (case-insensitive). Both an input (for receiving responses) and an output (for sending commands) must be found for a successful connection.

### Framing Protocol

MIDI messages are limited to 7-bit data values per byte. The VFLEX protocol works around this by splitting each 8-bit data byte into two 7-bit MIDI data fields (high nibble and low nibble), and using standard MIDI status bytes as framing delimiters:

| MIDI Status Byte | Meaning         | Description |
|-------------------|-----------------|-------------|
| `0x80` (Note Off) | **Start frame** | Signals the beginning of a new message. Data bytes are ignored. |
| `0x90` (Note On)  | **Data byte**   | Carries one byte of payload. `d1` = high nibble, `d2` = low nibble. The original byte is reconstructed as `(d1 << 4) \| d2`. |
| `0xA0` (Aftertouch)| **End frame**   | Signals the end of the message. Triggers response processing. |

A 20 ms delay is inserted between each MIDI packet to ensure reliable delivery.

### Command Packet Structure

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

### Response Handling

Responses from the device use the same framing protocol. The library reassembles incoming data bytes until an end frame (`0xA0`) is received, then parses the response. The command ID in the response (masked to 6 bits) is matched against the last sent command to generate an acknowledgment.

The library uses a polling-based ACK mechanism with a configurable timeout (default 1500 ms for commands).

## Commands

| Command | ID | Read Response Format | Description |
|---------|----|----------------------|-------------|
| `CMD_SERIAL_NUMBER` | 8 | UTF-8 string | Device serial number |
| `CMD_HARDWARE_ID` | 10 | UTF-8 string | Hardware revision identifier |
| `CMD_FIRMWARE_VERSION` | 11 | UTF-8 string | Firmware version string |
| `CMD_MFG_DATE` | 12 | UTF-8 string | Manufacturing date |
| `CMD_PDO_LOG` | 17 | Chunked binary (see below) | USB PD Power Data Object log |
| `CMD_VOLTAGE_MV` | 18 | uint16 big-endian | Configured output voltage in millivolts |
| `CMD_CURRENT_LIMIT_MA` | 19 | uint16 big-endian | Current limit in milliamps |
| `CMD_RESERVED_A` | 22 | `[subcmd, level]` | Authorization lock level |
| `CMD_USER_VLIMIT` | 23 | `[high_msb, high_lsb, low_msb, low_lsb]` | User voltage limits (high and low) in mV |
| `CMD_VTOLERANCE_NOMINAL_MV` | 24 | uint16 big-endian | Voltage tolerance nominal value in mV |
| `CMD_VTOLERANCE_SAG_PER_MA` | 25 | uint16 big-endian | Voltage sag tolerance per mA |
| `CMD_VMEASURE_ADC_COUNT_OFFSET` | 26 | int32 big-endian (signed) | ADC count offset calibration |
| `CMD_VMEASURE_ADC_COUNT_SCALE` | 27 | int32 big-endian (signed, milli-units) | ADC count scale calibration |
| `CMD_VMEASURE` | 28 | `[raw_msb, raw_lsb, v_mv_msb, v_mv_lsb]` | Live voltage measurement (raw ADC + mV) |

### PDO Log

The PDO log is retrieved in 12 chunks (requested sequentially with chunk IDs 0-11). Each chunk carries 8 bytes of payload, producing a 90-byte record once assembled. The record contains:

- Target and measured voltage
- Number of PDOs received and selected PDO index
- Status flags for USB PD negotiation (SPR, EPR, PPS states)
- Up to 20 raw PDO entries (parsed per USB PD specification into Fixed, Battery, Variable, and Augmented/PPS/AVS types)

## Quick Start

```html
<script src="lib.vflex.js"></script>
<script>
  const vflex = new VFLEX();

  async function run() {
    await vflex.tryConnect();

    // Read device info
    await vflex.getString(VFLEX_COMMANDS.CMD_SERIAL_NUMBER);
    console.log("Serial:", vflex.device_data.serial_num);

    // Read voltage
    await vflex.getVoltageMv();
    console.log("Voltage:", vflex.device_data.voltage_mv, "mV");

    // Get full PDO log
    const result = await vflex.getFullPdoLog();
    console.log(result.output);
  }

  run();
</script>
```

## API Reference

### `new VFLEX()`

Creates a new instance. Set `vflex.logLevel` to `'silent'`, `'info'`, `'warn'`, or `'error'` to control console output.

### Connection

- **`tryConnect()`** — Requests MIDI access and connects to the first VFLEX device found. Throws if no device is available.
- **`disconnect()`** — Disconnects from the device and clears MIDI port references.

### Read Methods

All read methods are async. After awaiting, the result is available on `vflex.device_data`.

| Method | Result Property |
|--------|-----------------|
| `getString(CMD_SERIAL_NUMBER)` | `device_data.serial_num` |
| `getString(CMD_HARDWARE_ID)` | `device_data.hw_id` |
| `getString(CMD_FIRMWARE_VERSION)` | `device_data.fw_id` |
| `getString(CMD_MFG_DATE)` | `device_data.mfg_date` |
| `getVoltageMv()` | `device_data.voltage_mv` |
| `getMaxCurrentMa()` | `device_data.max_current_ma` |
| `getAuthLockLevel()` | `device_data.authlock_level` |
| `getUserVLimit()` | `device_data.vlimit_high_mv`, `device_data.vlimit_low_mv` |
| `getVToleranceNominalMv()` | `device_data.vtolerance_nominal_mv` |
| `getVToleranceSagPerMa()` | `device_data.vtolerance_sag_per_ma` |
| `getVMeasureAdcCountOffset()` | `device_data.vmeasure_adc_count_offset` |
| `getVMeasureAdcCountScale()` | `device_data.vmeasure_adc_count_scale` |
| `getVMeasure()` | `device_data.vmeasure_raw_adc`, `device_data.vmeasure_voltage_mv` |
| `getFullPdoLog()` | Returns `{ logData, output }` with parsed PDO information |

### Low-Level

- **`sendCommand(cmd, payload, write, scratchpad, expectAck)`** — Sends a command with optional payload and flag bits. Set `write=true` for write operations, `scratchpad=true` for temporary writes.
- **`sendRaw(data)`** — Sends raw bytes using the MIDI framing protocol.

## Browser Requirements

Requires a browser with [Web MIDI API](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API) support (Chrome, Edge, Opera). Firefox and Safari do not currently support Web MIDI.
