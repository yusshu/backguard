#include <WiFi.h>
#include <WebSocketsClient.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <Arduino.h>
#include <Bonezegei_DHT11.h>
#include "esp_system.h"
#include <ESP32Servo.h>

#define RELAY_SLOW   25
#define RELAY_MEDIUM 26
#define RELAY_FAST   27
#define AMBIENT_PIN  14
#define SERVO_PIN    33

#define AMBIENT_READ_INTERVAL 2000  // read ambient data every 2 seconds

// device default wifi ssid and password
const char* DEFAULT_SSID = "FAN-AP";
const char* DEFAULT_PASSWORD = "fanpassword";

const char* DEVICE_SECRET = "PExZRJi88l";

enum FanSpeed { FAN_OFF, FAN_SLOW, FAN_MEDIUM, FAN_FAST };


Servo rotationServo;
FanSpeed currentSpeed = FAN_OFF;
bool currentRotates = false;
Bonezegei_DHT11 dht(AMBIENT_PIN);

void initializeFan() {
  pinMode(RELAY_SLOW, OUTPUT);
  pinMode(RELAY_MEDIUM, OUTPUT);
  pinMode(RELAY_FAST, OUTPUT);

  digitalWrite(RELAY_SLOW, LOW);
  digitalWrite(RELAY_MEDIUM, LOW);
  digitalWrite(RELAY_FAST, LOW);
  
  currentSpeed = FAN_OFF;
}

void setFanSpeed(FanSpeed speed) {
  digitalWrite(RELAY_SLOW, LOW);
  digitalWrite(RELAY_MEDIUM, LOW);
  digitalWrite(RELAY_FAST, LOW);
  switch (speed) {
    case FAN_SLOW:   digitalWrite(RELAY_SLOW, HIGH); break;
    case FAN_MEDIUM: digitalWrite(RELAY_MEDIUM, HIGH); break;
    case FAN_FAST:   digitalWrite(RELAY_FAST, HIGH); break;
    default: break;
  }
  currentSpeed = speed;
}

void setRotates(bool rotates) {
  if (rotates) {
    rotationServo.write(0);
  } else {
    rotationServo.write(90);
  }
  currentRotates = rotates;
}

const char* speedToString() {
  switch (currentSpeed) {
    case FAN_SLOW: return "slow";
    case FAN_MEDIUM: return "medium";
    case FAN_FAST: return "fast";
    default: return "off";
  }
}

Preferences preferences;
String wifiSSID;
String wifiPassword;

// wifi connection
void useNewWiFi(String newSSID, String newPassword, String defaultSsid, String defaultPassword) {
  saveWiFiToNVS(newSSID, newPassword);
  wifiSSID = newSSID;
  wifiPassword = newPassword;
  beginWiFi(defaultSsid, defaultPassword);
}

void beginWiFi(String defaultSsid, String defaultPassword) {
  loadWiFiFromNVS(defaultSsid, defaultPassword);

  Serial.print("[sdevice] connecting to wifi: ");
  Serial.println(wifiSSID);

  WiFi.disconnect(true);
  delay(500);

  WiFi.begin(wifiSSID.c_str(), wifiPassword.c_str());

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[sdevice] wifi connected");
    Serial.print("[sdevice] IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n[sdevice] wifi failed, falling back to default");
    wifiSSID = DEFAULT_SSID;
    wifiPassword = DEFAULT_PASSWORD;
    WiFi.begin(wifiSSID.c_str(), wifiPassword.c_str());
  }
}

void ensureWiFiConnected() {
  if (WiFi.status() == WL_CONNECTED)
    return;

  Serial.println("[sdevice] wifi disconnected, reconnecting...");
  WiFi.disconnect(true);
  delay(500);
  WiFi.begin();

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[sdevice] wifi reconnected!");
    Serial.print("[sdevice] IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n[sdevice] wifi reconnection failed, will retry again...");
  }
}

// wifi information storage
void loadWiFiFromNVS(String defaultSsid, String defaultPassword) {
  preferences.begin("wifi", true);
  wifiSSID = preferences.getString("ssid", "");
  wifiPassword = preferences.getString("password", "");
  preferences.end();

  if (wifiSSID.length() == 0) {
    wifiSSID = defaultSsid;
    wifiPassword = defaultPassword;
  }
}

