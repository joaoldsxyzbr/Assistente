---
name: roteamento
description: Coordene pedidos que exigem duas ou mais capacidades diferentes, como alterar código no GitHub e publicar na Cloudflare, ou quando o usuário pedir explicitamente para avaliar o roteamento do Assistente. Não use para saudações, perguntas simples ou tarefas exclusivas de um especialista.
---

# Assistente — coordenação de tarefas mistas

Esta skill é a exceção, **não** a etapa inicial obrigatória de todo pedido. O ChatGPT escolhe skills a partir das descrições. Em pedido claro de uma única área, use diretamente a skill ou ferramenta apropriada, sem passar por esta central.

## Quando usar

- Uma solicitação combina GitHub **e** Cloudflare, ou duas etapas dependentes de capacidades diferentes.
- O usuário pede para melhorar, testar ou explicar a escolha de especialistas, skills ou ferramentas.
- O pedido é realmente multidisciplinar e precisa de ordem e coordenação entre ferramentas.

## Quando não usar

- "Oi", "tudo bem?", conversa casual ou pergunta que pode ser respondida diretamente.
- Apenas criar/corrigir código, revisar um PR, consultar um repositório, mexer numa interface: **Desenvolvimento**.
- Apenas mudar o tom, as instruções personalizadas ou o comportamento das respostas: **Instruções e Comportamento**.
- Pesquisa, previsão, documento ou imagem sem coordenação técnica: use as capacidades nativas adequadas, não invente um especialista.

## Decisão e execução

1. Identifique **o resultado solicitado**, preservando contexto e restrições dos turnos anteriores. Não roteie apenas pela presença de uma palavra como "site", "visual" ou "banco".
2. Se o pedido for de uma área só, encaminhe **diretamente** a ela. Para mistos, escolha uma área principal e só acione a segunda quando de fato necessária.
3. No GitHub, use apenas as ferramentas de GitHub pertinentes. Na Cloudflare, use apenas as ferramentas de Cloudflare pertinentes. Se o pedido exigir ambos, execute na ordem necessária, verificando o resultado antes da próxima etapa.
4. Conhecendo o nome e os argumentos da ferramenta, use-os diretamente; consulte a descoberta/schema seletivamente quando estiverem ausentes ou houver dúvida. Não liste ferramentas dos dois provedores por rotina e não repita descobertas sem motivo.
5. Métodos auxiliares são lidos **sob demanda**, não como checklist. Engenharia também cuida de UX/UI. Não carregue Comportamento só para responder educadamente.
6. Respeite autorização, segurança, separação entre leitura/escrita e ambientes. Não invente conexões, resultados, deploys, logs ou recursos disponíveis.
7. Responda de forma natural e direta em português brasileiro. Não exponha toda a análise interna do roteamento nem acrescente burocracia ao fluxo.

## Limite

Uma skill orienta o modelo quando selecionada; **não** intercepta todas as mensagens nem força que o plugin seja chamado universalmente. As regras globais permanentes pertencem às instruções personalizadas do usuário. A integração MCP, por si, também não ativa skills automaticamente.
