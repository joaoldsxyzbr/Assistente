# Assistente — versão 1.2.0

Plugin pessoal com skills de engenharia maduras e seletivas, inspirado nos princípios de qualidade do [Superpowers](https://github.com/obra/superpowers), sem copiar hooks obrigatórios ou depender de subagentes não disponíveis.

## Descoberta direta — 13 skills

| Skill | Quando usar |
| --- | --- |
| `desenvolvimento` | Implementar e alterar código |
| `depuracao` | Investigar causa raiz de bugs |
| `descoberta-de-requisitos` | Definir produto ou função ainda ambíguos |
| `planejamento-tecnico` | Planejar implementação complexa |
| `desenvolvimento-orientado-a-testes` | Testes antes da lógica nova (TDD) |
| `execucao-de-planos` | Executar plano em etapas verificáveis |
| `revisao-e-testes` | Revisar código, PR e regressões |
| `revisao-de-feedback` | Avaliar comentários de revisão |
| `verificacao-de-entrega` | Conferir evidências antes de declarar conclusão |
| `integracao-de-branches` | Preparar PR, merge e releases |
| `ux-ui` | Melhorar aparência, usabilidade e acessibilidade |
| `instrucoes-e-comportamento` | Comunicação, preferências e instruções |
| `roteamento` | Coordenar pedidos realmente multidisciplinares |

Cada pasta acima contém `SKILL.md` com critérios de ativação. As referências `.md` nas pastas de Desenvolvimento e Comportamento continuam disponíveis sob demanda, sem virar etapas obrigatórias.

## Qualidade de engenharia

- Investigar **causa raiz** antes de corrigir, sem remendos aleatórios.
- Usar **RED → GREEN → REFACTOR** para código testável e reportar exceções honestamente.
- Planejar tarefas com critérios de aceite; executar com checkpoints e verificação.
- Validar testes, logs, UI e estado remoto **antes** de declarar concluído.
- Revisar feedback tecnicamente e confirmar o estado do merge/deploy.
- Delegar trabalho **somente** quando a plataforma disponibilizar subagentes e houver ganho real.

## Integrações e segurança

Identidade do plugin e App existente preservadas; o vínculo `.app.json` continua com GitHub e Cloudflare. Nenhum segredo, token, Worker ou banco faz parte do ZIP. Linguagens permitidas: JS, Python, C#, HTML/CSS/SQL. Sem dependências comunitárias não autorizadas.

As skills são instruções, não um roteador executável do modelo. A descoberta é decidida pelo ChatGPT, portanto **testes estáticos não comprovam seleção comportamental**, que deve ser aferida com casos reais na interface.

Código-fonte: [GitHub Assistente](https://github.com/joaoldsxyzbr/Assistente/tree/main/plugin); cenários e gates: `docs/QUALIDADE-SKILLS.md`.
