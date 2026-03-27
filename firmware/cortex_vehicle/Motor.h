#pragma once

// =============================================================================
// Cortex AI — Dual Motor Driver with Acceleration Ramp
// =============================================================================
// Supports two wiring styles selected in Config.h:
//
//   VARIADIRPWM  — One direction pin + one PWM speed pin per side.
//                  Direction pin: HIGH = forward, LOW = reverse.
//                  Speed pin:     duty cycle 0–255.
//
//   VARIAA1A2    — Two PWM pins per side (H-bridge A1/A2 style).
//                  Forward  : A1 = speed, A2 = 0
//                  Reverse  : A1 = 0,     A2 = speed
//                  Brake    : A1 = 0,     A2 = 0
//
// On ESP32 the ledc peripheral is used; on Arduino Due analogWrite() is used.
// =============================================================================

#include "Config.h"

// =============================================================================
// ESP32 ledc helpers
// =============================================================================
#if defined(ESP32)

// ledc channel assignments (0 and 1 are free; others may clash with Serial).
#define LEDC_CHAN_A1  0
#define LEDC_CHAN_A2  1
#define LEDC_CHAN_B1  2
#define LEDC_CHAN_B2  3
#define LEDC_FREQ     5000   // Hz
#define LEDC_BITS     8      // 8-bit resolution → 0–255

static inline void _ledcSetup4(int pinA1, int pinA2, int pinB1, int pinB2) {
#if defined(VARIADIRPWM)
    // In DIR+PWM mode, A1/B1 are direction pins (digital only) — do NOT attach
    // them to LEDC channels, or digitalWrite will not work on them.
    ledcSetup(LEDC_CHAN_A2, LEDC_FREQ, LEDC_BITS);
    ledcSetup(LEDC_CHAN_B2, LEDC_FREQ, LEDC_BITS);
    ledcAttachPin(pinA2, LEDC_CHAN_A2);
    ledcAttachPin(pinB2, LEDC_CHAN_B2);
    pinMode(pinA1, OUTPUT);
    pinMode(pinB1, OUTPUT);
#else
    ledcSetup(LEDC_CHAN_A1, LEDC_FREQ, LEDC_BITS);
    ledcSetup(LEDC_CHAN_A2, LEDC_FREQ, LEDC_BITS);
    ledcSetup(LEDC_CHAN_B1, LEDC_FREQ, LEDC_BITS);
    ledcSetup(LEDC_CHAN_B2, LEDC_FREQ, LEDC_BITS);
    ledcAttachPin(pinA1, LEDC_CHAN_A1);
    ledcAttachPin(pinA2, LEDC_CHAN_A2);
    ledcAttachPin(pinB1, LEDC_CHAN_B1);
    ledcAttachPin(pinB2, LEDC_CHAN_B2);
#endif
}

// Write a duty cycle (0–255) to a pin via its ledc channel.
static inline void _pwmWrite(int channel, int duty) {
    ledcWrite(channel, constrain(duty, 0, 255));
}

#else // Arduino Due

static inline void _ledcSetup4(int pinA1, int pinA2, int pinB1, int pinB2) {
    pinMode(pinA1, OUTPUT);
    pinMode(pinA2, OUTPUT);
    pinMode(pinB1, OUTPUT);
    pinMode(pinB2, OUTPUT);
}

// On the Due analogWrite() maps directly to the pin; channel is unused.
static inline void _pwmWrite(int pin, int duty) {
    analogWrite(pin, constrain(duty, 0, 255));
}

#endif

// =============================================================================
// MotorDriver — controls two DC motors with a software acceleration ramp
// =============================================================================
class MotorDriver {
public:
    // -------------------------------------------------------------------------
    // Constructor
    //   pinA1 / pinA2 — left  motor H-bridge pins
    //   pinB1 / pinB2 — right motor H-bridge pins
    // For VARIADIRPWM: pinA1 = direction, pinA2 = PWM (same for B side).
    // -------------------------------------------------------------------------
    MotorDriver(int pinA1, int pinA2, int pinB1, int pinB2)
        : _pinA1(pinA1), _pinA2(pinA2),
          _pinB1(pinB1), _pinB2(pinB2),
          _targetLeft(0.0f),  _currentLeft(0.0f),
          _targetRight(0.0f), _currentRight(0.0f),
          _rampRate(0.05f) {}

    // -------------------------------------------------------------------------
    // begin — configure pins and PWM channels.
    //   rampRate : fractional change applied per update() call (0.0–1.0).
    //              Lower values = smoother / slower acceleration.
    //              Default is 0.05 (5 % of full range per tick).
    // -------------------------------------------------------------------------
    void begin(float rampRate = 0.05f) {
        _rampRate = constrain(rampRate, 0.001f, 1.0f);

#if defined(ESP32)
        _ledcSetup4(_pinA1, _pinA2, _pinB1, _pinB2);
#else
        _ledcSetup4(_pinA1, _pinA2, _pinB1, _pinB2);
#endif
        stop();
    }

