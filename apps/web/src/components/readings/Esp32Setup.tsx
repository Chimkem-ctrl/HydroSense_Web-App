export function Esp32Setup({ deviceId }: { deviceId?: string }) {
  return <section className="card live-panel" aria-labelledby="esp32-setup-title">
    <div className="live-section-heading"><div><h2 id="esp32-setup-title">ESP32 Setup</h2></div></div>
    <p>Connect to <strong>HydroSense-Setup-XXXX</strong> using password <strong>hydrosense</strong>. If it is not visible, press and release RESET, then immediately hold BOOT for about five seconds.</p>
    <p>Open the setup page and enter the Wi-Fi network, password and registered tank device ID{deviceId ? ` (${deviceId})` : ''}. Setup sends credentials over an unencrypted local connection; use it only in a trusted environment.</p>
    <a className="button device-provision-link" href="http://192.168.4.1" target="_blank" rel="noreferrer">Configure ESP32</a>
    <p>The ESP32 restarts after saving. Reconnect your computer or phone to its usual network afterward.</p>
  </section>;
}
