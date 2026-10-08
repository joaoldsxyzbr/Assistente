using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace AssistentePc;

/// <summary>Diagnósticos fixos, sem shell nem parâmetros livres.</summary>
internal static class TerminalCommands
{
    [DllImport("kernel32.dll")]
    private static extern uint GetOEMCP();

    private static readonly IReadOnlyDictionary<string, string> Allowed =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["identidade"] = "whoami.exe",
            ["computador"] = "hostname.exe",
            ["rede"] = "ipconfig.exe",
            ["processos"] = "tasklist.exe"
        };

    internal static bool IsAllowed(string command) => Allowed.ContainsKey(command);

    internal static async Task<object> RunAsync(string command)
    {
        if (!Allowed.TryGetValue(command, out string? executable))
            throw new ArgumentException("Comando de terminal não permitido.");

        // Utilitários legados do Windows escrevem frequentemente no code page OEM,
        // e decodificá-los como UTF-8 corrompe caracteres acentuados.
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        var systemEncoding = Encoding.GetEncoding((int)GetOEMCP());
        var start = new ProcessStartInfo(Path.Combine(Environment.SystemDirectory, executable))
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = systemEncoding,
            StandardErrorEncoding = systemEncoding,
            WorkingDirectory = Environment.SystemDirectory
        };
        using var process = new Process { StartInfo = start };
        if (!process.Start()) throw new InvalidOperationException("Não foi possível iniciar a consulta.");

        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(9));
        try
        {
            Task<string> output = process.StandardOutput.ReadToEndAsync(timeout.Token);
            Task<string> error = process.StandardError.ReadToEndAsync(timeout.Token);
            await process.WaitForExitAsync(timeout.Token);
            string stdout = await output;
            string stderr = await error;
            return new
            {
                comando = command,
                codigoSaida = process.ExitCode,
                saida = stdout.Length > 6000 ? stdout[..6000] : stdout,
                erro = stderr.Length > 400 ? stderr[..400] : stderr,
                truncado = stdout.Length > 6000
            };
        }
        catch (OperationCanceledException)
        {
            if (!process.HasExited) process.Kill(entireProcessTree: true);
            throw new InvalidOperationException("Comando excedeu o limite de tempo.");
        }
    }
}
