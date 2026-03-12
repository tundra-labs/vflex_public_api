#!/usr/bin/env node

const JZZ = require('jzz');
const { VFLEX, VFLEX_COMMANDS } = require('../lib.vflex.js');

// --- Helpers ----------------------------------------------------------------

function uint16BE(val) {
  return new Uint8Array([(val >> 8) & 0xFF, val & 0xFF]);
}

function int32BE(val) {
  return new Uint8Array([
    (val >> 24) & 0xFF,
    (val >> 16) & 0xFF,
    (val >>  8) & 0xFF,
    val & 0xFF,
  ]);
}

function printUsage() {
  console.log(`
Usage: node cli.js [options]

=== VFLEX Direct Commands (USB device under test) ===
  --status              Print basic device status and configuration
  --measure             Read current voltage measurement (raw ADC + mV)
  --pdo-log             Read and display full PDO log
  --get-voltage                Get configured output voltage (mV)
  --get-current-limit          Get current limit (mA)
  --get-adc-offset             Get ADC offset calibration value
  --get-adc-scale              Get ADC scale calibration value
  --get-tol-nominal            Get nominal voltage tolerance (mV)
  --get-tol-sag                Get sag tolerance value
  --get-vlimit                 Get voltage operating window (low/high mV)
  --set-voltage <mV>           Set target output voltage in millivolts
  --set-current-limit <mA>     Set current limit in milliamps
  --set-adc-offset <val>       Set ADC offset calibration value
  --set-adc-scale <val>        Set ADC scale calibration value
  --set-tol-nominal <mV>       Set nominal voltage tolerance in mV
  --set-tol-sag <percent>      Set sag tolerance (percent or mA-based)
  --set-vlimit <low_mV> <high_mV>  Set voltage operating window

=== LED Control ===
  --led <color>         Set device LED (off, red, green, blue, white, yellow, magenta, cyan)

=== Options ===
  --help                Show this help message
  --list-midi           List available MIDI devices
`);
}

// --- LED color map ----------------------------------------------------------

const LED_COLORS = {
  off:     0,
  red:     1,
  green:   2,
  blue:    3,
  white:   4,
  yellow:  5,
  magenta: 6,
  cyan:    7,
};

// --- MIDI connection via JZZ ------------------------------------------------

async function listMidiDevices() {
  const jzz = await JZZ();
  const info = jzz.info();

  console.log('MIDI Inputs:');
  for (const inp of info.inputs) {
    console.log(`  ${inp.name}`);
  }
  console.log('MIDI Outputs:');
  for (const out of info.outputs) {
    console.log(`  ${out.name}`);
  }
  jzz.close();
}

async function connectVFLEX() {
  const jzz = await JZZ();
  const info = jzz.info();

  const inputInfo = info.inputs.find(p => p.name.toLowerCase().includes('vflex'));
  const outputInfo = info.outputs.find(p => p.name.toLowerCase().includes('vflex'));

  if (!inputInfo || !outputInfo) {
    console.error('Error: No VFLEX MIDI device found.');
    console.error('Available devices:');
    for (const p of info.inputs)  console.error(`  IN:  ${p.name}`);
    for (const p of info.outputs) console.error(`  OUT: ${p.name}`);
    process.exit(1);
  }

  const midiOut = await jzz.openMidiOut(outputInfo.name);
  const midiIn  = await jzz.openMidiIn(inputInfo.name);

  // Wrap JZZ ports to match lib.vflex.js port interface
  const wrappedInput = {
    _cb: null,
    set onmidimessage(cb) {
      this._cb = cb;
      if (cb) {
        midiIn.connect(function (msg) {
          cb({ data: [msg[0], msg[1], msg[2]] });
        });
      }
    },
    get onmidimessage() {
      return this._cb;
    },
  };

  const wrappedOutput = {
    send(data) {
      midiOut.send(data);
    },
  };

  const vflex = new VFLEX();
  vflex.logLevel = 'silent';
  vflex.connectWithPorts(wrappedInput, wrappedOutput);

  return { vflex, jzz };
}

// --- Command handlers -------------------------------------------------------

