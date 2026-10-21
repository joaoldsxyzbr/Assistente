---
name: integracao-de-branches
description: Use quando o usuário pedir preparar ou integrar branch, abrir ou mesclar PR, criar tag, publicar release ou organizar a entrega de código no GitHub. Não use para analisar um repositório sem publicar nem para commit local simples.
---

# Integração segura de branches e entregas

O trabalho só termina quando o estado remoto foi **confirmado**, não quando uma chamada de API foi enviada.

1. **Identificar:** repositório e branch de origem/destino, commit esperado, ambiente e necessidade de publicação. Não trate preview e produção como iguais.
2. **Proteção:** confira diff, arquivos inesperados, secrets, autorizações e testes disponíveis. Não use force push ou apague histórico por conveniência.
3. **PR:** descreva objetivo, alterações, riscos, testes e rollback. Se as regras da branch exigirem checks, aguarde sucesso efetivo antes do merge.
4. **Conciliação:** antes de merge, valide estado atualizado e SHA do head quando a ferramenta permitir; evite corrida e reescrita de mudanças paralelas.
5. **Publicação:** tags/releases/Worker exigem ação específica. Merge no GitHub não comprova deploy Cloudflare.
6. **Verificação:** releia PR, commit final, workflow e artefatos; se aplicável, faça smoke test sem dados sensíveis.
7. **Comunicação:** informe link, branch, commit, status dos testes, o que realmente foi publicado e o que ficou apenas preparado.

**Limite:** uma skill não fornece permissões de escrita nem dispensa confirmação para operações destrutivas ou de alto impacto não autorizadas.
