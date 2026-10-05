# Placar — Eleições 2026

Apuração ao vivo das eleições presidenciais brasileiras de 2026, direto dos dados oficiais do TSE.

**https://placar.nqlabs.io** (em breve)

## O que tem

- **Apuração ao vivo** — contagem por seções, comparecimento, abstenção, brancos e nulos
- **Mapa do Brasil** — cor = partido líder no estado, intensidade = % apurado, borda verde = finalizado
- **Placar por estado** — os 27 estados de uma olhada, ordenados por eleitorado
- **Cenários de 2º turno** — três caminhos para 25 de outubro, calculados a partir do resultado oficial do 1º turno e dos precedentes históricos (1989–2022)
- **Ranking completo** — todos os candidatos, votos nominais e barras
- **Alertas** — mudança de liderança e viradas por estado, com som opcional
- **Tendência** — evolução das cotas ao longo da sessão

## Como funciona

App 100% estático (Vite + React + TypeScript). Sem backend: o navegador busca os
JSONs públicos de `resultados.tse.jus.br` (arquivos EA20 unificado + EA14
acompanhamento), que o TSE publica com CORS aberto. Atualiza a cada 30 segundos.

O modelo de cenários de 2º turno redistribui os votos dos candidatos eliminados
sob três conjuntos de hipóteses nomeadas — cada uma ancorada em uma eleição real
(2022: Lula 48,4 → 50,9; 2018: Bolsonaro 46,0 → 55,1). Não é previsão; é aritmética
com premissas explícitas.

## Rodar localmente

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # output estático em dist/
```

## Fonte de dados

Divulgação oficial do TSE — resultados.tse.jus.br. Este projeto não tem vínculo
com o TSE. Cenários são estimativas estatísticas, não resultados oficiais.
