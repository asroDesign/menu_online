const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('second Windows agent is a .NET Worker hosted as an actual Windows Service', () => {
  const project = read('windows-service-bridge/MenuPeak.PrinterService.csproj');
  const program = read('windows-service-bridge/Program.cs');
  const worker = read('windows-service-bridge/PrinterWorker.cs');
  assert.match(project, /TargetFramework>net10\.0-windows/);
  assert.match(project, /Microsoft\.Extensions\.Hosting\.WindowsServices/);
  assert.match(program, /UseWindowsService\(options => options\.ServiceName = "MenuPeak Printer Service"\)/);
  assert.match(worker, /Environment\.SpecialFolder\.CommonApplicationData/);
});

test('service shares dashboard printer device API and reports verified connection and job outcomes', () => {
  const worker = read('windows-service-bridge/PrinterWorker.cs');
  const api = read('src/app/api/device/[code]/[action]/route.ts');
  assert.match(worker, /ApiAsync\(server, device\.Code, "ping", new \{ connected = true \}/);
  assert.match(worker, /ApiAsync\(server, device\.Code, "ping", new \{ connected = false \}/);
  assert.match(worker, /ApiAsync\(server, device\.Code, "jobs", null/);
  assert.match(worker, /status = "printed"/);
  assert.match(worker, /status = "failed"/);
  assert.match(worker, /ReadPrinterStatus\(name\)/);
  assert.match(worker, /client\.ConnectAsync\(device\.Host!/);
  assert.match(api, /case "ping"/);
  assert.match(api, /case "jobs"/);
});

test('installer imports the dashboard config and installs an automatic recoverable service', () => {
  const installer = read('windows-service-bridge/installer.iss');
  assert.match(installer, /CreateInputFilePage\(wpSelectDir/);
  assert.match(installer, /FileCopy\(ConfigPage\.Values\[0\], ConfigPath, True\)/);
  assert.match(installer, /config MenuPeakPrinterService binPath=.*start= auto/);
  assert.match(installer, /create MenuPeakPrinterService binPath=.*start= auto/);
  assert.match(installer, /failure MenuPeakPrinterService reset=.*actions= restart/);
  assert.match(installer, /icacls\.exe/);
  assert.match(installer, /S-1-5-18/);
  assert.match(installer, /S-1-5-32-544/);
  assert.match(installer, /start MenuPeakPrinterService/);
  assert.match(installer, /stop MenuPeakPrinterService/);
  assert.match(installer, /delete MenuPeakPrinterService/);
});

test('dashboard exposes the one-time automatic service installer alongside the existing desktop bridge', () => {
  const page = read('src/modules/hardware.tsx');
  assert.match(page, /releases\/download\/windows-printer-service-latest\/MenuPeak-Printer-Service-Setup-x64\.exe/);
  assert.match(page, /نصب سرویس خودکار/);
  assert.match(page, /هر بار روشن‌شدن Windows/);
  assert.match(page, /پل دسکتاپ قبلی/);
});

test('Windows Actions builds and publishes the service installer under its own stable release', () => {
  const workflow = read('.github/workflows/windows-printer-service.yml');
  assert.match(workflow, /dotnet-version: 10\.0\.x/);
  assert.match(workflow, /dotnet publish windows-service-bridge\/MenuPeak\.PrinterService\.csproj/);
  assert.match(workflow, /choco install innosetup/);
  assert.match(workflow, /windows-printer-service-latest/);
  assert.match(workflow, /MenuPeak-Printer-Service-Setup-x64\.exe/);
});
