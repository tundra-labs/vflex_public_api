---
title: API Reference
parent: lib.vflex Documentation
nav_order: 4
---

# API Reference

## `new VFLEX()`

Creates a new instance. Set `vflex.logLevel` to `'silent'`, `'info'`, `'warn'`, or `'error'` to control console output.

## Connection

- **`tryConnect()`** — Requests MIDI access and connects to the first VFLEX device found. Throws if no device is available.
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
| `getFullPdoLog()` | Returns `{ logData, output }` with parsed PDO information |

## Low-Level

- **`sendCommand(cmd, payload, write, scratchpad, expectAck)`** — Sends a command with optional payload and flag bits. Set `write=true` for write operations, `scratchpad=true` for temporary writes.
- **`sendRaw(data)`** — Sends raw bytes using the MIDI framing protocol.
