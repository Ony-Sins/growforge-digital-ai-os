@echo off
:: GrowForge AI OS — Enable LAN & Wi-Fi Access Script
:: Requires Administrator privileges to configure Windows Firewall & Network Profile

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Requesting Administrator Privileges...
    powershell -Command "Start-Process cmd -ArgumentList '/c \"%~f0\"' -Verb RunAs"
    exit /b
)

echo [1/3] Adding Inbound Firewall Rules for Port 3000 (TCP & UDP, all profiles)...
netsh advfirewall firewall delete rule name="GrowForge_Port_3000" >nul 2>&1
netsh advfirewall firewall delete rule name="GrowForge_Universal_3000" >nul 2>&1
netsh advfirewall firewall add rule name="GrowForge_Universal_3000" dir=in action=allow protocol=TCP localport=3000 profile=any
netsh advfirewall firewall add rule name="GrowForge_Universal_3000_UDP" dir=in action=allow protocol=UDP localport=3000 profile=any

echo [2/3] Enabling Inbound ICMP Ping (for network connectivity testing)...
netsh advfirewall firewall set rule name="File and Printer Sharing (Echo Request - ICMPv4-In)" new enable=Yes >nul 2>&1

echo [3/3] Setting Network Category to Private for 'Ethernet 3'...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Set-NetConnectionProfile -InterfaceAlias 'Ethernet 3' -NetworkCategory Private"

echo.
echo ============================================================
echo [SUCCESS] LAN & Wi-Fi Access has been configured!
echo.
echo Access URL for your Phone, Brother's PC, and local devices:
echo http://192.168.68.102:3000
echo ============================================================
echo.
pause
