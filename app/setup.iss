#define MyAppName "5 Star Splicer"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "5 Star Links"
#define MyAppExeName "5star-splicer.exe"

[Setup]
AppId={{5STAR-SPlicer-1234-ABCD-5678-EFGH}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
OutputDir=D:\0ne\app
OutputBaseFilename=5star-splicer-setup
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
SetupIconFile=D:\0ne\pics\logo\logo.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
CloseApplications=force
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "D:\0ne\app\5star-splicer.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch 5 Star Splicer now"; Flags: nowait postinstall skipifsilent
