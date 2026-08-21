# Especificação Técnica e Funcional — Gotardo Finanças

> Documento técnico completo para o sistema de gerenciamento e planejamento financeiro
> familiar. Versão 1.0 — Agosto 2026.

---

## Índice

1. [Visão do Produto](#1-visão-do-produto)
2. [Requisitos Funcionais](#2-requisitos-funcionais)
3. [Processamento de Documentos](#3-processamento-de-documentos)
4. [Arquitetura de Importação Bancária](#4-arquitetura-de-importação-bancária)
5. [Modelo de Dados Financeiro](#5-modelo-de-dados-financeiro)
6. [Motor de Categorização](#6-motor-de-categorização)
7. [Dashboard Financeiro](#7-dashboard-financeiro)
8. [Metas e Objetivos Financeiros](#8-metas-e-objetivos-financeiros)
9. [Motor de Projeção](#9-motor-de-projeção)
10. [Simulador de Cenários](#10-simulador-de-cenários)
11. [Arquitetura de IA](#11-arquitetura-de-ia)
12. [UX/UI](#12-uxui)
13. [Segurança e Privacidade](#13-segurança-e-privacidade)
14. [Arquitetura Técnica](#14-arquitetura-técnica)
15. [Arquitetura de API](#15-arquitetura-de-api)
16. [Fluxo de Importação](#16-fluxo-de-importação)
17. [Fluxo de Recibos](#17-fluxo-de-recibos)
18. [Relatórios](#18-relatórios)
19. [Notificações](#19-notificações)
20. [Regras de Negócio](#20-regras-de-negócio)
21. [Validação](#21-validação)
22. [MVP](#22-mvp)
23. [Roadmap](#23-roadmap)
24. [Plano de Desenvolvimento](#24-plano-de-desenvolvimento)
25. [Estratégia de Testes](#25-estratégia-de-testes)
26. [Casos Extremos](#26-casos-extremos)
27. [Inteligência Financeira](#27-inteligência-financeira)
28. [Assistente Conversacional](#28-assistente-conversacional)
29. [Entregáveis](#29-entregáveis)
30. [Próximos Passos](#30-próximos-passos)

---

## 1. Visão do Produto

### 1.1 Nome do Produto

**Gotardo Finanças** — Gerenciamento e Planejamento Financeiro Familiar

### 1.2 Problema que Resolve

Famílias brasileiras possuem informações financeiras dispersas em múltiplas contas bancárias, cartões de crédito, planos de saúde, assinaturas e compromissos. A ausência de uma visão consolidada gera:

- Dificuldade em saber "quanto entra e quanto sai"
- Esquecimento de compromissos e vencimentos
- Incapacidade de planejar objetivos de médio/longo prazo
- Gastos indevidos por falta de controle
- Decisões financeiras baseadas em intuição

### 1.3 Público-alvo

| Perfil | Característica |
|---|---|
| Família nuclear | 2-4 membros, renda combinada, contas compartilhadas |
| Família estendida | Múltiplas gerações, contas separadas, repartição de despesas |
| Casal sem filhos | Planejamento de curto prazo, viagens, reserva |
| Pessoa solo com dependentes | Controle rigoroso, múltiplas fontes de renda |
| Família de baixa renda | Necessidade premente de controle, sem margem para erro |

### 1.4 Proposta de Valor

1. **Centralização**: Todos os dados financeiros em um único lugar
2. **Automatização**: Importação de extratos, categorização por IA, detecção de duplicatas
3. **Visibilidade**: Dashboard claro com indicadores de saúde financeira
4. **Planejamento**: Orçamento, metas, projeções e simulações
5. **Controle**: Alertas inteligentes sobre desvios e oportunidades
6. **Privacidade**: Dados nunca saem do servidor do usuário (on-premises)
7. **Acessibilidade**: PWA instalável, funciona offline para consulta

### 1.5 Principais Diferenciais

| Diferencial | Descrição |
|---|---|
| Multi-tenant por família | Isolamento completo entre famílias |
| OCR + IA | Extração inteligente de dados de recibos e comprovantes |
| Aprendizado contínuo | Categorização melhora com o uso |
| Projeções e simulações | "O que acontece se eu economizar X?" |
| PWA offline-first | Funciona sem internet para consulta |
| On-premises | Dados nunca saem do servidor |
| Open source | Código auditável e customizável |

### 1.6 Resultado Esperado para o Usuário

Após 30 dias de uso, o usuário deverá conseguir responder:

- "Quanto entra e quanto sai por mês?"
- "Para onde está indo meu dinheiro?"
- "Quanto posso gastar sem comprometer meus objetivos?"
- "Estou cumprindo meu orçamento?"
- "Quando alcançarei minha reserva de emergência?"

---

## 2. Requisitos Funcionais

### 2.1 Usuários e Família

<Requirement>
<Name>Registro de Família</Name>
<Description>Criar conta com criação automática da família (primeiro usuário = OWNER). Suporte a convite de membros via token.</Description>
<Priority>P0</Priority>
<AcceptanceCriteria>Registro cria família + usuário OWNER; convite gera token com expiração de 7 dias; aceite cria usuário na família</AcceptanceCriteria>
</Requirement>

<Requirement>
<Name>Autenticação</Name>
<Description>Login por email/senha com JWT access (15min) + refresh (30d) com rotação. Logout revoga refresh token.</Description>
<Priority>P0</Priority>
<AcceptanceCriteria>Refresh rotação invalida token anterior; sessão expira corretamente; rate limit em login/registro</AcceptanceCriteria>
</Requirement>

<Requirement>
<Name>Controle de Papéis</Name>
<Description>4 papéis: OWNER (controle total), ADMIN (gerencia dados), MEMBER (uso normal), VIEWER (somente leitura).</Description>
<Priority>P0</Priority>
<AcceptanceCriteria>OWNER/ADMIN gerenciam; MEMBER usa; VIEWER lê. Mínimo 1 OWNER por família.</AcceptanceCriteria>
</Requirement>

<Requirement>
<Name>Gestão de Membros</Name>
<Description>OWNER/ADMIN podem convidar membros, alterar papéis e revogar convites.</Description>
<Priority>P1</Priority>
<AcceptanceCriteria>Lista de membros com papéis; alteração respeita hierarquia; convite expira em 7 dias</AcceptanceCriteria>
</Requirement>

### 2.2 Contas Bancárias

<Requirement>
<Name>CRUD de Contas</Name>
<Description>Tipos: CHECKING, SAVINGS, INVESTMENT, CASH, CREDIT_CARD. Campos: nome, tipo, instituição, moeda, saldo, limite (cartão), data de vencimento (cartão).</Description>
<Priority>P0</Priority>
<AcceptanceCriteria>Isolamento por família; saldo atualizado automaticamente; exclusão bloqueada se houver transações</AcceptanceCriteria>
</Requirement>

<Requirement>
<Name>Consolidação de Saldos</Name>
<Description>Saldo total = soma dos saldos de todas as contas ativas. Atualizado em tempo real a cada transação confirmada.</Description>
<Priority>P0</Priority>
<AcceptanceCriteria>Dashboard mostra saldo total; edição/exclusão ajusta saldo retroativamente</AcceptanceCriteria>
</Requirement>

### 2.3 Cartões de Crédito

<Requirement>
<Name>Conta tipo Cartão de Crédito</Name>
<Description>Modelar cartão como Account com type=CREDIT_CARD. Campos: limite, data de vencimento da fatura, dia de fechamento.</Description>
<Priority>P1</Priority>
<AcceptanceCriteria>Cartão permite registrar compras; fatura mensal visualizada; pagamento registrado como transferência</AcceptanceCriteria>
</Requirement>

<Requirement>
<Name>Parcelamentos</Name>
<Description>Compras parceladas geram N transações PENDING com número da parcela e data de vencimento. Edição afeta somente parcelas não confirmadas.</Description>
<Priority>P1</Priority>
<AcceptanceCriteria>Uma compra parcelada gera N transações; cada parcela tem número e data; edição afeta parcelas futuras</AcceptanceCriteria>
</Requirement>

### 2.4 Importação Bancária

<Requirement>
<Name>Upload de Arquivos</Name>
<Description>Upload de OFX, QFX, CSV, XLSX, PDF, imagens. Armazenamento no MinIO com registro em Document.</Description>
<Priority>P0 (OFX/CSV), P2 (XLSX), P3 (PDF/imagem)</Priority>
<AcceptanceCriteria>Upload cria Document com status PENDING; processamento assíncrono; transações criadas com status PENDING</AcceptanceCriteria>
</Requirement>

<Requirement>
<Name>Parser CSV Brasileiro</Name>
<Description>Parser robusto: delimitador detection (; vs ,), datas DD/MM/AAAA, colunas crédito/débito, encoding latin1/utf-8.</Description>
<Priority>P0</Priority>
<AcceptanceCriteria>Correto parsing de CSVs de bancos brasileiros; detecção automática de delimitador e headers</AcceptanceCriteria>
</Requirement>

<Requirement>
<Name>Parser OFX/QFX</Name>
<Description>Parser SGML com extração de TRNAMT, DTPOSTED, FITID, NAME, MEMO, TRNTYPE.</Description>
<Priority>P0</Priority>
<AcceptanceCriteria>Correto parsing de OFX padrão; FITID usado para dedup; TRNTYPE mapeado corretamente</AcceptanceCriteria>
</Requirement>

<Requirement>
<Name>Importação XLSX</Name>
<Description>Processar planilhas Excel (.xlsx) com conversão para CSV interno. Utilizar biblioteca xlsx/SheetJS.</Description>
<Priority>P2</Priority>
<AcceptanceCriteria>XLSX interpretado como planilha; primeira aba usada; headers detectados</AcceptanceCriteria>
</Requirement>

<Requirement>
<Name>Importação de PDFs e Imagens</Name>
<Description>Upload de PDFs e imagens. OCR via PaddleOCR para extração de texto. Campos financeiros identificados.</Description>
<Priority>P3</Priority>
<AcceptanceCriteria>Upload aceita PDF/JPG/PNG; OCR extrai texto; campos identificados; dados para revisão</AcceptanceCriteria>
</Requirement>

<Requirement>
<Name>Deduplicação</Name>
<Description>Detectar duplicatas via FITID (OFX) ou combinação data+valor+descrição normalizada.</Description>
<Priority>P0</Priority>
<AcceptanceCriteria>Nenhuma transação duplicada; dedup por FITID OU data+valor+descrição</AcceptanceCriteria>
</Requirement>

### 2.5 Transações

<Requirement>
<Name>CRUD de Transações</Name>
<Description>Campos: data, descrição, valor, tipo (INCOME/EXPENSE/TRANSFER), categoria, conta, envelope, status, forma de pagamento, fonte.</Description>
<Priority>P0</Priority>
<AcceptanceCriteria>Transação vinculada a conta e categoria; saldo ajustado ao confirmar; exclusão reverte saldo</AcceptanceCriteria>
</Requirement>

<Requirement>
<Name>Fluxo de Status</Name>
<Description>PENDING → CONFIRMED/REJECTED/REVIEW. Somente CONFIRMED afeta saldo.</Description>
<Priority>P0</Priority>
<AcceptanceCriteria>PENDING não afeta saldo; CONFIRMED ajusta; REJECTED ignora; REVIEW fica para análise</AcceptanceCriteria>
</Requirement>

<Requirement>
<Name>Transferências Entre Contas</Name>
<Description>Registrar transferência como par de transações vinculadas (saída + entrada). Não afeta saldo líquido da família.</Description>
<Priority>P1</Priority>
<AcceptanceCriteria>Par de transações criado; ambas vinculadas; saldo de cada conta ajusta; saldo total não muda</AcceptanceCriteria>
</Requirement>

### 2.6 Categorias

<Requirement>
<Name>Categorias Hierárquicas</Name>
<Description>Subcategorias via parentId. Isolamento por família. Proteção contra ciclos e exclusão com filhos.</Description>
<Priority>P0</Priority>
<AcceptanceCriteria>Hierarquia funcional; sem ciclos; exclusão bloqueada se tiver subcategorias ou transações</AcceptanceCriteria>
</Requirement>

<Requirement>
<Name>Categorização por IA</Name>
<Description>Serviço ML sugere categoria baseada na descrição. Regras PT-BR + aprendizado por família. Exibe "Sugerido: X" com botão "Aplicar".</Description>
<Priority>P1</Priority>
<AcceptanceCriteria>ML retorna categoria com confiança; dashboard exibe sugestão; falha do ML não bloqueia</AcceptanceCriteria>
</Requirement>

### 2.7 Recibos e Documentos

<Requirement>
<Name>Upload de Documentos</Name>
<Description>Upload de recibos e comprovantes em PDF e imagem. Armazenamento no MinIO com metadados.</Description>
<Priority>P2</Priority>
<AcceptanceCriteria>Upload aceita PDF/JPG/PNG; armazenamento seguro; metadados registrados; acesso restrito à família</AcceptanceCriteria>
</Requirement>

<Requirement>
<Name>Associação com Transação</Name>
<Description>Documento vinculado a transação. Transação pode ter múltiplos documentos.</Description>
<Priority>P2</Priority>
<AcceptanceCriteria>Documento vinculado; transação mostra documentos; download do original</AcceptanceCriteria>
</Requirement>

### 2.8 OCR

<Requirement>
<Name>Extração de Texto</Name>
<Description>OCR via PaddleOCR para imagens e PDFs digitalizados. Suporte a português.</Description>
<Priority>P3</Priority>
<AcceptanceCriteria>Texto extraído com taxa razoável; campos financeiros identificados; confiança indicada</AcceptanceCriteria>
</Requirement>

<Requirement>
<Name>Interpretação de Campos</Name>
<Description>Identificar: data, estabelecimento, descrição, valor, categoria, forma de pagamento. Apresentar para confirmação.</Description>
<Priority>P3</Priority>
<AcceptanceCriteria>Campos mapeados quando presentes; confiança exibida; usuário corrige antes de confirmar</AcceptanceCriteria>
</Requirement>

### 2.9 Dashboard

<Requirement>
<Name>Dashboard Principal</Name>
<Description>Visão consolidada: saldo total, receitas/despesas do mês, resultado, contas, categorias, transações, formas de pagamento, gráficos.</Description>
<Priority>P0</Priority>
<AcceptanceCriteria>Dados carregados via chamadas paralelas; navegação por mês; responsivo</AcceptanceCriteria>
</Requirement>

<Requirement>
<Name>Indicadores de Saúde</Name>
<Description>Taxa de poupança, comprometimento de renda, despesas essenciais vs não essenciais, progresso de metas.</Description>
<Priority>P2</Priority>
<AcceptanceCriteria>Indicadores calculados corretamente; visualmente claros; com trend quando disponível</AcceptanceCriteria>
</Requirement>

### 2.10 Orçamento

<Requirement>
<Name>Orçamento por Envelopes</Name>
<Description>Envelopes com meta mensal. Alocação e saldo = alocado - gasto (despesas confirmadas).</Description>
<Priority>P0</Priority>
<AcceptanceCriteria>CRUD de envelopes; alocações registradas; saldo calculado; exclusão bloqueada com transações</AcceptanceCriteria>
</Requirement>

<Requirement>
<Name>Comparação Orçado vs Realizado</Name>
<Description>Comparar alocado vs gasto efetivo. Indicar excesso e subutilização.</Description>
<Priority>P1</Priority>
<AcceptanceCriteria>Barra de progresso; cor indica status (verde/amarelo/vermelho)</AcceptanceCriteria>
</Requirement>

### 2.11 Metas e Objetivos

<Requirement>
<Name>CRUD de Objetivos</Name>
<Description>Nome, descrição, valor-alvo, valor atual, prazo, prioridade, status. Exemplos: reserva emergência, viagem, imóvel.</Description>
<Priority>P1</Priority>
<AcceptanceCriteria>Objetivos criados e listados; progresso visual; cálculo de valor mensal necessário</AcceptanceCriteria>
</Requirement>

<Requirement>
<Name>Acompanhamento de Progresso</Name>
<Description>Evolução de cada meta: valor acumulado, percentual, valor mensal necessário, previsão de conclusão.</Description>
<Priority>P1</Priority>
<AcceptanceCriteria>Gráfico de progresso; cálculo de tempo restante; alerta quando meta em risco</AcceptanceCriteria>
</Requirement>

<Requirement>
<Name>Viabilidade e Alternativas</Name>
<Description>Quando meta não é viável, sugerir: aumentar contribuição, prazo, reduzir valor, reduzir despesas.</Description>
<Priority>P2</Priority>
<AcceptanceCriteria>Sugestões geradas; impacto calculado; usuário escolhe qual seguir</AcceptanceCriteria>
</Requirement>

### 2.12 Projeções

<Requirement>
<Name>Projeção de Saldo Futuro</Name>
<Description>Projetar saldo baseado em: histórico, inflação, crescimento de renda, despesas recorrentes, metas.</Description>
<Priority>P2</Priority>
<AcceptanceCriteria>Projeção por 1-12 meses; cenários (conservador/base/optimista); valores reais vs estimativas marcados</AcceptanceCriteria>
</Requirement>

<Requirement>
<Name>Projeção de Metas</Name>
<Description>Calcular quando cada meta será atingida baseado na taxa atual de poupança.</Description>
<Priority>P2</Priority>
<AcceptanceCriteria>Data estimada de conclusão; sensibilidade a variações na contribuição</AcceptanceCriteria>
</Requirement>

### 2.13 Simulações

<Requirement>
<Name>Simulador de Cenários</Name>
<Description>Perguntas como: "O que acontece se economizar R$500/mês?", "Quando atingo minha reserva?", "Posso alcançar 3 objetivos?"</Description>
<Priority>P2</Priority>
<AcceptanceCriteria>Simulações baseadas em dados reais; impacto compreensível; comparação entre cenários</AcceptanceCriteria>
</Requirement>

### 2.14 Relatórios

<Requirement>
<Name>Relatórios Básicos</Name>
<Description>Fluxo de caixa, gastos por categoria, por envelope, extrato por conta, pagamentos por método.</Description>
<Priority>P0</Priority>
<AcceptanceCriteria>Filtrados por período; dados corretos; exportação em CSV/PDF</AcceptanceCriteria>
</Requirement>

<Requirement>
<Name>Relatório Mensal/Anual</Name>
<Description>Resumo consolidado: receitas, despesas, saldo, categorias top, tendências. Comparativo com período anterior.</Description>
<Priority>P2</Priority>
<AcceptanceCriteria>Gerado para qualquer mês/ano; comparativo com período anterior</AcceptanceCriteria>
</Requirement>

### 2.15 Alertas

<Requirement>
<Name>Alertas Inteligentes</Name>
<Description>Despesa acima do padrão, categoria estourando orçamento, conta próxima do vencimento, meta em risco, transação duplicada.</Description>
<Priority>P2</Priority>
<AcceptanceCriteria>Exibidos no dashboard; configuráveis pelo usuário; sem excesso</AcceptanceCriteria>
</Requirement>

### 2.16 Configurações

<Requirement>
<Name>Preferências do Usuário</Name>
<Description>Moeda padrão, categorias padrão, notificações, formato de data.</Description>
<Priority>P2</Priority>
<AcceptanceCriteria>Preferências salvas por família; reflitem na UI</AcceptanceCriteria>
</Requirement>

<Requirement>
<Name>Exportação de Dados</Name>
<Description>Exportar transações, relatórios e documentos em CSV, XLSX e PDF.</Description>
<Priority>P2</Priority>
<AcceptanceCriteria>Exportação inclui todos os campos; formato correto</AcceptanceCriteria>
</Requirement>


---

## 3. Processamento de Documentos

### 3.1 Pipeline Geral

```
Upload → Validação → Detecção de Tipo → Extração → Interpretação → Validação → Confirmação → Armazenamento
```

### 3.2 Tipos de Documento e Estratégias

| Tipo | Estratégia | Confiança |
|---|---|---|
| OFX/QFX | Parser SGML direto | Alta |
| CSV | Parser com detecção de layout | Alta |
| XLSX | Conversão via SheetJS → CSV | Alta |
| PDF digitalizado (texto embutido) | Extração de texto direto | Alta |
| PDF escaneado | OCR (PaddleOCR) | Média-Baixa |
| Imagem (JPG/PNG/HEIC) | OCR (PaddleOCR) | Média-Baixa |

### 3.3 Extração de Texto

- **PDFs nativos** (gerados por software): extração direto do conteúdo embutido
- **PDFs digitalizados**: conversão para imagem → OCR
- **Imagens**: OCR direto via PaddleOCR

### 3.4 OCR com PaddleOCR

**Por que PaddleOCR e não Tesseract:**
- Melhor detecção de texto em português
- Suporte nativo a layout de documentos financeiros
- Melhor precisão em imagens de baixa qualidade
- Pipeline de detecção + reconhecimento otimizado

**Configuração para português:**
- Modelo de detecção: `ch_PP-OCRv3_det`
- Modelo de reconhecimento: `ch_PP-OCRv3_rec` + dicionário PT-BR
- Classificador de orientação ativado

### 3.5 Interpretação de Campos Financeiros

Após extração do texto, o sistema deve identificar:

| Campo | Padrões de Detecção |
|---|---|
| Data | `DD/MM/AAAA`, `DD/MM/AA`, `AAAA-MM-DD` |
| Valor | `R$ 1.234,56`, `-1234.56`, `(1.234,56)` |
| Estabelecimento | Linha superior do documento, logo, nome fantasia |
| Descrição | Campo "descrição", "histórico", "memo" |
| Categoria | Palavras-chave: "supermercado", "farmácia", etc. |
| Forma de pagamento | "PIX", "cartão", "boleto", "dinheiro" |
| Número de transação | IDs, protocolos, NSU |

### 3.6 Documentos de Baixa Qualidade

- **Imagem borrada**: tentar OCR com configurações agressivas; se confiança < 50%, solicitar novo upload
- **PDF protegido**: informar que arquivo está protegido; sugerir desproteger
- **Formato desconhecido**: informar que formato não é suportado
- **Documento vazio**: informar que documento não contém dados

### 3.7 Informações Ausentes

Quando campos não são identificados:
1. Marcar como `null` no registro
2. Apresentar ao usuário com indicador "não identificado"
3. Permitir preenchimento manual
4. Aprender com correções para futuras extrações

### 3.8 Validação dos Dados

- **Valores negativos**: verificar se são estornos ou despesas
- **Datas futuras**: alertar que data está no futuro
- **Valores atípicos**: marcar como possível erro de OCR
- **Duplicidade**: verificar se documento já foi processado (hash do conteúdo)

### 3.9 Evitar Duplicidade

- **Hash SHA-256** do conteúdo do arquivo
- **Metadados**: nome, tamanho, data de upload
- **Comparação**: antes de processar, verificar se hash já existe na família

### 3.10 Armazenamento

- **Arquivo original**: preservado no MinIO com chave `{familyId}/{documentId}/{filename}`
- **Metadados**: salvos em `Document` no banco
- **Texto extraído**: salvo em `Document.extractedText`
- **Relacionamento**: `Document` ↔ `Transaction` via `documentId`

---

## 4. Arquitetura de Importação Bancária

### 4.1 Fluxo Geral

```
Arquivo enviado → Validação → Identificação do formato → Extração → Normalização → Validação → Dedup → Categorização → Revisão → Confirmação → Persistência → Atualização
```

### 4.2 Detecção de Formato

| Formato | Detecção | Parser |
|---|---|---|
| OFX/QFX | Extensão + presença de `<OFX>` ou `<QFX>` | `parseOfx()` |
| CSV | Extensão + delimitador detectado | `parseCsv()` |
| XLSX | Extensão `.xlsx` | Conversão SheetJS → `parseCsv()` |
| PDF | Extensão + mimeType `application/pdf` | Extração texto → OCR se necessário |
| Imagem | Extensão `.jpg/.png/.heic` | OCR direto |

### 4.3 Normalização de Dados Bancários

Independente do formato de origem, todos os dados são normalizados para o modelo `ParsedTransaction`:

```typescript
type ParsedTransaction = {
  date: string;           // YYYY-MM-DD
  description: string;    // Normalizada (lowercase, sem acentos)
  amount: string;         // Decimal com ponto, negativo para despesa
  type: TransactionType;  // INCOME | EXPENSE | TRANSFER
  externalId?: string;    // FITID ou ID original do banco
  paymentMethod?: PaymentMethod | null;
};
```

### 4.4 Campos Normalizados (Modelo Interno)

| Campo | Tipo | Descrição | Exemplo |
|---|---|---|---|
| `id` | `string` (cuid) | Identificador único | `clx1234567890` |
| `date` | `DateTime` | Data da transação | `2026-08-20T12:00:00Z` |
| `description` | `string` | Descrição normalizada | `supermercado extra` |
| `amount` | `Decimal(12,2)` | Valor (negativo = despesa) | `-156.78` |
| `type` | `enum` | Tipo da transação | `EXPENSE` |
| `accountId` | `string` | Conta vinculada | `clx1234567890` |
| `institution` | `string?` | Instituição financeira | `Itaú Unibanco` |
| `categoryId` | `string?` | Categoria atribuída | `clx1234567890` |
| `subcategory` | `string?` | Subcategoria | `Supermercado` |
| `paymentMethod` | `enum?` | Forma de pagamento | `CREDIT_CARD` |
| `documentId` | `string?` | Documento de origem | `clx1234567890` |
| `status` | `enum` | Status da transação | `PENDING` |
| `externalId` | `string?` | ID externo (FITID) | `TXN123456` |
| `source` | `enum` | Origem dos dados | `IMPORT` |
| `confidence` | `float?` | Nível de confiança OCR/IA | `0.85` |

### 4.5 Estratégia Multi-Banco

O sistema não depende de um único formato. A estratégia é:

1. **Parsers genéricos**: CSV e OFX seguem padrões abertos
2. **Detecção adaptativa**: headers são detectados por padrões regex
3. **Fallback**: quando layout não é reconhecido, campos são mapeados por posição
4. **Aprendizado**: correções do usuário alimentam regras futuras

**Bancos suportados (validados):**
- Itaú (OFX, CSV)
- Bradesco (OFX, CSV)
- Banco do Brasil (OFX, CSV)
- Santander (OFX, CSV)
- Caixa Econômica Federal (OFX)
- Nubank (CSV)
- Inter (CSV)
- Sicoob/Sicredi (OFX)

### 4.6 Tratamento de Erros

| Erro | Ação |
|---|---|
| Arquivo vazio | Rejeitar com mensagem "Arquivo vazio" |
| Formato inválido | Rejeitar com "Formato não suportado" |
| Layout não reconhecido | Tentar parsing genérico; se falhar, rejeitar |
| Arquivo corrompido | Rejeitar com "Arquivo corrompido" |
| Arquivo muito grande | Rejeitar (>5MB) |
| Nenhuma transação extraída | Rejeitar "Nenhuma transação reconhecida" |


---

## 5. Modelo de Dados Financeiro

### 5.1 Entidades Principais

#### Family (Tenant)

```
Family
├── id: String (cuid)
├── name: String
├── currency: Currency (BRL)
├── createdAt: DateTime
├── updatedAt: DateTime
├── users: User[]
├── accounts: Account[]
├── categories: Category[]
├── envelopes: Envelope[]
├── transactions: Transaction[]
├── documents: Document[]
├── recurringRules: RecurringRule[]
├── invitations: Invitation[]
├── goals: FinancialGoal[]          [NOVO]
├── projections: Projection[]       [NOVO]
├── notifications: Notification[]   [NOVO]
└── auditLogs: AuditLog[]           [NOVO]
```

#### User

```
User
├── id: String (cuid)
├── email: String (unique)
├── name: String
├── passwordHash: String
├── role: FamilyRole (OWNER/ADMIN/MEMBER/VIEWER)
├── familyId: String (FK → Family)
├── refreshTokens: RefreshToken[]
├── createdAt: DateTime
└── updatedAt: DateTime
```

#### Account

```
Account
├── id: String (cuid)
├── familyId: String (FK → Family)
├── name: String
├── type: AccountType (CHECKING/SAVINGS/INVESTMENT/CASH/CREDIT_CARD)
├── institution: String?
├── currency: Currency (BRL)
├── balance: Decimal(12,2)
├── creditLimit: Decimal(12,2)?     [NOVO - cartão]
├── billingDay: Int?                [NOVO - cartão]
├── dueDay: Int?                    [NOVO - cartão]
├── isArchived: Boolean
├── transactions: Transaction[]
├── recurringRules: RecurringRule[]
├── createdAt: DateTime
├── updatedAt: DateTime
└── deletedAt: DateTime?
```

#### Category

```
Category
├── id: String (cuid)
├── familyId: String (FK → Family)
├── name: String
├── icon: String?
├── parentId: String? (FK → Category)
├── parent: Category?
├── children: Category[]
├── transactions: Transaction[]
├── suggestedTransactions: Transaction[]
├── recurringRules: RecurringRule[]
├── createdAt: DateTime
└── updatedAt: DateTime
```

#### Envelope

```
Envelope
├── id: String (cuid)
├── familyId: String (FK → Family)
├── name: String
├── icon: String?
├── color: String?
├── targetAmount: Decimal(12,2)?
├── monthTarget: Decimal(12,2)?     [NOVO - meta mensal]
├── isActive: Boolean
├── transactions: Transaction[]
├── allocations: EnvelopeAllocation[]
├── recurringRules: RecurringRule[]
├── createdAt: DateTime
└── updatedAt: DateTime
```

#### Transaction

```
Transaction
├── id: String (cuid)
├── familyId: String (FK → Family)
├── accountId: String (FK → Account)
├── categoryId: String? (FK → Category)
├── suggestedCategoryId: String? (FK → Category)
├── envelopeId: String? (FK → Envelope)
├── documentId: String? (FK → Document)
├── date: DateTime
├── description: String
├── amount: Decimal(12,2)
├── type: TransactionType (INCOME/EXPENSE/TRANSFER)
├── status: TransactionStatus (PENDING/CONFIRMED/REJECTED/REVIEW)
├── source: TransactionSource (MANUAL/IMPORT/RECURRING/OCR)
├── externalId: String?
├── paymentMethod: PaymentMethod?
├── installments: Int?              [NOVO]
├── installmentNumber: Int?         [NOVO]
├── transferToAccountId: String?    [NOVO]
├── notes: String?                  [NOVO]
├── confidence: Float?              [NOVO - OCR/IA]
├── createdAt: DateTime
├── updatedAt: DateTime
└── deletedAt: DateTime?
```

#### Document

```
Document
├── id: String (cuid)
├── familyId: String (FK → Family)
├── storageKey: String
├── originalName: String
├── mimeType: String
├── sizeBytes: Int
├── sha256Hash: String?             [NOVO - dedup]
├── status: DocumentStatus (PENDING/PROCESSED/FAILED)
├── errorMessage: String?
├── extractedText: String?
├── ocrConfidence: Float?           [NOVO]
├── parsedFields: JSON?             [NOVO]
├── transactions: Transaction[]
├── createdAt: DateTime
├── updatedAt: DateTime
└── deletedAt: DateTime?
```

#### RecurringRule

```
RecurringRule
├── id: String (cuid)
├── familyId: String (FK → Family)
├── accountId: String (FK → Account)
├── categoryId: String? (FK → Category)
├── envelopeId: String? (FK → Envelope)
├── description: String
├── amount: Decimal(12,2)
├── type: TransactionType
├── frequency: RecurrenceFrequency (DAILY/WEEKLY/MONTHLY/YEARLY)
├── dayOfMonth: Int?
├── dayOfWeek: Int?                 [NOVO]
├── startDate: DateTime
├── endDate: DateTime?
├── isActive: Boolean
├── lastGeneratedAt: DateTime?      [NOVO]
├── createdAt: DateTime
├── updatedAt: DateTime
└── deletedAt: DateTime?
```

### 5.2 Entidades Novas (a serem implementadas)

#### FinancialGoal

```
FinancialGoal
├── id: String (cuid)
├── familyId: String (FK → Family)
├── name: String
├── description: String?
├── icon: String?
├── targetAmount: Decimal(12,2)
├── currentAmount: Decimal(12,2)
├── deadline: DateTime?
├── priority: Int (1=alta, 2=media, 3=baixa)
├── status: GoalStatus (ACTIVE/PAUSED/COMPLETED/CANCELLED)
├── monthlyContribution: Decimal(12,2)?  [calculado]
├── strategy: GoalStrategy?
├── createdAt: DateTime
├── updatedAt: DateTime
└── deletedAt: DateTime?
```

#### FinancialGoalAllocation

```
FinancialGoalAllocation
├── id: String (cuid)
├── goalId: String (FK → FinancialGoal)
├── amount: Decimal(12,2)
├── date: DateTime
├── note: String?
├── source: AllocationSource (MANUAL/AUTO)
└── createdAt: DateTime
```

#### Projection

```
Projection
├── id: String (cuid)
├── familyId: String (FK → Family)
├── name: String
├── scenario: ProjectionScenario (CONSERVATIVE/BASE/OPTIMISTIC/CUSTOM)
├── startDate: DateTime
├── endDate: DateTime
├── assumptions: JSON
├── results: JSON
├── isDefault: Boolean
├── createdAt: DateTime
└── updatedAt: DateTime
```

#### Notification

```
Notification
├── id: String (cuid)
├── familyId: String (FK → Family)
├── userId: String? (FK → User)
├── type: NotificationType
├── title: String
├── message: String
├── severity: NotificationSeverity (INFO/WARNING/CRITICAL)
├── isRead: Boolean
├── actionUrl: String?
├── metadata: JSON?
├── createdAt: DateTime
└── readAt: DateTime?
```

#### AuditLog

```
AuditLog
├── id: String (cuid)
├── familyId: String (FK → Family)
├── userId: String (FK → User)
├── action: AuditAction
├── entityType: String
├── entityId: String
├── changes: JSON?
├── ipAddress: String?
├── userAgent: String?
└── createdAt: DateTime
```

#### ImportBatch

```
ImportBatch
├── id: String (cuid)
├── familyId: String (FK → Family)
├── documentId: String (FK → Document)
├── status: BatchStatus (PROCESSING/COMPLETED/PARTIAL/FAILED)
├── totalTransactions: Int
├── importedTransactions: Int
├── duplicateTransactions: Int
├── failedTransactions: Int
├── errors: JSON?
├── createdAt: DateTime
└── updatedAt: DateTime
```

### 5.3 Relacionamentos Principais

```
Family ──┬── User (1:N)
         ├── Account (1:N)
         ├── Category (1:N, hierarquica)
         ├── Envelope (1:N)
         ├── Transaction (1:N)
         ├── Document (1:N)
         ├── RecurringRule (1:N)
         ├── Invitation (1:N)
         ├── FinancialGoal (1:N)
         ├── Projection (1:N)
         ├── Notification (1:N)
         └── AuditLog (1:N)

Transaction ──┬── Account (N:1)
              ├── Category (N:1, opcional)
              ├── Envelope (N:1, opcional)
              ├── Document (N:1, opcional)
              └── FinancialGoal (N:1, opcional)

Document ──┬── Transaction (1:N)
           └── ImportBatch (1:1)

FinancialGoal ── FinancialGoalAllocation (1:N)
```

### 5.4 Enums Existentes e Novos

**Existentes (Prisma):**
- `Currency`: BRL
- `FamilyRole`: OWNER, ADMIN, MEMBER, VIEWER
- `AccountType`: CHECKING, SAVINGS, INVESTMENT, CASH
- `TransactionType`: INCOME, EXPENSE, TRANSFER
- `TransactionStatus`: PENDING, CONFIRMED, REJECTED, REVIEW
- `TransactionSource`: MANUAL, IMPORT, RECURRING, OCR
- `RecurrenceFrequency`: DAILY, WEEKLY, MONTHLY, YEARLY
- `DocumentStatus`: PENDING, PROCESSED, FAILED
- `PaymentMethod`: PIX, BOLETO, CREDIT_CARD, DEBIT_CARD, TRANSFER, CASH, OTHER

**Novos (a implementar):**
- `AccountType`: + CREDIT_CARD
- `GoalStatus`: ACTIVE, PAUSED, COMPLETED, CANCELLED
- `GoalStrategy`: AGGRESSIVE, MODERATE, CONSERVATIVE, CUSTOM
- `ProjectionScenario`: CONSERVATIVE, BASE, OPTIMISTIC, CUSTOM
- `NotificationType`: BUDGET_EXCEEDED, ANOMALY_DETECTED, GOAL_AT_RISK, DUPLICATE_DETECTED, DOCUMENT_PENDING, ACCOUNT_DUE, RECURRING_GENERATED
- `NotificationSeverity`: INFO, WARNING, CRITICAL
- `AuditAction`: CREATE, UPDATE, DELETE, CONFIRM, REJECT, IMPORT
- `BatchStatus`: PROCESSING, COMPLETED, PARTIAL, FAILED
- `AllocationSource`: MANUAL, AUTO


---

## 6. Motor de Categorização

### 6.1 Estratégia Híbrida

| Camada | Quando Usar | Confiança |
|---|---|---|
| Regras determinísticas | Palavras-chave conhecidas | 0.8 |
| Aprendizado por família | Correções anteriores do usuário | 1.0 |
| ML (futuro) | Padrões complexos | Variável |
| LLM (futuro) | Contextos ambíguos | Variável |

### 6.2 Regras Determinísticas (Implementadas)

**Serviço atual** (`services/ml`):

```python
DEFAULT_RULES = {
    "Alimentação": ("padaria", "supermercado", "mercado", "hipermercado",
                    "feira", "hortifruti", "restaurante", "lanchonete",
                    "delivery", "ifood", "uber eats", "rappi", "marmita"),
    "Transporte": ("posto", "combustivel", "gasolina", "etanol", "uber",
                   "taxi", "99pop", "estacionamento", "pedagio"),
    "Moradia": ("aluguel", "condominio", "conta de agua", "conta de luz",
                "energia eletrica", "iptu", "ipva", "agua", "luz", "gas"),
    "Saúde": ("farmacia", "drogaria", "medico", "consulta", "dentista",
              "clinica", "plano de saude", "hospital", "exame", "academia"),
    "Educação": ("escola", "faculdade", "universidade", "curso", "matricula",
                 "mensalidade", "livraria", "idiomas"),
    "Lazer": ("cinema", "show", "teatro", "viagem", "hotel", "pousada",
              "ingresso", "parque", "netflix", "spotify", "streaming"),
    "Vestuário": ("roupa", "calca", "camiseta", "sapato", "tenis", "moda"),
    "Salário/Receitas": ("salario", "holerite", "bonus", "comissao",
                         "freelance", "reembolso", "venda", "rendimento",
                         "juros", "dividendo", "pix recebido"),
}
```

### 6.3 Aprendizado por Família

- Quando usuário corrige categorização → `POST /ml/learn`
- Regra aprendida: `keyword normalizada → categoria`
- Regras aprendidas têm **precedência** sobre regras padrão
- Persistidas em JSON (`ml-data/learned.json`)

### 6.4 Detecção de Anomalias (Implementada)

**Regra atual:**
- Despesa é anômala quando `|valor| >= 5x mediana` da categoria (ou global)
- E `|valor| >= R$ 100`
- Mínimo de 3 amostras para estatística
- Razão exibida em PT-BR

### 6.5 Quando Utilizar Cada Abordagem

| Cenário | Recomendação | Justificativa |
|---|---|---|
| Descrição contém nome de estabelecimento conhecido | Regras determinísticas | Rápido, preciso, sem custo de IA |
| Descrição é ambígua (ex: "COMPRA PAULISTANO") | LLM | Contexto necessário para interpretar |
| Padrão de gastos recorrente | ML | Aprende com histórico do usuário |
| Novo estabelecimento desconhecido | Regras + fallback LLM | Tenta regras primeiro; se falha, usa LLM |
| Dados estruturados (OFX com TRNTYPE) | Regras determinísticas | Dados já classificados pelo banco |

### 6.6 Prevenção de Erros de IA

- **Nunca inventar dados financeiros**: IA somente categoriza, não cria transações
- **Indicar confiança**: toda sugestão de IA tem `confidence` (0-1)
- **Revisão humana obrigatória**: quando confiança < 0.6, status fica REVIEW
- **Audit trail**: toda categorização registra fonte (REGRA/ML/LLM)
- **Fallback seguro**: se IA falha, transação fica sem categoria (não é rejeitada)

---

## 7. Dashboard Financeiro

### 7.1 Layout Atual (Implementado)

O dashboard atual é um componente monolítico (`app/dashboard/page.tsx`, 1024 linhas) com 13 seções:

1. Barra superior (marca, usuário, nav)
2. Cabeçalho (navegador de mês, refresh, nova transação)
3. Formulário de transação
4. Grid de estatísticas (4 cards: saldo, receitas, despesas, resultado)
5. Contas (tabela)
6. Categorias (hierárquica)
7. Envelopes (com barras de progresso)
8. Importar extratos (upload + histórico)
9. Formas de pagamento (cards)
10. Gastos por categoria (barras CSS)
11. Gastos por envelope (barras CSS)
12. Extrato por conta (seletor + tabela)
13. Transações por forma de pagamento (tabelas agrupadas)

### 7.2 Dashboard Futuro (Proposto)

#### Indicadores Essenciais

| Indicador | Cálculo | Formato |
|---|---|---|
| Saldo Total | Σ(saldos de contas ativas) | Moeda |
| Receita do Mês | Σ(transações INCOME confirmadas no mês) | Moeda |
| Despesa do Mês | Σ(transações EXPENSE confirmadas no mês) | Moeda |
| Resultado do Mês | Receita - Despesa | Moeda (verde/vermelho) |
| Taxa de Poupança | (Receita - Despesa) / Receita × 100 | Percentual |
| Comprometimento de Renda | Despesas Fixas / Receita × 100 | Percentual |
| Despesas Essenciais | Σ(moradia + alimentação + saúde + transporte) | Moeda |
| Despesas Não Essenciais | Despesa Total - Despesas Essenciais | Moeda |
| Progresso de Metas | Σ(valor atual meta) / Σ(valor-alvo meta) × 100 | Percentual |

#### Cards

| Card | Conteúdo | Cor |
|---|---|---|
| Saldo Total | Valor consolidado | Primária |
| Receita do Mês | Valor + variação vs mês anterior | Sucesso |
| Despesa do Mês | Valor + variação vs mês anterior | Perigo |
| Resultado | Valor + indicador de tendência | Conforme sinal |
| Taxa de Poupança | Percentual | Conforme meta |
| Reserva de Emergência | Meses cobertos | Conforme meses |

#### Gráficos

| Gráfico | Tipo | Dados | Justificativa |
|---|---|---|---|
| Fluxo de Caixa | Linha | Receitas vs despesas por mês | Mostra tendência temporal |
| Despesas por Categoria | Pizza/Barras | Top categorias | Visualiza proporção |
| Despesas por Envelope | Barras horizontais | Alocado vs gasto | Compara orçado/realizado |
| Evolução Patrimonial | Linha | Saldo total por mês | Mostra crescimento |
| Despesas por Forma de Pagamento | Barras | Totais por método | Identifica padrões de pagamento |
| Progresso das Metas | Barras horizontais | Atual vs alvo | Mostra evolução |
| Gastos Fixos vs Variáveis | Pizza | Fixos / Variáveis | Mostra comprometimento |

#### Filtros

- **Período**: mês atual, últimos 3/6/12 meses, personalizado
- **Conta**: todas ou específica
- **Categoria**: todas ou específica
- **Forma de pagamento**: todas ou específica
- **Status**: confirmados, pendentes, todos

#### Indicadores de Saúde Financeira

| Indicador | Fórmula | Semáforo |
|---|---|---|
| Reserva de Emergência | Saldo disponível / Despesas fixas mensais | Verde >6 meses, Amarelo 3-6, Vermelho <3 |
| Taxa de Poupança | (Receita - Despesa) / Receita | Verde >20%, Amarelo 10-20%, Vermelho <10% |
| Comprometimento Renda Fixa | Despesas fixas / Receita | Verde <50%, Amarelo 50-70%, Vermelho >70% |
| Dívida / Renda | Total dívidas / Receita anual | Verde <30%, Amarelo 30-50%, Vermelho >50% |
| Diversificação de Fontes | Nº fontes de renda | Verde >=3, Amarelo 2, Vermelho 1 |

---

## 8. Metas e Objetivos Financeiros

### 8.1 Tipos de Objetivos

| Objetivo | Exemplo | Prazo Típico |
|---|---|---|
| Reserva de Emergência | 6 meses de despesas | 12-24 meses |
| Viagem | Viagem internacional | 6-18 meses |
| Compra de Imóvel | Entrada do apartamento | 24-60 meses |
| Compra de Veículo | Carro 0km | 12-36 meses |
| Educação | Faculdade dos filhos | 60-240 meses |
| Aposentadoria | Complemento de renda | 120-360 meses |
| Quitação de Dívidas | Empréstimo consignado | 12-60 meses |
| Grandes Compras | Eletrodomésticos, reforma | 3-24 meses |
| Personalizado | Qualquer objetivo definido pelo usuário | Variável |

### 8.2 Campos do Objetivo

| Campo | Tipo | Descrição |
|---|---|---|
| `name` | String | Nome do objetivo |
| `description` | String? | Descrição detalhada |
| `targetAmount` | Decimal | Valor-alvo |
| `currentAmount` | Decimal | Valor já acumulado |
| `deadline` | DateTime? | Prazo desejado |
| `priority` | Int | 1=alta, 2=média, 3=baixa |
| `status` | Enum | ACTIVE, PAUSED, COMPLETED, CANCELLED |
| `monthlyContribution` | Decimal? | Valor mensal necessário (calculado) |

### 8.3 Cálculos Automáticos

**Valor mensal necessário:**
```
monthlyRequired = (targetAmount - currentAmount) / mesesRestantes
```

**Previsão de conclusão:**
```
monthsNeeded = ceil((targetAmount - currentAmount) / monthlyContributionAtual)
predictedDate = today + monthsNeeded
```

**Percentual concluído:**
```
progress = (currentAmount / targetAmount) × 100
```

### 8.4 Viabilidade

Quando o sistema detecta que o objetivo **não é viável** com a situação atual:

1. Calcular déficit mensal
2. Gerar alternativas:
   - **Aumentar contribuição**: quanto precisa por mês a mais
   - **Aumentar prazo**: nova data com contribuição atual
   - **Reduzir valor-alvo**: novo valor com prazo atual
   - **Reduzir despesas**: categorias que podem ser cortadas
   - **Aumentar receitas**: sugestão genérica (sem aconselhamento financeiro)
3. Apresentar impacto de cada alternativa
4. Usuário escolhe qual seguir

### 8.5 Estratégias de Contribuição

| Estratégia | Descrição |
|---|---|
| `FIXED` | Valor fixo mensal definido pelo usuário |
| `PERCENTAGE` | Percentual da renda líquida |
| `PROPORTIONAL` | Proporcional entre múltiplas metas |
| `OPPORTUNISTIC` | Aporte quando houver sobra no orçamento |

---


## 9. Motor de Projeção

### 9.1 Fontes de Dados para Projeção

| Fonte | Tipo | Uso na Projeção |
|---|---|---|
| Histórico de receitas | Real | Média de receitas dos últimos 3-6 meses |
| Histórico de despesas | Real | Média de despesas fixas e variáveis |
| Inflação | Configurável (IPCA) | Ajuste de valores futuros |
| Crescimento de renda | Configurável | Aumento planejado |
| Despesas recorrentes | Real | Compromissos fixos conhecidos |
| Metas | Definido pelo usuário | Aportes mensais planejados |
| Dívidas | Real | Parcelas restantes |
| Investimentos | Informado pelo usuário | Rendimentos estimados |

### 9.2 Cenários

| Cenário | Multiplicador Receita | Multiplicador Despesa | Inflação |
|---|---|---|---|
| Conservador | 0.95 | 1.05 | IPCA + 1% |
| Base | 1.00 | 1.00 | IPCA |
| Otimista | 1.05 | 0.95 | IPCA - 0.5% |
| Personalizado | Configurável | Configurável | Configurável |

### 9.3 Fórmulas de Projeção

**Saldo Futuro (mês a mês):**
```
saldo[m] = saldo[m-1] + receita[m] - despesa[m] - aporteMeta[m] - parcelaDivida[m]
```

**Capacidade de Poupança:**
```
poupanca[m] = receita[m] - despesa[m]
```

**Tempo para Objetivo:**
```
meses = ceil((valorAlvo - valorAtual) / poupancaMedia)
```

### 9.4 O que Projetar

- **Saldo futuro** por mês (1-12 meses)
- **Capacidade de poupança** mensal
- **Tempo para atingir cada objetivo**
- **Impacto de mudanças** nas despesas
- **Impacto de aumento/redução** de renda
- **Impacto de despesas extraordinárias**
- **Evolução patrimonial** quando disponível

### 9.5 Transparência

Todo dado projetado deve ser claramente marcado:

| Tipo | Indicador Visual |
|---|---|
| Dado real | Fonte normal, cor sólida |
| Estimativa | Ícone de estimativa, cor atenuada |
| Inferência | Texto "baseado em padrões históricos" |
| Recomendação | Texto "sugestão do sistema" |

---

## 10. Simulador de Cenários

### 10.1 Perguntas Suportadas

| Pergunta | Parâmetros | Tipo de Resposta |
|---|---|---|
| "O que acontece se eu economizar R$ X por mês?" | valor extra, meses | Projeção de saldo + impacto nas metas |
| "Quando consigo atingir minha reserva de emergência?" | meta selecionada | Data estimada |
| "Quanto posso gastar sem comprometer meu objetivo?" | objetivo | Orçamento disponível |
| "O que acontece se minha renda cair 10%?" | percentual | Cenário de redução |
| "Quanto tempo economizarei se reduzir despesas em 15%?" | percentual, categorias | Comparação de tempo |
| "Posso alcançar meus três objetivos simultaneamente?" | todos os objetivos | Viabilidade multi-objetivo |

### 10.2 Comparação de Cenários

O simulador deve apresentar:

1. **Cenário Atual**: linha de base com dados reais
2. **Cenário Proposto**: com a alteração solicitada
3. **Diferença**: impacto líquido em cada indicador
4. **Temporal**: evolução mês a mês de ambos os cenários

### 10.3 Saída do Simulador

```json
{
  "scenario": {
    "name": "Economizar R$ 500/mês extras",
    "monthlyImpact": 500,
    "projectedBalance": [/* valores mês a mês */],
    "goalsImpact": [
      {
        "goalId": "...",
        "goalName": "Reserva de Emergência",
        "currentDate": "2027-03",
        "projectedDate": "2026-11",
        "monthsSaved": 4
      }
    ],
    "overallImpact": {
      "monthlySavingsIncrease": 500,
      "yearlySavingsIncrease": 6000,
      "emergencyFundMonthsGained": 2
    }
  }
}
```

---

## 11. Arquitetura de IA

### 11.1 Usos de IA no Sistema

| Uso | Status | Implementação Recomendada |
|---|---|---|
| OCR de imagens/PDFs | P3 (adiado) | PaddleOCR (local, sem API externa) |
| Extração de campos financeiros | P3 | Regex + heurísticas + OCR |
| Categorização de transações | P1 (implementado) | Regras determinísticas + aprendizado |
| Detecção de anomalias | P1 (implementado) | Estatística (mediana × fator) |
| Identificação de despesas recorrentes | P2 | Análise de padrões temporais |
| Explicação de indicadores | P2 | Template + dados contextuais |
| Sugestões de economia | P2 | Regras baseadas em proporções |
| Planejamento de metas | P2 | Cálculos determinísticos |
| Simulações | P2 | Motor de projeção determinístico |
| Assistente conversacional | P3 | LLM com retrieval (RAG) sobre dados do usuário |

### 11.2 Princípios para Uso de IA

1. **Nunca inventar dados financeiros**: IA categoriza e sugere; nunca cria transações ou saldos
2. **Diferenciar dados reais de estimativas**: toda saída de IA indica nível de confiança
3. **Revisão humana obrigatória**: quando confiança < 0.6, dados ficam pendentes de confirmação
4. **Fallback seguro**: se IA falha, sistema continua funcionando sem ela
5. **Privacidade**: dados do usuário não saem do servidor ( modelos locais ou API com DPA)
6. **Auditabilidade**: toda decisão de IA é registrada com justificativa

### 11.3 Estratégia de Modelo

| Componente | Modelo Recomendado | Justificativa |
|---|---|---|
| OCR | PaddleOCR (local) | Gratuito, offline, bom para PT-BR |
| Categorização | Regras + ML leve (scikit-learn) | Já implementado, rápido, explicável |
| Anomalias | Estatística (mediana) | Já implementado, sem modelo de ML |
| Conversacional | LLM local (Ollama + Llama 3) ou API | Flexível, mas requer GPU para local |
| Extração de campos | Regex + heurísticas | Determinístico, auditável |

### 11.4 Prevenção de Alucinações

- **Grounding**: LLM recebe dados do usuário como contexto (RAG)
- **Validação cruzada**: valores mencionados pelo LLM são verificados no banco
- **Resposta restrita**: se dado não existe, LLM deve dizer "não disponível"
- **Metadados de origem**: toda resposta indica se é dado real, cálculo ou estimativa

---

## 12. UX/UI

### 12.1 Princípios de Design

1. **Simplicidade**: usuários sem conhecimento financeiro devem entender
2. **Clareza**: "Quanto entra?", "Quanto sai?", "Para onde vai?"
3. **Concisão**: informação essencial em primeiro plano
4. **Consistência**: padrões visuais uniformes
5. **Acessibilidade**: contraste adequado, navegação por teclado, responsivo

### 12.2 Navegação Principal

```
┌─────────────────────────────────────────────┐
│  Gotardo Finanças     [Usuário] [Sair]      │
├─────────────────────────────────────────────┤
│  Dashboard │ Transações │ Orçamento │ Metas  │
│  Relatórios│ Importar   │ Família   │ Config │
└─────────────────────────────────────────────┘
```

### 12.3 Estrutura de Menus

| Menu | Submenus | Acesso |
|---|---|---|
| Dashboard | Visão geral, Indicadores | Todos |
| Transações | Lista, Nova, Importar | MEMBER+ |
| Orçamento | Envelopes, Alocações | OWNER/ADMIN |
| Metas | Objetivos, Progresso | OWNER/ADMIN |
| Relatórios | Mensal, Anual, Categorias, Fluxo | Todos |
| Importar | Upload, Histórico | OWNER/ADMIN |
| Família | Membros, Convites | OWNER/ADMIN |
| Configurações | Preferências, Exportar | OWNER |

### 12.4 Fluxos Principais

**Fluxo de Importação:**
```
Upload → Selecionar conta → Processar → Revisar transações → Confirmar → Dashboard atualizado
```

**Fluxo de Análise de Recibo:**
```
Upload → OCR → Extração → Confirmação → Vincular transação → Salvar
```

**Fluxo de Categorização:**
```
Transação → Sugestão IA → Usuário confirma/corrige → Aprendizado registrado
```

**Fluxo de Criação de Meta:**
```
Definir nome/valor/prazo → Calcular viabilidade → Definir contribuição → Acompanhar progresso
```

**Fluxo de Projeções:**
```
Selecionar cenário → Ajustar parâmetros → Ver resultado → Comparar cenários → Decidir
```

### 12.5 Resumo do Dashboard

O usuário deve compreender rapidamente:

| Pergunta | Indicador |
|---|---|
| "Quanto entra?" | Card: Receita do Mês |
| "Quanto sai?" | Card: Despesa do Mês |
| "Para onde está indo meu dinheiro?" | Gráfico: Despesas por Categoria |
| "Quanto posso gastar?" | Indicador: Orçamento Disponível |
| "Estou cumprindo meu planejamento?" | Indicador: Progresso do Orçamento |
| "Quando alcançarei meus objetivos?" | Indicador: Progresso das Metas |


---

## 13. Segurança e Privacidade

### 13.1 Criptografia

| Camada | Medida | Implementação |
|---|---|---|
| Em trânsito | TLS 1.3 | Caddy (Let's Encrypt) |
| Em repouso (banco) | Criptografia do disco | PostgreSQL TDE ou volume criptografado |
| Em repouso (storage) | Criptografia server-side | MinIO com SSE |
| Senhas | Argon2id | `argon2` npm |
| Tokens JWT | HS256 | Segredo configurável via env |
| Dados sensíveis em logs | Mascaramento | Nunca logar valores financeiros |

### 13.2 Controle de Acesso

| Mecanismo | Descrição |
|---|---|
| Multi-tenant | `familyId` em toda query (guard global) |
| Papéis | OWNER > ADMIN > MEMBER > VIEWER |
| Rate limiting | 100 req/60s global; 5/min registro; 10/min login |
| Refresh token rotation | Token anterior invalidado a cada uso |
| Sessão expirável | Access: 15min; Refresh: 30d |

### 13.3 Autenticação

- **Registro**: email + senha → hash argon2id → Family + User(OWNER)
- **Login**: email + senha → verificação → JWT access + refresh
- **Refresh**: rotação atômica (old invalidado, new issued)
- **Logout**: refresh token revogado
- **Aceite de convite**: token único + criação de User na Family existente

### 13.4 Autorização

```typescript
@Roles(FamilyRole.OWNER, FamilyRole.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
```

| Recurso | OWNER | ADMIN | MEMBER | VIEWER |
|---|---|---|---|---|
| Ver dados | Sim | Sim | Sim | Sim |
| Criar transação | Sim | Sim | Sim | Não |
| Confirmar transação | Sim | Sim | Sim | Não |
| Editar/excluir | Sim | Sim | Não | Não |
| Gerenciar contas | Sim | Sim | Não | Não |
| Gerenciar categorias | Sim | Sim | Não | Não |
| Gerenciar envelopes | Sim | Sim | Não | Não |
| Importar extratos | Sim | Sim | Não | Não |
| Gerenciar membros | Sim | Sim | Não | Não |
| Convidar membros | Sim | Sim | Não | Não |
| Alterar papéis | Sim | Não | Não | Não |
| Deletar família | Sim | Não | Não | Não |

### 13.5 Proteção de Documentos

- Upload restrito a tipos permitidos (MIME type + extensão)
- Tamanho máximo: 5MB (OFX/CSV), 10MB (PDF/imagem)
- Armazenamento isolado por família: `{familyId}/{documentId}/{filename}`
- Acesso somente via URL assinada (MinIO presigned URLs)
- Scan de malware recomendado (requisito sugerido)

### 13.6 Logs de Auditoria

Toda ação significativa é registrada em `AuditLog`:

| Ação | Entidade | Dados Registrados |
|---|---|---|
| CREATE | Qualquer | ID do criado |
| UPDATE | Qualquer | Antes/Depois |
| DELETE | Qualquer | Dados deletados |
| CONFIRM | Transaction | Status anterior |
| REJECT | Transaction | Status anterior |
| IMPORT | Document | Número de transações |
| ROLE_CHANGE | User | Papel anterior/novo |

### 13.7 Backup e Recuperação

| Aspecto | Estratégia |
|---|---|
| Banco de dados | `pg_dump` diário → MinIO, retenção 30 dias |
| Storage (MinIO) | Backup via `mc mirror` ou snapshot do volume |
| Configuração | `compose.prod.yaml` versionada no git |
| Recuperação | Script de restore documentado em `deploy/backup/` |

### 13.8 Isolamento entre Famílias

- **Banco**: toda query filtra por `familyId` (Prisma middleware ou guard)
- **API**: `familyId` extraído do JWT, não aceito no body
- **Storage**: chaves de objeto prefixadas com `familyId`
- **ML**: regras aprendidas isoladas por `familyId`
- **Testes**: teste automatizado de cruzamento de tenants

### 13.9 Proteção contra Upload Malicioso

- Validação de MIME type no servidor (não confiar no client)
- Validação de extensão
- Tamanho máximo
- Scan de conteúdo (magic bytes)
- Rejeição de arquivos executáveis

### 13.10 Segurança de APIs

- CORS configurado para domínio específico
- Helmet.js (headers de segurança)
- Validação de input (class-validator)
- Rate limiting global e por rota
- Sanitização de strings (XSS prevention)
- Prepared statements via Prisma (SQL injection prevention)

### 13.11 LGPD (Lei Geral de Proteção de Dados)

| Princípio | Implementação |
|---|---|
| Minimização | Coletar somente dados necessários |
| Finalidade | Dados usados somente para gestão financeira |
| Qualidade | Dados mantidos atualizados |
| Transparência | Usuário pode ver todos os seus dados |
| Segurança | Medidas técnicas e organizacionais |
| Responsabilização | Registro de tratamento de dados |
| Eliminação | Soft-delete + purga periódica |
| Portabilidade | Exportação em formato aberto (CSV/JSON) |

**DECISÃO A VALIDAR**: O sistema não precisa de um DPO (Data Protection Officer) formal se for uso familiar/privado, mas deve ter documentedas as práticas de tratamento de dados.

---

## 14. Arquitetura Técnica

### 14.1 Stack Atual

| Camada | Tecnologia | Versão |
|---|---|---|
| Frontend | Next.js (App Router) | 14.2.15 |
| Backend | NestJS | 10.x |
| Banco | PostgreSQL | 16 |
| ORM | Prisma | 5.x |
| Fila | BullMQ + Redis | 7.x |
| Storage | MinIO (S3) | Latest |
| ML | FastAPI (Python) | 0.115+ |
| OCR | FastAPI (PaddleOCR) | P3 |
| Deploy | Docker Compose | 2.x |
| Proxy | Caddy | 2.x |

### 14.2 Arquitetura Recomendada (MVP)

```
Browser (PWA)
    │
    ▼
apps/web (Next.js, porta 3001)
    │
    │  REST + JSON (proxy Caddy em prod)
    ▼
apps/api (NestJS, porta 3000)
    │
    ├── @gotardo/db (Prisma) ──► PostgreSQL 16
    │
    ├── StorageService ──► MinIO (S3)
    │
    ├── MlClient ──► services/ml (FastAPI, porta 8001)
    │
    ├── OcrClient ──► services/ocr (FastAPI, porta 8002) [P3]
    │
    └── BullMQ ──► Redis (fila assíncrona)
```

### 14.3 Arquitetura Escalável (Futuro)

```
Browser (PWA) / App Mobile
    │
    ▼
CDN (CloudFront/Cloudflare)
    │
    ▼
Load Balancer
    │
    ├──► apps/web (Next.js, replicas)
    │
    └──► apps/api (NestJS, replicas)
             │
             ├──► RDS PostgreSQL (Multi-AZ)
             ├──► ElastiCache Redis
             ├──► S3
             ├──► services/ml (Fargate/spot)
             ├──► services/ocr (Fargate/GPU)
             └──► SQS/SNS (fila managed)
```

### 14.4 Justificativas de Tecnologia

| Decisão | Recomendação | Alternativas Descartadas | Justificativa |
|---|---|---|---|
| Frontend | Next.js | Remix, Vite+React | PWA built-in, SSR opcional, ecossistema rico |
| Backend | NestJS | Express puro, Fastify | Arquitetura modular, DI, decorators, OpenAPI |
| Banco | PostgreSQL | MySQL, SQLite | JSON support, CTEs, extensões, madureza |
| ORM | Prisma | TypeORM, Drizzle | Type-safety, migrations, DX excelente |
| Fila | BullMQ | Agenda.js, Bull | Redis-native, retries, priorities, rate limiting |
| Storage | MinIO | AWS S3 direto | S3-compatível, on-prem, migration futura simples |
| ML | FastAPI | Flask, NestJS interno | Assíncrono, Pydantic, performance, Python ML |
| OCR | PaddleOCR | Tesseract | Melhor PT-BR, pipeline otimizado |

### 14.5 Decisões a Validar

<Decision>
<Recommendation>Manter Next.js para o frontend</Recommendation>
<Reason>PWA funcionando, SSR não é essencial (SPA client-side basta), ecossistema de componentes</Reason>
<Alternatives>Remix (SSR forte), Vite+React (mais leve, sem PWA nativo)</Alternatives>
<DecisionToValidate>Confirmar se SSR é necessário para SEO (provavelmente não para app autenticado)</DecisionToValidate>
</Decision>

<Decision>
<Recommendation>Manter NestJS para o backend</Recommendation>
<Reason>Arquitetura modular probada, DI nativa, OpenAPI via swagger, guards/decorators para auth</Reason>
<Alternatives>Express (mais simples, menos estruturado), Fastify (mais rápido, menos ecosystem NestJS)</Alternatives>
<DecisionToValidate>Avaliar se性能 é bottleneck (NestJS é suficiente para MVP)</DecisionToValidate>
</Decision>

<Decision>
<Recommendation>PostgreSQL como banco único</Recommendation>
<Reason>ACID, JSONB para dados flexíveis, extensions (pg_trgm para busca fuzzy), madureza</Reason>
<Alternatives>MySQL (menos features), SQLite (não escala), MongoDB (não relacional, inadequado para finanças)</Alternatives>
<DecisionToValidate>Nenhuma — escolha sólida</DecisionToValidate>
</Decision>


---

## 15. Arquitetura de API

### 15.1 Padrões Gerais

- Prefixo: `/api/v1`
- Formato: JSON
- Envelope: `{ "data": T, "meta": { "requestId", "timestamp" } }`
- Erros: `{ "error": { "code", "message", "details?" }, "meta?" }`
- Paginação: `?page=1&limit=20` → `{ "data": [], "meta": { "total", "page", "limit" } }`

### 15.2 Endpoints Principais

#### Autenticação

| Método | Endpoint | Descrição | Auth |
|---|---|---|---|
| POST | `/auth/register` | Criar família + OWNER | Não |
| POST | `/auth/login` | Login | Não |
| POST | `/auth/refresh` | Renovar token | Não |
| POST | `/auth/logout` | Revogar sessão | Sim |
| POST | `/auth/accept-invitation` | Aceitar convite | Não |
| GET | `/auth/me` | Dados do usuário atual | Sim |

#### Usuários e Família

| Método | Endpoint | Descrição | Auth | Papel |
|---|---|---|---|---|
| GET | `/family` | Dados da família + membros | Sim | Qualquer |
| POST | `/family/invitations` | Criar convite | Sim | OWNER/ADMIN |
| GET | `/family/invitations` | Listar convites | Sim | OWNER/ADMIN |
| DELETE | `/family/invitations/:id` | Revogar convite | Sim | OWNER/ADMIN |
| PATCH | `/family/members/:userId/role` | Alterar papel | Sim | OWNER |

#### Contas

| Método | Endpoint | Descrição | Auth | Papel |
|---|---|---|---|---|
| GET | `/accounts` | Listar contas | Sim | Qualquer |
| POST | `/accounts` | Criar conta | Sim | OWNER/ADMIN |
| GET | `/accounts/:id` | Detalhe da conta | Sim | Qualquer |
| PATCH | `/accounts/:id` | Editar conta | Sim | OWNER/ADMIN |
| DELETE | `/accounts/:id` | Excluir conta | Sim | OWNER/ADMIN |

#### Categorias

| Método | Endpoint | Descrição | Auth | Papel |
|---|---|---|---|---|
| GET | `/categories` | Listar categorias | Sim | Qualquer |
| POST | `/categories` | Criar categoria | Sim | OWNER/ADMIN |
| GET | `/categories/:id` | Detalhe | Sim | Qualquer |
| PATCH | `/categories/:id` | Editar | Sim | OWNER/ADMIN |
| DELETE | `/categories/:id` | Excluir | Sim | OWNER/ADMIN |

#### Transações

| Método | Endpoint | Descrição | Auth | Papel |
|---|---|---|---|---|
| GET | `/transactions` | Listar transações | Sim | Qualquer |
| POST | `/transactions` | Criar transação | Sim | OWNER/ADMIN/MEMBER |
| GET | `/transactions/:id` | Detalhe | Sim | Qualquer |
| PATCH | `/transactions/:id` | Editar/confirmar | Sim | OWNER/ADMIN/MEMBER |
| DELETE | `/transactions/:id` | Excluir | Sim | OWNER/ADMIN |

#### Envelopes

| Método | Endpoint | Descrição | Auth | Papel |
|---|---|---|---|---|
| GET | `/envelopes` | Listar envelopes | Sim | Qualquer |
| POST | `/envelopes` | Criar envelope | Sim | OWNER/ADMIN |
| GET | `/envelopes/:id` | Detalhe + resumo | Sim | Qualquer |
| PATCH | `/envelopes/:id` | Editar | Sim | OWNER/ADMIN |
| DELETE | `/envelopes/:id` | Excluir | Sim | OWNER/ADMIN |
| POST | `/envelopes/:id/allocations` | Alocar valor | Sim | OWNER/ADMIN |
| GET | `/envelopes/:id/allocations` | Listar alocações | Sim | Qualquer |

#### Importação

| Método | Endpoint | Descrição | Auth | Papel |
|---|---|---|---|---|
| POST | `/imports` | Upload de arquivo | Sim | OWNER/ADMIN |
| GET | `/imports` | Listar importações | Sim | Qualquer |
| GET | `/imports/:id` | Detalhe + transações | Sim | Qualquer |

#### Metas (NOVO)

| Método | Endpoint | Descrição | Auth | Papel |
|---|---|---|---|---|
| GET | `/goals` | Listar objetivos | Sim | Qualquer |
| POST | `/goals` | Criar objetivo | Sim | OWNER/ADMIN |
| GET | `/goals/:id` | Detalhe + progresso | Sim | Qualquer |
| PATCH | `/goals/:id` | Editar | Sim | OWNER/ADMIN |
| DELETE | `/goals/:id` | Excluir | Sim | OWNER/ADMIN |
| POST | `/goals/:id/allocations` | Registrar contribuição | Sim | OWNER/ADMIN |
| GET | `/goals/:id/progress` | Evolução temporal | Sim | Qualquer |

#### Projeções (NOVO)

| Método | Endpoint | Descrição | Auth | Papel |
|---|---|---|---|---|
| GET | `/projections` | Listar projeções | Sim | Qualquer |
| POST | `/projections` | Criar projeção | Sim | OWNER/ADMIN |
| GET | `/projections/:id` | Resultados | Sim | Qualquer |
| POST | `/projections/simulate` | Simular cenário | Sim | OWNER/ADMIN |

#### Relatórios

| Método | Endpoint | Descrição | Auth | Papel |
|---|---|---|---|---|
| GET | `/reports/cashflow` | Fluxo de caixa | Sim | Qualquer |
| GET | `/reports/expenses-by-category` | Gastos por categoria | Sim | Qualquer |
| GET | `/reports/expenses-by-envelope` | Gastos por envelope | Sim | Qualquer |
| GET | `/reports/payment-methods` | Por forma de pagamento | Sim | Qualquer |
| GET | `/reports/anomalies` | Anomalias detectadas | Sim | Qualquer |
| GET | `/reports/account-statement/:id` | Extrato da conta | Sim | Qualquer |
| GET | `/reports/monthly` | Relatório mensal (NOVO) | Sim | Qualquer |
| GET | `/reports/annual` | Relatório anual (NOVO) | Sim | Qualquer |

#### Dashboard (NOVO)

| Método | Endpoint | Descrição | Auth | Papel |
|---|---|---|---|---|
| GET | `/dashboard/summary` | Resumo do período | Sim | Qualquer |
| GET | `/dashboard/health` | Indicadores de saúde | Sim | Qualquer |
| GET | `/dashboard/goals-progress` | Progresso das metas | Sim | Qualquer |

#### Notificações (NOVO)

| Método | Endpoint | Descrição | Auth | Papel |
|---|---|---|---|---|
| GET | `/notifications` | Listar notificações | Sim | Qualquer |
| PATCH | `/notifications/:id/read` | Marcar como lida | Sim | Qualquer |
| PATCH | `/notifications/read-all` | Marcar todas como lidas | Sim | Qualquer |

### 15.3 Exemplo de Request/Response

**POST /api/v1/goals**

Request:
```json
{
  "name": "Reserva de Emergência",
  "description": "6 meses de despesas essenciais",
  "targetAmount": 30000.00,
  "currentAmount": 5000.00,
  "deadline": "2027-12-31",
  "priority": 1,
  "monthlyContribution": 1000.00
}
```

Response:
```json
{
  "data": {
    "id": "clx1234567890",
    "name": "Reserva de Emergência",
    "targetAmount": 30000.00,
    "currentAmount": 5000.00,
    "progress": 16.67,
    "monthlyRequired": 1000.00,
    "monthsRemaining": 25,
    "predictedCompletion": "2027-01-15",
    "status": "ACTIVE",
    "createdAt": "2026-08-21T10:00:00Z"
  }
}
```

---

## 16. Fluxo de Importação

### 16.1 Fluxo Completo

```
1. Usuário seleciona arquivo + conta
2. POST /imports (multipart: file + accountId)
3. Validação (tipo, tamanho, extensão)
4. Upload para MinIO → Document criado (PENDING)
5. Se Redis disponível: enfileirar job BullMQ
6. Senão: processar inline
7. Worker identifica formato (OFX/CSV/XLSX/PDF)
8. Parser extrai transações normalizadas
9. Dedup: FITID ou data+valor+descrição
10. ML categoriza cada transação (sugestão)
11. Transações criadas com status PENDING
12. Document atualizado para PROCESSED
13. Frontend obtém status via polling ou WebSocket
14. Usuário revisa transações pendentes
15. Confirma (PENDING → CONFIRMED) → saldo ajustado
```

### 16.2 Tratamento de Erros por Etapa

| Etapa | Erro Possível | Ação |
|---|---|---|
| Upload | Arquivo > 5MB | 400: "Arquivo muito grande" |
| Upload | Formato inválido | 400: "Formato não suportado" |
| Parser | Arquivo vazio | 400: "Arquivo vazio" |
| Parser | Layout inválido | 400: "Não foi possível ler o arquivo" |
| Parser | Nenhuma transação | 400: "Nenhuma transação reconhecida" |
| Dedup | Todas duplicadas | Document PROCESSED, 0 transações criadas |
| ML | Serviço indisponível | Transações criadas sem sugestão (null) |
| Persistência | Erro de banco | Document FAILED, transações não criadas |

### 16.3 Status da Importação

| Status | Significado |
|---|---|
| PENDING | Arquivo recebido, aguardando processamento |
| PROCESSED | Arquivo processado com sucesso |
| FAILED | Erro durante processamento (errorMessage detalhado) |
| PARTIAL | Processado parcialmente (algumas transações falharam) |

---

## 17. Fluxo de Recibos

### 17.1 Fluxo Completo

```
1. Usuário faz upload de recibo/comprovante
2. POST /documents (multipart: file + transactionId?)
3. Validação de tipo e tamanho
4. Upload para MinIO → Document criado (PENDING)
5. Se PDF com texto: extrair texto direto
6. Se PDF escaneado ou imagem: OCR (PaddleOCR)
7. Extração de campos financeiros (regex + heurísticas)
8. Interpretação: data, valor, estabelecimento, categoria
9. Validação: valores coerentes, datas válidas
10. Se confidence >= 0.6: criar transação PENDING
11. Se confidence < 0.6: apresentar dados para confirmação
12. Usuário revisa e confirma/corrige
13. Se transactionId fornecido: vincular ao documento
14. Document atualizado para PROCESSED
15. Texto extraído e campos salvos no Document
```

### 17.2 Quando Confiança é Baixa

| Confiança | Ação |
|---|---|
| >= 0.8 | Auto-criar transação PENDING, mostrar "extraído automaticamente" |
| 0.6 - 0.8 | Criar transação PENDING, marcar como "requer revisão" |
| 0.4 - 0.6 | Apresentar campos extraídos, pedir confirmação antes de criar |
| < 0.4 | Mostrar texto extraído, pedir preenchimento manual |

### 17.3 Formatos de Recibo Suportados

| Formato | Extração | Observação |
|---|---|---|
| PDF digitalizado | Texto embutido + OCR se necessário | Nota fiscal eletrônica (NF-e) |
| JPG/PNG de recibo | OCR direto | Foto de recibo de mercado |
| Nota fiscal XML | Parse XML | NF-e/NFC-e (futuro) |
| Cupom fiscal | OCR com template | Específico para PDV |

---

## 18. Relatórios

### 18.1 Relatórios Disponíveis

| Relatório | Conteúdo | Período | Exportação |
|---|---|---|---|
| Fluxo de Caixa | Receitas vs despesas por mês | Mês ou intervalo | CSV, PDF |
| Gastos por Categoria | Totais por categoria, ordenados | Mês ou intervalo | CSV |
| Gastos por Envelope | Alocado vs gasto por envelope | Mês | CSV |
| Extrato por Conta | Transações com saldos | Mês ou intervalo | CSV |
| Pagamentos por Método | Totais por forma de pagamento | Mês ou intervalo | CSV |
| Anomalias | Transações fora do padrão | Mês ou intervalo | CSV |
| Relatório Mensal | Resumo consolidado do mês | Mês | PDF |
| Relatório Anual | Resumo consolidado do ano | Ano | PDF |
| Orçamento vs Realizado | Comparação envelope/realizado | Mês | CSV |
| Evolução de Metas | Progresso temporal das metas | Intervalo | CSV |

### 18.2 Relatório Mensal (Estrutura)

```
RESUMO MENSAL — Agosto 2026
═══════════════════════════

Receitas:        R$ 8.500,00
Despesas:        R$ 6.230,00
Resultado:       R$ 2.270,00
Taxa Poupança:   26,7%

TOP 5 CATEGORIAS
1. Moradia      R$ 2.100,00
2. Alimentação  R$ 1.450,00
3. Transporte   R$   890,00
4. Saúde        R$   650,00
5. Lazer        R$   420,00

ORÇAMENTO
Envelopes estourados: 1 (Lazer: 110%)
Envelopes dentro: 4

METAS
Reserva Emergência: R$ 5.000 / R$ 30.000 (16,7%)
Viagem Europa:      R$ 2.000 / R$ 8.000  (25,0%)
```

### 18.3 Formatos de Exportação

| Formato | Quando Usar | Ferramenta |
|---|---|---|
| CSV | Dados tabulares, para análise em planilha | Gerador nativo |
| PDF | Relatório formatado, para impressão | Puppeteer/Playwright |
| XLSX | Dados tabulares com formatação | SheetJS/ExcelJS |

---

## 19. Notificações

### 19.1 Tipos de Alertas

| Tipo | Trigger | Severidade | Frequência Máxima |
|---|---|---|---|
| Orçamento estourado | Gasto envelope > 100% alocado | WARNING | Uma vez por envelope/mês |
| Despesa acima do padrão | Valor > 5x mediana (anomalia) | WARNING | Por transação |
| Conta próxima do vencimento | Vencimento em 3 dias | INFO | Uma vez por conta |
| Meta em risco | Projeção indica não atingir prazo | WARNING | Uma vez por meta/mês |
| Receita abaixo do esperado | Receita < 80% da média 3 meses | INFO | Uma vez por mês |
| Documento pendente | Documento com status PENDING > 24h | INFO | Uma vez por documento |
| Possível duplicata | Transação com valor+data similar | INFO | Por ocorrência |
| Transação sugerida | ML categorizou com alta confiança | INFO | Uma vez por transação |
| Recorrência gerada | Regra recorrente criou transação | INFO | Uma vez por regra |

### 19.2 Preferências de Notificação

O usuário pode configurar:
- Quais tipos quer receber
- Frequência (instantâneo, resumo diário, resumo semanal)
- Canais (dashboard, email futuro)

### 19.3 Anti-Pattern: Excesso de Notificações

- **Agrupamento**: notificações do mesmo tipo em 24h são agrupadas
- **Cooldown**: mesmo trigger não gera notificação duplicada em 24h
- **Prioridade**: somente 3 notificações visíveis no dashboard por vez
- **Silenciamento**: usuário pode silenciar tipo específico


---

## 20. Regras de Negócio

### 20.1 Transferências entre Contas Próprias

- Criar **par de transações**: uma EXPENSE na conta origem, uma INCOME na conta destino
- Ambas vinculadas via `transferToAccountId`
- Ambas com status PENDING simultaneamente
- Confirmar/Rejeitar ambas juntas
- **Não afeta** saldo líquido da família

### 20.2 Estornos

- Registrar como transação com sinal inverso ao original
- Valor positivo se era despesa; negativo se era receita
- Vincular à transação original via campo `reversalOfId` (NOVO)
- Descrição deve indicar "Estorno de: [descrição original]"

### 20.3 Parcelamentos

- Compra parcelada: criar N transações PENDING
- Campos: `installments` (total), `parcelaNumber` (atual)
- Cada parcela com data de vencimento individual
- Editar parcela futura: somente parcelas não confirmadas
- Excluir parcela: somente se não confirmada

### 20.4 Compras Recorrentes

- Criar `RecurringRule` com frequência e data de início
- Worker gera transações automaticamente na data
- Transações geradas com `source: RECURRING` e `status: PENDING`
- Usuário confirma individualmente

### 20.5 Assinaturas

- Modelar como `RecurringRule` com `frequency: MONTHLY`
- Exemplos: Netflix, Spotify, academia, plano de saúde
- Detectadas automaticamente por padrão em importações

### 20.6 Faturas de Cartão de Crédito

- Conta CREDIT_CARD com `billingDay` e `dueDay`
- Compras no período faturam no `billingDay`
- Pagamento da fatura é transferência (CC → Conta corrente)
- Pagamento pode ser parcelado (mínimo, total)

### 20.7 Receitas Recorrentes

- Salário, aluguel recebido, pensão
- Criar `RecurringRule` com type INCOME
- Gerar transação automaticamente no dia esperado

### 20.8 Despesas Compartilhadas

- Família com membros que dividem contas
- Cada membro registra sua parte
- Envelope ou categoria agrupa as partes

### 20.9 Reembolsos

- Despesa paga por um membro que será ressarcida
- Registrar como despesa + criar meta/regra de reembolso
- Quando reembolso chegar: registrar como INCOME vinculado

### 20.10 Transações Duplicadas

- **Detecção**: FITID (OFX) ou data+valor+descrição normalizada
- **Ação**: transação duplicada NÃO é criada
- **Documentação**: `ImportBatch.duplicateTransactions` registra quantas foram evitadas

### 20.11 Dados Incompletos

- Transação sem categoria: fica sem `categoryId`, sugerida por ML
- Transação sem envelope: fica sem `envelopeId`
- Transação sem forma de pagamento: fica com `paymentMethod: null`
- Documento sem campos extraídos: campos ficam null, usuário preenche

---

## 21. Validação

### 21.1 Tipos de Validação

| Tipo | Descrição | Exemplo |
|---|---|---|
| Estrutural | Campos obrigatórios, tipos, tamanhos | `amount` é Decimal, `date` é DateTime |
| Matemática | Saldos batem, totais corretos | Σ transações = saldo da conta |
| Temporal | Datas coerentes | Transação não é 30 anos no futuro |
| Consistência | Relacionamentos válidos | Conta pertence à mesma família |
| Duplicidade | Não há registros idênticos | Mesmo FITID não importado 2x |
| Humana | Confirmação do usuário | Dados de OCR com baixa confiança |

### 21.2 Validação de OCR/IA

- **Nunca** apresentar dado extraído por OCR como fato confirmado
- Sempre indicar **origem** (OCR, regra, ML) e **nível de confiança**
- Dados com confiança < 0.6 ficam em **REVIEW**
- Usuário deve **confirmar explicitamente** antes de status CONFIRMED

### 21.3 Regras de Negócio como Validação

- Saldo da conta não pode ficar negativo (exceto CREDIT_CARD)
- Transação CONFIRMED não pode ter status alterado sem estorno
- Exclusão de transação CONFIRMED reverte saldo
- Exclusão de conta bloqueada se houver transações
- Exclusão de envelope bloqueada se houver transações
- Exclusão de categoria bloqueada se houver subcategorias ou transações

---

## 22. MVP

### 22.1 Essenciais para Lançamento (MVP)

| Funcionalidade | Status | Prioridade |
|---|---|---|
| Autenticação + Família | Concluído (E0.5/6) | P0 |
| Contas bancárias | Concluído (E0.8) | P0 |
| Categorias hierárquicas | Concluído (E0.8) | P0 |
| Transações manuais | Concluído (E0.9) | P0 |
| Orçamento por envelopes | Concluído (E0.10) | P0 |
| Importação OFX/CSV | Concluído (E0.7) | P0 |
| Relatórios básicos | Concluído (E0.11) | P0 |
| Dashboard (web) | Concluído (E0.13) | P0 |
| Deploy on-prem | Concluído (E0.12) | P0 |
| PWA offline | Concluído (E1.5) | P1 |
| Categorização ML | Concluído (P1) | P1 |
| Detecção de anomalias | Concluído (P1) | P1 |

**Justificativa**: MVP já atende o ciclo básico: registrar → importar → categorizar → visualizar → controlar orçamento.

### 22.2 Importantes para Segunda Versão (Beta+)

| Funcionalidade | Justificativa |
|---|---|
| Importação XLSX | Formato comum de bancos |
| Cartões de crédito + parcelamentos | Essencial para uso real |
| Metas e objetivos financeiros | Diferencial competitivo |
| Alertas inteligentes | Retém usuário, evita esquecimentos |
| Relatório mensal/anual | Consolidado para tomada de decisão |
| Exportação de dados | LGPD + usabilidade |

### 22.3 Futuras (V2+)

| Funcionalidade | Justificativa |
|---|---|
| OCR de recibos/comprovantes | Complexidade técnica, pode ser adiado |
| Projeções financeiras | Requer dados históricos suficientes |
| Simulador de cenários | Depende de projeções |
| Assistente conversacional | Complexo, pode ser substituído por FAQs |
| App mobile nativo | PWA atende no curto prazo |

### 22.4 Funcionalidades a Evitar Inicialmente

| Funcionalidade | Por quê |
|---|---|
| Integração bancária via API (Open Banking) | Complexidade regulatória, APIs incompatíveis |
| Investimentos (renda variável) | Mercado brasileiro tem muitas opções, complexo |
| Imposto de renda | Regras tributárias complexas, risco legal |
| Multimoeda | MVP é BRL; internationalização futura |
| Multi-tenant entre famílias (compartilhamento) | Complexo demais para MVP |

---

## 23. Roadmap

### Fase E0 — Fundação (CONCLUÍDA)

| Marco | Status | Entregáveis |
|---|---|---|
| E0.1 Monorepo | Concluído | pnpm, Turborepo, configs |
| E0.3 Docker dev | Concluído | PostgreSQL, Redis, MinIO |
| E0.4 Schema Prisma | Concluído | Modelo de dados |
| E0.5/6 Auth | Concluído | JWT, refresh, roles, tenant |
| E0.7 Importação | Concluído | BullMQ, OFX/CSV, dedup |
| E0.8 Contas/Categorias | Concluído | CRUD hierárquico |
| E0.9 Transações | Concluído | CRUD + saldo |
| E0.10 Envelopes | Concluído | Orçamento |
| E0.11 Relatórios | Concluído | Fluxo de caixa, categorias |
| E0.12 Deploy | Concluído | Compose, HTTPS, backups |

### Fase E1 — Beta (CONCLUÍDA)

| Marco | Status | Entregáveis |
|---|---|---|
| E1.1 Dashboard pagamento | Concluído | Enum PaymentMethod |
| E1.2 Relatórios web | Concluído | Gráficos no frontend |
| E1.3 Família web | Concluído | Membros, convites |
| E1.4 Anomalias | Concluído | ML anomalias |
| E1.5 PWA | Concluído | Manifest, SW, offline |
| E1.6 Wrap-up | Concluído | Docs, deploy prod |

### Fase E2 — Enrichment (PRÓXIMA)

| Marco | Objetivo | Funcionalidades |
|---|---|---|
| E2.1 XLSX | Importação Excel | Parser SheetJS, testes com bancos reais |
| E2.2 Cartões | Cartão de crédito | AccountType CREDIT_CARD, faturas, parcelamentos |
| E2.3 Dashboard v2 | Refactor do dashboard | Componentização, React Query, gráficos reais |
| E2.4 Relatórios v2 | Relatórios avançados | Mensal, anual, exportação CSV |
| E2.5 Testes frontend | Cobertura de testes | Jest + Testing Library |

### Fase E3 — Metas e Alertas

| Marco | Objetivo | Funcionalidades |
|---|---|---|
| E3.1 Metas | Objetivos financeiros | CRUD, progresso, viabilidade |
| E3.2 Alertas | Notificações inteligentes | Tipos, preferências, agrupamento |
| E3.3 Dashboard saúde | Indicadores | Taxa poupança, reserva, comprometimento |

### Fase E4 — Inteligência

| Marco | Objetivo | Funcionalidades |
|---|---|---|
| E4.1 OCR básico | PDFs e imagens | PaddleOCR, extração de campos |
| E4.2 Projeções | Projeção de saldo | Motor de projeção, cenários |
| E4.3 Simulador | Simulação de cenários | Perguntas em linguagem natural |

### Fase E5 — Excelência

| Marco | Objetivo | Funcionalidades |
|---|---|---|
| E5.1 OCR avançado | Templates de receipt | NF-e, cupom fiscal |
| E5.2 Assistente | Chat financeiro | LLM + RAG sobre dados |
| E5.3 Dark mode | Tema escuro | CSS variables |
| E5.4 Mobile | App mobile (React Native) | Se necessário |
| E5.5 Open Banking | Integração bancária | APIs regulamentadas |

---

## 24. Plano de Desenvolvimento

### 24.1 Épicos e Tarefas

#### Épico E2.1 — Importação XLSX

| Tarefa | Backend | Frontend | Prioridade |
|---|---|---|---|
| Instalar xlsx (SheetJS) | Sim | - | Alta |
| Criar parser XLSX → CSV | Sim | - | Alta |
| Atualizar imports.service.ts | Sim | - | Alta |
| Atualizar ALLOWED_EXTENSIONS | Sim | - | Alta |
| Aceitar .xlsx no upload | - | Sim | Média |
| Testes com XLSX reais | Sim | - | Alta |
| Documentar formatos aceitos | - | Sim | Baixa |

#### Épico E2.2 — Cartões de Crédito

| Tarefa | Backend | Frontend | Prioridade |
|---|---|---|---|
| Adicionar CREDIT_CARD ao enum | Sim | Sim | Alta |
| Migration: creditLimit, billingDay, dueDay | Sim | - | Alta |
| Criar AccountType.CREDIT_CARD | Sim | - | Alta |
| Lógica de fatura mensal | Sim | - | Alta |
| Parcelamentos (installments) | Sim | - | Alta |
| Formulário de cartão no frontend | - | Sim | Média |
| Visualização de fatura | - | Sim | Média |
| Testes de lógica de fatura | Sim | - | Alta |

#### Épico E2.3 — Dashboard v2

| Tarefa | Backend | Frontend | Prioridade |
|---|---|---|---|
| Instalar Recharts | - | Sim | Alta |
| Componentizar seções do dashboard | - | Sim | Alta |
| Implementar React Query/SWR | - | Sim | Alta |
| Gráfico de fluxo de caixa (linha) | Sim | Sim | Alta |
| Gráfico de categorias (pizza/barras) | Sim | Sim | Alta |
| Indicadores de saúde | Sim | Sim | Média |
| Filtros de período | Sim | Sim | Média |
| Responsividade mobile | - | Sim | Alta |

#### Épico E3.1 — Metas e Objetivos

| Tarefa | Backend | Frontend | Prioridade |
|---|---|---|---|
| Schema: FinancialGoal | Sim | - | Alta |
| Schema: FinancialGoalAllocation | Sim | - | Alta |
| Migration | Sim | - | Alta |
| CRUD Goals (API) | Sim | - | Alta |
| Cálculos (viabilidade, progresso) | Sim | - | Alta |
| Página de metas (UI) | - | Sim | Alta |
| Gráfico de progresso | - | Sim | Média |
| Alerta de meta em risco | Sim | Sim | Média |
| Testes unitários | Sim | - | Alta |

#### Épico E3.2 — Alertas

| Tarefa | Backend | Frontend | Prioridade |
|---|---|---|---|
| Schema: Notification | Sim | - | Alta |
| Migration | Sim | - | Alta |
| Service de verificação periódica | Sim | - | Alta |
| API de notificações | Sim | - | Alta |
| Badges no dashboard | - | Sim | Média |
| Página de notificações | - | Sim | Média |
| Preferências de notificação | Sim | Sim | Média |

### 24.2 Dependências entre Épicos

```
E2.1 (XLSX) ── independente
E2.2 (Cartões) ── independente
E2.3 (Dashboard v2) ── pode rodar em paralelo
E3.1 (Metas) ── pode rodar em paralelo
E3.2 (Alertas) ── pode rodar em paralelo
E4.1 (OCR) ── depende de E2.1 (XLSX) para estabilizar importação
E4.2 (Projeções) ── depende de E3.1 (Metas) + dados históricos
```

### 24.3 Estimativas

| Épico | Tarefas | Dias Estimados | Dependências |
|---|---|---|---|
| E2.1 XLSX | 7 | 3-5 | Nenhuma |
| E2.2 Cartões | 8 | 5-8 | Nenhuma |
| E2.3 Dashboard v2 | 8 | 5-8 | E2.1 ou E2.2 |
| E3.1 Metas | 9 | 5-8 | Nenhuma |
| E3.2 Alertas | 7 | 4-6 | E3.1 |
| E4.1 OCR | 8 | 8-12 | E2.1 |
| E4.2 Projeções | 6 | 5-8 | E3.1 |

**Total estimado para Beta+ completo: 35-55 dias de desenvolvimento**

---

## 25. Estratégia de Testes

### 25.1 Tipos de Teste

| Tipo | Ferramenta | Cobertura | Prioridade |
|---|---|---|---|
| Unitários (backend) | Jest | Services, utils, parsers | Alta |
| Unitários (frontend) | Jest + Testing Library | Componentes isolados | Média |
| Integração (backend) | Jest + Supertest | Controllers + Prisma | Alta |
| E2E | Jest (e2e) | Fluxos completos | Média |
| API | Supertest | Endpoints REST | Alta |
| Banco de dados | Prisma + test DB | Migrations, queries | Alta |
| OCR | pytest | Extração de texto | Baixa (P3) |
| Importação | Jest | Parsers CSV/OFX/XLSX | Alta |
| Categorização | pytest | Regras ML | Alta |
| Projeções | Jest | Motor de projeção | Média |
| Segurança | Manual + ferramentas | Auth, tenant, injection | Alta |
| Performance | k6 ou Artillery | Carga, stress | Média |
| UX | Manual | Usabilidade | Baixa |
| Regressão | Todos anteriores | Não quebrar funcionalidades existentes | Alta |

### 25.2 Casos de Teste Críticos

#### Importação

```typescript
describe('Importação', () => {
  it('deve importar OFX válido com 5 transações')
  it('deve detectar duplicatas por FITID')
  it('deve rejeitar arquivo vazio')
  it('deve rejeitar formato inválido')
  it('deve processar CSV com delimitador ponto-e-vírgula')
  it('deve processar CSV com encoding latin1')
  it('deve processar datas DD/MM/AAAA')
  it('deve mapear TRNTYPE corretamente')
  it('deve criar transações PENDING')
  it('deve categorizar via ML')
  it('deve funcionar sem Redis (fallback inline)')
})
```

#### Categorização

```python
def test_categorizacao():
    assert categorize("supermercado extra") == "Alimentação"
    assert categorize("posto shell") == "Transporte"
    assert categorize("salario") == "Salário/Receitas"
    assert categorize("xyz abc 123") is None  # sem match

def test_aprendizado_familia():
    learn(family_id, "minha loja favorita", "Vestuário")
    assert categorize("minha loja favorita", family_id) == "Vestuário"

def test_anomalias():
    items = [{"id": "1", "amount": "-5000", "category": "Alimentação"}]
    assert detect_anomalies(items)["1"]["isAnomaly"] is True
```

#### Segurança

```typescript
describe('Isolamento de tenant', () => {
  it('usuário A não deve ver transações do usuário B')
  it('token de família A não deve acessar dados da família B')
  it('enumeração de IDs não deve retornar dados de outro tenant')
  it('upload de documento deve ser isolado por família')
})
```

### 25.3 Testes de Regressão

- Toda feature nova deve ter testes
- Antes de cada release, rodar suite completa
- CI deve bloquear merge se testes falharem
- Coverage mínimo: 80% para services, 70% para controllers


---

## 26. Casos Extremos

### 26.1 Arquivo Vazio

**Situação**: Usuário envia arquivo CSV/OFX sem conteúdo.

**Comportamento atual** (implementado):
- CSV: `throw new BadRequestException('Arquivo CSV vazio')`
- OFX: retorna array vazio → `throw new BadRequestException('Nenhuma transação reconhecida')`

**Melhoria sugerida**: Mensagem mais amigável e sugestão de ação.

### 26.2 Arquivo Corrompido

**Situação**: Arquivo com bytes inválidos ou encoding errado.

**Comportamento**: `decodeText()` detecta caracteres `U+FFFD` e tenta latin1; se parsing falhar, Document fica FAILED com errorMessage.

### 26.3 Formato Desconhecido

**Situação**: Extensão não listada (.txt, .pdf, .zip).

**Comportamento**: `ALLOWED_EXTENSIONS` rejeita com "Formato não suportado".

### 26.4 Extrato com Layout Inesperado

**Situação**: CSV de banco não padronizado, colunas em posições diferentes.

**Comportamento**: `detectHeaderIndex()` procura por keywords (data, valor, descrição); se não encontrar, assume posições padrão (coluna 0=data, 1=descrição).

### 26.5 PDF Protegido

**Situação**: PDF com senha.

**Comportamento**: Extração de texto retorna vazio; Document fica FAILED; mensagem sugere "desproteger o arquivo".

### 26.6 Imagem Ilegível

**Situação**: Foto borrada, baixa resolução,ângulo inadequado.

**Comportamento**: OCR retorna texto vazio ou com baixa confiança; Document fica FAILED ou PENDING com mensagem "Imagem ilegível".

### 26.7 OCR Incorreto

**Situação**: OCR interpreta "R$ 123,45" como "R$ 12345".

**Comportamento**: Validação pós-OCR detecta valor atípico; campos ficam com confiança baixa; usuário deve revisar.

### 26.8 Transação Duplicada

**Situação**: Mesma transação importada 2 vezes.

**Comportamento**: Dedup por FITID ou data+valor+descrição; segunda importação é ignorada; `ImportBatch.duplicateTransactions` incrementa.

### 26.9 Transferência entre Contas Próprias

**Situação**: Usuário transfere R$500 da conta A para conta B.

**Comportamento**: Duas transações vinculadas (EXPENSE em A, INCOME em B); saldo de cada conta muda; saldo total da família permanece igual.

### 26.10 Compra Parcelada

**Situação**: Compra de R$1200 em 12x de R$100.

**Comportamento**: 12 transações PENDING criadas; parcelas com datas futuras; editar parcela 5 afeta somente parcelas 5-12.

### 26.11 Estorno

**Situação**: Estorno de R$50 (compra anterior era despesa).

**Comportamento**: Transação INCOME de R$50; descrição "Estorno de: [original]"; vinculada à transação original.

### 26.12 Valor Negativo Inesperado

**Situação**: Transação de receita com valor negativo (erro de importação).

**Comportamento**: `typeFromAmount()` classifica como EXPENSE; usuário deve revisar e corrigir se era INCOME.

### 26.13 Datas Inconsistentes

**Situação**: Transação com data 30/02/2026 (inexistente).

**Comportamento**: Parser ignora linha; Document fica PROCESSED mas com 0 transações; mensagem informativa.

### 26.14 Mudança de Banco

**Situação**: Usuário migra do Itaú para o Nubank.

**Comportação**: Conta antiga fica archived; nova conta criada; importações continuam funcionando; dados históricos preservados.

### 26.15 Conta Encerrada

**Situação**: Conta bancária encerrada com saldo zero.

**Comportamento**: Account.isArchived = true; transações futuras não são associadas; saldo mostra R$ 0,00.

### 26.16 Falta de Histórico para Projeção

**Situação**: Usuário novo com 1 mês de dados.

**Comportamento**: Projeções usam dados disponíveis com aviso "Dados insuficientes para projeção confiável"; recomenda-se 3+ meses.

### 26.17 Múltiplas Moedas

**Situação**: Conta em USD, transações em BRL.

**Comportamento**: MVP suporta somente BRL; moeda da conta é BRL por padrão; Exchange rate não é suportado no MVP.

### 26.18 Usuário Exclui Todos os Dados

**Situação**: Família limpa todas as transações.

**Comportamento**: Soft-delete; dados recuperáveis por 30 dias; purge periódico remove definitivamente.

---

## 27. Inteligência Financeira

### 27.1 Indicadores de Saúde

| Indicador | Fórmula | Ideal | Alerta |
|---|---|---|---|
| Reserva de Emergência | Saldo disponível / Despesas fixas | >= 6 meses | < 3 meses |
| Taxa de Poupança | (Receita - Despesa) / Receita | >= 20% | < 10% |
| Comprometimento Renda Fixa | Despesas fixas / Receita | < 50% | > 70% |
| Dívida / Renda Anual | Total dívidas / Receita × 12 | < 30% | > 50% |
| Diversificação Fontes | Nº fontes de renda | >= 3 | 1 |
| Gasto Essencial / Total | Despesas essenciais / Total | < 60% | > 80% |
| Recorrência / Total | Despesas fixas / Total | < 50% | > 70% |

### 27.2 Tendências de Gastos

- **Crescimento**: despesas crescendo > inflação nos últimos 3 meses
- **Estabilidade**: despesas variando < 5% mês a mês
- **Redução**: despesas diminuindo consistentemente

### 27.3 Capacidade de Poupança

```
poupancaPotencial = Receita - Despesas Fixas - Metas Atuais
```

Se `poupancaPotencial < 0`: família está comprometendo mais do que ganha.

### 27.4 Evolução Patrimonial

Quando disponível (3+ meses de dados):
- Gráfico de linha: saldo total por mês
- Taxa de crescimento mensal
- Comparação com inflação (IPCA)

### 27.5 Sustentabilidade do Orçamento

```
sustentabilidade = (Receita - Despesas Comprometidas) / Receita × 100
```

- > 50%: Sustentável (sobra para poupança e lazer)
- 20-50%: Moderado (atenção a gastos extras)
- < 20%: Crítico (pouca margem para imprevistos)

---

## 28. Assistente Conversacional

### 28.1 Perguntas Suportadas

| Pergunta | Tipo de Dados | Fonte |
|---|---|---|
| "Quanto gastei com alimentação este mês?" | Soma por categoria | Transactions |
| "Quanto gastei no supermercado nos últimos 6 meses?" | Soma por descrição/categoria | Transactions |
| "Por que meus gastos aumentaram?" | Análise comparativa | Reports |
| "Quanto preciso guardar por mês para viajar?" | Cálculo de meta | Goals |
| "Quais despesas posso reduzir?" | Análise de categorias | Reports |
| "Estou gastando mais do que deveria?" | Comparação orçado/realizado | Envelopes |
| "Se eu economizar R$800/mês, quando atingo minha meta?" | Projeção | Goals + Projection |

### 28.2 Arquitetura

```
Usuário pergunta
    │
    ▼
Frontend envia para API
    │
    ▼
API identifica intenção (regex/LLM)
    │
    ▼
Executa query no banco
    │
    ▼
Formata resposta com dados reais
    │
    ▼
Retorna para o usuário
```

### 28.3 Regras para o Assistente

1. **Somente dados reais**: nunca inventar transação, valor ou saldo
2. **Diferenciar tipos de informação**:
   - **Dado real**: "Você gastou R$1.450 com alimentação"
   - **Cálculo**: "Sua taxa de poupança é 26,7%"
   - **Estimativa**: "Com base no padrão atual, sua reserva será atingida em março"
   - **Inferência**: "Seus gastos com transporte aumentaram 15%"
   - **Recomendação**: "Considere reduzir gastos com lazer"
3. **Resposta concisa**: máximo 3 frases
4. **Fallback**: "Não tenho dados suficientes para responder isso"
5. **Sem aconselhamento financeiro**: recomendações são genéricas, não pessoais

### 28.4 Implementação Recomendada

- **MVP (sem LLM)**: regex + queries diretas no banco
- **V2 (com LLM)**: RAG com embeddings dos dados do usuário + LLM para interpretação
- **Segurança**: LLM não deve receber dados de outros usuários
- **Custos**: LLM local (Ollama) para evitar custos de API

---

## 29. Entregáveis

### A. Visão Geral do Produto
- Seção 1 completa
- Nome, problema, público, proposta, diferenciais

### B. Arquitetura Funcional
- Seção 2 completa
- 16 módulos com requisitos detalhados
- 40+ requisitos com prioridade e critérios de aceite

### C. Arquitetura Técnica
- Seção 14 completa
- Stack atual, recomendada e escalável
- Decisões tecnológicas documentadas

### D. Modelo de Dados
- Seção 5 completa
- 16 entidades documentadas
- Enums existentes e novos
- Relacionamentos

### E. Fluxos Principais
- Seções 16 e 17
- Importação completa
- Processamento de recibos
- Tratamento de erros por etapa

### F. API Inicial
- Seção 15 completa
- 40+ endpoints
- Request/Response examples

### G. Estratégia de IA/OCR
- Seções 6 e 11
- Motor de categorização
- Arquitetura de IA
- Prevenção de alucinações

### H. Requisitos de Segurança
- Seção 13 completa
- Criptografia, auth, autorização, LGPD

### I. MVP
- Seção 22
- O que já existe, o que falta, o que evitar

### J. Roadmap
- Seção 23
- Fases E0-E5 com status e estimativas

### K. Backlog Priorizado
- Seção 24
- Épicos, tarefas, dependências, estimativas

### L. Estratégia de Testes
- Seção 25
- Tipos, ferramentas, casos críticos

### M. Principais Riscos

| Risco | Impacto | Probabilidade | Mitigação |
|---|---|---|---|
| Isolamento de tenant falho | Alto | Média | Testes automatizados de cruzamento |
| OCR com baixa precisão | Médio | Alta | Revisão humana obrigatória |
| Performance com muitos dados | Médio | Baixa | Índices, paginação, cache |
| Complexidade de cartões | Alto | Média | Implementação incremental |
| LGPD não atendida | Alto | Baixa | Minimização de dados, soft-delete |
| Dados financeiros incorretos | Crítico | Média | Validações em cascata |

### N. Próximos Passos

1. **Priorizar E2.1 (XLSX)** — maior impacto com menor esforço
2. **Iniciar E2.2 (Cartões)** — essencial para uso real
3. **Componentizar Dashboard** — reduzir dívida técnica
4. **Criar testes de integração** — cobrir fluxos críticos
5. **Documentar API com Swagger** — OpenAPI já habilitado

---

## 30. Próximos Passos

### Ação Imediata (esta semana)

1. Revisar esta especificação com stakeholders
2. Validar decisões marcadas como "DECISÃO A VALIDAR"
3. Priorizar Épico E2.1 (XLSX) para implementação
4. Criar issues no GitHub para cada tarefa do backlog

### Curto Prazo (2-4 semanas)

1. Implementar E2.1 (Importação XLSX)
2. Implementar E2.2 (Cartões de Crédito)
3. Iniciar refatoração do Dashboard (E2.3)
4. Criar suite de testes de integração

### Médio Prazo (1-3 meses)

1. E3.1 (Metas e Objetivos)
2. E3.2 (Alertas)
3. E2.4 (Relatórios v2)
4. E2.5 (Testes frontend)

### Longo Prazo (3-6 meses)

1. E4.1 (OCR básico)
2. E4.2 (Projeções)
3. E4.3 (Simulador)
4. E5.x (Excelência)

---

> **DECISÃO A VALIDAR**: A especificação assume que o sistema continuará rodando on-premises.
> Se houver interesse em versão cloud (SaaS compartilhado), a arquitetura de multi-tenant
> precisará de revisão significativa (schema por tenant vs rows por tenant, rate limiting
> global, billing, etc.).

---

*Documento gerado em Agosto 2026. Versão 1.0.*
*Próxima revisão: após conclusão do Épico E2.1.*

