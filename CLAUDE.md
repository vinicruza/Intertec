# CLAUDE.md — Regras do projeto Intertec CMV e Rentabilidade

- Leia docs/01-PRD.md e docs/Calculations.md antes de qualquer tarefa.
- Em qualquer assunto de cálculo, docs/Calculations.md prevalece sobre tudo.
- Trabalhe sempre uma sprint por vez (roadmap na Seção 10 do PRD); nunca avance para a próxima sem o usuário aprovar.
- Commits pequenos e frequentes, com mensagens claras.
- Publicar direto na `main` (decisão do cliente, 30/07/2026): toda alteração vai para a `main`, sem branch intermediário nem pull request. O Vercel publica a `main`, então cada push é uma publicação em produção — antes de qualquer push, rodar tipos, lint, testes e build; se o CI ficar vermelho depois, avisar e consertar na hora.
- Toda função de cálculo financeiro deve ter testes automatizados; os golden tests da Seção 11 do Calculations.md são obrigatórios e nunca podem ser removidos.
- Nenhum cálculo financeiro dentro de componente de tela; tudo em lib/calculations/.
- Dinheiro nunca em float; precisão total no cálculo, arredondamento só na exibição.
- Explique decisões técnicas em linguagem simples para um usuário não técnico.
