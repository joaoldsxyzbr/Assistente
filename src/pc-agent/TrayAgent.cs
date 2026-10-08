using System.Drawing;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Win32;

namespace AssistentePc;

// O agente permanece na sessão interativa do Windows, mas sem janela de console.
internal sealed class TrayAgent : ApplicationContext
{
    private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string RunName = "AssistentePc";

    private readonly NotifyIcon _icon;
    private readonly ContextMenuStrip _menu = new();
    private readonly ToolStripMenuItem _statusItem = new("Status: iniciando") { Enabled = false };
    private readonly ToolStripMenuItem _startWithWindowsItem = new("Iniciar com Windows");
    private readonly Control _dispatcher = new();
    private readonly SemaphoreSlim _restartGate = new(1, 1);

    private CancellationTokenSource? _connectionCancellation;
    private Task? _connectionTask;
    private string _status = "Iniciando";
    private bool _exiting;

    internal TrayAgent()
    {
        _ = _dispatcher.Handle; // Destino das notificações vindas da conexão em segundo plano.
        _menu.Items.Add(_statusItem);
        _menu.Items.Add(new ToolStripSeparator());
        _menu.Items.Add("Reconectar", null, (_, _) => _ = RestartAsync());
        _menu.Items.Add("Configurar token...", null, (_, _) =>
        {
            if (AskForToken()) _ = RestartAsync();
        });
        _startWithWindowsItem.Click += (_, _) => ToggleStartWithWindows();
        _menu.Items.Add(_startWithWindowsItem);
        _menu.Items.Add(new ToolStripSeparator());
        _menu.Items.Add("Sair", null, (_, _) => ExitThread());

        _icon = new NotifyIcon
        {
            Icon = SystemIcons.Application,
            Text = "Assistente PC",
            ContextMenuStrip = _menu,
            Visible = true
        };
        _icon.DoubleClick += (_, _) =>
        {
            if (!File.Exists(Program.SecretPath))
            {
                if (AskForToken()) _ = RestartAsync();
                return;
            }
            MessageBox.Show($"Estado atual: {_status}.\n\nUse o botão direito no ícone para acessar as opções.",
                "Assistente PC", MessageBoxButtons.OK, MessageBoxIcon.Information);
        };

        RefreshStartWithWindows();
        Application.Idle += OnFirstIdle;
    }

    private void OnFirstIdle(object? sender, EventArgs e)
    {
        Application.Idle -= OnFirstIdle;
        if (!File.Exists(Program.SecretPath)) AskForToken();
        _ = RestartAsync();
    }

    private void SetStatus(string status)
    {
        if (_exiting) return;
        _status = status;
        _statusItem.Text = "Status: " + status;
        _icon.Text = "Assistente PC - " + status;
    }

    private void PostStatus(string status)
    {
        if (_exiting || !_dispatcher.IsHandleCreated) return;
        try
        {
            _dispatcher.BeginInvoke((Action)(() => SetStatus(status)));
        }
        catch (InvalidOperationException) { /* Janela de mensagens já encerrada. */ }
        catch (ObjectDisposedException) { /* Encerramento em andamento. */ }
    }

    private static bool TryReadToken(out string token)
    {
        token = "";
        try
        {
            byte[] encrypted = File.ReadAllBytes(Program.SecretPath);
            token = Encoding.UTF8.GetString(ProtectedData.Unprotect(encrypted, null,
                DataProtectionScope.CurrentUser));
            return token.Length is >= 32 and <= 256;
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or CryptographicException)
        {
            return false;
        }
    }

    private async Task RestartAsync()
    {
        await _restartGate.WaitAsync();
        try
        {
            CancellationTokenSource? previous = _connectionCancellation;
            Task? previousTask = _connectionTask;
            _connectionCancellation = null;
            _connectionTask = null;
            previous?.Cancel();
            if (previousTask != null)
            {
                try { await previousTask; }
                catch (OperationCanceledException) { }
            }
            previous?.Dispose();
            if (_exiting) return;

            if (!TryReadToken(out string token))
            {
                SetStatus("Token não configurado");
                return;
            }

            var cancellation = new CancellationTokenSource();
            _connectionCancellation = cancellation;
            SetStatus("Conectando");
            _connectionTask = Task.Run(() => ConnectLoopAsync(token, cancellation.Token));
        }
        catch (Exception)
        {
            SetStatus("Falha ao iniciar");
        }
        finally { _restartGate.Release(); }
    }

    private async Task ConnectLoopAsync(string token, CancellationToken cancellation)
    {
        while (!cancellation.IsCancellationRequested)
        {
            try
            {
                using var socket = new ClientWebSocket();
                socket.Options.SetRequestHeader("Authorization", "Bearer " + token);
                socket.Options.KeepAliveInterval = TimeSpan.FromSeconds(25);
                await socket.ConnectAsync(Program.Address, cancellation);
                PostStatus("Conectado");
                await Program.ReceiveCommands(socket, cancellation);
                PostStatus("Reconectando");
            }
            catch (OperationCanceledException) when (cancellation.IsCancellationRequested)
            {
                break;
            }
            catch (Exception e) when (e is WebSocketException or HttpRequestException or IOException)
            {
                PostStatus("Sem conexão - tentando novamente");
            }
            catch (Exception)
            {
                PostStatus("Erro - tentando novamente");
            }

            try { await Task.Delay(TimeSpan.FromSeconds(5), cancellation); }
            catch (OperationCanceledException) { break; }
        }
    }

