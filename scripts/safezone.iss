#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

#define AppFolder "safezone-" + AppVersion + "-windows-x64"

[Setup]
AppId={{15D0AC9E-FF0C-45F2-8B85-3AC873F6E431}
AppName=SafeZone
AppVersion={#AppVersion}
AppPublisher=SafeZone
DefaultDirName={localappdata}\Programs\SafeZone
DefaultGroupName=SafeZone
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64
ArchitecturesAllowed=x64
OutputDir=..\build
OutputBaseFilename=safezone-{#AppVersion}-windows-x64-setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
UninstallDisplayIcon={app}\SafeZone.exe

[Tasks]
Name: "desktopicon"; Description: "Criar atalho na área de trabalho"; GroupDescription: "Atalhos:"; Flags: unchecked

[Files]
Source: "..\build\{#AppFolder}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\SafeZone"; Filename: "{app}\SafeZone.exe"
Name: "{autodesktop}\SafeZone"; Filename: "{app}\SafeZone.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\SafeZone.exe"; Description: "Abrir SafeZone"; Flags: postinstall nowait skipifsilent
