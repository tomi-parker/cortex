#pragma once

// =============================================================================
// Cortex AI — YDlidar X4 / X2 Driver
// =============================================================================
// Supports two YDlidar models:
//   • X4  — 128 000 baud, full-duplex.  Requires both RX and TX lines.
//            Send 0xA5 0x60 to start scanning; 0xA5 0x65 to stop.
//   • X2  — 115 200 baud, simplex (listen-only).  TX pin is not required;
//            the device streams scan packets continuously after power-on.
//
// Both models use the same binary packet format (described below), so the
// parsing state machine is shared between them.
//
// Packet structure (YDlidar point-cloud scan packet):
//   Byte 0    : 0xAA  (start mark byte 1)
//   Byte 1    : 0x55  (start mark byte 2)
//   Byte 2    : packet type  (0x00 = zero-angle, 0x01 = scan data)
//   Byte 3    : sample count (number of distance samples in this packet)
//   Byte 4-5  : start angle (little-endian, unit = 1/64 degree, bit15 = check)
//   Byte 6-7  : end angle   (little-endian, unit = 1/64 degree, bit15 = check)
//   Byte 8-9  : check code  (little-endian XOR of all previous bytes)
//   Byte 10.. : sample data (2 bytes per sample, little-endian, unit = mm)
// =============================================================================

#include "Config.h"

class Lidar {
public:
    // -------------------------------------------------------------------------
    // Public interface
    // -------------------------------------------------------------------------

    Lidar() : _serial(nullptr), _state(DEBUT), _newData(false) {
        for (int i = 0; i < SENSOR_COUNT; i++) {
            distances[i] = 0.0f;
        }
    }

    // begin — store the serial reference; call Serial2.begin() before this.
    void begin(HardwareSerial& serial) {
        _serial = &serial;
        _state  = DEBUT;
        _newData = false;
    }

    // enable — drive the lidar enable pin HIGH and send the start command (X4).
    void enable(int enablePin) {
        pinMode(enablePin, OUTPUT);
        digitalWrite(enablePin, HIGH);

#if defined(LIDAR_X4)
        // X4 requires an explicit start-scan command over the TX line.
        if (_serial) {
            _serial->write(0xA5);
            _serial->write(0x60);
        }
#endif
        // X2 begins streaming automatically; no start command needed.
    }

    // disable — stop the lidar motor and streaming (X4 only).
    void disable(int enablePin) {
        digitalWrite(enablePin, LOW);

#if defined(LIDAR_X4)
        if (_serial) {
            _serial->write(0xA5);
            _serial->write(0x65);
        }
#endif
    }

    // setMotorSpeed — control the lidar scanning motor via PWM (0–100 %).
    // The lidar motor pin should be connected to a MOSFET or PWM-capable pin.
    void setMotorSpeed(int pin, int percent) {
        percent = constrain(percent, 0, 100);
#if defined(ESP32)
        // Map 0-100 % to 0-255 duty cycle on the ledc channel already
        // configured by the motor driver.  For the lidar motor we use a
        // separate analogWrite-compatible call if the pin has been set up.
        analogWrite(pin, map(percent, 0, 100, 0, 255));
#else
        analogWrite(pin, map(percent, 0, 100, 0, 255));
#endif
    }

    // process — feed incoming bytes into the packet parser; call every loop().
    void process() {
        if (!_serial) return;

        while (_serial->available()) {
            uint8_t byte = (uint8_t)_serial->read();
            _parseByte(byte);
        }
    }

    // newDataReady — returns true (once) when a complete scan has been decoded.
    bool newDataReady() {
        if (_newData) {
            _newData = false;
            return true;
        }
        return false;
    }

    // getDistance — returns the distance in mm for the given angle index.
    //   Index 0 → -90°,  1 → -45°,  2 → 0°,  3 → 45°,  4 → 90°
    float getDistance(int angleIndex) const {
        if (angleIndex < 0 || angleIndex >= SENSOR_COUNT) return 0.0f;
        return distances[angleIndex];
    }

    // distances — publicly readable for debug printing.
    float distances[SENSOR_COUNT];

private:
    // -------------------------------------------------------------------------
    // Parser state machine constants
    // -------------------------------------------------------------------------
    enum State {
        DEBUT,      // Waiting for first 0xAA start byte
        START,      // Received 0xAA, waiting for 0x55
        ENTETE,     // Collecting the 8-byte header (type through check code)
        DONNEES,    // Collecting sample distance bytes
        BUG,        // Framing error — skip to next 0xAA
        BUGSUITE    // Recovery: waiting for 0x55 after a BUG 0xAA
    };

