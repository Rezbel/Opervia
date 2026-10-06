using System.Diagnostics;
var directory = new DirectoryInfo(AppContext.BaseDirectory);
while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "scripts", "start-local.ps1")))
    directory = directory.Parent;
if (directory is null) { Console.Error.WriteLine("Coloca el iniciador dentro de Opervia."); return 1; }
var bundledShell = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
    ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "native", "powershell", "pwsh.exe");
var info = new ProcessStartInfo(File.Exists(bundledShell) ? bundledShell : "pwsh.exe") { UseShellExecute = false };
info.ArgumentList.Add("-NoProfile");
info.ArgumentList.Add("-File");
info.ArgumentList.Add(Path.Combine(directory.FullName, "scripts", "start-local.ps1"));
if (args.Contains("--test")) info.ArgumentList.Add("-NoBrowser");
using var process = Process.Start(info)!;
await process.WaitForExitAsync();
return process.ExitCode;