async function cmdStatus(vflex) {
  await vflex.getString(VFLEX_COMMANDS.CMD_SERIAL_NUMBER);
  await vflex.getString(VFLEX_COMMANDS.CMD_HARDWARE_ID);
  await vflex.getString(VFLEX_COMMANDS.CMD_FIRMWARE_VERSION);
  await vflex.getString(VFLEX_COMMANDS.CMD_MFG_DATE);
  await vflex.getVoltageMv();
  await vflex.getMaxCurrentMa();
  await vflex.getUserVLimit();
  await vflex.getVToleranceNominalMv();
  await vflex.getVToleranceSagPerMa();
  await vflex.getVMeasureAdcCountOffset();
  await vflex.getVMeasureAdcCountScale();

  const d = vflex.device_data;
  console.log('=== VFLEX Device Status ===');
  console.log(`  Serial Number:    ${d.serial_num || 'N/A'}`);
  console.log(`  Hardware ID:      ${d.hw_id || 'N/A'}`);
  console.log(`  Firmware Version: ${d.fw_id || 'N/A'}`);
  console.log(`  Mfg Date:         ${d.mfg_date || 'N/A'}`);
  console.log(`  Voltage:          ${d.voltage_mv} mV`);
  console.log(`  Current Limit:    ${d.max_current_ma} mA`);
  console.log(`  V-Limit Low:      ${d.vlimit_low_mv} mV`);
  console.log(`  V-Limit High:     ${d.vlimit_high_mv} mV`);
  console.log(`  Tol Nominal:      ${d.vtolerance_nominal_mv} mV`);
  console.log(`  Tol Sag/mA:       ${d.vtolerance_sag_per_ma}`);
  console.log(`  ADC Offset:       ${d.vmeasure_adc_count_offset}`);
  console.log(`  ADC Scale:        ${d.vmeasure_adc_count_scale}`);
}

async function cmdMeasure(vflex) {
  await vflex.getVMeasure();
  const d = vflex.device_data;
  console.log(`Raw ADC: ${d.vmeasure_raw_adc}  Voltage: ${d.vmeasure_voltage_mv} mV`);
}

async function cmdPdoLog(vflex) {
  const result = await vflex.getFullPdoLog();
  console.log(result.output);
}

async function cmdGetVoltage(vflex) {
  await vflex.getVoltageMv();
  console.log(`Voltage: ${vflex.device_data.voltage_mv} mV`);
}

async function cmdGetCurrentLimit(vflex) {
  await vflex.getMaxCurrentMa();
  console.log(`Current Limit: ${vflex.device_data.max_current_ma} mA`);
}

async function cmdGetAdcOffset(vflex) {
  await vflex.getVMeasureAdcCountOffset();
  console.log(`ADC Offset: ${vflex.device_data.vmeasure_adc_count_offset}`);
}

async function cmdGetAdcScale(vflex) {
  await vflex.getVMeasureAdcCountScale();
  console.log(`ADC Scale: ${vflex.device_data.vmeasure_adc_count_scale}`);
}

async function cmdGetTolNominal(vflex) {
  await vflex.getVToleranceNominalMv();
  console.log(`Tolerance Nominal: ${vflex.device_data.vtolerance_nominal_mv} mV`);
}

async function cmdGetTolSag(vflex) {
  await vflex.getVToleranceSagPerMa();
  console.log(`Tolerance Sag: ${vflex.device_data.vtolerance_sag_per_ma}`);
}

async function cmdGetVLimit(vflex) {
  await vflex.getUserVLimit();
  const d = vflex.device_data;
  console.log(`V-Limit: ${d.vlimit_low_mv} - ${d.vlimit_high_mv} mV`);
}

async function cmdSetVoltage(vflex, mv) {
  const val = parseInt(mv, 10);
  if (isNaN(val) || val < 0 || val > 48000) {
    console.error('Error: Voltage must be 0-48000 mV');
    process.exit(1);
  }
  await vflex.sendCommand(VFLEX_COMMANDS.CMD_VOLTAGE_MV, uint16BE(val), true);
  console.log(`Voltage set to ${val} mV`);
}

async function cmdSetCurrentLimit(vflex, ma) {
  const val = parseInt(ma, 10);
  if (isNaN(val) || val < 0 || val > 5000) {
    console.error('Error: Current limit must be 0-5000 mA');
    process.exit(1);
  }
  await vflex.sendCommand(VFLEX_COMMANDS.CMD_CURRENT_LIMIT_MA, uint16BE(val), true);
  console.log(`Current limit set to ${val} mA`);
}

async function cmdSetAdcOffset(vflex, valStr) {
  const val = parseInt(valStr, 10);
  if (isNaN(val)) {
    console.error('Error: ADC offset must be an integer');
    process.exit(1);
  }
  await vflex.sendCommand(VFLEX_COMMANDS.CMD_VMEASURE_ADC_COUNT_OFFSET, int32BE(val), true);
  console.log(`ADC offset set to ${val}`);
}

async function cmdSetAdcScale(vflex, valStr) {
  const val = parseInt(valStr, 10);
  if (isNaN(val)) {
    console.error('Error: ADC scale must be an integer');
    process.exit(1);
  }
  await vflex.sendCommand(VFLEX_COMMANDS.CMD_VMEASURE_ADC_COUNT_SCALE, int32BE(val), true);
  console.log(`ADC scale set to ${val}`);
}

