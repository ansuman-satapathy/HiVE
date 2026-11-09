# Corporate VPN Setup & Troubleshooting Guide

## Overview
HiVE provides secure remote access to internal company resources via the Corporate Virtual Private Network (VPN).

## Initial Setup
1. Download and install the **HiVE Connect VPN Client** from the internal IT portal (`https://it.hive.internal/vpn`).
2. Open the VPN application and set the Server Address to `vpn.hive.internal`.
3. Enter your corporate email address and password.
4. Complete Multi-Factor Authentication (MFA) via the Authenticator App.

## Common Issues & Troubleshooting
- **Connection Failed / Timeout**: Ensure your local internet connection is active. Verify that firewall software is not blocking UDP port 443 or port 1194.
- **403 Forbidden / Access Denied**: Check if your account is active and assigned to the VPN access group in Active Directory. Contact IT Support if you recently changed departments.
- **DNS Resolution Issues**: If you cannot access internal servers by hostname after connecting, flush your DNS cache by running `ipconfig /flushdns` (Windows) or `sudo dscacheutil -flushcache` (macOS).

For further assistance, submit a ticket under the **IT** category.
