# Integração, REURB da Integral

Sistema de regularização fundiária da Integral Soluções em Engenharia: clientes, núcleos, processos, metas, planos, calendário, chat, campo offline, documentos com IA, mapa e PRF.

Feito em React com Vite. Roda na Vercel, com uma função de servidor para a IA. Os dados ficam no aparelho (IndexedDB) enquanto a gravação no Supabase não é ligada.

## Publicar

1. **Criar o repositório**
   ```bash
   git init
   git add .
   git commit -m "Integração REURB"
   git branch -M main
   git remote add origin https://github.com/SUA-CONTA/integracao-reurb.git
   git push -u origin main
   ```
2. **Importar na Vercel:** New Project, escolher o repositório. O Vite é detectado sozinho: build `npm run build`, saída `dist`.
3. **Variáveis de ambiente** (Project Settings, Environment Variables), para Production e Preview:

   | Nome | Para que serve | Obrigatória |
   |---|---|---|
   | `ANTHROPIC_API_KEY` | Análise de documentos pela IA | sim |
   | `ANTHROPIC_MODEL` | Trocar o modelo da IA | não |
   | `VITE_ERP_SUPABASE_URL` | Endereço do Supabase do ERP | não |
   | `VITE_ERP_SUPABASE_KEY` | Chave publicável do ERP | não |
   | `VITE_DEMO` | `1` liga os dados de exemplo, para treinamento | não |

4. **Proteger o acesso:** Settings, Deployment Protection, ligar Vercel Authentication. Só quem tem conta no time abre o sistema.
5. **Conferir:** entrar, ir em Configurações, Prévia com dados do ERP, e usar os botões "Testar o Supabase do ERP" e "Testar o agente de IA".

## Entrar no sistema

O acesso usa a **mesma conta e senha do ERP Integral**: o login consulta a autenticação do Supabase do ERP e traz o perfil, com setor e função já convertidos. Quem entra pela primeira vez é cadastrado no Integração na hora. Sem internet, quem já entrou naquele aparelho consegue abrir o sistema de novo.

O sistema começa vazio: nenhum município, núcleo, morador ou usuário de exemplo. Para treinar a equipe, ligue `VITE_DEMO=1` em um deploy de teste.

## Importar os dados do ERP

Configurações, aba **Prévia com dados do ERP**, botão "Carregar dados do ERP". Traz usuários com setor e função, municípios com o prefixo do financeiro, núcleos com a etapa no kanban, e os andamentos do CRM, as observações por setor e o histórico de etapas de cada processo. Como o ERP não guarda a remessa, os núcleos entram direto no município; as remessas são criadas depois e cada núcleo é movido para a sua. É só leitura: nada é gravado no ERP. Carregar substitui o que estiver no aparelho; "Restaurar dados de exemplo", na aba Histórico e dados, desfaz.

Moradores e unidades estão no CRM e entram em uma segunda etapa.

## Agente de IA

O navegador nunca vê a chave. Ele manda o pedido para `/api/claude`, e a função repassa à Anthropic, conferindo a origem. Cada pedido tem limite de 4,5 MB, por isso imagens grandes são reduzidas e convertidas no próprio navegador antes de subir.

## Mapa dos núcleos

Imagens de satélite do World Imagery (Esri), sem chave nem cadastro. O contorno vem de um KMZ ou KML exportado do Google Earth. Para usar as imagens do Google, troque o endereço dos blocos em `CAMADAS`, dentro de `src/App.jsx`, e use uma chave do Google Maps Platform.

## Campo offline

Instalável como aplicativo pelo próprio navegador. Pré-carregue o núcleo ou a remessa com internet, trabalhe sem rede e sincronize ao voltar. Fotos e pacotes ficam no IndexedDB do aparelho.

## Rodar na sua máquina

```bash
npm install
npm run dev
```

A análise por IA só funciona publicada, porque depende da função `/api/claude`.

## Limites desta versão

- Os dados vivem no aparelho. A gravação no Supabase do Integração ainda não foi ligada.
- Moradores e unidades ainda não vêm do CRM.
- O mapa precisa de internet para carregar as imagens de satélite.
