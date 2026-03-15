# pqLAB — Documentação

> **App de gestão de rotinas de pesquisa desenvolvido por coLAB-UFF**

---

## Descrição

O **pqLAB** é uma aplicação web voltada para pesquisadores acadêmicos que precisam organizar, em um único lugar, todas as etapas rotineiras da produção científica: registro de campo, referências bibliográficas, planos de aula, listas de leitura, tarefas e acompanhamento de publicações via RSS.

O aplicativo opera de forma totalmente client-side — sem backend próprio. Os dados do usuário são persistidos em um repositório GitHub privado (via API), garantindo versionamento, portabilidade e privacidade. Um modo de demonstração com dados fictícios está disponível para avaliação sem cadastro.

---

## Módulos

### 1. Diário de Campo
Registro cronológico de atividades de pesquisa de campo (entrevistas, visitas, observações). Cada entrada possui data, título, conteúdo em Markdown, imagens anexadas e tags. Exportação disponível em **XLS**, **PDF** e **Markdown**.

### 2. Bookmarks
Gerenciador de referências web e bibliográficas com suporte a três tipos de itens:
- **URL** — com busca automática de metadados (título, descrição, imagem via Open Graph)
- **DOI** — resolução automática via CrossRef API (autores, periódico, ano)
- **Arquivo** — PDFs e documentos locais com upload de anexos

Inclui também um **leitor de feeds RSS** integrado (aba RSS), com busca via múltiplos proxies CORS em cascata (codetabs → rss2json → allorigins).

### 3. Fichamentos
Registro estruturado de textos acadêmicos fichados. Cada fichamento contém título, autores, ano, periódico, DOI, resumo em Markdown, e entradas numeradas com páginas e anotações. Exportação individual em **PDF** (layout tipográfico elegante) e coletiva em **XLS** e **CSV**.

### 4. Planos de Aula
Planejamento de disciplinas com organização em módulos e aulas. Cada aula possui data, título, descrição, e leituras obrigatórias/complementares (com autores e ano). Suporta reordenação por drag-and-drop. Exportação em **PDF** (com capa, índice de módulos e etiquetas de leitura), **XLS** e **Markdown**.

### 5. Listas
Listas personalizáveis de itens (listas de leitura, compras, checklist, etc.) com suporte a categorias e marcação de conclusão. Interface compacta de gestão múltipla.

### 6. Tarefas
Gerenciador de tarefas com prioridades (alta/média/baixa), datas de vencimento, categorias e filtros. Visualização por status (pendente, em andamento, concluído).

---

## Tecnologias Utilizadas

### Frontend
| Tecnologia | Versão | Função |
|---|---|---|
| **React** | 19 | Biblioteca de interface (componentes, estado, hooks) |
| **TypeScript** | 5 | Tipagem estática em todo o código-fonte |
| **Vite** | 7 | Build tool e servidor de desenvolvimento (HMR) |
| **TailwindCSS** | 4 | Estilização utilitária via classes CSS |
| **React Router DOM** | 7 | Roteamento client-side (SPA) |

### Componentes de UI
| Tecnologia | Função |
|---|---|
| **Radix UI** (Primitives) | Componentes acessíveis: diálogos, abas, selects, avatares |
| **Lucide React** | Biblioteca de ícones SVG |
| **class-variance-authority** | Variantes de componentes com Tailwind |
| **clsx / tailwind-merge** | Composição condicional de classes CSS |

### Funcionalidades
| Tecnologia | Função |
|---|---|
| **jsPDF** | Geração de PDFs client-side (fichamentos, planos, diário) |
| **SheetJS (xlsx)** | Exportação de planilhas `.xlsx` |
| **@hello-pangea/dnd** | Drag-and-drop nas listas de aulas (fork mantido do react-beautiful-dnd) |
| **react-markdown + remark-gfm** | Renderização de Markdown com suporte a tabelas e listas |
| **DOMPurify** | Sanitização de HTML antes de renderização (proteção XSS no leitor RSS) |

### Autenticação e Persistência
| Tecnologia | Função |
|---|---|
| **Firebase Authentication** | Login com Google (OAuth 2.0) |
| **GitHub REST API** | Armazenamento de dados como arquivos JSON em repositório privado |
| **@tanstack/react-query** | Cache e sincronização de dados assíncronos |

### Ferramentas de Desenvolvimento
| Tecnologia | Função |
|---|---|
| **Node.js** | Ambiente de execução para build e scripts |
| **npm** | Gerenciador de pacotes |
| **ESLint** | Linting e análise estática de código |
| **Playwright** | Testes e capturas de tela automatizados |

---

## Instruções de Instalação

### Pré-requisitos

- **Node.js** ≥ 18.0
- **npm** ≥ 9.0
- Conta Google (para autenticação via Firebase)
- Conta GitHub com um repositório privado vazio para persistência de dados

### 1. Clonar o repositório

```bash
git clone https://github.com/<seu-usuario>/pqlab.git
cd pqlab
```

### 2. Instalar dependências

```bash
npm install
```

### 3. Configurar Firebase

1. Acesse [console.firebase.google.com](https://console.firebase.google.com) e crie um projeto
2. Ative **Authentication → Google** como provedor de login
3. Adicione `http://localhost:5173` aos domínios autorizados
4. Copie as credenciais do seu app Web

Crie o arquivo `public/config.json` com o seguinte conteúdo:

```json
{
  "firebase": {
    "apiKey": "SUA_API_KEY",
    "authDomain": "SEU_PROJETO.firebaseapp.com",
    "projectId": "SEU_PROJETO",
    "storageBucket": "SEU_PROJETO.appspot.com",
    "messagingSenderId": "SEU_ID",
    "appId": "SEU_APP_ID"
  }
}
```

### 4. Executar em desenvolvimento

```bash
npm run dev
```

Acesse `http://localhost:5173`.

### 5. Build para produção

```bash
npm run build
```

Os arquivos estáticos serão gerados em `dist/`. Podem ser servidos por qualquer CDN ou servidor estático (Vercel, Netlify, GitHub Pages, etc.).

### 6. Configurar persistência GitHub (in-app)

Após o login, clique em **"Configurar GitHub para persistência"** no banner de modo demonstração e forneça:
- **Token de acesso pessoal** do GitHub com permissão `repo`
- **Nome do repositório privado** que será usado como armazenamento

---

## Modo Demonstração

O pqLAB pode ser explorado sem qualquer configuração. Ao acessar o app sem autenticação completa, ele inicia em **Modo Demonstração** com dados fictícios pré-carregados. Todas as funcionalidades de visualização e exportação estão disponíveis; os dados são voláteis (resetados ao recarregar).

---

## Licença

Desenvolvido pelo **coLAB/UFF** — Laboratório de Pesquisa em Comunicação e Cultura, Universidade Federal Fluminense.
