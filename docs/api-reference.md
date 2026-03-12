---
title: API Reference
parent: lib.vflex.app
nav_order: 6
---

# API Reference

## `new VFLEX()`

Creates a new instance. Set `vflex.logLevel` to `'silent'`, `'info'`, `'warn'`, or `'error'` to control console output.

## Connection

- **`tryConnect()`** — Browser only. Requests MIDI access via the Web MIDI API and connects to the first VFLEX device found. Throws if no device is available or if called in Node.js.
- **`connectWithPorts(input, output)`** — Manual connection with user-supplied MIDI ports. Works in any environment (Node.js, browser, etc.). See [Platform Support](browser-requirements.html) for the port interface specification.
- **`disconnect()`** — Disconnects from the device and clears MIDI port references.

## Read Methods

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
| `getFullPdoLog()` | Returns `{ logData, parsed_pdos, output }` with parsed PDO information |

## Write Methods

Write operations use `sendCommand()` with `write=true` and a payload. All values are big-endian.

| Operation | Example |
|-----------|---------|
| Set voltage (mV) | `sendCommand(CMD_VOLTAGE_MV, uint16BE(9000), true)` |
| Set current limit (mA) | `sendCommand(CMD_CURRENT_LIMIT_MA, uint16BE(3000), true)` |
| Set voltage limits | `sendCommand(CMD_USER_VLIMIT, [high_msb, high_lsb, low_msb, low_lsb], true)` |
| Set tolerance nominal (mV) | `sendCommand(CMD_VTOLERANCE_NOMINAL_MV, uint16BE(val), true)` |
| Set tolerance sag | `sendCommand(CMD_VTOLERANCE_SAG_PER_MA, uint16BE(val), true)` |
| Set ADC offset | `sendCommand(CMD_VMEASURE_ADC_COUNT_OFFSET, int32BE(val), true)` |
| Set ADC scale | `sendCommand(CMD_VMEASURE_ADC_COUNT_SCALE, int32BE(val), true)` |
| Set LED color | `sendCommand(CMD_FLASH_LED_SEQUENCE_ADVANCED, [10, 1, color, 2, 0], true)` |
| Clear PDO log | `clearPdoLog()` |

### LED Colors

The LED command (`CMD_FLASH_LED_SEQUENCE_ADVANCED`, ID 13) accepts a 5-byte payload `[10, 1, color, 2, 0]` where `color` is:

| Color | Value |
|-------|-------|
| off | 0 |
| red | 1 |
| green | 2 |
| blue | 3 |
| white | 4 |
| yellow | 5 |
| magenta | 6 |
| cyan | 7 |

## Low-Level

- **`sendCommand(cmd, payload, write, scratchpad, expectAck)`** — Sends a command with optional payload and flag bits. Set `write=true` for write operations, `scratchpad=true` for temporary writes.
- **`sendRaw(data)`** — Sends raw bytes using the MIDI framing protocol.
