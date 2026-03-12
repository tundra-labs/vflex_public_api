---
title: Quick Start
parent: lib.vflex.app
nav_order: 5
---

# Quick Start

## Browser

Include the library in your HTML page. The browser's Web MIDI API is used automatically.

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

## Node.js

Install the library and a MIDI backend such as [JZZ](https://www.npmjs.com/package/jzz):

```bash
npm install lib-vflex jzz
```

Since Node.js does not have the Web MIDI API, use `connectWithPorts()` to supply MIDI input and output objects directly.

```js
const JZZ = require('jzz');
const { VFLEX, VFLEX_COMMANDS } = require('lib-vflex');

async function run() {
  const jzz = await JZZ();
  const info = jzz.info();

  // Find VFLEX MIDI ports
  const inputInfo = info.inputs.find(p => p.name.toLowerCase().includes('vflex'));
  const outputInfo = info.outputs.find(p => p.name.toLowerCase().includes('vflex'));

  const midiOut = await jzz.openMidiOut(outputInfo.name);
  const midiIn  = await jzz.openMidiIn(inputInfo.name);

  // Wrap JZZ ports to match the lib.vflex.js port interface
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
    get onmidimessage() { return this._cb; },
  };

  const wrappedOutput = {
    send(data) { midiOut.send(data); },
  };

  // Connect and use the library
  const vflex = new VFLEX();
  vflex.connectWithPorts(wrappedInput, wrappedOutput);

  await vflex.getString(VFLEX_COMMANDS.CMD_SERIAL_NUMBER);
  console.log("Serial:", vflex.device_data.serial_num);

  await vflex.getVoltageMv();
  console.log("Voltage:", vflex.device_data.voltage_mv, "mV");

  vflex.disconnect();
  jzz.close();
}

run();
```

## CLI Example

A complete Node.js command-line tool is included in the `examples/` directory. It supports reading all device parameters, setting configuration values, and controlling the LED.

```bash
cd examples
npm install
node cli.js --help
```

### Usage

```
node cli.js --status                          # Print full device status
node cli.js --measure                         # Read voltage measurement
node cli.js --pdo-log                         # Read PDO log

node cli.js --get-voltage                     # Get configured voltage
node cli.js --get-current-limit               # Get current limit
node cli.js --get-vlimit                      # Get voltage window

node cli.js --set-voltage 9000                # Set voltage to 9V
node cli.js --set-current-limit 3000          # Set current limit to 3A
node cli.js --set-vlimit 3000 20000           # Set voltage window

node cli.js --led blue                        # Set LED color
node cli.js --list-midi                       # List MIDI devices
```

Commands can be chained in a single invocation:

```
node cli.js --set-voltage 12000 --get-voltage --measure
```
