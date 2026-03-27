// =============================================================================
// Cortex AI — Main Firmware
// =============================================================================
// Arduino/ESP32 sketch for the Cortex autonomous vehicle platform.
//
// Hardware summary:
//   • ESP32 (default) or Arduino Due — see Config.h to switch boards
//   • YDlidar X4 or X2 — 360° laser scanner for obstacle detection
//   • Dual DC motor driver — controlled via MotorDriver
//   • Neural network — 5-input, 5-hidden, 2-output (see NeuralNet.h)
//
// Serial debug commands (115200 baud):
//   'd' — print current lidar distances
//   'w' — print neural network weights
//   's' — stop motors immediately
//   'g' — resume autonomous driving
//   'c' — toggle calibration mode (reads lidar without driving)
// =============================================================================

#include "Config.h"
#include "NeuralNet.h"
#include "Lidar.h"
#include "Motor.h"

// =============================================================================
// Global instances
// =============================================================================

NeuralNet   neuralNet;
Lidar       lidar;
MotorDriver motors(MOTOR_A1, MOTOR_A2, MOTOR_B1, MOTOR_B2);

// =============================================================================
// State flags
// =============================================================================

static bool g_driving     = true;   // false when stopped via 's' command
static bool g_calibrating = false;  // true while in calibration mode
static bool g_emergency   = false;  // true while emergency stop is active

// Normalisation ceiling: distances are clamped to this value before dividing.
// 2000 mm (2 m) is a practical range limit for the X4/X2 at normal speeds.
static const float DIST_NORM_MAX = 2000.0f;

// =============================================================================
// Forward declarations
// =============================================================================

void handleSerialCommand(char cmd);
void printDistances();
void emergencyCheck(float sensorValues[SENSOR_COUNT]);
void applyNetworkOutputs(float outputs[2]);

// =============================================================================
// setup
// =============================================================================

void setup() {
    // --- Debug serial ---------------------------------------------------------
    Serial.begin(115200);
    while (!Serial && millis() < 2000) { /* wait up to 2 s for USB CDC */ }
    Serial.println(F("Cortex AI Ready"));

    // --- Lidar serial ---------------------------------------------------------
#if defined(ESP32)
    // UART2 on the pins defined in Config.h
    Serial2.begin(LIDAR_BAUD, SERIAL_8N1, LIDAR_RX_PIN, LIDAR_TX_PIN);
    lidar.begin(Serial2);
#else
    // Arduino Due — use Serial1 (hardware UART on pins 18/19)
    Serial1.begin(LIDAR_BAUD);
    lidar.begin(Serial1);
#endif

    // --- Enable lidar motor and start streaming ----------------------------
    lidar.setMotorSpeed(LIDAR_MOTOR_PIN, 70);   // 70 % is a good default
    lidar.enable(LIDAR_ENABLE_PIN);

    // --- Motor driver ---------------------------------------------------------
    motors.begin(0.04f);   // ramp rate: ~4 % of full scale per loop tick
    motors.stop();

    Serial.println(F("Type 'd'=distances  'w'=weights  's'=stop  'g'=go  'c'=calibrate"));
}

// =============================================================================
// loop
// =============================================================================

void loop() {
    // 1. Feed incoming lidar bytes into the packet parser.
    lidar.process();

    // 2. When a complete scan packet has been decoded, run inference.
    if (lidar.newDataReady()) {

        // --- Build normalised input vector -----------------------------------
        float inputs[SENSOR_COUNT];
        for (int i = 0; i < SENSOR_COUNT; i++) {
            float d = lidar.getDistance(i);
            // 0 from the lidar usually means "no return" — treat as max range.
            if (d <= 0.0f) d = DIST_NORM_MAX;
            inputs[i] = constrain(d / DIST_NORM_MAX, 0.0f, 1.0f);
        }

        // --- Emergency obstacle check ----------------------------------------
        emergencyCheck(inputs);

        // --- Neural network inference ----------------------------------------
        if (g_driving && !g_emergency && !g_calibrating) {
            float outputs[2];
            neuralNet.forward(inputs, outputs);
            applyNetworkOutputs(outputs);
        }
    }

    // 3. Apply acceleration ramp every loop tick.
    motors.update();

    // 4. Handle incoming debug commands.
    while (Serial.available()) {
        char cmd = (char)Serial.read();
        if (cmd != '\r' && cmd != '\n') {
            handleSerialCommand(cmd);
        }
    }
}

