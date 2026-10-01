# GiroFinance - Calendário & Painel Financeiro Mobile 🚗💰

Aplicativo web mobile para motoristas e autônomos realizarem o controle diário de jornadas, cálculo de lucro líquido e acompanhamento financeiro com sincronização no **Supabase** e suporte offline com **LocalStorage**.

---

## 📱 Novidades: CRUD do Perfil e Sistema de Login / Cadastro

1. **Sistema de Autenticação (Supabase Auth)**:
   - **Login e Cadastro**: Apenas com **E-mail** e **Senha**.
   - **Alternância rápida**: Alterne entre "Entrar" e "Criar Conta" em 1 clique.
   - **Logout**: Botão para sair da conta com segurança a qualquer momento.
   - **Modo Convidado / Offline**: Você pode usar o app normalmente mesmo sem fazer login imediatamente.

2. **CRUD Completo do Perfil**:
   - **Foto de Perfil**: Toque na câmera para carregar uma foto da galeria do celular ou do computador (com preview instantâneo) ou selecione avatares pré-definidos.
   - **Nome Completo**: Atualiza a saudação no topo e em todos os relatórios.
   - **Data de Nascimento**: Calcula e exibe sua idade automaticamente.
   - **Modelo do Carro**: Ex: *Chevrolet Onix Plus 1.0*, *Renault Kwid*, *Fiat Cronos*.
   - **Meta Mensal (R$)**: Defina seu objetivo de lucro líquido no bolso por mês.

3. **Barra de Progresso da Meta Mensal no Painel**:
   - Uma barra visual no painel de fechamento calcula em tempo real o percentual da sua meta mensal já atingida com base nos lançamentos do mês atual.

4. **Calendário Mensal & CRUD Diário de Jornadas**:
   - Navegação mês a mês (botões `<` e `>`).
   - Visualização dos dias com indicação de ganhos líquidos.
   - Ao tocar em qualquer dia, abre o formulário de jornada:
     - **Ganho Bruto (Entradas)**
     - **Combustível (Saída)**
     - **Outros Gastos (Saídas)**
     - **Observações / KM Rodado**
     - **Cálculo Automático em Tempo Real**: `Líquido = Ganho Bruto - (Combustível + Outros Gastos)` com margem percentual e indicador de eficiência.

5. **Filtros Rápidos de Período**:
   - `Dia`: Total do dia selecionado.
   - `Semanal`: Total dos últimos 7 dias.
   - `Quinzenal`: Total da 1ª quinzena (1 a 15) ou 2ª quinzena (16 ao fim do mês).
   - `Mensal`: Total do mês completo.

---

## ⚡ Como Ativar o Banco de Dados no Supabase

1. Acesse o **SQL Editor** do seu projeto no Supabase:  
   👉 [https://supabase.com/dashboard/project/tqlyltckhlrjogvxqsbt/sql](https://supabase.com/dashboard/project/tqlyltckhlrjogvxqsbt/sql)
2. Abra o arquivo `supabase_schema.sql` (que está na pasta do projeto).
3. Copie todo o código SQL e cole no editor do Supabase.
4. Clique no botão verde **"Run"**.

Esse script cria a tabela de perfil com todos os campos novos, a tabela de lançamentos com isolamento por usuário (`user_id`), as políticas de segurança RLS e o trigger que cria o perfil automaticamente quando alguém se cadastra com email e senha.

---

## 🚀 Como Executar o Projeto

- Basta dar dois cliques no arquivo `index.html` para abrir no Google Chrome, Edge ou navegador do celular.
- Ou rodar com `npx serve .` para acessar via Wi-Fi no celular.
