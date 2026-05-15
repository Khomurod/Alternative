; DAT Dispatcher Assist — per-user unpack installer (Load Unpacked workflow)
; Compile-time defines from Node: SRC_DIR_ABS, OUTFILE_PATH, PRODUCT_VERSION, VI_PRODUCT_QUAD

Unicode true
RequestExecutionLevel user
Name "DAT Dispatcher Assist"
Caption "DAT Dispatcher Assist Setup"
InstallDir "$LOCALAPPDATA\DAT_Dispatcher_Assist"
BrandingText " "

!ifndef SRC_DIR_ABS
  !error "SRC_DIR_ABS is required (staging folder with extension files)"
!endif
!ifndef OUTFILE_PATH
  !error "OUTFILE_PATH is required (output .exe path)"
!endif
!ifndef PRODUCT_VERSION
  !define PRODUCT_VERSION "0.0.0"
!endif
!ifndef VI_PRODUCT_QUAD
  !define VI_PRODUCT_QUAD "0.0.0.0"
!endif

VIProductVersion "${VI_PRODUCT_QUAD}"
VIAddVersionKey /LANG=1033 "ProductName" "DAT Dispatcher Assist"
VIAddVersionKey /LANG=1033 "FileVersion" "${PRODUCT_VERSION}"
VIAddVersionKey /LANG=1033 "LegalCopyright" ""

OutFile "${OUTFILE_PATH}"
ShowInstDetails show
AutoCloseWindow false

Page instfiles

Section "InstallExtension"
  SectionIn RO
  RMDir /r "$INSTDIR"
  SetOutPath "$INSTDIR"

  File /r "${SRC_DIR_ABS}\*.*"

  DetailPrint "Opening Chrome (Extensions) and setup guide…"
  StrCpy $0 "$PROGRAMFILES64\Google\Chrome\Application\chrome.exe"
  IfFileExists "$0" LaunchChrome
  StrCpy $0 "$PROGRAMFILES\Google\Chrome\Application\chrome.exe"
  IfFileExists "$0" LaunchChrome
  StrCpy $0 "$LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  IfFileExists "$0" LaunchChrome
  MessageBox MB_OK|MB_ICONINFORMATION "Installation complete.$\n$\nExtension files:$\n    $INSTDIR$\n$\nGoogle Chrome was not found in the usual locations.$\n$\n1. Open Google Chrome.$\n2. Go to chrome://extensions$\n3. Turn on Developer Mode.$\n4. Click Load unpacked and select the folder above."
  Goto OpenGuide

  LaunchChrome:
  Exec '"$0" "chrome://extensions"'

  OpenGuide:
  IfFileExists "$INSTDIR\INSTALL.html" InstallHtml OpenGuideDone
  InstallHtml:
  ExecShell "open" "$INSTDIR\INSTALL.html"
  OpenGuideDone:
SectionEnd
