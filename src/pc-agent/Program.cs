using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
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
        if (args.Length == 1 && args[0] == "--check-input-layout")
        {
            // Verificação segura do ABI no runner Windows (não injeta teclas).
            int expectedSize = Environment.Is64BitProcess ? 40 : 28;
            int actualSize = Marshal.SizeOf<Input>();
            // Retorna o tamanho observado se houver erro, para diagnosticar o CI.
            Environment.ExitCode = actualSize == expectedSize ? 0 : actualSize;
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
                response = Execute(name, root.GetProperty("args"), id);
            }
            catch (Exception ex) when (ex is JsonException or KeyNotFoundException or ArgumentException or InvalidOperationException or ExternalException)
            {
                response = new { id, ok = false, error = "Operação inválida ou não disponível nesta sessão." };
            }
            byte[] serialized = JsonSerializer.SerializeToUtf8Bytes(response);
            if (serialized.Length > 1_350_000)
                serialized = JsonSerializer.SerializeToUtf8Bytes(new { id, ok = false, error = "Resposta grande demais." });
            await socket.SendAsync(serialized.AsMemory(), WebSocketMessageType.Text, true, cancellation);
        }
    }

    private static object Execute(string name, JsonElement args, string id)
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
            case "pc_tela": return new { id, ok = true, image = CaptureJpeg() };
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
            case "pc_clicar":
                int x = args.GetProperty("x").GetInt32(), y = args.GetProperty("y").GetInt32();
                int w = GetSystemMetrics(0), h = GetSystemMetrics(1);
                if (x < 0 || y < 0 || x >= w || y >= h) throw new ArgumentException("Coordenada fora da tela.");
                string botao = args.TryGetProperty("botao", out var buttonArg) ? buttonArg.GetString() ?? "" : "esquerdo";
                bool duplo = args.TryGetProperty("duplo", out var doubleArg) && doubleArg.GetBoolean();
                if (botao != "esquerdo" && botao != "direito") throw new ArgumentException("Botão não permitido.");
                if (duplo && botao != "esquerdo") throw new ArgumentException("Duplo clique direito não permitido.");
                if (!SetCursorPos(x, y)) throw new InvalidOperationException("Clique indisponível.");
                uint down = botao == "esquerdo" ? 0x0002u : 0x0008u;
                uint up = botao == "esquerdo" ? 0x0004u : 0x0010u;
                for (int i = 0; i < (duplo ? 2 : 1); i++)
                {
                    mouse_event(down, 0, 0, 0, UIntPtr.Zero);
                    mouse_event(up, 0, 0, 0, UIntPtr.Zero);
                }
                return new { id, ok = true, data = new { x, y, botao, duplo } };
            case "pc_rolar":
                string direcao = args.GetProperty("direcao").GetString() ?? "";
                int passos = args.GetProperty("passos").GetInt32();
                if ((direcao != "cima" && direcao != "baixo") || passos < 1 || passos > 12)
                    throw new ArgumentException("Rolagem não permitida.");
                int delta = (direcao == "cima" ? 1 : -1) * passos * 120;
                mouse_event(0x0800, 0, 0, unchecked((uint)delta), UIntPtr.Zero);
                return new { id, ok = true, data = new { direcao, passos } };
            case "pc_digitar":
                string text = args.GetProperty("texto").GetString() ?? "";
                if (text.Length == 0 || text.Length > 500) throw new ArgumentException("Texto inválido.");
                foreach (char c in text) { SendUnicode(c, false); SendUnicode(c, true); }
                return new { id, ok = true, data = new { digitado = text.Length } };
            case "pc_tecla":
                string shortcut = args.GetProperty("atalho").GetString() ?? "";
                SendShortcut(shortcut);
                return new { id, ok = true, data = new { atalho = shortcut } };
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

    private static string CaptureJpeg()
    {
        int width = GetSystemMetrics(0), height = GetSystemMetrics(1);
        if (width <= 0 || height <= 0) throw new InvalidOperationException("Tela indisponível.");
        using var source = new Bitmap(width, height);
        using (Graphics g = Graphics.FromImage(source))
            g.CopyFromScreen(0, 0, 0, 0, new Size(width, height));
        double scale = Math.Min(1d, Math.Min(960d / width, 540d / height));
        using var resized = new Bitmap(source, new Size(Math.Max(1, (int)(width * scale)), Math.Max(1, (int)(height * scale))));
        using var memory = new MemoryStream();
        ImageCodecInfo codec = ImageCodecInfo.GetImageEncoders().First(c => c.MimeType == "image/jpeg");
        using var parameters = new EncoderParameters(1);
        parameters.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 50L);
        resized.Save(memory, codec, parameters);
        return Convert.ToBase64String(memory.ToArray());
    }

    private static void SendShortcut(string combo)
    {
        byte? modifier = combo.StartsWith("CTRL+", StringComparison.Ordinal) ? (byte)0x11
                       : combo.StartsWith("ALT+", StringComparison.Ordinal) ? (byte)0x12 : null;
        byte key = combo switch {
            "ENTER" => 0x0D, "TAB" => 0x09, "ESC" => 0x1B,
            "BACKSPACE" => 0x08, "DELETE" => 0x2E,
            "UP" => 0x26, "DOWN" => 0x28, "LEFT" => 0x25, "RIGHT" => 0x27,
            "PAGEUP" => 0x21, "PAGEDOWN" => 0x22, "HOME" => 0x24, "END" => 0x23,
            "F5" => 0x74,
            "CTRL+S" => 0x53, "CTRL+C" => 0x43, "CTRL+V" => 0x56,
            "CTRL+A" => 0x41, "CTRL+F" => 0x46, "CTRL+T" => 0x54,
            "CTRL+W" => 0x57, "CTRL+L" => 0x4C,
            "CTRL+Z" => 0x5A, "CTRL+Y" => 0x59, "ALT+TAB" => 0x09,
            _ => throw new ArgumentException("Atalho não autorizado.")
        };
        if (modifier is byte down) Key(down, false);
        try { Key(key, false); Key(key, true); }
        finally { if (modifier is byte up) Key(up, true); }
    }
    private static void Key(byte key, bool release)
    {
        var input = new Input { Type = 1, U = new InputUnion { Keyboard = new KeyboardInput { VirtualKey = key, Flags = release ? 2u : 0u } } };
        if (SendInput(1, new[] { input }, Marshal.SizeOf<Input>()) != 1) throw new InvalidOperationException("Teclado indisponível.");
    }
    private static void SendUnicode(char character, bool release)
    {
        var input = new Input { Type = 1, U = new InputUnion { Keyboard = new KeyboardInput { Scan = character, Flags = 4u | (release ? 2u : 0u) } } };
        if (SendInput(1, new[] { input }, Marshal.SizeOf<Input>()) != 1) throw new InvalidOperationException("Digitação indisponível.");
    }

    // A união nativa INPUT usa o tamanho do maior membro (MOUSEINPUT).
    // Apenas KEYBDINPUT deixa cbSize menor que sizeof(INPUT) e SendInput falha (erro 87).
    [StructLayout(LayoutKind.Sequential)] private struct Input { public uint Type; public InputUnion U; }
    [StructLayout(LayoutKind.Explicit)] private struct InputUnion {
        [FieldOffset(0)] public KeyboardInput Keyboard;
        [FieldOffset(0)] public MouseInput Mouse;
    }
    [StructLayout(LayoutKind.Sequential)] private struct KeyboardInput {
        public ushort VirtualKey; public ushort Scan; public uint Flags; public uint Time; public IntPtr ExtraInfo;
    }
    [StructLayout(LayoutKind.Sequential)] private struct MouseInput {
        public int X; public int Y; public uint MouseData; public uint Flags; public uint Time; public IntPtr ExtraInfo;
    }
    private delegate bool EnumWindowsProc(IntPtr window, IntPtr extra);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr extra);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr window, StringBuilder text, int max);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowTextLength(IntPtr window);
    [DllImport("user32.dll")] private static extern int GetSystemMetrics(int index);
    [DllImport("user32.dll")] private static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] private static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
    [DllImport("user32.dll", SetLastError = true)] private static extern uint SendInput(uint count, [In] Input[] input, int size);
}
