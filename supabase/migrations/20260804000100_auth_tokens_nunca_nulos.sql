-- Conta que não conseguia entrar, e o erro "{}" na tela de login.
--
-- O serviço de autenticação do Supabase é escrito em Go, e lá as colunas de
-- token de auth.users são texto que NÃO aceita nulo. Quando uma conta nasce
-- fora do fluxo normal — criada à mão no painel, ou por SQL — essas colunas
-- ficam NULL, e a leitura da conta estoura:
--
--   error finding user: sql: Scan error on column index 3,
--   name "confirmation_token": converting NULL to string is unsupported
--
-- A resposta então é um HTTP 500 de corpo vazio. A biblioteca do navegador
-- transforma esse corpo vazio na mensagem "{}", e era isso, literalmente, que
-- aparecia na caixa vermelha da tela de login.
--
-- Efeito prático: a conta existia, a senha estava certa, e mesmo assim ela
-- nunca entrava — nem chegava à tela de trocar a senha provisória, porque essa
-- tela só existe depois de autenticar.
--
-- Vazio ('') é o valor que o serviço espera para "não há token pendente". Só
-- toca em linha com NULL; conta sadia fica intacta.
update auth.users
   set confirmation_token       = coalesce(confirmation_token, ''),
       recovery_token           = coalesce(recovery_token, ''),
       email_change             = coalesce(email_change, ''),
       email_change_token_new   = coalesce(email_change_token_new, ''),
       email_change_token_current = coalesce(email_change_token_current, ''),
       phone_change             = coalesce(phone_change, ''),
       phone_change_token       = coalesce(phone_change_token, ''),
       reauthentication_token   = coalesce(reauthentication_token, '')
 where confirmation_token is null
    or recovery_token is null
    or email_change is null
    or email_change_token_new is null
    or email_change_token_current is null
    or phone_change is null
    or phone_change_token is null
    or reauthentication_token is null;
