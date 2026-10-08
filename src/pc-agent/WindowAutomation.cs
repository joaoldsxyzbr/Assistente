using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows.Automation;

namespace AssistentePc;

internal sealed class PcAutomationException(string code, string message) : Exception(message)
{
    internal string Code { get; } = code;
}

/// <summary>Automação Windows sem imagens; somente controles acessíveis da janela ativa.</summary>
internal static class WindowAutomation
{
    private const int MaxNodes = 400;
    private const int MaxResults = 70;
    private const int MaxDepth = 8;
    private static readonly TreeWalker Walker = TreeWalker.ControlViewWalker;

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    private static (AutomationElement Element, string Id) CurrentWindow()
    {
        IntPtr handle = GetForegroundWindow();
        if (handle == IntPtr.Zero) throw new PcAutomationException("window_missing", "Nenhuma janela ativa.");
        AutomationElement element = AutomationElement.FromHandle(handle);
        return (element, $"{element.Current.ProcessId}:{handle.ToInt64():X}");
    }

    private static (List<AutomationElement> Found, int Visited, bool Truncated) Elements(AutomationElement root)
    {
        var result = new List<AutomationElement>();
        int visited = 0;
        bool truncated = false;
        using var cache = new CacheRequest
        {
            TreeScope = TreeScope.Element,
            AutomationElementMode = AutomationElementMode.Full
        };
        cache.Add(AutomationElement.NameProperty);
        cache.Add(AutomationElement.AutomationIdProperty);
        cache.Add(AutomationElement.IsPasswordProperty);
        cache.Add(AutomationElement.IsEnabledProperty);
        cache.Add(AutomationElement.IsOffscreenProperty);
        cache.Add(AutomationElement.ControlTypeProperty);
        using (cache.Activate())
        {
            void Visit(AutomationElement node, int depth)
            {
                if (depth >= MaxDepth) { truncated = true; return; }
                AutomationElement? child = Walker.GetFirstChild(node);
                while (child is not null)
                {
                    if (visited >= MaxNodes || result.Count >= MaxResults)
                    {
                        truncated = true;
                        return;
                    }
                    visited++;
                    AutomationElement? next = null;
                    try
                    {
                        next = Walker.GetNextSibling(child);
                        if (!child.Current.IsPassword)
                        {
                            // Elementos estruturais também são percorridos, mas somente
                            // controles nomeados/identificados integram o resultado.
                            if (!string.IsNullOrWhiteSpace(child.Current.Name) ||
                                !string.IsNullOrWhiteSpace(child.Current.AutomationId))
                                result.Add(child);
                            Visit(child, depth + 1);
                        }
                    }
                    catch (ElementNotAvailableException) { /* Controle transitório. */ }
                    catch (InvalidOperationException) { /* Provedor não expõe o controle. */ }
                    child = next;
                }
            }

            Visit(root, 0);
        }
        return (result, visited, truncated);
    }

    internal static object Inspect()
    {
        var timer = Stopwatch.StartNew();
        var (window, id) = CurrentWindow();
        var (elements, visited, truncated) = Elements(window);
        var items = new List<object>();
        foreach (var element in elements)
        {
            try
            {
                if (!element.Current.IsPassword)
                    items.Add(new
                    {
                        nome = Limit(element.Current.Name, 100),
                        identificador = Limit(element.Current.AutomationId, 100),
                        tipo = element.Current.ControlType.ProgrammaticName,
                        habilitado = element.Current.IsEnabled
                    });
            }
            catch (ElementNotAvailableException) { /* Elemento desapareceu. */ }
        }
        return new
        {
            janela = Limit(window.Current.Name, 120),
            janelaId = id,
            elementos = items,
            visitados = visited,
            truncado = truncated,
            duracaoMs = timer.ElapsedMilliseconds
        };
    }

    internal static object Act(string target, string action, string? text, string? windowId, string? type)
    {
        var timer = Stopwatch.StartNew();
        if (string.IsNullOrWhiteSpace(target) || target.Length > 100)
            throw new PcAutomationException("invalid_target", "Identificação de controle inválida.");
        if (action == "preencher" && (text is null || text.Length is < 1 or > 500))
            throw new PcAutomationException("invalid_text", "Texto fora dos limites permitidos.");
        if (action != "preencher" && text is not null)
            throw new PcAutomationException("invalid_text", "Esta ação não aceita texto.");

