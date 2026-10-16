const GITHUB_TOOL_CATALOG = [
  {
    "serverId": "github",
    "name": "get_me",
    "description": "Identifica a conta GitHub associada \xE0 credencial.",
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
    "description": "Pesquisa reposit\xF3rios acess\xEDveis; usa a sintaxe de busca GitHub.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Express\xE3o de busca GitHub."
        },
        "perPage": {
          "type": "integer",
          "description": "At\xE9 100 resultados por p\xE1gina.",
          "minimum": 1
        },
        "page": {
          "type": "integer",
          "description": "P\xE1gina.",
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
    "description": "Pesquisa c\xF3digo em reposit\xF3rios acess\xEDveis.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Consulta de c\xF3digo GitHub, incluindo repo:owner/name quando relevante."
        },
        "perPage": {
          "type": "integer",
          "description": "Resultados por p\xE1gina.",
          "minimum": 1
        },
        "page": {
          "type": "integer",
          "description": "P\xE1gina.",
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
    "description": "L\xEA arquivo ou diret\xF3rio do reposit\xF3rio indicado.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Propriet\xE1rio ou organiza\xE7\xE3o do reposit\xF3rio, informado conforme o pedido; n\xE3o h\xE1 reposit\xF3rio fixo."
        },
        "repo": {
          "type": "string",
          "description": "Nome do reposit\xF3rio escolhido para esta opera\xE7\xE3o."
        },
        "path": {
          "type": "string",
          "description": "Caminho no reposit\xF3rio."
        },
        "ref": {
          "type": "string",
          "description": "Refer\xEAncia Git opcional, como refs/heads/main."
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
    "description": "Lista branches do reposit\xF3rio.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Propriet\xE1rio ou organiza\xE7\xE3o do reposit\xF3rio, informado conforme o pedido; n\xE3o h\xE1 reposit\xF3rio fixo."
        },
        "repo": {
          "type": "string",
          "description": "Nome do reposit\xF3rio escolhido para esta opera\xE7\xE3o."
        },
        "page": {
          "type": "integer",
          "description": "P\xE1gina.",
          "minimum": 1
        },
        "perPage": {
          "type": "integer",
          "description": "Resultados por p\xE1gina.",
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
    "description": "Lista commits do reposit\xF3rio.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Propriet\xE1rio ou organiza\xE7\xE3o do reposit\xF3rio, informado conforme o pedido; n\xE3o h\xE1 reposit\xF3rio fixo."
        },
        "repo": {
          "type": "string",
          "description": "Nome do reposit\xF3rio escolhido para esta opera\xE7\xE3o."
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
          "description": "P\xE1gina.",
          "minimum": 1
        },
        "perPage": {
          "type": "integer",
          "description": "Resultados por p\xE1gina.",
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
    "description": "Cria branch no reposit\xF3rio escolhido, a partir de outra branch.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Propriet\xE1rio ou organiza\xE7\xE3o do reposit\xF3rio, informado conforme o pedido; n\xE3o h\xE1 reposit\xF3rio fixo."
        },
        "repo": {
          "type": "string",
          "description": "Nome do reposit\xF3rio escolhido para esta opera\xE7\xE3o."
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
    "description": "Cria ou substitui arquivo com conte\xFAdo UTF-8; ao atualizar forne\xE7a sha do arquivo.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Propriet\xE1rio ou organiza\xE7\xE3o do reposit\xF3rio, informado conforme o pedido; n\xE3o h\xE1 reposit\xF3rio fixo."
        },
        "repo": {
          "type": "string",
          "description": "Nome do reposit\xF3rio escolhido para esta opera\xE7\xE3o."
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
          "description": "Texto exato que ser\xE1 salvo; n\xE3o codificar em base64."
        },
        "message": {
          "type": "string",
          "description": "Mensagem de commit."
        },
        "sha": {
          "type": "string",
          "description": "SHA atual obrigat\xF3rio para arquivo existente."
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
    "description": "Atualiza v\xE1rios arquivos do reposit\xF3rio em um \xFAnico commit.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Propriet\xE1rio ou organiza\xE7\xE3o do reposit\xF3rio, informado conforme o pedido; n\xE3o h\xE1 reposit\xF3rio fixo."
        },
        "repo": {
          "type": "string",
          "description": "Nome do reposit\xF3rio escolhido para esta opera\xE7\xE3o."
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
                "description": "Conte\xFAdo UTF-8."
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
    "description": "Obt\xE9m issue, coment\xE1rios, labels ou sub-issues conforme method.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Propriet\xE1rio ou organiza\xE7\xE3o do reposit\xF3rio, informado conforme o pedido; n\xE3o h\xE1 reposit\xF3rio fixo."
        },
        "repo": {
          "type": "string",
          "description": "Nome do reposit\xF3rio escolhido para esta opera\xE7\xE3o."
        },
        "issue_number": {
          "type": "integer",
          "description": "N\xFAmero da issue.",
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
          "description": "P\xE1gina.",
          "minimum": 1
        },
        "perPage": {
          "type": "integer",
          "description": "Resultados por p\xE1gina.",
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
    "description": "Pesquisa issues nos reposit\xF3rios permitidos pelo token, com owner/repo opcionais.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Termos de busca de issues."
        },
        "owner": {
          "type": "string",
          "description": "Propriet\xE1rio opcional para restringir a busca."
        },
        "repo": {
          "type": "string",
          "description": "Reposit\xF3rio opcional."
        },
        "page": {
          "type": "integer",
          "description": "P\xE1gina.",
          "minimum": 1
        },
        "perPage": {
          "type": "integer",
          "description": "Resultados por p\xE1gina.",
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
    "description": "Cria ou atualiza issue em qualquer reposit\xF3rio autorizado pelo token.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Propriet\xE1rio ou organiza\xE7\xE3o do reposit\xF3rio, informado conforme o pedido; n\xE3o h\xE1 reposit\xF3rio fixo."
        },
        "repo": {
          "type": "string",
          "description": "Nome do reposit\xF3rio escolhido para esta opera\xE7\xE3o."
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
          "description": "N\xFAmero da issue para update.",
          "minimum": 1
        },
        "title": {
          "type": "string",
          "description": "T\xEDtulo da issue."
        },
        "body": {
          "type": "string",
          "description": "Descri\xE7\xE3o Markdown."
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
          "description": "Motivo de mudan\xE7a de estado."
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
          "description": "Usu\xE1rios designados."
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
    "description": "Adiciona coment\xE1rio a uma issue ou PR.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Propriet\xE1rio ou organiza\xE7\xE3o do reposit\xF3rio, informado conforme o pedido; n\xE3o h\xE1 reposit\xF3rio fixo."
        },
        "repo": {
          "type": "string",
          "description": "Nome do reposit\xF3rio escolhido para esta opera\xE7\xE3o."
        },
        "issue_number": {
          "type": "integer",
          "description": "N\xFAmero da issue/PR.",
          "minimum": 1
        },
        "body": {
          "type": "string",
          "description": "Coment\xE1rio Markdown."
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
    "description": "Lista PRs de um reposit\xF3rio.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Propriet\xE1rio ou organiza\xE7\xE3o do reposit\xF3rio, informado conforme o pedido; n\xE3o h\xE1 reposit\xF3rio fixo."
        },
        "repo": {
          "type": "string",
          "description": "Nome do reposit\xF3rio escolhido para esta opera\xE7\xE3o."
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
          "description": "P\xE1gina.",
          "minimum": 1
        },
        "perPage": {
          "type": "integer",
          "description": "Resultados por p\xE1gina.",
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
    "description": "Obt\xE9m detalhes, diff, arquivos, reviews, commits ou checks de uma PR.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Propriet\xE1rio ou organiza\xE7\xE3o do reposit\xF3rio, informado conforme o pedido; n\xE3o h\xE1 reposit\xF3rio fixo."
        },
        "repo": {
          "type": "string",
          "description": "Nome do reposit\xF3rio escolhido para esta opera\xE7\xE3o."
        },
        "pullNumber": {
          "type": "integer",
          "description": "N\xFAmero da PR.",
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
          "description": "P\xE1gina.",
          "minimum": 1
        },
        "perPage": {
          "type": "integer",
          "description": "Resultados por p\xE1gina.",
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
    "description": "Abre PR entre branches do reposit\xF3rio.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Propriet\xE1rio ou organiza\xE7\xE3o do reposit\xF3rio, informado conforme o pedido; n\xE3o h\xE1 reposit\xF3rio fixo."
        },
        "repo": {
          "type": "string",
          "description": "Nome do reposit\xF3rio escolhido para esta opera\xE7\xE3o."
        },
        "base": {
          "type": "string",
          "description": "Branch base."
        },
        "head": {
          "type": "string",
          "description": "Branch da mudan\xE7a."
        },
        "title": {
          "type": "string",
          "description": "T\xEDtulo."
        },
        "body": {
          "type": "string",
          "description": "Descri\xE7\xE3o Markdown."
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
    "description": "Faz merge de PR com m\xE9todo e SHA esperado opcionais.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Propriet\xE1rio ou organiza\xE7\xE3o do reposit\xF3rio, informado conforme o pedido; n\xE3o h\xE1 reposit\xF3rio fixo."
        },
        "repo": {
          "type": "string",
          "description": "Nome do reposit\xF3rio escolhido para esta opera\xE7\xE3o."
        },
        "pullNumber": {
          "type": "integer",
          "description": "N\xFAmero da PR.",
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
          "description": "SHA HEAD esperado para impedir merge de vers\xE3o inesperada."
        },
        "commit_title": {
          "type": "string",
          "description": "T\xEDtulo de commit opcional."
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
    "description": "Lista workflows, execu\xE7\xF5es, jobs ou artefatos conforme method.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Propriet\xE1rio ou organiza\xE7\xE3o do reposit\xF3rio, informado conforme o pedido; n\xE3o h\xE1 reposit\xF3rio fixo."
        },
        "repo": {
          "type": "string",
          "description": "Nome do reposit\xF3rio escolhido para esta opera\xE7\xE3o."
        },
        "method": {
          "type": "string",
          "description": "M\xE9todo GitHub Actions, como list_workflows, list_workflow_runs ou list_workflow_jobs."
        },
        "resource_id": {
          "type": "string",
          "description": "ID do workflow ou run quando exigido."
        },
        "page": {
          "type": "integer",
          "description": "P\xE1gina.",
          "minimum": 1
        },
        "perPage": {
          "type": "integer",
          "description": "Resultados por p\xE1gina.",
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
    "description": "Obt\xE9m detalhes de workflow, run, job ou artefato.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Propriet\xE1rio ou organiza\xE7\xE3o do reposit\xF3rio, informado conforme o pedido; n\xE3o h\xE1 reposit\xF3rio fixo."
        },
        "repo": {
          "type": "string",
          "description": "Nome do reposit\xF3rio escolhido para esta opera\xE7\xE3o."
        },
        "method": {
          "type": "string",
          "description": "M\xE9todo, como get_workflow, get_workflow_run ou get_workflow_job."
        },
        "resource_id": {
          "type": "string",
          "description": "ID do recurso requerido pelo m\xE9todo."
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
    "description": "Dispara ou gerencia execu\xE7\xE3o de workflow GitHub Actions.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Propriet\xE1rio ou organiza\xE7\xE3o do reposit\xF3rio, informado conforme o pedido; n\xE3o h\xE1 reposit\xF3rio fixo."
        },
        "repo": {
          "type": "string",
          "description": "Nome do reposit\xF3rio escolhido para esta opera\xE7\xE3o."
        },
        "method": {
          "type": "string",
          "description": "M\xE9todo oficial como run_workflow, rerun_workflow_run ou cancel_workflow_run."
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
          "description": "ID da execu\xE7\xE3o para a\xE7\xF5es sobre runs.",
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
    "description": "Obt\xE9m logs de um job do GitHub Actions ou dos jobs que falharam.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "owner": {
          "type": "string",
          "description": "Propriet\xE1rio ou organiza\xE7\xE3o do reposit\xF3rio, informado conforme o pedido; n\xE3o h\xE1 reposit\xF3rio fixo."
        },
        "repo": {
          "type": "string",
          "description": "Nome do reposit\xF3rio escolhido para esta opera\xE7\xE3o."
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
          "description": "N\xFAmero de linhas finais.",
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
export {
  GITHUB_TOOL_CATALOG
};