// =============================================================================
// emergencyCheck
// =============================================================================
// If any normalised distance is below threshold, trigger an emergency stop.
// The vehicle reverses briefly then halts until the obstacle clears.

void emergencyCheck(float sensorValues[SENSOR_COUNT]) {
    const float normThreshold = (float)MIN_OBSTACLE_DIST / DIST_NORM_MAX;

    bool obstacleDetected = false;
    for (int i = 0; i < SENSOR_COUNT; i++) {
        if (sensorValues[i] < normThreshold) {
            obstacleDetected = true;
            break;
        }
    }

    if (obstacleDetected && !g_emergency) {
        g_emergency = true;
        Serial.println(F("[EMERGENCY] Obstacle detected — stopping"));
        motors.stop();

        // Brief reverse to clear the obstacle (both sides at -30 %).
        motors.setSpeed(-0.3f, -0.3f);
        // The ramp will apply this gradually; after ~50 update() calls the
        // vehicle will have backed away slightly.  Clearing is handled below.
    }

    if (!obstacleDetected && g_emergency) {
        g_emergency = false;
        Serial.println(F("[CLEAR] Obstacle cleared — resuming"));
        motors.stop();
    }
}

// =============================================================================
// applyNetworkOutputs
// =============================================================================
// Map the two sigmoid outputs [0, 1] to normalised motor speeds [-1, 1].
// The network is trained to output 0.5 for "no motion" on each side, so
// we shift and scale:  motorSpeed = (output - 0.5) * 2.0

void applyNetworkOutputs(float outputs[2]) {
    float leftSpeed  = (outputs[0] - 0.5f) * 2.0f;
    float rightSpeed = (outputs[1] - 0.5f) * 2.0f;

    // Clamp to safe range (the math already gives [-1, 1] but be safe).
    leftSpeed  = constrain(leftSpeed,  -1.0f, 1.0f);
    rightSpeed = constrain(rightSpeed, -1.0f, 1.0f);

    motors.setSpeed(leftSpeed, rightSpeed);
}

// =============================================================================
// handleSerialCommand
// =============================================================================

void handleSerialCommand(char cmd) {
    switch (cmd) {

    case 'd':
        printDistances();
        break;

    case 'w':
        neuralNet.printWeights();
        break;

    case 's':
        g_driving = false;
        motors.stop();
        Serial.println(F("[CMD] Motors stopped."));
        break;

    case 'g':
        g_driving   = true;
        g_emergency = false;
        g_calibrating = false;
        Serial.println(F("[CMD] Autonomous driving resumed."));
        break;

    case 'c':
        g_calibrating = !g_calibrating;
        if (g_calibrating) {
            motors.stop();
            Serial.println(F("[CALIBRATE] Entered calibration mode — motors off."));
            Serial.println(F("  Rotate vehicle manually; distances will update."));
        } else {
            Serial.println(F("[CALIBRATE] Exited calibration mode."));
        }
        break;

    default:
        Serial.print(F("[CMD] Unknown command: "));
        Serial.println(cmd);
        break;
    }
}

// =============================================================================
// printDistances
// =============================================================================

void printDistances() {
    Serial.println(F("-- Lidar distances --"));
    const char* labels[SENSOR_COUNT] = { "-90°", "-45°", "  0°", " 45°", " 90°" };
    for (int i = 0; i < SENSOR_COUNT; i++) {
        Serial.print(F("  "));
        Serial.print(labels[i]);
        Serial.print(F(" : "));
        float d = lidar.getDistance(i);
        if (d <= 0.0f) {
            Serial.println(F("no return"));
        } else {
            Serial.print(d, 0);
            Serial.println(F(" mm"));
        }
    }
}