    HardwareSerial* _serial;
    State    _state;
    bool     _newData;

    // Raw packet buffer (header bytes only; samples processed on-the-fly)
    uint8_t  _header[8];    // bytes 2–9 of the packet (after the 0xAA 0x55 mark)
    uint8_t  _headerIdx;

    uint8_t  _sampleCount;  // total samples declared in the packet header
    uint8_t  _sampleIdx;    // how many sample bytes we have received so far
    uint8_t  _sampleBuf[2]; // accumulator for the current 2-byte sample word
    uint8_t  _sampleBufIdx;

    float    _startAngle;   // start angle of this packet (degrees)
    float    _endAngle;     // end angle   of this packet (degrees)

    // -------------------------------------------------------------------------
    // _parseByte — advance the state machine with one incoming byte
    // -------------------------------------------------------------------------
    void _parseByte(uint8_t b) {
        switch (_state) {

        case DEBUT:
            if (b == 0xAA) {
                _state = START;
            }
            break;

        case START:
            if (b == 0x55) {
                _headerIdx = 0;
                _state = ENTETE;
            } else if (b == 0xAA) {
                // Stay in START — could be two 0xAA bytes in a row.
            } else {
                _state = DEBUT;
            }
            break;

        case ENTETE:
            _header[_headerIdx++] = b;
            if (_headerIdx == 8) {
                _processHeader();
            }
            break;

        case DONNEES:
            // Each sample is 2 bytes (little-endian, unsigned, unit = mm).
            _sampleBuf[_sampleBufIdx++] = b;
            if (_sampleBufIdx == 2) {
                _processSample();
                _sampleBufIdx = 0;
                _sampleIdx++;
                if (_sampleIdx >= _sampleCount) {
                    _newData = true;
                    _state   = DEBUT;
                }
            }
            break;

        case BUG:
            if (b == 0xAA) _state = BUGSUITE;
            break;

        case BUGSUITE:
            _state = (b == 0x55) ? ENTETE : BUG;
            if (_state == ENTETE) _headerIdx = 0;
            break;
        }
    }

    // -------------------------------------------------------------------------
    // _processHeader — decode the 8-byte header after 0xAA 0x55
    // Header layout (relative, byte 0 = packet byte 2):
    //   [0]   packet type
    //   [1]   sample count
    //   [2-3] start angle (little-endian, 1/64 deg, bit15 stripped)
    //   [4-5] end angle   (little-endian, 1/64 deg, bit15 stripped)
    //   [6-7] check code  (not validated here for speed)
    // -------------------------------------------------------------------------
    void _processHeader() {
        _sampleCount = _header[1];

        uint16_t rawStart = (uint16_t)(_header[2] | (_header[3] << 8));
        uint16_t rawEnd   = (uint16_t)(_header[4] | (_header[5] << 8));

        // Strip the check bit (bit 15) and convert from 1/64 degree units.
        _startAngle = (float)(rawStart & 0x7FFF) / 64.0f;
        _endAngle   = (float)(rawEnd   & 0x7FFF) / 64.0f;

        if (_sampleCount == 0) {
            _state = DEBUT;
            return;
        }

        _sampleIdx    = 0;
        _sampleBufIdx = 0;
        _state        = DONNEES;
    }

    // -------------------------------------------------------------------------
    // _processSample — decode one 2-byte distance sample and store it if the
    // computed angle matches one of our 5 target angles.
    // -------------------------------------------------------------------------
    void _processSample() {
        uint16_t raw = (uint16_t)(_sampleBuf[0] | (_sampleBuf[1] << 8));
        float distMm = (float)raw;  // already in mm

        // Interpolate the angle for this sample within the packet.
        float fraction  = (_sampleCount > 1)
                          ? (float)_sampleIdx / (float)(_sampleCount - 1)
                          : 0.0f;
        float angleDeg  = _startAngle + fraction * (_endAngle - _startAngle);

        // Normalise to [-180, 180] then map to the 5 target angles.
        // The lidar reports angles in [0, 360); we offset so that 0° points
        // forward (straight ahead of the vehicle).
        if (angleDeg > 180.0f) angleDeg -= 360.0f;

        // Check each target angle; accept if within ±5°.
        for (int i = 0; i < SENSOR_COUNT; i++) {
            float diff = angleDeg - (float)LIDAR_ANGLES[i];
            if (fabsf(diff) <= LIDAR_ANGLE_TOLERANCE) {
                // Keep the closest (smallest) reading for this slot.
                if (distMm > 0.0f &&
                    (distances[i] == 0.0f || distMm < distances[i])) {
                    distances[i] = distMm;
                }
                break;
            }
        }
    }
};
