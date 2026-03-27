#pragma once

// =============================================================================
// Cortex AI Autonomous Vehicle — Board & Hardware Configuration
// =============================================================================
// Select the target board by uncommenting the appropriate line below.
// Only one board definition may be active at a time.

#define ESP32
// #define Due

// =============================================================================
// Pin Definitions
// =============================================================================

#if defined(ESP32)

// --- Motor driver pins (ESP32) ------------------------------------------------
#define MOTOR_A1  25
#define MOTOR_A2  26
#define MOTOR_B1  27
#define MOTOR_B2  14

// --- Lidar pins (ESP32) -------------------------------------------------------
// RX/TX for hardware serial — UART2
#define LIDAR_RX_PIN  16
#define LIDAR_TX_PIN  17
// PWM pin to control the lidar motor speed
#define LIDAR_MOTOR_PIN  4
// Enable pin to power the lidar (active HIGH)
#define LIDAR_ENABLE_PIN  5

#elif defined(Due)

// --- Motor driver pins (Arduino Due) -----------------------------------------
#define MOTOR_A1  2
#define MOTOR_A2  3
#define MOTOR_B1  4
#define MOTOR_B2  5

// --- Lidar pins (Arduino Due) -------------------------------------------------
// Serial1 is used on the Due (pins 18/19); TX is not needed for X2.
#define LIDAR_MOTOR_PIN  6
#define LIDAR_ENABLE_PIN  7

#else
#error "No board selected. Define either ESP32 or Due in Config.h."
#endif

// =============================================================================
// Motor Driver Type
// =============================================================================
// VARIADIRPWM : direction pin + PWM speed pin per side
// VARIAA1A2   : two PWM pins per side (A1/A2 style H-bridge)
//
// Uncomment the driver type that matches your hardware.

// #define VARIADIRPWM
#define VARIAA1A2

// =============================================================================
// Lidar Type
// =============================================================================
// LIDAR_X4 : YDlidar X4  — 128000 baud, full-duplex (TX required)
// LIDAR_X2 : YDlidar X2  — 115200 baud, TX pin not needed (listen-only)

#define LIDAR_X4
// #define LIDAR_X2

#if defined(LIDAR_X4)
  #define LIDAR_BAUD 128000
#elif defined(LIDAR_X2)
  #define LIDAR_BAUD 115200
#else
  #error "No lidar type selected. Define LIDAR_X4 or LIDAR_X2 in Config.h."
#endif

// =============================================================================
// General Constants
// =============================================================================

// Maximum PWM value sent to the motor driver (0–255 range)
#define MOTOR_MAX_SPEED 255

// Minimum safe distance in millimetres — triggers emergency stop below this
#define MIN_OBSTACLE_DIST 150

// Number of lidar scan angles sampled by the neural network
#define SENSOR_COUNT 5

// Timeout (ms) to wait for USB CDC enumeration on native-USB boards
// (Arduino Due in native-USB mode, ESP32 with USB CDC enabled).
// The sketch continues after this delay even if no host has connected.
#define SERIAL_TIMEOUT_MS 2000

// Angular tolerance (degrees) for matching a full-360 scan angle to one of the
// 5 desired sensor directions. Increase if a sensor angle is never populated.
#define LIDAR_ANGLE_TOLERANCE 5.0f

// The five lidar angles (degrees) sampled from the full 360° scan.
// Index:  0     1     2    3    4
// Angle: -90°  -45°   0°  45°  90°
const int LIDAR_ANGLES[SENSOR_COUNT] = { -90, -45, 0, 45, 90 };

// =============================================================================
// Neural Network Architecture
// =============================================================================
// Topology: 5 inputs → 5 hidden neurons → 2 outputs
//   Inputs  : normalised distances from the 5 lidar angles above
//   Outputs : [left motor speed, right motor speed] in range [0, 1]
//
// The weight values below are placeholders.  Replace them with the exported
// arrays from model_converter.js after training in the simulation.

// --- Input → Hidden weights [hidden][input] -----------------------------------
const float NN_WEIGHTS_1[5][5] = {
    { 0.0f, 0.0f, 0.0f, 0.0f, 0.0f },
    { 0.0f, 0.0f, 0.0f, 0.0f, 0.0f },
    { 0.0f, 0.0f, 0.0f, 0.0f, 0.0f },
    { 0.0f, 0.0f, 0.0f, 0.0f, 0.0f },
    { 0.0f, 0.0f, 0.0f, 0.0f, 0.0f }
};

// --- Hidden layer biases [hidden] --------------------------------------------
const float NN_BIAS_1[5] = { 0.0f, 0.0f, 0.0f, 0.0f, 0.0f };

// --- Hidden → Output weights [output][hidden] --------------------------------
const float NN_WEIGHTS_2[2][5] = {
    { 0.0f, 0.0f, 0.0f, 0.0f, 0.0f },
    { 0.0f, 0.0f, 0.0f, 0.0f, 0.0f }
};

// --- Output layer biases [output] --------------------------------------------
const float NN_BIAS_2[2] = { 0.0f, 0.0f };
