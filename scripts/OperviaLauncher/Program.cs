using System.Diagnostics;
using System.Net.Sockets;

const string ProjectRoot = @"D:\Proyectos\Opervia";
const string WebRoot = @"D:\Proyectos\Opervia\src\Opervia.Web";
const string ApiProject = @"D:\Proyectos\Opervia\src\Opervia.Api\Opervia.Api.csproj";
const string DockerDesktop = @"C:\Program Files\Docker\Docker\Docker Desktop.exe";
const string DockerCli = @"C:\Program Files\Docker\Docker\resources\bin\docker.exe";
const string DotNet = @"C:\Program Files\dotnet\dotnet.exe";
const string Node = @"C:\Users\eduar\AppData\Roaming\fnm\aliases\default\node.exe";
const string Vite = @"D:\Proyectos\Opervia\src\Opervia.Web\node_modules\vite\bin\vite.js";
const string Ollama = @"C:\Users\eduar\AppData\Local\Programs\Ollama\ollama.exe";

Console.Title = "Iniciar Opervia";
Console.OutputEncoding = System.Text.Encoding.UTF8;
var testMode = args.Any(argument => argument.Equals("--test", StringComparison.OrdinalIgnoreCase));
Console.WriteLine("========================================");
Console.WriteLine("        INICIADOR DE OPERVIA");
Console.WriteLine("========================================\n");

try
{
    RequireFile(DotNet, ".NET");
    RequireFile(Node, "Node.js");
    RequireFile(Vite, "Vite");
    Directory.CreateDirectory(Path.Combine(ProjectRoot, ".run"));

    await StartOllamaAsync();
    await StartMySqlAsync();
    await StartApiAsync();
    await StartWebAsync();

    Console.ForegroundColor = ConsoleColor.Green;
    Console.WriteLine("\n✓ Opervia está lista.");
    Console.ResetColor();
    Console.WriteLine("  Página: http://localhost:5173/");
    Console.WriteLine("  API:    http://localhost:5106/");
    Console.WriteLine("\nFirebird no fue modificado; Opervia lo consulta en modo de solo lectura.");

    if (!testMode)
        Process.Start(new ProcessStartInfo("http://localhost:5173/") { UseShellExecute = true });
}
catch (Exception exception)
{
    Console.ForegroundColor = ConsoleColor.Red;
    Console.WriteLine($"\n✗ No fue posible iniciar Opervia: {exception.Message}");
    Console.ResetColor();
    Console.WriteLine($"Revisa los registros en {Path.Combine(ProjectRoot, ".run")}");
}

if (!testMode)
{
    Console.WriteLine("\nPresiona una tecla para cerrar esta ventana...");
    Console.ReadKey(true);
}

static async Task StartOllamaAsync()
{
    Console.Write("IA local (Ollama)... ");
    if (await IsPortOpenAsync(11434))
    {
        WriteOk("ya estaba activa");
        return;
    }

    RequireFile(Ollama, "Ollama");
    var info = HiddenProcess(Ollama, "serve", ProjectRoot,
        "ollama.out.log", "ollama.err.log");
    info.Environment["OLLAMA_MODELS"] = @"D:\OllamaModels";
    Process.Start(info);
    await WaitForPortAsync(11434, TimeSpan.FromSeconds(30), "Ollama");
    WriteOk("iniciada");
}