        var (window, currentId) = CurrentWindow();
        if (windowId is not null && !string.Equals(windowId, currentId, StringComparison.Ordinal))
            throw new PcAutomationException("target_changed", "A janela ativa mudou. Inspecione novamente.");
        var (elements, _, truncated) = Elements(window);
        var matches = elements.Where(e =>
            (string.Equals(e.Current.Name, target, StringComparison.OrdinalIgnoreCase) ||
             string.Equals(e.Current.AutomationId, target, StringComparison.Ordinal)) &&
            (type is null || string.Equals(e.Current.ControlType.ProgrammaticName, type, StringComparison.OrdinalIgnoreCase)))
            .Take(2).ToList();
        if (matches.Count != 1)
            throw new PcAutomationException(matches.Count > 1 ? "ambiguous" : truncated ? "search_truncated" : "not_found",
                matches.Count > 1 ? "Controle ambíguo. Use ID e tipo." :
                truncated ? "Busca limitada. Refine o controle." : "Controle não localizado.");

        AutomationElement element = matches[0];
        if (element.Current.IsPassword)
            throw new PcAutomationException("sensitive", "Controle protegido.");
        if (!element.Current.IsEnabled)
            throw new PcAutomationException("disabled", "Controle desabilitado.");
        if (element.Current.IsOffscreen)
            throw new PcAutomationException("offscreen", "Controle não está visível.");

        // Não executar ações se o foco mudou durante a inspeção.
        if (GetForegroundWindow() != new IntPtr(Convert.ToInt64(currentId.Split(':')[1], 16)))
            throw new PcAutomationException("target_changed", "A janela ativa mudou. Inspecione novamente.");

        object? pattern;
        switch (action)
        {
            case "acionar":
                if (!element.TryGetCurrentPattern(InvokePattern.Pattern, out pattern))
                    throw Unsupported();
                ((InvokePattern)pattern).Invoke();
                break;
            case "preencher":
                if (!element.TryGetCurrentPattern(ValuePattern.Pattern, out pattern))
                    throw Unsupported();
                var value = (ValuePattern)pattern;
                if (value.Current.IsReadOnly)
                    throw new PcAutomationException("read_only", "Campo somente leitura.");
                value.SetValue(text!);
                break;
            case "selecionar":
                if (!element.TryGetCurrentPattern(SelectionItemPattern.Pattern, out pattern))
                    throw Unsupported();
                ((SelectionItemPattern)pattern).Select();
                break;
            case "marcar":
            case "desmarcar":
                if (!element.TryGetCurrentPattern(TogglePattern.Pattern, out pattern))
                    throw Unsupported();
                var toggle = (TogglePattern)pattern;
                ToggleState wanted = action == "marcar" ? ToggleState.On : ToggleState.Off;
                if (toggle.Current.ToggleState != wanted) toggle.Toggle();
                if (toggle.Current.ToggleState != wanted)
                    throw new PcAutomationException("state_unconfirmed", "Não foi possível confirmar o estado.");
                break;
            case "expandir":
            case "recolher":
                if (!element.TryGetCurrentPattern(ExpandCollapsePattern.Pattern, out pattern))
                    throw Unsupported();
                var expand = (ExpandCollapsePattern)pattern;
                if (action == "expandir" && expand.Current.ExpandCollapseState != ExpandCollapseState.Expanded)
                    expand.Expand();
                if (action == "recolher" && expand.Current.ExpandCollapseState != ExpandCollapseState.Collapsed)
                    expand.Collapse();
                break;
            default:
                throw new PcAutomationException("invalid_action", "Ação UIA não permitida.");
        }

        return new { alvo = target, acao = action, executado = true,
            janelaId = currentId, duracaoMs = timer.ElapsedMilliseconds };
    }

    private static PcAutomationException Unsupported() =>
        new("unsupported_pattern", "Este controle não oferece a ação solicitada.");

    private static string Limit(string? value, int size) =>
        value is null ? "" : value.Length > size ? value[..size] : value;
}
