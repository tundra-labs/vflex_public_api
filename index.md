---
title: lib.vflex Documentation
layout: default
nav_order: 1
has_children: true
---

# lib.vflex Documentation

[Configuration Tool](vflex-tool.html){: .btn .btn-primary .mr-2 }
[Debug Tool](vflex-debug.html){: .btn .mr-2 }
[Source Code](https://github.com/tundra-labs/lib.vflex){: .btn .mr-2 }

## What is VFLEX?

VFLEX is a universal USB-C power adapter that converts any USB-C Power Delivery charger into a configurable power solution. Set the exact voltage your device needs, plug into a USB-C PD charger or power bank, and power everything from legacy electronics to modern gear. It supports standard (SPR) and extended (EPR) power ranges, including PPS and AVS modes.

## Get the hardware

The **VFLEX Base** is available for $8.00 USD from Werewolf.

[Buy VFLEX Base](https://werewolf.us/products/vflex-base){: .btn .btn-primary .mr-2 }
[Datasheet](https://werewolf.us/vflex/base/datasheet){: .btn .mr-2 }
[User Manual](https://werewolf.us/vflex/user-manual){: .btn .mr-2 }

## About this library

`lib.vflex.js` is a JavaScript library for communicating with the VFLEX device over MIDI using the Web MIDI API. It provides a high-level API for connection management, the custom framing protocol, and command/response parsing — allowing you to configure voltage, current, and read device diagnostics directly from a browser.
