# Hardware Guide

Complete guide for building the Cortex autonomous vehicle: bill of materials, wiring, 3D printing, and assembly.

---

## Table of Contents

1. [Bill of Materials](#bill-of-materials)
2. [Wiring Overview](#wiring-overview)
3. [ESP32 DEVKIT V1 Pin Connections](#esp32-devkit-v1-pin-connections)
4. [Arduino Due Pin Connections](#arduino-due-pin-connections)
5. [Lidar Connections](#lidar-connections)
6. [Motor Driver Wiring](#motor-driver-wiring)
7. [Power Supply Setup](#power-supply-setup)
8. [3D Printing Instructions](#3d-printing-instructions)
9. [Assembly Order](#assembly-order)
10. [First Power-On Checklist](#first-power-on-checklist)

---

## Bill of Materials

| # | Component | Specification | Est. Price (€) |
|---|-----------|--------------|----------------|
| 1 | **Microcontroller** | ESP32 DEVKIT V1 (30-pin) | 5–8 |
| — | *or alternative* | Arduino Due (84 MHz ARM Cortex-M3) | 30–40 |
| 2 | **Lidar scanner** | YDlidar X4 (360°, 128 000 baud) | 60–80 |
| — | *or alternative* | YDlidar X2 (360°, 115 200 baud) | 35–50 |
| 3 | **Motor driver** | TB6612FNG dual H-bridge module | 3–6 |
| — | *or alternative* | DRV8833 dual H-bridge module | 2–4 |
| — | *or alternative* | Arduino motor shield (Due only) | 10–15 |
| 4 | **DC-DC converter** | LM2596 step-down module (adj. or 5 V fixed) | 2–4 |
| 5 | **DC geared motors** | 2× N20 or similar (3 V–6 V) with wheels | 6–10 |
| 6 | **Battery** | 7.4 V 2S LiPo 500–1000 mAh | 8–15 |
| 7 | **Battery connector** | XT30 or JST-XH 2S | 1–2 |
| 8 | **Chassis** | 3D printed — `CAO/chassis.stl` | filament |
| 9 | **Skids (×2)** | 3D printed — `CAO/patin.stl` | filament |
| 10 | **Screws & standoffs** | M2 × 6 mm, M3 × 8 mm | 2–3 |
| 11 | **Jumper wires** | Male-female 20 cm | 2 |
| — | *optional* | Custom PCB (KiCad files available) | — |

**Total (ESP32 + X4 option): ≈ €90–130**

---

## Wiring Overview

The full wiring diagram is at `Images/schema.png`.

```
Battery (7.4 V)
    │
    ├──► LM2596 module ──► 5 V ──► Lidar VCC
    │                    └──► GND
    │
    ├──► Motor driver VM (battery voltage direct)
    │
    └──► ESP32 / Arduino Due VIN (from battery via diode or driver VCC)
```

Key rules:
- **Never power the lidar from the Arduino's onboard 5 V regulator** — the X4 draws up to 500 mA, which exceeds the regulator's rating.
- The motor driver's logic VCC (3.3 V) is supplied from the microcontroller.
- All grounds must be common (battery GND = ESP32 GND = driver GND = lidar GND).

---

## ESP32 DEVKIT V1 Pin Connections

Reference pinout: `Images/ESP32-Pinout.jpg`

### Lidar (YDlidar X4 / X2)

| ESP32 Pin | GPIO | Lidar Signal | Notes |
|-----------|------|-------------|-------|
| RX2 | GPIO 16 | TX (lidar data out) | UART2 receive |
| TX2 | GPIO 17 | RX (lidar data in) | X4 only; leave unconnected for X2 |
| GPIO 4 | 4 | M_SCTR (motor speed PWM) | Controls scan speed |
| GPIO 5 | 5 | M_EN (motor enable) | Active HIGH |

> Config.h defines: `LIDAR_RX_PIN 16`, `LIDAR_TX_PIN 17`, `LIDAR_MOTOR_PIN 4`, `LIDAR_ENABLE_PIN 5`

### Motor Driver (TB6612 / DRV8833)

| ESP32 Pin | GPIO | Driver Signal | Motor |
|-----------|------|--------------|-------|
| — | GPIO 25 | APWM / AIN2 (DRV8833) | Left motor speed |
| — | GPIO 26 | AIN1 | Left motor direction |
| — | GPIO 27 | BPWM / BIN2 (DRV8833) | Right motor speed |
| — | GPIO 14 | BIN1 | Right motor direction |

> Config.h defines: `MOTOR_A1 25`, `MOTOR_A2 26`, `MOTOR_B1 27`, `MOTOR_B2 14`

### Power

| ESP32 Pin | Connection |
|-----------|-----------|
| 3.3 V | Driver logic VCC (STBY pull-up for TB6612) |
| GND | Common ground |
| VIN | 5 V from LM2596 (or use USB only for bench testing) |

---

## Arduino Due Pin Connections

### Lidar (YDlidar X4 / X2)

| Due Pin | Signal | Notes |
|---------|--------|-------|
| RX1 (pin 19) | Lidar TX | Hardware Serial1 |
| TX1 (pin 18) | Lidar RX | X4 only; NC for X2 |
| D6 | M_SCTR | Lidar motor speed |
| D7 | M_EN | Lidar enable |

> **Serial buffer:** Increase to 512 bytes to avoid overflow with the X2's continuous data stream.  
> File: `…\packages\arduino\hardware\sam\1.6.12\cores\arduino\RingBuffer.h`  
> Change `#define SERIAL_BUFFER_SIZE 64` to `#define SERIAL_BUFFER_SIZE 512`

### Motor Driver (TB6612 / DRV8833)

| Due Pin | Signal | Motor |
|---------|--------|-------|
| D2 | MOTOR_A1 | Left motor |
| D3 | MOTOR_A2 | Left motor |
| D4 | MOTOR_B1 | Right motor |
| D5 | MOTOR_B2 | Right motor |

### Power

| Due Pin | Connection |
|---------|-----------|
| 3.3 V | Driver logic VCC |
| GND | Common ground |
| VIN | 7–12 V from battery (via LM2596 recommended) |

---

## Lidar Connections

### YDlidar X4 — 128 000 baud

```
Lidar X4          ESP32 / Due
──────────────────────────────
VCC (5 V) ──────► LM2596 5V output
GND       ──────► GND
TX        ──────► RX2 (GPIO16) / RX1 (pin19)
RX        ──────► TX2 (GPIO17) / TX1 (pin18)
M_SCTR    ──────► GPIO4 / D6      (PWM motor speed)
M_EN      ──────► GPIO5 / D7      (active HIGH enable)
```

The X4's motor speed (`M_SCTR`) accepts a 0–3.3 V PWM signal. The firmware sets it to a fixed duty cycle at startup to maintain the rated 7 Hz rotation speed.

Reference: `Images/connection X4.png`

### YDlidar X2 — 115 200 baud

```
Lidar X2          ESP32 / Due
──────────────────────────────
VCC (5 V) ──────► LM2596 5V output
GND       ──────► GND
TX        ──────► RX2 (GPIO16) / RX1 (pin19)
RX        ──────  Not connected (listen-only)
M_SCTR    ──────► GPIO4 / D6      (PWM motor speed)
```

The X2 does not require an enable pin. The `LIDAR_ENABLE_PIN` definition in `Config.h` is unused when `LIDAR_X2` is selected.

Reference: `Images/connection X2.png`

---

## Motor Driver Wiring

### TB6612FNG

```
TB6612            ESP32 (GPIO) / Due (Pin)
──────────────────────────────────────────
PWMA  ──────────► GPIO25 / D2   (left  PWM speed)
AIN1  ──────────► GPIO26 / D3   (left  direction)
AIN2  ────────── Not used for TB6612 (direction is single-pin)
PWMB  ──────────► GPIO27 / D4   (right PWM speed)
BIN1  ──────────► GPIO14 / D5   (right direction)
STBY  ──────────► 3.3 V          (always enabled)
VM    ──────────► Battery+        (motor power)
VCC   ──────────► 3.3 V          (logic power)
GND   ──────────► GND
AO+/AO-          Left  motor terminals
BO+/BO-          Right motor terminals
```

> Set `#define VARIADIRPWM` in `Config.h` when using TB6612.

### DRV8833

```
DRV8833           ESP32 (GPIO) / Due (Pin)
──────────────────────────────────────────
AIN2 (PWM) ─────► GPIO25 / D2   (left  PWM speed)
AIN1       ─────► GPIO26 / D3   (left  direction)
BIN2 (PWM) ─────► GPIO27 / D4   (right PWM speed)
BIN1       ─────► GPIO14 / D5   (right direction)
VM         ─────► Battery+
GND        ─────► GND
AOUT1/AOUT2      Left  motor terminals
BOUT1/BOUT2      Right motor terminals
```

> Set `#define VARIAA1A2` in `Config.h` when using DRV8833.

---

## Power Supply Setup

### LM2596 step-down module

1. Connect **VIN+** to battery positive, **VIN−** to battery negative.
2. **Adjust the potentiometer** until **VOUT = 5.0 V** (measure with a multimeter before connecting the lidar).
3. Connect **VOUT+** to lidar VCC and the microcontroller's 5 V rail (if powering via VIN).
4. Connect **VOUT−** to common ground.

### Power budget (approximate)

| Component | Current |
|-----------|---------|
| YDlidar X4 | 400–500 mA at 5 V |
| ESP32 | 80–240 mA at 3.3 V |
| 2× DC motors (stall) | 200–600 mA each at battery voltage |
| TB6612 logic | < 10 mA |

A 7.4 V 1000 mAh LiPo provides roughly **10–15 minutes** of runtime at moderate speed.

### Recommended fusing

Add a 3 A automotive blade fuse in series with the battery positive lead to protect against shorts.

---

## 3D Printing Instructions

All STL files are in the `CAO/` directory.

### Files

| File | Part | Notes |
|------|------|-------|
| `chassis.stl` | Main chassis | Fits ESP32 DEVKIT V1 (30-pin) by default |
| `patin.stl` | Rear skid (×2) | Prints flat; print two copies |

### Recommended settings

| Parameter | Value |
|-----------|-------|
| Material | PLA (or PETG for added rigidity) |
| Layer height | 0.2 mm |
| Infill | 20–30 % (gyroid or grid) |
| Supports | Yes for chassis (motor mounts overhang) |
| Print orientation | Chassis flat on bed |
| Nozzle | 0.4 mm |
| Bed temp | 60 °C (PLA) |
| Nozzle temp | 210 °C (PLA) |

### Post-processing

- Remove supports carefully around motor mounts and lidar platform.
- Test-fit the ESP32 before mounting any electronics — the header slots should grip the board firmly.
- If using an Arduino Due instead of ESP32, **trim the ESP32 standoff pillars** with flush cutters.

---

## Assembly Order

Follow this order to avoid needing to disassemble:

1. **Print all parts** and remove supports.
2. **Press-fit the motors** into the chassis motor bays.
3. **Attach wheels** to motor shafts (set screw or friction fit).
4. **Mount the skids** at the rear (two M2 screws each).
5. **Install the LM2596 module** and adjust to 5 V (do this before mounting to avoid accidental shorts later).
6. **Wire the motor driver** — solder motor leads, connect to driver output terminals.
7. **Mount the motor driver** on the chassis with M2 standoffs.
8. **Seat the ESP32** (or Due) into the chassis slot.
9. **Wire the microcontroller** to the motor driver per the pin table above.
10. **Mount the lidar** on the lidar platform using the four M2 holes.
11. **Connect the lidar** to the LM2596 5 V output and to the microcontroller serial/GPIO pins.
12. **Install the battery holder** and connect via the LM2596 input.
13. **Route and secure all wires** with cable ties so they do not contact wheels.
14. Perform the **First Power-On Checklist** below before loading firmware.

---

## First Power-On Checklist

Complete each step **before** loading the trained model firmware.

- [ ] **Multimeter check**: LM2596 output = 5.0 V ± 0.1 V (load test with lidar connected)
- [ ] **Motor polarity**: upload a test sketch that spins both motors forward; verify both wheels rotate in the correct direction (if not, swap the motor terminal wires, not the firmware pins)
- [ ] **Serial monitor**: set baud rate to 115 200 and verify the ESP32 prints boot messages
- [ ] **Lidar spin-up**: send command `'c'` in Serial Monitor (calibration mode); verify distance readings appear and are plausible (~ room dimensions in mm)
- [ ] **Emergency stop**: send `'s'` — motors stop; send `'g'` — autonomous driving resumes
- [ ] **Weight arrays**: confirm `Config.h` contains the trained (non-zero) weight arrays from `model_converter.js`
- [ ] **Test drive**: place the vehicle on the track and power on — it should navigate without immediate collision

Serial debug commands (115 200 baud):

| Command | Effect |
|---------|--------|
| `d` | Print current 5 lidar distances (mm) |
| `w` | Print all neural network weights |
| `s` | Emergency stop |
| `g` | Resume autonomous driving |
| `c` | Toggle calibration mode (lidar only, motors off) |
