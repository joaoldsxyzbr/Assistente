import type { McpToolContract } from "../contracts.ts";

/** Allowlist estática do MCP oficial GitHub. Nenhum owner/repo é fixado. */
export const GITHUB_TOOL_CATALOG: readonly McpToolContract[] = [
  {
    "serverId": "github",
    "name": "get_me",
    "description": "Identifica a conta GitHub associada à credencial.",
    "inputSchema": {
      "type": "object",
      "properties": {},
      "required": [],
      "additionalProperties": false
    },
    "isWrite": false
  },
  {
    "serverId": "github",
    "name": "search_repositories",
    "description": "Pesquisa repositórios acessíveis; usa a sintaxe de busca GitHub.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Expressão de busca GitHub."
        },
        "perPage": {
          "type": "integer",
          "description": "Até 100 resultados por página.",
          "minimum": 1
        },
        "page": {
          "type": "integer",
          "description": "Página.",
          "minimum": 1
        }
      },
      "required": [
        "query"
      ],
      "additionalProperties": false
    },
    "isWrite": false
  },
  {
    "serverId": "github",
    "name": "search_code",
    "description": "Pesquisa código em repositórios acessíveis.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Consulta de código GitHub, incluindo repo:owner/name quando relevante."
        },
        "perPage": {
          "type": "integer",
          "description": "Resultados por página.",
          "minimum": 1
        },
        "page": {
          "type": "integer",
          "description": "Página.",
          "minimum": 1
        }
      },
      "required": [
        "query"
      ],
      "additionalProperties": false
    },
    "isWrite": false
  },
  {
    "serverId": "github",
    "name": "get_file_contents",
    "description": "Lê arquivo ou diretório do repositório indicado.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Proprietário ou organização do repositório, informado conforme o pedido; não há repositório fixo."
        },
        "repo": {
          "type": "string",
          "description": "Nome do repositório escolhido para esta operação."
        },
        "path": {
          "type": "string",
          "description": "Caminho no repositório."
        },
        "ref": {
          "type": "string",
          "description": "Referência Git opcional, como refs/heads/main."
        },
        "sha": {
          "type": "string",
          "description": "SHA do commit opcional."
        }
      },
      "required": [
        "owner",
        "repo"
      ],
      "additionalProperties": false
    },
    "isWrite": false
  },
  {
    "serverId": "github",
    "name": "list_branches",
    "description": "Lista branches do repositório.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Proprietário ou organização do repositório, informado conforme o pedido; não há repositório fixo."
        },
        "repo": {
          "type": "string",
          "description": "Nome do repositório escolhido para esta operação."
        },
        "page": {
          "type": "integer",
          "description": "Página.",
          "minimum": 1
        },
        "perPage": {
          "type": "integer",
          "description": "Resultados por página.",
          "minimum": 1
        }
      },
      "required": [
        "owner",
        "repo"
      ],
      "additionalProperties": false
    },
    "isWrite": false
  },
  {
    "serverId": "github",
    "name": "list_commits",
    "description": "Lista commits do repositório.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Proprietário ou organização do repositório, informado conforme o pedido; não há repositório fixo."
        },
        "repo": {
          "type": "string",
          "description": "Nome do repositório escolhido para esta operação."
        },
        "sha": {
          "type": "string",
          "description": "Branch ou commit inicial opcional."
        },
        "path": {
          "type": "string",
          "description": "Caminho opcional."
        },
        "page": {
          "type": "integer",
          "description": "Página.",
          "minimum": 1
        },
        "perPage": {
          "type": "integer",
          "description": "Resultados por página.",
          "minimum": 1
        }
      },
      "required": [
        "owner",
        "repo"
      ],
      "additionalProperties": false
    },
    "isWrite": false
  },
  {
    "serverId": "github",
    "name": "create_branch",
    "description": "Cria branch no repositório escolhido, a partir de outra branch.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Proprietário ou organização do repositório, informado conforme o pedido; não há repositório fixo."
        },
        "repo": {
          "type": "string",
          "description": "Nome do repositório escolhido para esta operação."
        },
        "branch": {
          "type": "string",
          "description": "Nome da nova branch."
        },
        "from_branch": {
          "type": "string",
          "description": "Branch de origem opcional."
        }
      },
      "required": [
        "owner",
        "repo",
        "branch"
      ],
      "additionalProperties": false
    },
    "isWrite": true
  },
  {
    "serverId": "github",
    "name": "create_or_update_file",
    "description": "Cria ou substitui arquivo com conteúdo UTF-8; ao atualizar forneça sha do arquivo.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Proprietário ou organização do repositório, informado conforme o pedido; não há repositório fixo."
        },
        "repo": {
          "type": "string",
          "description": "Nome do repositório escolhido para esta operação."
        },
        "branch": {
          "type": "string",
          "description": "Branch de destino."
        },
        "path": {
          "type": "string",
          "description": "Caminho do arquivo."
        },
        "content": {
          "type": "string",
          "description": "Texto exato que será salvo; não codificar em base64."
        },
        "message": {
          "type": "string",
          "description": "Mensagem de commit."
        },
        "sha": {
          "type": "string",
          "description": "SHA atual obrigatório para arquivo existente."
        }
      },
      "required": [
        "owner",
        "repo",
        "branch",
        "path",
        "content",
        "message"
      ],
      "additionalProperties": false
    },
    "isWrite": true
  },
  {
    "serverId": "github",
    "name": "push_files",
    "description": "Atualiza vários arquivos do repositório em um único commit.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Proprietário ou organização do repositório, informado conforme o pedido; não há repositório fixo."
        },
        "repo": {
          "type": "string",
          "description": "Nome do repositório escolhido para esta operação."
        },
        "branch": {
          "type": "string",
          "description": "Branch de destino."
        },
        "message": {
          "type": "string",
          "description": "Mensagem de commit."
        },
        "files": {
          "type": "array",
          "description": "Arquivos para alterar; cada item possui path e content.",
          "items": {
            "type": "object",
            "properties": {
              "path": {
                "type": "string",
                "description": "Caminho relativo."
              },
              "content": {
                "type": "string",
                "description": "Conteúdo UTF-8."
              }
            },
            "required": [
              "path",
              "content"
            ],
            "additionalProperties": false
          }
        }
      },
      "required": [
        "owner",
        "repo",
        "branch",
        "message",
        "files"
      ],
      "additionalProperties": false
    },
    "isWrite": true
  },
  {
    "serverId": "github",
    "name": "issue_read",
    "description": "Obtém issue, comentários, labels ou sub-issues conforme method.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Proprietário ou organização do repositório, informado conforme o pedido; não há repositório fixo."
        },
        "repo": {
          "type": "string",
          "description": "Nome do repositório escolhido para esta operação."
        },
        "issue_number": {
          "type": "integer",
          "description": "Número da issue.",
          "minimum": 1
        },
        "method": {
          "type": "string",
          "enum": [
            "get",
            "get_comments",
            "get_sub_issues",
            "get_parent",
            "get_labels"
          ]
        },
        "page": {
          "type": "integer",
          "description": "Página.",
          "minimum": 1
        },
        "perPage": {
          "type": "integer",
          "description": "Resultados por página.",
          "minimum": 1
        }
      },
      "required": [
        "owner",
        "repo",
        "issue_number",
        "method"
      ],
      "additionalProperties": false
    },
    "isWrite": false
  },
  {
    "serverId": "github",
    "name": "search_issues",
    "description": "Pesquisa issues nos repositórios permitidos pelo token, com owner/repo opcionais.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Termos de busca de issues."
        },
        "owner": {
          "type": "string",
          "description": "Proprietário opcional para restringir a busca."
        },
        "repo": {
          "type": "string",
          "description": "Repositório opcional."
        },
        "page": {
          "type": "integer",
          "description": "Página.",
          "minimum": 1
        },
        "perPage": {
          "type": "integer",
          "description": "Resultados por página.",
          "minimum": 1
        }
      },
      "required": [
        "query"
      ],
      "additionalProperties": false
    },
    "isWrite": false
  },
  {
    "serverId": "github",
    "name": "issue_write",
    "description": "Cria ou atualiza issue em qualquer repositório autorizado pelo token.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Proprietário ou organização do repositório, informado conforme o pedido; não há repositório fixo."
        },
        "repo": {
          "type": "string",
          "description": "Nome do repositório escolhido para esta operação."
        },
        "method": {
          "type": "string",
          "enum": [
            "create",
            "update"
          ]
        },
        "issue_number": {
          "type": "integer",
          "description": "Número da issue para update.",
          "minimum": 1
        },
        "title": {
          "type": "string",
          "description": "Título da issue."
        },
        "body": {
          "type": "string",
          "description": "Descrição Markdown."
        },
        "state": {
          "type": "string",
          "enum": [
            "open",
            "closed"
          ]
        },
        "state_reason": {
          "type": "string",
          "description": "Motivo de mudança de estado."
        },
        "labels": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Labels opcionais."
        },
        "assignees": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Usuários designados."
        }
      },
      "required": [
        "owner",
        "repo",
        "method"
      ],
      "additionalProperties": false
    },
    "isWrite": true
  },
  {
    "serverId": "github",
    "name": "add_issue_comment",
    "description": "Adiciona comentário a uma issue ou PR.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Proprietário ou organização do repositório, informado conforme o pedido; não há repositório fixo."
        },
        "repo": {
          "type": "string",
          "description": "Nome do repositório escolhido para esta operação."
        },
        "issue_number": {
          "type": "integer",
          "description": "Número da issue/PR.",
          "minimum": 1
        },
        "body": {
          "type": "string",
          "description": "Comentário Markdown."
        }
      },
      "required": [
        "owner",
        "repo",
        "issue_number",
        "body"
      ],
      "additionalProperties": false
    },
    "isWrite": true
  },
  {
    "serverId": "github",
    "name": "list_pull_requests",
    "description": "Lista PRs de um repositório.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Proprietário ou organização do repositório, informado conforme o pedido; não há repositório fixo."
        },
        "repo": {
          "type": "string",
          "description": "Nome do repositório escolhido para esta operação."
        },
        "state": {
          "type": "string",
          "enum": [
            "open",
            "closed",
            "all"
          ]
        },
        "page": {
          "type": "integer",
          "description": "Página.",
          "minimum": 1
        },
        "perPage": {
          "type": "integer",
          "description": "Resultados por página.",
          "minimum": 1
        }
      },
      "required": [
        "owner",
        "repo"
      ],
      "additionalProperties": false
    },
    "isWrite": false
  },
  {
    "serverId": "github",
    "name": "pull_request_read",
    "description": "Obtém detalhes, diff, arquivos, reviews, commits ou checks de uma PR.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Proprietário ou organização do repositório, informado conforme o pedido; não há repositório fixo."
        },
        "repo": {
          "type": "string",
          "description": "Nome do repositório escolhido para esta operação."
        },
        "pullNumber": {
          "type": "integer",
          "description": "Número da PR.",
          "minimum": 1
        },
        "method": {
          "type": "string",
          "enum": [
            "get",
            "get_diff",
            "get_status",
            "get_files",
            "get_commits",
            "get_review_comments",
            "get_reviews",
            "get_comments",
            "get_check_runs"
          ]
        },
        "page": {
          "type": "integer",
          "description": "Página.",
          "minimum": 1
        },
        "perPage": {
          "type": "integer",
          "description": "Resultados por página.",
          "minimum": 1
        }
      },
      "required": [
        "owner",
        "repo",
        "pullNumber",
        "method"
      ],
      "additionalProperties": false
    },
    "isWrite": false
  },
  {
    "serverId": "github",
    "name": "create_pull_request",
    "description": "Abre PR entre branches do repositório.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Proprietário ou organização do repositório, informado conforme o pedido; não há repositório fixo."
        },
        "repo": {
          "type": "string",
          "description": "Nome do repositório escolhido para esta operação."
        },
        "base": {
          "type": "string",
          "description": "Branch base."
        },
        "head": {
          "type": "string",
          "description": "Branch da mudança."
        },
        "title": {
          "type": "string",
          "description": "Título."
        },
        "body": {
          "type": "string",
          "description": "Descrição Markdown."
        },
        "draft": {
          "type": "boolean",
          "description": "Abrir como rascunho."
        }
      },
      "required": [
        "owner",
        "repo",
        "base",
        "head",
        "title"
      ],
      "additionalProperties": false
    },
    "isWrite": true
  },
  {
    "serverId": "github",
    "name": "merge_pull_request",
    "description": "Faz merge de PR com método e SHA esperado opcionais.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Proprietário ou organização do repositório, informado conforme o pedido; não há repositório fixo."
        },
        "repo": {
          "type": "string",
          "description": "Nome do repositório escolhido para esta operação."
        },
        "pullNumber": {
          "type": "integer",
          "description": "Número da PR.",
          "minimum": 1
        },
        "merge_method": {
          "type": "string",
          "enum": [
            "merge",
            "squash",
            "rebase"
          ]
        },
        "expectedHeadSha": {
          "type": "string",
          "description": "SHA HEAD esperado para impedir merge de versão inesperada."
        },
        "commit_title": {
          "type": "string",
          "description": "Título de commit opcional."
        },
        "commit_message": {
          "type": "string",
          "description": "Mensagem de commit opcional."
        }
      },
      "required": [
        "owner",
        "repo",
        "pullNumber"
      ],
      "additionalProperties": false
    },
    "isWrite": true
  },
  {
    "serverId": "github",
    "name": "actions_list",
    "description": "Lista workflows, execuções, jobs ou artefatos conforme method.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Proprietário ou organização do repositório, informado conforme o pedido; não há repositório fixo."
        },
        "repo": {
          "type": "string",
          "description": "Nome do repositório escolhido para esta operação."
        },
        "method": {
          "type": "string",
          "description": "Método GitHub Actions, como list_workflows, list_workflow_runs ou list_workflow_jobs."
        },
        "resource_id": {
          "type": "string",
          "description": "ID do workflow ou run quando exigido."
        },
        "page": {
          "type": "integer",
          "description": "Página.",
          "minimum": 1
        },
        "perPage": {
          "type": "integer",
          "description": "Resultados por página.",
          "minimum": 1
        }
      },
      "required": [
        "owner",
        "repo",
        "method"
      ],
      "additionalProperties": false
    },
    "isWrite": false
  },
  {
    "serverId": "github",
    "name": "actions_get",
    "description": "Obtém detalhes de workflow, run, job ou artefato.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Proprietário ou organização do repositório, informado conforme o pedido; não há repositório fixo."
        },
        "repo": {
          "type": "string",
          "description": "Nome do repositório escolhido para esta operação."
        },
        "method": {
          "type": "string",
          "description": "Método, como get_workflow, get_workflow_run ou get_workflow_job."
        },
        "resource_id": {
          "type": "string",
          "description": "ID do recurso requerido pelo método."
        }
      },
      "required": [
        "owner",
        "repo",
        "method",
        "resource_id"
      ],
      "additionalProperties": false
    },
    "isWrite": false
  },
  {
    "serverId": "github",
    "name": "actions_run_trigger",
    "description": "Dispara ou gerencia execução de workflow GitHub Actions.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Proprietário ou organização do repositório, informado conforme o pedido; não há repositório fixo."
        },
        "repo": {
          "type": "string",
          "description": "Nome do repositório escolhido para esta operação."
        },
        "method": {
          "type": "string",
          "description": "Método oficial como run_workflow, rerun_workflow_run ou cancel_workflow_run."
        },
        "workflow_id": {
          "type": "string",
          "description": "ID ou nome do YAML para run_workflow."
        },
        "ref": {
          "type": "string",
          "description": "Branch/tag para run_workflow."
        },
        "run_id": {
          "type": "integer",
          "description": "ID da execução para ações sobre runs.",
          "minimum": 1
        },
        "inputs": {
          "type": "object",
          "description": "Inputs opcionais do workflow.",
          "additionalProperties": true
        }
      },
      "required": [
        "owner",
        "repo",
        "method"
      ],
      "additionalProperties": false
    },
    "isWrite": true
  },
  {
    "serverId": "github",
    "name": "get_job_logs",
    "description": "Obtém logs de um job do GitHub Actions ou dos jobs que falharam.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Proprietário ou organização do repositório, informado conforme o pedido; não há repositório fixo."
        },
        "repo": {
          "type": "string",
          "description": "Nome do repositório escolhido para esta operação."
        },
        "job_id": {
          "type": "integer",
          "description": "ID do job.",
          "minimum": 1
        },
        "run_id": {
          "type": "integer",
          "description": "ID do run.",
          "minimum": 1
        },
        "failed_only": {
          "type": "boolean",
          "description": "Somente jobs com falha."
        },
        "return_content": {
          "type": "boolean",
          "description": "Retornar texto dos logs."
        },
        "tail_lines": {
          "type": "integer",
          "description": "Número de linhas finais.",
          "minimum": 1
        }
      },
      "required": [
        "owner",
        "repo"
      ],
      "additionalProperties": false
    },
    "isWrite": false
  }
];
