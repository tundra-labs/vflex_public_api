---
title: Platform Support
parent: lib.vflex.app
nav_order: 7
---

# Platform Support

## Browser

In the browser, the library uses the [Web MIDI API](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API) to communicate with VFLEX devices. Call `tryConnect()` to auto-discover the device.

**Supported browsers:** Chrome, Edge, Opera

**Not supported:** Firefox and Safari do not currently support Web MIDI.

## Node.js

In Node.js, there is no Web MIDI API. Instead, use `connectWithPorts(input, output)` to provide your own MIDI input and output objects. The library works with any MIDI backend that matches the required port interface.

[JZZ](https://www.npmjs.com/package/jzz) is a recommended cross-platform MIDI library for Node.js.

### Install

```bash
npm install lib-vflex jzz
```

### Port Interface

The MIDI ports you pass to `connectWithPorts()` must implement:

- **input**: must accept `onmidimessage = callback` where callback receives `{ data: [status, d1, d2] }`
- **output**: must have a `send([status, d1, d2])` method

See the [Quick Start](quick-start.html) guide for a complete example of wrapping JZZ ports.

### npm Package

The library is published on npm as `lib-vflex`:

```bash
npm install lib-vflex
```

```js
const { VFLEX, VFLEX_COMMANDS } = require('lib-vflex');
```

The same file can also be loaded directly via a `<script>` tag in the browser, where `VFLEX` and `VFLEX_COMMANDS` are exposed as globals.
