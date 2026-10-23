#define AppName "MenuPeak Printer Service"
#define AppVersion "1.0.0"
#define AppPublisher "MenuPeak"
#define AppExe "MenuPeak.PrinterService.exe"

[Setup]
AppId={{7DBA3D7A-3BB0-4C20-A0EF-E1D3FE05F862}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\MenuPeak\PrinterService
DefaultGroupName=MenuPeak
OutputDir={#SourceDir}\..\windows-service-bridge\dist
OutputBaseFilename=MenuPeak-Printer-Service-Setup-x64
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=admin
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\{#AppExe}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no

[Dirs]
Name: "{commonappdata}\MenuPeak\PrinterService"

[Files]
Source: "{#SourceDir}\{#AppExe}"; DestDir: "{app}"; Flags: ignoreversion

[UninstallRun]
Filename: "{sys}\sc.exe"; Parameters: "stop MenuPeakPrinterService"; Flags: runhidden waituntilterminated; RunOnceId: "StopMenuPeakPrinterService"
Filename: "{sys}\sc.exe"; Parameters: "delete MenuPeakPrinterService"; Flags: runhidden waituntilterminated; RunOnceId: "DeleteMenuPeakPrinterService"

[UninstallDelete]
Type: filesandordirs; Name: "{commonappdata}\MenuPeak\PrinterService"

[Code]
var
  ConfigPage: TInputFileWizardPage;

procedure InitializeWizard;
begin
  ConfigPage := CreateInputFilePage(wpSelectDir,
    'اتصال به پنل MenuPeak',
    'فایل تنظیمات پرینتر را از پنل رستوران دریافت کنید.',
    'در داشبورد، تنظیمات پرینترها را باز کنید، «دانلود تنظیمات» را بزنید و فایل JSON را در این مرحله انتخاب کنید.');
  ConfigPage.Add('فایل تنظیمات دستگاه‌ها:', 'JSON files|*.json|All files|*.*', '.json');
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = ConfigPage.ID then begin
    if (ConfigPage.Values[0] = '') or (not FileExists(ConfigPage.Values[0])) then begin
      MsgBox('ابتدا فایل تنظیمات دانلودشده از پنل را انتخاب کنید.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Exec(ExpandConstant('{sys}\sc.exe'), 'stop MenuPeakPrinterService', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Sleep(2000);
  Result := '';
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  ServiceExe: String;
  ServiceArgs: String;
  ConfigPath: String;
  IcaclsExe: String;
begin
  if CurStep = ssPostInstall then begin
    ConfigPath := ExpandConstant('{commonappdata}\MenuPeak\PrinterService\bridge.config.json');
    if not FileCopy(ConfigPage.Values[0], ConfigPath, True) then
      RaiseException('کپی فایل تنظیمات به پوشهٔ سرویس انجام نشد. نصب را با دسترسی مدیر اجرا کنید.');
    IcaclsExe := ExpandConstant('{sys}\icacls.exe');
    ServiceArgs := '"' + ExtractFileDir(ConfigPath) + '" /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F"';
    if (not Exec(IcaclsExe, ServiceArgs, '', SW_HIDE, ewWaitUntilTerminated, ResultCode)) or (ResultCode <> 0) then
      RaiseException('محدودکردن دسترسی فایل کدهای اتصال ناموفق بود؛ نصب متوقف شد.');

    ServiceExe := ExpandConstant('{sys}\sc.exe');
    ServiceArgs := 'config MenuPeakPrinterService binPath= "' + ExpandConstant('{app}\{#AppExe}') + '" start= auto DisplayName= "MenuPeak Printer Service"';
    if (not Exec(ServiceExe, ServiceArgs, '', SW_HIDE, ewWaitUntilTerminated, ResultCode)) or (ResultCode <> 0) then begin
      ServiceArgs := 'create MenuPeakPrinterService binPath= "' + ExpandConstant('{app}\{#AppExe}') + '" start= auto DisplayName= "MenuPeak Printer Service"';
      if (not Exec(ServiceExe, ServiceArgs, '', SW_HIDE, ewWaitUntilTerminated, ResultCode)) or (ResultCode <> 0) then
        RaiseException('ثبت سرویس ویندوز انجام نشد. Setup را با گزینهٔ Run as administrator اجرا کنید.');
    end;
    Exec(ServiceExe, 'description MenuPeakPrinterService "اتصال خودکار چاپگرها به صف چاپ MenuPeak"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec(ServiceExe, 'failure MenuPeakPrinterService reset= 86400 actions= restart/5000/restart/15000/restart/60000', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec(ServiceExe, 'failureflag MenuPeakPrinterService 1', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    if (not Exec(ServiceExe, 'start MenuPeakPrinterService', '', SW_HIDE, ewWaitUntilTerminated, ResultCode)) or (ResultCode <> 0) then
      RaiseException('سرویس نصب شد اما شروع نشد. تنظیمات دستگاه‌ها و گزارش سرویس را بررسی کنید.');
  end;
end;
