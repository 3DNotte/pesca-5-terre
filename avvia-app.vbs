' Avvia backend e frontend senza mostrare nessuna finestra di console.
' Log su file (cartella logs\) invece che a schermo: se qualcosa non parte,
' controlla logs\backend.log o logs\frontend.log.

Dim fso, shell, baseDir, logsDir, q, backendCmd, frontendCmd

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

baseDir = fso.GetParentFolderName(WScript.ScriptFullName)
logsDir = baseDir & "\logs"
If Not fso.FolderExists(logsDir) Then fso.CreateFolder(logsDir)

q = Chr(34) ' un carattere " letterale, per costruire i comandi senza incasinarsi con l'escaping

backendCmd = "cmd /c cd /d " & q & baseDir & "\backend" & q & _
             " && .venv\Scripts\python.exe -m uvicorn app.main:app --port 8000 --reload > " & _
             q & logsDir & "\backend.log" & q & " 2>&1"

frontendCmd = "cmd /c cd /d " & q & baseDir & q & _
              " && set " & q & "PATH=C:\Program Files\nodejs;%PATH%" & q & _
              " && npm run dev > " & q & logsDir & "\frontend.log" & q & " 2>&1"

' 0 = finestra nascosta, False = non aspettare che finisca (girano in background)
shell.Run backendCmd, 0, False
shell.Run frontendCmd, 0, False

WScript.Sleep 3000
shell.Run "http://localhost:5173", 1, False
