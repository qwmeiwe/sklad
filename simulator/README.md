# IoT and courier simulator

Start the backend first and provision a courier account plus an order assigned to that courier. From the project root, install the simulator dependency:

```powershell
python -m pip install -r simulator\requirements.txt
```

Set the IoT token to the same value as `IOT_DEVICE_TOKEN` in `backend\.env`. The all-in-one mode also needs a courier username, password, and assigned order ID:

```powershell
$env:IOT_DEVICE_TOKEN = "your-device-token"
$env:COURIER_USERNAME = "courier"
$env:COURIER_PASSWORD = "your-courier-password"
$env:ORDER_ID = "1"
python simulator\iot_simulator.py --verbose
```

The sensor values are generated locally by the simulator; no physical devices or external sensor service are queried. Temperature starts near 22.4 °C and changes by no more than 0.03 °C at each one-minute sample. Humidity also drifts gradually around 48%. Motion changes state occasionally and lighting follows it; both are sent every 10 seconds. Battery charge is sent every 10 seconds and drops by one percentage point per sample (accelerated for demonstration). On reaching 17%, the simulator sends the 17% reading, immediately sends 100% as a replacement battery, and logs the replacement. GPS coordinates follow a small random walk and are sent every 5 seconds. Courier credentials are exchanged for a JWT through the REST login endpoint; the device token and JWT are not printed.

Run one stream at a time with `--mode sensors` or `--mode gps`. Set `SERVER_URL` or pass `--server-url` to use another HTTP/HTTPS API address. GPS starts near Moscow by default; `--latitude` and `--longitude` change its starting point. Use `--seed` to make the sequence of generated sensor values repeatable. Press Ctrl+C to stop.
