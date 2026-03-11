---
title: Commands
parent: lib.vflex Documentation
nav_order: 2
---

# Commands

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

## PDO Log

The PDO log is retrieved in 12 chunks (requested sequentially with chunk IDs 0-11). Each chunk carries 8 bytes of payload, producing a 90-byte record once assembled. The record contains:

- Target and measured voltage
- Number of PDOs received and selected PDO index
- Status flags for USB PD negotiation (SPR, EPR, PPS states)
- Up to 20 raw PDO entries (parsed per USB PD specification into Fixed, Battery, Variable, and Augmented/PPS/AVS types)
