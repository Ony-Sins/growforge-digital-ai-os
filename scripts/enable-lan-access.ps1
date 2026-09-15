# GrowForge AI OS — Enable LAN & Wi-Fi Access
# Self-elevate to Administrator if not already elevated
if (!([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "[!] Elevating to Administrator..." -ForegroundColor Yellow
    Start-Process powershell.exe -Verb RunAs -ArgumentList ("-NoProfile -ExecutionPolicy Bypass -File `"{0}`"" -f $PSCommandPath)
    exit
}

Write-Host "[1/3] Adding Inbound Firewall Rules for Port 3000 (TCP/UDP, all profiles)..." -ForegroundColor Cyan
netsh advfirewall firewall delete rule name="GrowForge_Port_3000" | Out-Null
netsh advfirewall firewall delete rule name="GrowForge_Universal_3000" | Out-Null
netsh advfirewall firewall add rule name="GrowForge_Universal_3000" dir=in action=allow protocol=TCP localport=3000 profile=any
netsh advfirewall firewall add rule name="GrowForge_Universal_3000_UDP" dir=in action=allow protocol=UDP localport=3000 profile=any

Write-Host "[2/3] Enabling Inbound ICMP Ping..." -ForegroundColor Cyan
netsh advfirewall firewall set rule name="File and Printer Sharing (Echo Request - ICMPv4-In)" new enable=Yes | Out-Null

Write-Host "[3/3] Setting Network Category to Private for 'Ethernet 3'..." -ForegroundColor Cyan
Set-NetConnectionProfile -InterfaceAlias "Ethernet 3" -NetworkCategory Private -ErrorAction SilentlyContinue

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host " [SUCCESS] LAN & Wi-Fi Access configured!" -ForegroundColor Green
Write-Host " Accessible at: http://192.168.68.102:3000" -ForegroundColor White
Write-Host "============================================================`n" -ForegroundColor Green

Read-Host "Press Enter to exit"
