' Starforge Observatory - silent launcher
' Keep this file ASCII-only: wscript reads .vbs as ANSI.
Option Explicit
Dim sh, cmd
Set sh = CreateObject("WScript.Shell")
cmd = "powershell -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File ""E:\21289\DSH\observatory\agent-ops\bin\launch.ps1"""
sh.Run cmd, 0, False