    private static bool AskForToken()
    {
        using var dialog = new Form
        {
            Text = "Configurar Assistente PC",
            StartPosition = FormStartPosition.CenterScreen,
            FormBorderStyle = FormBorderStyle.FixedDialog,
            MaximizeBox = false,
            MinimizeBox = false,
            ShowInTaskbar = true,
            ClientSize = new Size(450, 185)
        };
        var instruction = new Label
        {
            Text = "Informe o mesmo PC_AGENT_TOKEN cadastrado como Secret no Worker.\nA chave ficará protegida pelo Windows para seu usuário.",
            Location = new Point(18, 17),
            Size = new Size(414, 52)
        };
        var secret = new TextBox
        {
            Location = new Point(18, 83),
            Width = 414,
            UseSystemPasswordChar = true,
            MaxLength = 256
        };
        var save = new Button { Text = "Salvar", Location = new Point(244, 132), Size = new Size(88, 32) };
        var cancel = new Button { Text = "Cancelar", Location = new Point(344, 132), Size = new Size(88, 32),
            DialogResult = DialogResult.Cancel };
        save.Click += (_, _) =>
        {
            string token = secret.Text.Trim();
            if (token.Length is < 32 or > 256)
            {
                MessageBox.Show(dialog, "O token deve ter entre 32 e 256 caracteres.",
                    "Token inválido", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(Program.SecretPath)!);
                byte[] encrypted = ProtectedData.Protect(Encoding.UTF8.GetBytes(token),
                    null, DataProtectionScope.CurrentUser);
                File.WriteAllBytes(Program.SecretPath, encrypted);
                dialog.DialogResult = DialogResult.OK;
                dialog.Close();
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or CryptographicException)
            {
                MessageBox.Show(dialog, "Não foi possível salvar o token na pasta do usuário.",
                    "Erro", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        };
        dialog.Controls.AddRange(new Control[] { instruction, secret, save, cancel });
        dialog.AcceptButton = save;
        dialog.CancelButton = cancel;
        dialog.Shown += (_, _) => secret.Focus();
        return dialog.ShowDialog() == DialogResult.OK;
    }

    internal static void ConfigureOnly()
    {
        if (AskForToken())
            MessageBox.Show("Token salvo. Abra o Assistente PC pela bandeja ou reinicie o aplicativo para conectar.",
                "Assistente PC", MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    internal static void ResetOnly()
    {
        try
        {
            if (File.Exists(Program.SecretPath)) File.Delete(Program.SecretPath);
            MessageBox.Show("Token local apagado. Revogue também o Secret no Worker. Se o aplicativo estiver aberto, encerre-o pela bandeja.",
                "Assistente PC", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            MessageBox.Show("Não foi possível apagar a credencial local.", "Assistente PC",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private static string? GetExecutablePath() => Environment.ProcessPath;

    private static bool IsStartWithWindowsEnabled()
    {
        using RegistryKey? key = Registry.CurrentUser.OpenSubKey(RunKey);
        string? path = GetExecutablePath();
        return path != null && string.Equals(key?.GetValue(RunName) as string,
            "\"" + path + "\"", StringComparison.OrdinalIgnoreCase);
    }

    private void RefreshStartWithWindows()
    {
        try { _startWithWindowsItem.Checked = IsStartWithWindowsEnabled(); }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or System.Security.SecurityException)
        {
            _startWithWindowsItem.Checked = false;
        }
    }

    private void ToggleStartWithWindows()
    {
        try
        {
            using RegistryKey key = Registry.CurrentUser.CreateSubKey(RunKey)
                ?? throw new IOException("Não foi possível acessar a Inicialização do Windows.");
            if (IsStartWithWindowsEnabled()) key.DeleteValue(RunName, throwOnMissingValue: false);
            else
            {
                string path = GetExecutablePath() ?? throw new IOException("Caminho do programa indisponível.");
                key.SetValue(RunName, "\"" + path + "\"", RegistryValueKind.String);
            }
            RefreshStartWithWindows();
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or System.Security.SecurityException)
        {
            MessageBox.Show("Não foi possível alterar a opção de iniciar com Windows.",
                "Assistente PC", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    protected override void ExitThreadCore()
    {
        _exiting = true;
        Application.Idle -= OnFirstIdle;
        _connectionCancellation?.Cancel();
        _icon.Visible = false;
        _icon.Dispose();
        _menu.Dispose();
        _dispatcher.Dispose();
        base.ExitThreadCore();
    }
}
