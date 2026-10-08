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
            case "pc_clicar":
                int x = args.GetProperty("x").GetInt32(), y = args.GetProperty("y").GetInt32();
                int w = GetSystemMetrics(0), h = GetSystemMetrics(1);
                if (x < 0 || y < 0 || x >= w || y >= h) throw new ArgumentException("Coordenada fora da tela.");
                if (!SetCursorPos(x, y)) throw new InvalidOperationException("Clique indisponível.");
                mouse_event(0x0002, 0, 0, 0, UIntPtr.Zero);
                mouse_event(0x0004, 0, 0, 0, UIntPtr.Zero);
                return new { id, ok = true, data = new { x, y } };
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
            "CTRL+S" => 0x53, "CTRL+C" => 0x43, "CTRL+V" => 0x56,
            "CTRL+A" => 0x41, "ALT+TAB" => 0x09,
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

    [StructLayout(LayoutKind.Sequential)] private struct Input { public uint Type; public InputUnion U; }
    [StructLayout(LayoutKind.Explicit)] private struct InputUnion { [FieldOffset(0)] public KeyboardInput Keyboard; }
    [StructLayout(LayoutKind.Sequential)] private struct KeyboardInput {
        public ushort VirtualKey; public ushort Scan; public uint Flags; public uint Time; public IntPtr ExtraInfo;
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