void saveWiFiToNVS(const String &ssid, const String &password) {
  preferences.begin("wifi", false);
  preferences.putString("ssid", ssid);
  preferences.putString("password", password);
  preferences.end();
}

WebSocketsClient ws;

const char *WS_HOST = "148.113.174.2";
const uint16_t WS_PORT = 6969;
const char *WS_PATH = "/";

void sendStatus() {
  ws.sendTXT(String("STATUS ") + speedToString());
}

void sendRotates() {
  ws.sendTXT(String("ROTATES ") + (currentRotates ? "true" : "false"));
}

void sendHandshake() {
  String deviceId = getDeviceId();
  Serial.print("[ws] sending handshake as ");
  Serial.println(deviceId);
  String msg = "HELLO fan " + deviceId + " " + DEVICE_SECRET;
  ws.sendTXT(msg);
}

void sendAmbientData(float temperature, int humidity) {
  if (WiFi.status() != WL_CONNECTED) return;
  
  String msg = "AMBIENT ";
  msg += String(temperature);
  msg += " ";
  msg += String(humidity);
  ws.sendTXT(msg);
}

void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {

    case WStype_CONNECTED:
      Serial.println("[ws] connected");
      sendHandshake();
      sendStatus();
      break;

    case WStype_TEXT: {
      String msg = (char*)payload;
      msg.trim();

      Serial.print("[WS] Received: ");
      Serial.println(msg);

      if (msg.startsWith("SET_STATUS")) {
        if (msg.endsWith("off")) setFanSpeed(FAN_OFF);
        else if (msg.endsWith("slow")) setFanSpeed(FAN_SLOW);
        else if (msg.endsWith("medium")) setFanSpeed(FAN_MEDIUM);
        else if (msg.endsWith("fast")) setFanSpeed(FAN_FAST);
        sendStatus();
        return;
      }

      if (msg.startsWith("SET_ROTATES")) {
        bool rotates = msg.endsWith("true");
        setRotates(rotates);
        sendRotates();
        return;
      }

      if (msg.startsWith("SET_WIFI ")) {
        StaticJsonDocument<256> doc;
        DeserializationError err = deserializeJson(doc, msg.substring(9));

        if (err) {
          ws.sendTXT("ERROR Invalid JSON");
          return;
        }

        String newSSID = doc["ssid"] | "";
        String newPassword = doc["password"] | "";

        if (newSSID.length() == 0) {
          ws.sendTXT("ERROR Missing SSID");
          return;
        }

        useNewWiFi(newSSID, newPassword, DEFAULT_SSID, DEFAULT_PASSWORD);
        ws.sendTXT("OK WIFI_SAVED");
        return;
      }

      break;
    }

    default:
      break;
  }
}

String getDeviceId() {
  uint64_t chipid = ESP.getEfuseMac();
  char buf[17];
  sprintf(buf, "%04X%08X",
        (uint16_t) (chipid >> 32),
        (uint32_t) chipid);
  return String(buf);
}

void setup() {
  Serial.begin(115200);

  // servo setup
  rotationServo.setPeriodHertz(50); // SG90S
  rotationServo.attach(SERVO_PIN, 500, 2400);
  rotationServo.write(90);

  initializeFan();
  beginWiFi(DEFAULT_SSID, DEFAULT_PASSWORD);
  ws.begin(WS_HOST, WS_PORT, WS_PATH);
  ws.onEvent(webSocketEvent);
  ws.setReconnectInterval(3000);
  ws.enableHeartbeat(15000, 1500, 5);
  dht.begin();
}

unsigned long lastAmbientRead = 0;

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    ws.loop();
  } else {
    ensureWiFiConnected();
    delay(10);
  }

  unsigned long now = millis();
  if (now - lastAmbientRead >= AMBIENT_READ_INTERVAL && dht.getData()) {
    float temperature = dht.getTemperature();
    float humidity = dht.getHumidity();
    sendAmbientData(temperature, humidity);
    lastAmbientRead = now;
  }
}
