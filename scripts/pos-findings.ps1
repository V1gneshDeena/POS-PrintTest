# Read-only hardware findings for a POS terminal (printer, scanner, browser, Node).
# Paste into PowerShell on the terminal; the report is copied to the clipboard.
# Changes nothing. Works on Windows 10 1507 (PowerShell 5).
& {
  "== Windows"; [Environment]::OSVersion.VersionString; $PSVersionTable.PSVersion.ToString()
  "== Printers (Windows queues)"
  Get-Printer | Format-Table Name, DriverName, PortName, Shared, ShareName, PrinterStatus -AutoSize
  "== Printer ports"
  Get-PrinterPort | Format-Table Name, Description -AutoSize
  "== COM ports"
  Get-WmiObject Win32_SerialPort | Format-Table DeviceID, Description, PNPDeviceID -AutoSize
  [IO.Ports.SerialPort]::GetPortNames()
  "== Printer / scanner / HID devices"
  Get-PnpDevice -PresentOnly | Where-Object {
    $_.Class -in 'Printer', 'PrintQueue', 'Ports', 'Keyboard', 'HIDClass', 'Image', 'USB' -or
    $_.FriendlyName -match 'scan|barcode|epson|micros|honeywell|datalogic|zebra|receipt|TM-|MSR'
  } | Sort-Object Class, FriendlyName | Format-Table Class, FriendlyName, Status, InstanceId -AutoSize
  "== OPOS devices (MICROS / Epson drivers)"
  foreach ($root in 'HKLM:\SOFTWARE\WOW6432Node\OLEforRetail\ServiceOPOS', 'HKLM:\SOFTWARE\OLEforRetail\ServiceOPOS') {
    Get-ChildItem $root -ErrorAction SilentlyContinue | ForEach-Object {
      $_.PSChildName; Get-ChildItem $_.PSPath | ForEach-Object { "  " + $_.PSChildName }
    }
  }
  "== Firefox"
  (Get-Item "$env:ProgramFiles\Mozilla Firefox\firefox.exe", "${env:ProgramFiles(x86)}\Mozilla Firefox\firefox.exe" -ErrorAction SilentlyContinue).VersionInfo.ProductVersion
  "== Node"
  if (Get-Command node -ErrorAction SilentlyContinue) { node -v } else { "not installed" }
  "== Network"
  Get-NetIPAddress -AddressFamily IPv4 | Format-Table InterfaceAlias, IPAddress, PrefixLength -AutoSize
} *>&1 | Out-String -Width 300 | Tee-Object -Variable report | clip
"Report copied to the clipboard ($($report.Length) characters). Paste it back to Claude."