    // -------------------------------------------------------------------------
    // setSpeed — set target speeds as normalised values in [-1.0, 1.0].
    //   +1.0 = full forward,  -1.0 = full reverse,  0.0 = stop.
    //   The actual PWM is ramped toward these targets in update().
    // -------------------------------------------------------------------------
    void setSpeed(float leftNorm, float rightNorm) {
        _targetLeft  = constrain(leftNorm,  -1.0f, 1.0f);
        _targetRight = constrain(rightNorm, -1.0f, 1.0f);
    }

    // -------------------------------------------------------------------------
    // update — advance the acceleration ramp one step; call every loop().
    // -------------------------------------------------------------------------
    void update() {
        _currentLeft  = _rampToward(_currentLeft,  _targetLeft);
        _currentRight = _rampToward(_currentRight, _targetRight);
        _applyLeft (_currentLeft);
        _applyRight(_currentRight);
    }

    // -------------------------------------------------------------------------
    // stop — immediately cut power to both motors (target AND current = 0).
    // -------------------------------------------------------------------------
    void stop() {
        _targetLeft = _targetRight = 0.0f;
        _currentLeft = _currentRight = 0.0f;
        _applyLeft(0.0f);
        _applyRight(0.0f);
    }

    // -------------------------------------------------------------------------
    // brake — set both pins LOW (passive brake / coast depending on driver).
    // -------------------------------------------------------------------------
    void brake() {
        _targetLeft = _targetRight = 0.0f;
        _currentLeft = _currentRight = 0.0f;
#if defined(ESP32)
        _pwmWrite(LEDC_CHAN_A1, 0);
        _pwmWrite(LEDC_CHAN_A2, 0);
        _pwmWrite(LEDC_CHAN_B1, 0);
        _pwmWrite(LEDC_CHAN_B2, 0);
#else
        digitalWrite(_pinA1, LOW);
        digitalWrite(_pinA2, LOW);
        digitalWrite(_pinB1, LOW);
        digitalWrite(_pinB2, LOW);
#endif
    }

    // Convenience getters for current speed (useful for telemetry).
    float currentLeft()  const { return _currentLeft;  }
    float currentRight() const { return _currentRight; }

private:
    int   _pinA1, _pinA2, _pinB1, _pinB2;
    float _targetLeft,  _currentLeft;
    float _targetRight, _currentRight;
    float _rampRate;

    // Move current value one ramp step toward target.
    float _rampToward(float current, float target) const {
        float diff = target - current;
        if (fabsf(diff) <= _rampRate) return target;
        return current + (diff > 0 ? _rampRate : -_rampRate);
    }

    // Apply a normalised speed [-1, 1] to the left motor pins.
    void _applyLeft(float norm) {
        int duty = (int)(fabsf(norm) * MOTOR_MAX_SPEED);
        duty = constrain(duty, 0, MOTOR_MAX_SPEED);

#if defined(VARIADIRPWM)
        // pinA1 = direction (digital only), pinA2 = PWM speed
        // On ESP32 the direction pin must NOT be ledc-attached; use digitalWrite.
  #if defined(ESP32)
        digitalWrite(_pinA1, norm >= 0 ? HIGH : LOW);
        _pwmWrite(LEDC_CHAN_A2, duty);
  #else
        digitalWrite(_pinA1, norm >= 0 ? HIGH : LOW);
        analogWrite(_pinA2, duty);
  #endif

#elif defined(VARIAA1A2)
        // pinA1 & pinA2 are both PWM; one carries speed, other stays 0.
  #if defined(ESP32)
        if (norm >= 0) {
            _pwmWrite(LEDC_CHAN_A1, duty);
            _pwmWrite(LEDC_CHAN_A2, 0);
        } else {
            _pwmWrite(LEDC_CHAN_A1, 0);
            _pwmWrite(LEDC_CHAN_A2, duty);
        }
  #else
        if (norm >= 0) {
            analogWrite(_pinA1, duty);
            analogWrite(_pinA2, 0);
        } else {
            analogWrite(_pinA1, 0);
            analogWrite(_pinA2, duty);
        }
  #endif
#endif
    }

    // Apply a normalised speed [-1, 1] to the right motor pins.
    void _applyRight(float norm) {
        int duty = (int)(fabsf(norm) * MOTOR_MAX_SPEED);
        duty = constrain(duty, 0, MOTOR_MAX_SPEED);

#if defined(VARIADIRPWM)
  #if defined(ESP32)
        digitalWrite(_pinB1, norm >= 0 ? HIGH : LOW);
        _pwmWrite(LEDC_CHAN_B2, duty);
  #else
        digitalWrite(_pinB1, norm >= 0 ? HIGH : LOW);
        analogWrite(_pinB2, duty);
  #endif

#elif defined(VARIAA1A2)
  #if defined(ESP32)
        if (norm >= 0) {
            _pwmWrite(LEDC_CHAN_B1, duty);
            _pwmWrite(LEDC_CHAN_B2, 0);
        } else {
            _pwmWrite(LEDC_CHAN_B1, 0);
            _pwmWrite(LEDC_CHAN_B2, duty);
        }
  #else
        if (norm >= 0) {
            analogWrite(_pinB1, duty);
            analogWrite(_pinB2, 0);
        } else {
            analogWrite(_pinB1, 0);
            analogWrite(_pinB2, duty);
        }
  #endif
#endif
    }
};
