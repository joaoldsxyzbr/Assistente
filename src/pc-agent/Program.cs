using System.Diagnostics;
using System.Net.WebSockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Windows.Forms;

namespace AssistentePc;

internal static class Program
{
    internal static readonly Uri Address = new("wss://assistente.joaolds.xyz.br/pc/connect");
    internal static readonly string SecretPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "Assistente", "pc-secret.dat");

    [STAThread]
    private static void Main(string[] args)
    {
        if (args.Length == 1 && args[0] == "--check-terminal")
        {
            Environment.ExitCode =
                TerminalCommands.IsAllowed("identidade") &&
                TerminalCommands.IsAllowed("rede") &&
                !TerminalCommands.IsAllowed("powershell") &&
                !TerminalCommands.IsAllowed("cmd /c dir") ? 0 : 1;
            return;
        }

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        if (args.Length == 1 && args[0].Equals("configure", StringComparison.OrdinalIgnoreCase))
        {
            TrayAgent.ConfigureOnly();
            return;
        }
        if (args.Length == 1 && args[0].Equals("reset", StringComparison.OrdinalIgnoreCase))
        {
            TrayAgent.ResetOnly();
            return;
        }
        if (args.Length != 0)
        {
            MessageBox.Show("Comando inválido. Use configure ou reset.", "Assistente PC",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        using var singleInstance = new Mutex(initiallyOwned: true,
            name: @"Local\AssistentePcAgent", createdNew: out bool createdNew);
        if (!createdNew)
        {
            MessageBox.Show("O Assistente PC já está aberto. Procure o ícone na bandeja, perto do relógio.",
                "Assistente PC", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }
        Application.Run(new TrayAgent());
    }

    internal static async Task ReceiveCommands(ClientWebSocket socket, CancellationToken cancellation)
    {
        byte[] buffer = new byte[8192];
        while (socket.State == WebSocketState.Open && !cancellation.IsCancellationRequested)
        {
            using var message = new MemoryStream();
            ValueWebSocketReceiveResult part;
            do
            {
                part = await socket.ReceiveAsync(buffer.AsMemory(), cancellation);
                if (part.MessageType == WebSocketMessageType.Close) return;
                if (part.MessageType != WebSocketMessageType.Text || message.Length + part.Count > 8192)
                    throw new IOException("Comando excede limite.");
                message.Write(buffer, 0, part.Count);
            } while (!part.EndOfMessage);

            string id = "";
            object response;
            try
            {
                using var json = JsonDocument.Parse(message.ToArray());
                JsonElement root = json.RootElement;
                id = root.GetProperty("id").GetString() ?? "";
                string name = root.GetProperty("name").GetString() ?? "";
                response = await ExecuteAsync(name, root.GetProperty("args"), id);
            }
            catch (Exception ex) when (ex is JsonException or KeyNotFoundException or ArgumentException or InvalidOperationException or ExternalException or System.ComponentModel.Win32Exception)
            {
                response = new { id, ok = false, error = "Operação inválida ou não disponível nesta sessão." };
            }
            byte[] serialized = JsonSerializer.SerializeToUtf8Bytes(response);
            if (serialized.Length > 1_350_000)
                serialized = JsonSerializer.SerializeToUtf8Bytes(new { id, ok = false, error = "Resposta grande demais." });
            await socket.SendAsync(serialized.AsMemory(), WebSocketMessageType.Text, true, cancellation);
        }
    }

    private static async Task<object> ExecuteAsync(string name, JsonElement args, string id)
    {
        switch (name)
        {
            case "pc_informacoes":
                return new { id, ok = true, data = new {
                    versao = typeof(Program).Assembly.GetName().Version?.ToString(3) ?? "desconhecida",
                    computador = Environment.MachineName,
                    windows = System.Runtime.InteropServices.RuntimeInformation.OSDescription,
                    arquitetura = System.Runtime.InteropServices.RuntimeInformation.OSArchitecture.ToString(),
                    ligadoMinutos = Environment.TickCount64 / 60000,
                    tela = new { largura = GetSystemMetrics(0), altura = GetSystemMetrics(1) }
                } };
            case "pc_processos": return new { id, ok = true, data = ListProcesses() };
            case "pc_janelas": return new { id, ok = true, data = new { janelas = ListWindows() } };
            case "pc_terminal":
                string comando = args.GetProperty("comando").GetString() ?? "";
                return new { id, ok = true, data = await TerminalCommands.RunAsync(comando) };
            case "pc_ui_elementos":
                return new { id, ok = true, data = WindowAutomation.Inspect() };
            case "pc_ui_acao":
                string alvo = args.GetProperty("alvo").GetString() ?? "";
                string acao = args.GetProperty("acao").GetString() ?? "";
                string? valor = args.TryGetProperty("texto", out var inputText) ? inputText.GetString() : null;
                return new { id, ok = true, data = WindowAutomation.Act(alvo, acao, valor) };
            case "pc_abrir":
                string app = args.GetProperty("aplicativo").GetString() ?? "";
                string executable = app switch {
                    "bloco_de_notas" => "notepad.exe",
                    "calculadora" => "calc.exe",
                    "explorador" => "explorer.exe",
                    _ => throw new ArgumentException("Aplicativo não permitido.")
                };
                Process.Start(new ProcessStartInfo(executable) { UseShellExecute = true });
                return new { id, ok = true, data = new { aplicativo = app } };
            case "pc_pasta":
                string pasta = args.GetProperty("pasta").GetString() ?? "";
                string path = pasta switch {
                    "downloads" => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads"),
                    "documentos" => Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
                    "imagens" => Environment.GetFolderPath(Environment.SpecialFolder.MyPictures),
                    "area_de_trabalho" => Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
                    _ => throw new ArgumentException("Pasta não permitida.")
                };
                if (!Directory.Exists(path)) throw new InvalidOperationException("Pasta não encontrada.");
                var explorer = new ProcessStartInfo("explorer.exe") { UseShellExecute = false };
                explorer.ArgumentList.Add(path);
                Process.Start(explorer);
                return new { id, ok = true, data = new { pasta } };
            default: throw new ArgumentException("Ferramenta não permitida.");
        }
    }

    private static object ListProcesses()
    {
        var names = new SortedSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var process in Process.GetProcesses())
        {
            using (process)
            {
                try { if (!string.IsNullOrWhiteSpace(process.ProcessName)) names.Add(process.ProcessName); }
                catch (InvalidOperationException) { /* Processo encerrou durante a leitura. */ }
                catch (System.ComponentModel.Win32Exception) { /* Processo protegido. */ }
            }
        }
        return new { processos = names.Take(40).ToArray(), truncado = names.Count > 40 };
    }

    private static List<string> ListWindows()
    {
        var titles = new List<string>();
        EnumWindows((handle, _) => {
            if (!IsWindowVisible(handle)) return true;
            int length = GetWindowTextLength(handle);
            if (length is <= 0 or > 1000) return true;
            var title = new StringBuilder(length + 1);
            GetWindowText(handle, title, title.Capacity);
            if (title.Length > 0) titles.Add(title.ToString());
            return titles.Count < 40;
        }, IntPtr.Zero);
        return titles;
    }

    private delegate bool EnumWindowsProc(IntPtr window, IntPtr extra);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr extra);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr window, StringBuilder text, int max);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowTextLength(IntPtr window);
    [DllImport("user32.dll")] private static extern int GetSystemMetrics(int index);
}
