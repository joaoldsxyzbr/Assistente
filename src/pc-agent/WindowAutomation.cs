using System.Runtime.InteropServices;
using System.Windows.Automation;

namespace AssistentePc;

/// <summary>Automação sem pixels: controla somente elementos da janela atualmente ativa.</summary>
internal static class WindowAutomation
{
    private const int MaxNodes = 250;
    private const int MaxResults = 70;
    private const int MaxDepth = 6;
    private static readonly TreeWalker Walker = TreeWalker.ControlViewWalker;

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    private static AutomationElement CurrentWindow()
    {
        IntPtr handle = GetForegroundWindow();
        if (handle == IntPtr.Zero) throw new InvalidOperationException("Janela ativa indisponível.");
        return AutomationElement.FromHandle(handle);
    }

    private static List<AutomationElement> Elements(AutomationElement root)
    {
        var result = new List<AutomationElement>();
        int visited = 0;

        void Visit(AutomationElement current, int depth)
        {
            if (depth > MaxDepth || visited >= MaxNodes || result.Count >= MaxResults) return;
            AutomationElement? child = Walker.GetFirstChild(current);
            while (child is not null && visited < MaxNodes && result.Count < MaxResults)
            {
                visited++;
                try
                {
                    // Nunca disponibilizar conteúdo nem atributos de controles de senha.
                    if (!child.Current.IsPassword &&
                        (!string.IsNullOrWhiteSpace(child.Current.Name) ||
                         !string.IsNullOrWhiteSpace(child.Current.AutomationId)))
                        result.Add(child);
                    Visit(child, depth + 1);
                }
                catch (ElementNotAvailableException) { /* Controle desapareceu. */ }
                catch (InvalidOperationException) { /* Controle não expõe UIA. */ }
                child = Walker.GetNextSibling(child);
            }
        }

        Visit(root, 0);
        return result;
    }

    internal static object Inspect()
    {
        AutomationElement window = CurrentWindow();
        List<AutomationElement> elements = Elements(window);
        return new
        {
            janela = Limit(window.Current.Name, 120),
            elementos = elements.Select(e => new {
                nome = Limit(e.Current.Name, 100),
                identificador = Limit(e.Current.AutomationId, 100),
                tipo = e.Current.ControlType.ProgrammaticName,
                habilitado = e.Current.IsEnabled
            }).ToArray(),
            truncado = elements.Count >= MaxResults
        };
    }

    internal static object Act(string target, string action, string? text)
    {
        if (string.IsNullOrWhiteSpace(target) || target.Length > 100 ||
            (action != "acionar" && action != "preencher"))
            throw new ArgumentException("Ação UI Automation não permitida.");
        if (action == "preencher" && (text is null || text.Length is < 1 or > 500))
            throw new ArgumentException("Texto inválido.");
        if (action == "acionar" && text is not null)
            throw new ArgumentException("Texto não permitido ao acionar.");

        AutomationElement window = CurrentWindow();
        var matches = Elements(window).Where(e =>
            string.Equals(e.Current.Name, target, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(e.Current.AutomationId, target, StringComparison.Ordinal)).Take(2).ToList();
        if (matches.Count != 1)
            throw new InvalidOperationException(matches.Count == 0
                ? "Elemento não encontrado na janela ativa."
                : "Nome ambíguo. Use o identificador de automação.");

        AutomationElement element = matches[0];
        if (!element.Current.IsEnabled || element.Current.IsOffscreen || element.Current.IsPassword)
            throw new InvalidOperationException("Elemento bloqueado, oculto ou sensível.");

        if (action == "acionar")
        {
            if (!element.TryGetCurrentPattern(InvokePattern.Pattern, out object? invoke))
                throw new InvalidOperationException("Elemento não oferece a ação Invocar.");
            ((InvokePattern)invoke).Invoke();
            return new { alvo = target, acao = action, executado = true };
        }

        if (!element.TryGetCurrentPattern(ValuePattern.Pattern, out object? value))
            throw new InvalidOperationException("Elemento não aceita preenchimento por UI Automation.");
        var pattern = (ValuePattern)value;
        if (pattern.Current.IsReadOnly)
            throw new InvalidOperationException("Campo somente leitura.");
        pattern.SetValue(text!);
        return new { alvo = target, acao = action, executado = true, tamanho = text!.Length };
    }

    private static string Limit(string? text, int length) =>
        text is null ? "" : text.Length > length ? text[..length] : text;
}
