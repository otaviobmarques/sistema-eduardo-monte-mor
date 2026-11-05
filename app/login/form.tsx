'use client';
import { useActionState } from 'react';
import { entrar } from './actions';

export function LoginForm({ erroInicial }: { erroInicial?: string }) {
  const [state, action, pending] = useActionState(entrar, erroInicial ? { erro: erroInicial } : undefined);
  return (
    <form action={action} className="space-y-4" noValidate>
      <div>
        <label htmlFor="login" className="rotulo">Usuário</label>
        <input id="login" name="login" className="campo" autoComplete="username" autoCapitalize="none" required autoFocus />
      </div>
      <div>
        <label htmlFor="senha" className="rotulo">Senha</label>
        <input id="senha" name="senha" type="password" className="campo" autoComplete="current-password" required />
      </div>
      {state?.erro && (
        <p role="alert" className="rounded-campo bg-error-bg px-3 py-2 text-sm font-medium text-error">{state.erro}</p>
      )}
      <button className="btn btn-primario w-full" disabled={pending}>{pending ? 'Entrando…' : 'Entrar'}</button>
    </form>
  );
}