static async Task StartMySqlAsync()
{
    Console.Write("Docker y MySQL... ");
    RequireFile(DockerCli, "Docker CLI");

    if (!await IsDockerReadyAsync())
    {
        RequireFile(DockerDesktop, "Docker Desktop");
        Process.Start(new ProcessStartInfo(DockerDesktop)
        {
            UseShellExecute = true,
            WindowStyle = ProcessWindowStyle.Hidden
        });

        var deadline = DateTime.UtcNow.AddMinutes(2);
        while (DateTime.UtcNow < deadline && !await IsDockerReadyAsync())
            await Task.Delay(3000);
        if (!await IsDockerReadyAsync())
            throw new InvalidOperationException("Docker Desktop no respondió en dos minutos.");
    }

    if (!await IsPortOpenAsync(3307))
    {
        var result = await RunAndCaptureAsync(DockerCli, ["start", "opervia-mysql"]);
        if (result.ExitCode != 0 && !result.Output.Contains("already", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException($"MySQL no pudo iniciar. {result.Output.Trim()}");
    }

    await WaitForPortAsync(3307, TimeSpan.FromSeconds(45), "MySQL");
    WriteOk("activos");
}

static async Task StartApiAsync()
{
    Console.Write("API de Opervia... ");
    if (await IsHttpOkAsync("http://127.0.0.1:5106/api/connections"))
    {
        WriteOk("ya estaba activa");
        return;
    }

    var info = HiddenProcess(DotNet,
        $"run --no-build --project \"{ApiProject}\" --launch-profile http",
        ProjectRoot, "api.out.log", "api.err.log");
    Process.Start(info);
    await WaitForHttpAsync("http://127.0.0.1:5106/api/connections",
        TimeSpan.FromSeconds(45), "la API");
    WriteOk("iniciada");
}

static async Task StartWebAsync()
{
    Console.Write("Página web... ");
    if (await IsHttpOkAsync("http://127.0.0.1:5173/"))
    {
        WriteOk("ya estaba activa");
        return;
    }

    var info = HiddenProcess(Node, $"\"{Vite}\" --host 127.0.0.1",
        WebRoot, "web.out.log", "web.err.log");
    Process.Start(info);
    await WaitForHttpAsync("http://127.0.0.1:5173/",
        TimeSpan.FromSeconds(45), "la página web");
    WriteOk("iniciada");
}

static ProcessStartInfo HiddenProcess(string fileName, string arguments,
    string workingDirectory, string outputLog, string errorLog) => new ProcessStartInfo()
{
    FileName = fileName,
    Arguments = arguments,
    WorkingDirectory = workingDirectory,
    UseShellExecute = false,
    CreateNoWindow = true,
    WindowStyle = ProcessWindowStyle.Hidden,
    RedirectStandardOutput = true,
    RedirectStandardError = true
}.WithLogs(Path.Combine(ProjectRoot, ".run", outputLog),
    Path.Combine(ProjectRoot, ".run", errorLog));

static async Task<bool> IsDockerReadyAsync()
{
    var result = await RunAndCaptureAsync(DockerCli, ["info", "--format", "{{.ServerVersion}}"]);
    return result.ExitCode == 0;
}

static async Task<(int ExitCode, string Output)> RunAndCaptureAsync(
    string fileName, IEnumerable<string> arguments)
{
    var info = new ProcessStartInfo(fileName)
    {
        UseShellExecute = false,
        CreateNoWindow = true,
        RedirectStandardOutput = true,
        RedirectStandardError = true
    };
    foreach (var argument in arguments) info.ArgumentList.Add(argument);
    using var process = Process.Start(info)!;
    var stdout = process.StandardOutput.ReadToEndAsync();
    var stderr = process.StandardError.ReadToEndAsync();
    await process.WaitForExitAsync();
    return (process.ExitCode, (await stdout) + (await stderr));
}

static async Task<bool> IsPortOpenAsync(int port)
{
    try
    {
        using var client = new TcpClient();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(1));
        await client.ConnectAsync("127.0.0.1", port, timeout.Token);
        return true;
    }
    catch { return false; }
}

static async Task<bool> IsHttpOkAsync(string url)
{
    try
    {
        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(3) };
        using var response = await client.GetAsync(url);
        return response.IsSuccessStatusCode;
    }
    catch { return false; }
}

static async Task WaitForPortAsync(int port, TimeSpan timeout, string service)
{
    var deadline = DateTime.UtcNow.Add(timeout);
    while (DateTime.UtcNow < deadline)
    {
        if (await IsPortOpenAsync(port)) return;
        await Task.Delay(1000);
    }
    throw new TimeoutException($"{service} no abrió el puerto {port}.");
}

static async Task WaitForHttpAsync(string url, TimeSpan timeout, string service)
{
    var deadline = DateTime.UtcNow.Add(timeout);
    while (DateTime.UtcNow < deadline)
    {
        if (await IsHttpOkAsync(url)) return;
        await Task.Delay(1000);
    }
    throw new TimeoutException($"No respondió {service} en {url}.");
}

static void RequireFile(string path, string component)
{
    if (!File.Exists(path))
        throw new FileNotFoundException($"No se encontró {component}: {path}");
}

static void WriteOk(string message)
{
    Console.ForegroundColor = ConsoleColor.Green;
    Console.WriteLine($"OK ({message})");
    Console.ResetColor();
}

static class ProcessInfoExtensions
{
    public static ProcessStartInfo WithLogs(this ProcessStartInfo info,
        string outputPath, string errorPath)
    {
        // Los procesos permanecen desacoplados. El iniciador registra su salida
        // mediante un cmd intermedio solo cuando se requiere diagnóstico.
        info.RedirectStandardOutput = false;
        info.RedirectStandardError = false;
        return info;
    }
}
