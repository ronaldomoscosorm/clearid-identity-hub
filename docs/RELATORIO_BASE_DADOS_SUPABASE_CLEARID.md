# Relatório — Base de Dados Supabase e sua Relação com o ClearID

**Produto:** Argus ClearID — Console de Gestão de Identidades (R&M Tecnologia)
**Escopo:** Estrutura da base de dados auxiliar (Supabase) e a divisão de
responsabilidade com o ClearID, com foco na aderência à privacidade (LGPD).
**Referências técnicas:** `supabase/migrations/20260913130000_lgpd_identities_shadow.sql`,
`docs/LGPD_IDENTITIES_SHADOW.md`, `docs/FRONTEND_UPDATE_LGPD.md`.

---

## 1. Sumário executivo

O sistema opera com **duas bases distintas e complementares**:

| Base | Papel | Contém dados pessoais do colaborador? |
| --- | --- | --- |
| **ClearID** | Fonte da verdade da identidade (cadastro da pessoa) | **Sim** — nome, e-mail, telefone, endereço, aniversário, vínculo corporativo, dados de sistema/acesso |
| **Supabase** | Base auxiliar do console (configuração e dados operacionais) | **Não** — armazena apenas atributos auxiliares vinculados por `identity_id` |

**Princípio central:** o dado cadastral **identificável** do colaborador é
**gravado exclusivamente no ClearID**. A base Supabase **não persiste** esse
cadastro; ela guarda apenas informações auxiliares (configurações, catálogos e
valores operacionais) **relacionadas à pessoa através do seu identificador no
ClearID** (`identity_id`).

Como consequência, uma linha da base Supabase, **isoladamente, não identifica
uma pessoa**: ela carrega um `identity_id` (chave pseudonimizada) e um valor
auxiliar. A reassociação a uma pessoa real só é possível consultando o ClearID —
o que caracteriza **pseudonimização** dos dados no Supabase.

---

## 2. Arquitetura e divisão de responsabilidade

```
                        ┌─────────────────────────────┐
   Cadastro da pessoa   │           ClearID           │
   (PII identificável) →│  nome, e-mail, telefone,    │  ← Fonte da verdade
                        │  endereço, aniversário,     │     da identidade
                        │  vínculo corporativo,       │
                        │  dados de sistema/acesso    │
                        └──────────────┬──────────────┘
                                       │  identity_id (chave)
                                       ▼
                        ┌─────────────────────────────┐
   Dados auxiliares    →│          Supabase           │  ← Base do console
   (config. + valores   │  vínculo identity_id +      │     (sem PII cadastral)
    operacionais)       │  atributos auxiliares       │
                        └─────────────────────────────┘
```

- **ClearID** é o sistema de identidade (Genetec/Argus). Todo o cadastro pessoal
  do colaborador é criado, alterado e lido **no ClearID**, via sua API.
- **Supabase** é a base de apoio do console web. Ela **não recebe** os campos
  cadastrais da pessoa; guarda apenas o que é necessário para a operação do
  console e não existe no ClearID (catálogos de campos personalizados,
  configurações, defaults, e valores operacionais vinculados por `identity_id`).

### 2.1 Mudança de conformidade aplicada (LGPD)

A tabela `public.identities` do Supabase foi convertida em **shadow table**:
foram **removidas 46 colunas de PII** (dados pessoais e de sistema) que antes
eram espelhadas. Restaram apenas o vínculo e metadados locais. A migração
executa **purga + drop** irreversível dessas colunas.

**Colunas removidas (exemplos):** `first_name`, `last_name`, `email`,
`private_birthday`, `private_phone_primary`, `private_city_of_residence`,
`company_name`, `company_job_title`, `system_external_id`,
`system_activation_date_utc`, entre outras.

**Estado final da tabela `identities` (9 colunas, sem PII):**
`id`, `account_id`, `identity_id`, `etag`, `is_deleted`, `company_id`,
`worker_type_id`, `created_at`, `updated_at`.

---

## 3. Catálogo das tabelas do Supabase

As 15 tabelas dividem-se em cinco grupos. **Nenhuma armazena o cadastro
identificável do colaborador.**

### 3.1 Vínculo com o ClearID (pseudonimização)

| Tabela | Conteúdo | Observação de privacidade |
| --- | --- | --- |
| `identities` | Shadow table: `identity_id` (link ClearID) + `account_id`, `etag`, `is_deleted`, `company_id`, `worker_type_id` | **Sem PII.** Só o vínculo e metadados locais. É a "ponte" para o ClearID. |

### 3.2 Dados operacionais por pessoa (vinculados por `identity_id`)

| Tabela | Conteúdo | Observação de privacidade |
| --- | --- | --- |
| `identity_custom_fields` | Valores de campos operacionais por pessoa (ex.: datas de NRs/certidões), por `identity_id` + campo do site | Valores operacionais, **não identificáveis por si**; a chave é o `identity_id` pseudonimizado. |
| `identity_attachments` | Metadados dos anexos comprobatórios (nome do arquivo, caminho no Storage, tipo, tamanho, versão), por `identity_id` | O arquivo em si (comprovante) fica no Storage. Ver **§5 Considerações**. |