async function cmdSetTolNominal(vflex, mv) {
  const val = parseInt(mv, 10);
  if (isNaN(val) || val < 0) {
    console.error('Error: Tolerance nominal must be a positive integer (mV)');
    process.exit(1);
  }
  await vflex.sendCommand(VFLEX_COMMANDS.CMD_VTOLERANCE_NOMINAL_MV, uint16BE(val), true);
  console.log(`Tolerance nominal set to ${val} mV`);
}

async function cmdSetTolSag(vflex, valStr) {
  const val = parseInt(valStr, 10);
  if (isNaN(val) || val < 0) {
    console.error('Error: Tolerance sag must be a positive integer');
    process.exit(1);
  }
  await vflex.sendCommand(VFLEX_COMMANDS.CMD_VTOLERANCE_SAG_PER_MA, uint16BE(val), true);
  console.log(`Tolerance sag set to ${val}`);
}

async function cmdSetVLimit(vflex, lowStr, highStr) {
  const low = parseInt(lowStr, 10);
  const high = parseInt(highStr, 10);
  if (isNaN(low) || isNaN(high) || low < 0 || high < 0) {
    console.error('Error: V-limit values must be positive integers (mV)');
    process.exit(1);
  }
  if (low >= high) {
    console.error('Error: low_mV must be less than high_mV');
    process.exit(1);
  }
  const payload = new Uint8Array([
    (high >> 8) & 0xFF, high & 0xFF,
    (low >> 8) & 0xFF, low & 0xFF,
  ]);
  await vflex.sendCommand(VFLEX_COMMANDS.CMD_USER_VLIMIT, payload, true);
  console.log(`V-limit set to ${low} - ${high} mV`);
}

async function cmdLed(vflex, colorName) {
  const color = colorName.toLowerCase();
  if (!(color in LED_COLORS)) {
    console.error(`Error: Unknown LED color '${colorName}'`);
    console.error(`  Valid colors: ${Object.keys(LED_COLORS).join(', ')}`);
    process.exit(1);
  }
  const payload = new Uint8Array([10, 1, LED_COLORS[color], 2, 0]);
  await vflex.sendCommand(VFLEX_COMMANDS.CMD_FLASH_LED_SEQUENCE_ADVANCED, payload, true);
  console.log(`LED set to ${color}`);
}

// --- Main -------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    printUsage();
    process.exit(0);
  }

  if (args.includes('--list-midi')) {
    await listMidiDevices();
    process.exit(0);
  }

  const { vflex, jzz } = await connectVFLEX();

  try {
    let i = 0;
    while (i < args.length) {
      const arg = args[i];
      switch (arg) {
        case '--status':
          await cmdStatus(vflex);
          break;
        case '--measure':
          await cmdMeasure(vflex);
          break;
        case '--pdo-log':
          await cmdPdoLog(vflex);
          break;
        case '--get-voltage':
          await cmdGetVoltage(vflex);
          break;
        case '--get-current-limit':
          await cmdGetCurrentLimit(vflex);
          break;
        case '--get-adc-offset':
          await cmdGetAdcOffset(vflex);
          break;
        case '--get-adc-scale':
          await cmdGetAdcScale(vflex);
          break;
        case '--get-tol-nominal':
          await cmdGetTolNominal(vflex);
          break;
        case '--get-tol-sag':
          await cmdGetTolSag(vflex);
          break;
        case '--get-vlimit':
          await cmdGetVLimit(vflex);
          break;
        case '--set-voltage':
          await cmdSetVoltage(vflex, args[++i]);
          break;
        case '--set-current-limit':
          await cmdSetCurrentLimit(vflex, args[++i]);
          break;
        case '--set-adc-offset':
          await cmdSetAdcOffset(vflex, args[++i]);
          break;
        case '--set-adc-scale':
          await cmdSetAdcScale(vflex, args[++i]);
          break;
        case '--set-tol-nominal':
          await cmdSetTolNominal(vflex, args[++i]);
          break;
        case '--set-tol-sag':
          await cmdSetTolSag(vflex, args[++i]);
          break;
        case '--set-vlimit':
          await cmdSetVLimit(vflex, args[++i], args[++i]);
          break;
        case '--led':
          await cmdLed(vflex, args[++i]);
          break;
        default:
          console.error(`Unknown option: ${arg}`);
          printUsage();
          process.exit(1);
      }
      i++;
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  } finally {
    vflex.disconnect();
    jzz.close();
  }
}

main();
