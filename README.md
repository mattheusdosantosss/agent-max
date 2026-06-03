# Agent Max · Dashboard

Painel de métricas do agente **Max** (The Best Speaker 2026), no padrão visual do
dashboard TBS. Mede:

1. **Dúvidas que chegaram** — mensagens (execuções n8n) + conversas únicas (HubSpot)
2. **Escaladas para humano** — `atendimento_humano = true`
3. **Principais dúvidas** — `motivo_do_contato` agregado
4. **Custo do LLM** — estimativa por volume × preço do modelo

Sem as variáveis de ambiente ele já renderiza com um snapshot real do HubSpot
(seed). Com as envs, fica ao vivo.

## Rodar local

```bash
npm install
cp .env.example .env.local   # preencha as chaves
npm run dev
```

## Deploy na Vercel

1. Suba este projeto no repo `agent-max`.
2. Na Vercel: New Project → importe o repo.
3. Em **Settings → Environment Variables**, adicione (NÃO commite a key):
   - `N8N_BASE_URL` = https://revopspsa.app.n8n.cloud
   - `N8N_WORKFLOW_ID` = ABZUMMhJizuP9mDv
   - `N8N_API_KEY` = (sua key do n8n)
   - `HUBSPOT_TOKEN` = (token de Private App, scope crm.objects.contacts.read)
   - `LLM_MODEL` = o modelo do nó AI Agent (ex: gpt-4o-mini)
   - `LLM_AVG_TOKENS_IN` / `LLM_AVG_TOKENS_OUT` = médias de tokens
4. Deploy.

## Onde cada métrica é calculada

- `lib/hubspot.ts` — escalações, conversas únicas, tópicos, motivos, datas
- `lib/n8n.ts` — volume de mensagens (execuções do workflow)
- `lib/metrics.ts` — junta tudo e estima o custo
- `lib/pricing.ts` — preço por modelo + normalização dos tópicos

## Notas

- A key do n8n **nunca** vai no código — só em env var na Vercel.
- O custo é **estimativa v1**. Para custo exato, plugar a API de billing do provedor do LLM.