### 3.3 Catálogo e configuração de campos (não é dado de pessoa)

| Tabela | Conteúdo |
| --- | --- |
| `custom_field_definitions` | Catálogo de campos personalizados (nome, tipo, seção, anexo, vencimento) |
| `custom_field_sections` | Seções/agrupamentos dos campos personalizados |
| `site_custom_fields` | Quais campos valem por **site + tipo de trabalhador** (obrigatoriedade, ordem, faixa de valores) |
| `special_custom_fields` | Dropdowns especiais (listas de opções para campos do ClearID) |
| `identity_field_labels` | Apelidos, ordem e visibilidade dos campos **nativos** (rótulos de UI) |
| `worker_types` | Catálogo de tipos de trabalhador (código, nome, i18n) |

### 3.4 Empresas (dado da pessoa jurídica, não do colaborador)

| Tabela | Conteúdo | Observação |
| --- | --- | --- |
| `companies` | Empresas: `name`, `legal_name`, `tax_id` (CNPJ), `status`, `site_id` | Dado **corporativo (PJ)**, não PII de colaborador. |
| `company_custom_fields` | Valores de campos personalizados da empresa | Vinculado à empresa, não à pessoa. |

### 3.5 Configuração do console e preferências (por usuário do sistema)

| Tabela | Conteúdo | Observação |
| --- | --- | --- |
| `settings` | Configuração por usuário técnico: branding, `argus_base_url`, **`argus_api_key`** (credencial), defaults, `preferences` | Credencial sensível — ver **§5**. |
| `client_settings` | Configuração por cliente (ex.: storage padrão dos campos) | — |
| `user_defaults` | Cliente/perfil padrão do usuário logado | Chave por `user_key` (username do console). |
| `user_client_defaults` | Site/regra/sistema padrão por (usuário + cliente) | — |

---

## 4. Fluxos de dados (onde cada informação é gravada)

| Ação | ClearID | Supabase |
| --- | --- | --- |
| **Criar pessoa** | Grava o cadastro (nome, e-mail, etc.) e a foto | Cria a *shadow row* (`identity_id`, `company_id`, `worker_type_id`) e valores operacionais/anexos |
| **Editar pessoa** | Atualiza o cadastro no ClearID | Atualiza apenas metadados locais e valores operacionais |
| **Listar/abrir pessoa** | Lê o cadastro (nome, e-mail, etc.) do ClearID | Lê apenas metadados e valores auxiliares |
| **Campos personalizados / anexos** | (quando o campo é do ClearID) | Valores e anexos operacionais vinculados por `identity_id` |

Regra de implementação (garantida no código): a gravação da identidade ocorre
**apenas no ClearID**; a leitura do nome/e-mail/telefone vem do **payload do
ClearID**, nunca de colunas do Supabase (que não existem mais).

---

## 5. Considerações de privacidade e segurança

1. **Pseudonimização (ponto forte).** No Supabase, os registros ligados a
   pessoas usam o `identity_id` do ClearID como única chave. Sem acesso ao
   ClearID, não é possível reassociar um registro a uma pessoa identificada.

2. **Valores operacionais.** `identity_custom_fields` guarda valores (ex.: datas
   de certificações/NRs). São dados operacionais **não identificáveis por si**,
   mas ainda assim relativos a uma pessoa — permanecem pseudonimizados pelo
   `identity_id` e sujeitos às políticas de acesso.

3. **Anexos comprobatórios.** Os arquivos (`identity_attachments` + Storage)
   podem, por natureza, conter dados pessoais no documento digitalizado
   (ex.: certificado com nome/CPF). Recomenda-se: (a) política de acesso restrita
   ao bucket, (b) definição de **retenção/expurgo**, (c) registro de finalidade.

4. **Credencial no `settings.argus_api_key`.** Campo sensível (acesso à API do
   ClearID). Recomenda-se **não** mantê-lo em texto puro na base e adotar rotação
   periódica. *(Ponto de segurança, não de PII de colaborador.)*

5. **Controle de acesso.** O console autentica via SSO/JWT do Portal Argus. As
   políticas de acesso do Supabase (RLS) e do Storage devem ser revisadas para
   garantir escopo por cliente/perfil. *(Recomenda-se confirmar o estado atual
   das políticas antes de auditoria formal.)*

---

## 6. Conclusão

A arquitetura mantém o **cadastro identificável do colaborador exclusivamente no
ClearID**. A base Supabase cumpre um papel **auxiliar e pseudonimizado**:
armazena configurações, catálogos e valores operacionais **relacionados às
pessoas apenas através do seu `identity_id`**, sem replicar nome, e-mail,
telefone, endereço, aniversário, vínculo corporativo ou dados de sistema.

Essa separação **reduz a superfície de dado pessoal** na base do console e
sustenta a aderência aos princípios de **minimização** e **pseudonimização** da
LGPD, deixando o dado sensível concentrado e governado no sistema de identidade
(ClearID).
