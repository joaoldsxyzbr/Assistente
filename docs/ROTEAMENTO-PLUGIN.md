# Roteamento do Assistente — v1.2.0

O ChatGPT descobre diretamente **13 skills** por suas descrições. A skill roteamento apenas coordena trabalhos realmente mistos e nunca atua como middleware obrigatório. Métodos adicionais na pasta desenvolvimento continuam referências sob demanda.

A lista de cenários, critérios técnicos e limitações está em docs/QUALIDADE-SKILLS.md. A CI executa verificações estáticas de identidade, frontmatter e gatilhos; o comportamento real de seleção ainda requer testes na plataforma.

Não criar um segundo roteador em JavaScript nem alterar o Worker para seleção de skills.
