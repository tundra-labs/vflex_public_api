// UMD-style export: works in Node.js (CommonJS/ESM) and browsers (global)
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    const exported = factory();
    root.VFLEX = exported.VFLEX;
    root.VFLEX_COMMANDS = exported.VFLEX_COMMANDS;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {

function delay_ms(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const VFLEX_COMMANDS = Object.freeze({
  CMD_SERIAL_NUMBER:               8,
  CMD_HARDWARE_ID:                10,
  CMD_FIRMWARE_VERSION:           11,
  CMD_MFG_DATE:                   12,
  CMD_FLASH_LED_SEQUENCE_ADVANCED: 13,
  CMD_VOLTAGE_MV:                 18,
  CMD_CURRENT_LIMIT_MA:           19,
  CMD_PDO_LOG:                    17,
  CMD_AUTHLOCK:                   22,
  CMD_USER_VLIMIT:                23,
  CMD_VTOLERANCE_NOMINAL_MV:      24,
  CMD_VTOLERANCE_SAG_PER_MA:      25,
  CMD_VMEASURE_ADC_COUNT_OFFSET:  26,
  CMD_VMEASURE_ADC_COUNT_SCALE:   27,
  CMD_VMEASURE:                   28,
});


class VFLEX {
  constructor() {
    this.device_data = {};
    this.midi_access = null;
    this.midi_input = null;
    this.midi_output = null;
    this.connected = false;
    this.receive_buffer = [];
    this.receive_complete = false;
    this.ACK = 0;
    this.ACK_CMD = null;
    this.preamble_len = 2;
    this.midi_packet_delay_ms = 20;

    this.logLevel = 'info'; // 'silent' | 'info' | 'warn' | 'error' — can be changed
  }

  log(msg, level = 'info') {
    if (this.logLevel === 'silent') return;
    if (level === 'error' || this.logLevel === 'error') {
      console.error(msg);
    } else if (level === 'warn' || this.logLevel === 'warn') {
      console.warn(msg);
    } else {
      console.log(msg);
    }
  }

  async initMidi() {
    if (this.midi_access) return;
    if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) {
      throw new Error(
        "Web MIDI API not available. In Node.js, use connectWithPorts(input, output) instead of tryConnect()."
      );
    }
    try {
      this.midi_access = await navigator.requestMIDIAccess();
      this.midi_access.onstatechange = e => this.handleMidiStateChange(e);
    } catch (err) {
      throw new Error(`MIDI access denied: ${err.message}`);
    }
  }

  handleMidiStateChange(e) {
    if (!e.port?.name?.toLowerCase().includes('vflex')) return;
    if (e.port.state === 'disconnected' && this.connected) {
      this.disconnect();
    }
  }

  /**
   * Browser auto-discovery via Web MIDI API.
   * Finds the first MIDI device whose name contains "vflex".
   */
  async tryConnect() {
    if (this.connected) return true;

    await this.initMidi();

    let output = null;
    for (let out of this.midi_access.outputs.values()) {
      if (out.name?.toLowerCase().includes('vflex')) {
        output = out;
        break;
      }
    }

    let input = null;
    for (let inp of this.midi_access.inputs.values()) {
      if (inp.name?.toLowerCase().includes('vflex')) {
        input = inp;
        break;
      }
    }

    if (!input || !output) {
      throw new Error("No VFLEX MIDI device found");
    }

    this.midi_output = output;
    this.midi_input = input;

    this.midi_input.onmidimessage = ev => this.onMidiMessage(ev);

    this.connected = true;
    this.log("VFLEX MIDI connected", 'info');

    return true;
  }

  /**
   * Manual connection with user-supplied MIDI ports.
   * Use this in Node.js or any environment without Web MIDI.
   *
   * @param {object} input  - Must support: input.onmidimessage = callback
   *                          Callback receives { data: [status, d1, d2] }
   * @param {object} output - Must support: output.send([status, d1, d2])
   */
  connectWithPorts(input, output) {
    if (!input || !output) {
      throw new Error("Both input and output MIDI ports are required");
    }
    this.midi_input = input;
    this.midi_output = output;
    this.midi_input.onmidimessage = ev => this.onMidiMessage(ev);
    this.connected = true;
    this.log("VFLEX MIDI connected (manual ports)", 'info');
    return true;
  }

  disconnect() {
    if (this.midi_input) {
      this.midi_input.onmidimessage = null;
    }
    this.midi_input = null;
    this.midi_output = null;
    this.connected = false;
    this.log("VFLEX disconnected", 'warn');
  }

  onMidiMessage(event) {
    const [status, d1, d2] = event.data;

    if (status === 0x80) {           // start
      this.receive_buffer = [];
      this.receive_complete = false;
    } else if (status === 0x90) {    // data byte
      if (this.receive_buffer.length < 64) {
        const byte = (d1 << 4) | d2;
        this.receive_buffer.push(byte);
      }
    } else if (status === 0xA0) {    // end
      this.receive_complete = true;
      this.processResponse(new Uint8Array(this.receive_buffer));
      this.receive_buffer = [];
    }
  }

  async sendRaw(data) {
    if (!this.midi_output) throw new Error("No MIDI output");

    this.midi_output.send([0x80, 0, 0]);
    await delay_ms(this.midi_packet_delay_ms);

    for (const byte of data) {
      const hi = (byte >> 4) & 0x0F;
      const lo = byte & 0x0F;
      this.midi_output.send([0x90, hi, lo]);
      await delay_ms(this.midi_packet_delay_ms);
    }

    this.midi_output.send([0xA0, 0, 0]);
  }

  async sendCommand(cmd, payload = new Uint8Array(0), write = false, scratchpad = false, expectAck = true) {
    if (!this.connected) throw new Error("Not connected");

    let command = cmd;
    if (scratchpad) command |= 0x40;
    if (write) command |= 0x80;

    const len = this.preamble_len + payload.length;
    const arr = new Uint8Array(len);

    arr[0] = len;
    arr[1] = command;
    arr.set(payload, this.preamble_len);

    this.ACK = 0;
    this.ACK_CMD = cmd;

    await this.sendRaw(arr);

    if (!expectAck) return true;

    await this.awaitResponse(1500);
    return true;
  }

  async awaitResponse(timeoutMs = 800) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const iv = setInterval(() => {
        if (this.ACK === 1) {
          clearInterval(iv);
          this.ACK = 0;
          resolve();
        }
        if (Date.now() - start > timeoutMs) {
          clearInterval(iv);
          reject(new Error(`Command timeout (${timeoutMs} ms)`));
        }
      }, 20);
    });
  }

  processResponse(data) {
    if (data.length < 2) return;

    const cmd = data[1] & 0x3F; // Mask off write/scratch bits for matching

    if (this.ACK_CMD === cmd) {
      this.ACK = 1;
    }

    switch (cmd) {
      case VFLEX_COMMANDS.CMD_SERIAL_NUMBER:
      case VFLEX_COMMANDS.CMD_HARDWARE_ID:
      case VFLEX_COMMANDS.CMD_FIRMWARE_VERSION:
      case VFLEX_COMMANDS.CMD_MFG_DATE:
        const str = new TextDecoder().decode(data.slice(this.preamble_len)).trim();
        if (cmd === VFLEX_COMMANDS.CMD_SERIAL_NUMBER)   this.device_data.serial_num = str;
        if (cmd === VFLEX_COMMANDS.CMD_HARDWARE_ID)     this.device_data.hw_id     = str;
        if (cmd === VFLEX_COMMANDS.CMD_FIRMWARE_VERSION)this.device_data.fw_id     = str;
        if (cmd === VFLEX_COMMANDS.CMD_MFG_DATE)        this.device_data.mfg_date  = str;
        break;

      case VFLEX_COMMANDS.CMD_VOLTAGE_MV:
        this.device_data.voltage_mv = (data[2] << 8) | data[3];
        break;

      case VFLEX_COMMANDS.CMD_CURRENT_LIMIT_MA:
        this.device_data.max_current_ma = (data[2] << 8) | data[3];
        break;

      case VFLEX_COMMANDS.CMD_PDO_LOG:
        const chunkId = data[2];
        const payloadOffset = 3;
        if (chunkId === 0) {
          this.device_data.pdo_payload = [];
        }
        if (data.length > payloadOffset + 7) {
          for (let i = 0; i < 8; i++) {
            this.device_data.pdo_payload.push(data[payloadOffset + i]);
          }
        }
        break;

      case VFLEX_COMMANDS.CMD_AUTHLOCK:
        // For get: data = [len=4, cmd=22, subcmd=22, level]
        this.device_data.authlock_level = data[3];
        break;

      case VFLEX_COMMANDS.CMD_USER_VLIMIT:
        // data = [len=6, cmd=23, high_msb, high_lsb, low_msb, low_lsb]
        this.device_data.vlimit_high_mv = (data[2] << 8) | data[3];
        this.device_data.vlimit_low_mv = (data[4] << 8) | data[5];
        break;

      case VFLEX_COMMANDS.CMD_VTOLERANCE_NOMINAL_MV:
        // data = [len=4, cmd=24, msb, lsb]
        this.device_data.vtolerance_nominal_mv = (data[2] << 8) | data[3];
        break;

      case VFLEX_COMMANDS.CMD_VTOLERANCE_SAG_PER_MA:
        // data = [len=4, cmd=25, msb, lsb]
        this.device_data.vtolerance_sag_per_ma = (data[2] << 8) | data[3];
        break;

      case VFLEX_COMMANDS.CMD_VMEASURE_ADC_COUNT_OFFSET:
        // data = [len=6, cmd=26, b3(msb), b2, b1, b0(lsb)] signed int32
        let offset = (data[2] << 24) | (data[3] << 16) | (data[4] << 8) | data[5];
        if (offset & 0x80000000) offset -= 0x100000000;
        this.device_data.vmeasure_adc_count_offset = offset;
        break;

      case VFLEX_COMMANDS.CMD_VMEASURE_ADC_COUNT_SCALE:
        // data = [len=6, cmd=27, b3(msb), b2, b1, b0(lsb)] int32 (milli-units)
        let scale = (data[2] << 24) | (data[3] << 16) | (data[4] << 8) | data[5];
        if (scale & 0x80000000) scale -= 0x100000000;
        this.device_data.vmeasure_adc_count_scale = scale;
        break;

      case VFLEX_COMMANDS.CMD_VMEASURE:
        // data = [len=6, cmd=28, raw_msb, raw_lsb, v_mv_msb, v_mv_lsb]
        this.device_data.vmeasure_raw_adc = (data[2] << 8) | data[3];
        this.device_data.vmeasure_voltage_mv = (data[4] << 8) | data[5];
        break;

      default:
        this.log(`Unhandled command code: ${cmd}`, 'warn');
    }
  }

  // ─── Public API ───────────────────────────────────────

  async getString(cmd) {
    return this.sendCommand(cmd);
  }

  async getVoltageMv() {
    return this.sendCommand(VFLEX_COMMANDS.CMD_VOLTAGE_MV);
  }

  async getMaxCurrentMa() {
    return this.sendCommand(VFLEX_COMMANDS.CMD_CURRENT_LIMIT_MA);
  }

  async getAuthLockLevel() {
    return this.sendCommand(VFLEX_COMMANDS.CMD_AUTHLOCK);
  }

  async getUserVLimit() {
    return this.sendCommand(VFLEX_COMMANDS.CMD_USER_VLIMIT);
  }

  async getVToleranceNominalMv() {
    return this.sendCommand(VFLEX_COMMANDS.CMD_VTOLERANCE_NOMINAL_MV);
  }

  async getVToleranceSagPerMa() {
    return this.sendCommand(VFLEX_COMMANDS.CMD_VTOLERANCE_SAG_PER_MA);
  }

  async getVMeasureAdcCountOffset() {
    return this.sendCommand(VFLEX_COMMANDS.CMD_VMEASURE_ADC_COUNT_OFFSET);
  }

  async getVMeasureAdcCountScale() {
    return this.sendCommand(VFLEX_COMMANDS.CMD_VMEASURE_ADC_COUNT_SCALE);
  }

  async getVMeasure() {
    return this.sendCommand(VFLEX_COMMANDS.CMD_VMEASURE);
  }

  async clearPdoLog() {
    return this.sendCommand(VFLEX_COMMANDS.CMD_PDO_LOG, new Uint8Array(0), true);
  }

  async getFullPdoLog() {
    this.device_data.pdo_payload = [];

    // Request chunks 0–11 (adjust if device sends more/fewer)
    for (let i = 0; i < 12; i++) {
      await this.sendCommand(VFLEX_COMMANDS.CMD_PDO_LOG, new Uint8Array([i]));
      await delay_ms(60);
    }

    if (!this.device_data.pdo_payload || this.device_data.pdo_payload.length < 90) {
      throw new Error(`Incomplete PDO log (${this.device_data.pdo_payload?.length ?? 0} bytes)`);
    }

    return this.parseAndPrintPdoLog(this.device_data.pdo_payload.slice(0, 90));
  }

  parseAndPrintPdoLog(bytes) {
    if (bytes.length !== 90) {
      throw new Error(`Expected 90 bytes, got ${bytes.length}`);
    }

    const buffer = new ArrayBuffer(90);
    new Uint8Array(buffer).set(bytes);
    const dv = new DataView(buffer);

    let offset = 0;
    const target_voltage_mv   = dv.getUint16(offset, true); offset += 2;
    const measured_voltage_mv = dv.getUint16(offset, true); offset += 2;
    const n_pdos_received     = dv.getUint8(offset);        offset += 1;
    const id_selected_pdo     = dv.getUint8(offset);        offset += 1;

    const flags  = dv.getUint16(offset, true); offset += 2;
    const flags2 = dv.getUint16(offset, true); offset += 2;

    const pdos = [];
    for (let i = 0; i < 20; i++) {
      pdos.push(dv.getUint32(offset, true));
      offset += 4;
    }

    const logData = {
      target_voltage_mv,
      measured_voltage_mv,
      n_pdos_received,
      id_selected_pdo,
      flags,
      flags2,
      pdos,
    };

    const pd_request_accepted = (flags & 0x01) !== 0;
    const pd_request_rejected = (flags & 0x02) !== 0;
    const voltage_within_tolerance = (flags & 0x04) !== 0;
    const webusb_connection = (flags & 0x08) !== 0;

    const spr_init_pdos_received = (flags2 & 0x0001) !== 0;
    const spr_ps_rdy = (flags2 & 0x0002) !== 0;
    const non_epr_ps = (flags2 & 0x0004) !== 0;
    const epr_cable_fail = (flags2 & 0x0008) !== 0;
    const non_epr_ps_rdy = (flags2 & 0x0010) !== 0;
    const non_epr_ps_reject = (flags2 & 0x0020) !== 0;
    const epr_available = (flags2 & 0x0040) !== 0;
    const epr_enter_request = (flags2 & 0x0080) !== 0;
    const epr_enter_request_ack = (flags2 & 0x0100) !== 0;
    const epr_entered = (flags2 & 0x0200) !== 0;
    const epr_rejected = (flags2 & 0x0400) !== 0;
    const epr_first_pdos_chunk_received = (flags2 & 0x0800) !== 0;
    const epr_second_pdos_chunk_received = (flags2 & 0x1000) !== 0;
    const epr_ps_rdy = (flags2 & 0x2000) !== 0;

    const parsed_pdos = pdos.map((pdo_raw, index) => {
      const type = (pdo_raw >> 30) & 0x03;
      const subtype = '';
      let parsed = { raw: pdo_raw.toString(16).padStart(8, '0'), type, subtype };

      if (type === 0) { // Fixed Supply PDO
        parsed.voltage_mv = ((pdo_raw >> 10) & 0x3FF) * 50;
        parsed.max_current_ma = (pdo_raw & 0x3FF) * 10;
        parsed.peak_current = (pdo_raw >> 20) & 0x03;
        parsed.epr_capable = ((pdo_raw >> 23) & 0x01) !== 0;
        parsed.unchunked_extended_messages_supported = ((pdo_raw >> 26) & 0x01) !== 0;
        parsed.dual_role_data = ((pdo_raw >> 27) & 0x01) !== 0;
        parsed.usb_communications_capable = ((pdo_raw >> 28) & 0x01) !== 0;
        parsed.unconstrained_power = ((pdo_raw >> 29) & 0x01) !== 0;
        parsed.usb_suspend_supported = ((pdo_raw >> 25) & 0x01) !== 0;
        parsed.dual_role_power = ((pdo_raw >> 24) & 0x01) !== 0;
      } else if (type === 1) { // Battery Supply PDO
        parsed.min_voltage_mv = ((pdo_raw >> 20) & 0x3FF) * 50;
        parsed.max_voltage_mv = ((pdo_raw >> 10) & 0x3FF) * 50;
        parsed.max_power_mw = (pdo_raw & 0x3FF) * 250;
      } else if (type === 2) { // Variable Supply PDO
        parsed.min_voltage_mv = ((pdo_raw >> 20) & 0x3FF) * 50;
        parsed.max_voltage_mv = ((pdo_raw >> 10) & 0x3FF) * 50;
        parsed.max_current_ma = (pdo_raw & 0x3FF) * 10;
      } else if (type === 3) { // Augmented PDO
        parsed.apdo_subtype = (pdo_raw >> 28) & 0x03;
        parsed.subtype = ['SPR PPS', 'EPR AVS', 'SPR AVS', 'Reserved'][parsed.apdo_subtype];
        if (parsed.apdo_subtype === 0) { // SPR PPS
          parsed.min_voltage_mv = ((pdo_raw >> 8) & 0xFF) * 100;
          parsed.max_voltage_mv = ((pdo_raw >> 17) & 0xFF) * 100;
          parsed.max_current_ma = (pdo_raw & 0x7F) * 50;
          parsed.pps_power_limited = ((pdo_raw >> 27) & 0x01) !== 0;
        } else if (parsed.apdo_subtype === 1) { // EPR AVS
          parsed.min_voltage_mv = ((pdo_raw >> 8) & 0xFF) * 100;
          parsed.max_voltage_mv = ((pdo_raw >> 17) & 0xFF) * 100;
          parsed.pdp_watts = pdo_raw & 0xFF;
          parsed.peak_current = (pdo_raw >> 25) & 0x03;
        } else if (parsed.apdo_subtype === 2) { // SPR AVS
          parsed.max_current_20v_ma = ((pdo_raw >> 17) & 0x7F) * 50;
          parsed.max_current_15v_ma = ((pdo_raw >> 8) & 0x7F) * 50;
          parsed.peak_current = (pdo_raw >> 25) & 0x03;
        }
      }
      return parsed;
    });

    // Build output string in the same format as previous console logs
    let output = '--- VFLEX PDO Log ---\n';
    output += `Target Voltage: ${target_voltage_mv} mV\n`;
    output += `Measured Voltage: ${measured_voltage_mv} mV\n`;
    output += `Number of PDOs Received: ${n_pdos_received}\n`;
    output += `Selected PDO ID: ${id_selected_pdo}\n`;
    output += `PD Request Accepted: ${pd_request_accepted}\n`;
    output += `PD Request Rejected: ${pd_request_rejected}\n`;
    output += `Voltage Within Tolerance: ${voltage_within_tolerance}\n`;
    output += `WebUSB Connection: ${webusb_connection}\n`;

    output += `SPR Init PDOs Received: ${spr_init_pdos_received}\n`;
    output += `SPR PS Ready: ${spr_ps_rdy}\n`;
    output += `Non-EPR PS: ${non_epr_ps}\n`;
    output += `EPR Cable Fail: ${epr_cable_fail}\n`;
    output += `Non-EPR PS Ready: ${non_epr_ps_rdy}\n`;
    output += `Non-EPR PS Reject: ${non_epr_ps_reject}\n`;
    output += `EPR Available: ${epr_available}\n`;
    output += `EPR Enter Request: ${epr_enter_request}\n`;
    output += `EPR Enter Request Ack: ${epr_enter_request_ack}\n`;
    output += `EPR Entered: ${epr_entered}\n`;
    output += `EPR Rejected: ${epr_rejected}\n`;
    output += `EPR First PDOs Chunk Received: ${epr_first_pdos_chunk_received}\n`;
    output += `EPR Second PDOs Chunk Received: ${epr_second_pdos_chunk_received}\n`;
    output += `EPR PS Ready: ${epr_ps_rdy}\n`;
    output += 'PDOs:\n';

    for (let i = 0; i < n_pdos_received; i++) {
      const pdo = parsed_pdos[i];
      output += `  PDO ${i + 1} (Raw: ${pdo.raw})\n`;
      output += `    Type: ${pdo.subtype}\n`;
      if (pdo.type === 0) { // Fixed
        output += `    Voltage: ${pdo.voltage_mv} mV\n`;
        output += `    Max Current: ${pdo.max_current_ma} mA\n`;
        output += `    Peak Current: ${pdo.peak_current}\n`;
        output += `    EPR Capable: ${pdo.epr_capable}\n`;
        output += `    Unchunked Extended Messages Supported: ${pdo.unchunked_extended_messages_supported}\n`;
        output += `    Dual Role Data: ${pdo.dual_role_data}\n`;
        output += `    USB Communications Capable: ${pdo.usb_communications_capable}\n`;
        output += `    Unconstrained Power: ${pdo.unconstrained_power}\n`;
        output += `    USB Suspend Supported: ${pdo.usb_suspend_supported}\n`;
        output += `    Dual Role Power: ${pdo.dual_role_power}\n`;
      } else if (pdo.type === 1) { // Battery
        output += `    Min Voltage: ${pdo.min_voltage_mv} mV\n`;
        output += `    Max Voltage: ${pdo.max_voltage_mv} mV\n`;
        output += `    Max Power: ${pdo.max_power_mw} mW\n`;
      } else if (pdo.type === 2) { // Variable
        output += `    Min Voltage: ${pdo.min_voltage_mv} mV\n`;
        output += `    Max Voltage: ${pdo.max_voltage_mv} mV\n`;
        output += `    Max Current: ${pdo.max_current_ma} mA\n`;
      } else if (pdo.type === 3) { // Augmented
        if (pdo.apdo_subtype === 0) { // SPR PPS
          output += `    Min Voltage: ${pdo.min_voltage_mv} mV\n`;
          output += `    Max Voltage: ${pdo.max_voltage_mv} mV\n`;
          output += `    Max Current: ${pdo.max_current_ma} mA\n`;
          output += `    PPS Power Limited: ${pdo.pps_power_limited}\n`;
        } else if (pdo.apdo_subtype === 1) { // EPR AVS
          output += `    Min Voltage: ${pdo.min_voltage_mv} mV\n`;
          output += `    Max Voltage: ${pdo.max_voltage_mv} mV\n`;
          output += `    PDP: ${pdo.pdp_watts} W\n`;
          output += `    Peak Current: ${pdo.peak_current}\n`;
        } else if (pdo.apdo_subtype === 2) { // SPR AVS
          output += `    Max Current (20V): ${pdo.max_current_20v_ma} mA\n`;
          output += `    Max Current (15V): ${pdo.max_current_15v_ma} mA\n`;
          output += `    Peak Current: ${pdo.peak_current}\n`;
        } else if (pdo.apdo_subtype === 3) { // Reserved
          output += `    (No specific fields)\n`;
        }
      }
    }
    output += '--- End PDO Log ---\n';

    return { logData, parsed_pdos, output };
  }
}

return { VFLEX, VFLEX_COMMANDS };

}));