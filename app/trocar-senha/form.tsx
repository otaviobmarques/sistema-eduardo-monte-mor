'use client';
import { useActionState } from 'react';
import { trocarSenha } from './actions';

export function TrocaForm() {
  const [state, action, pending] = useActionState(trocarSenha, undefined);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="senha" className="rotulo">Nova senha</label>
        <input id="senha" name="senha" type="password" minLength={8} className="campo" autoComplete="new-password" required autoFocus />
        <p className="ajuda">Mínimo de 8 caracteres.</p>
      </div>
      <div>
        <label htmlFor="confirmacao" className="rotulo">Confirme a nova senha</label>
        <input id="confirmacao" name="confirmacao" type="password" minLength={8} className="campo" autoComplete="new-password" required />
      </div>
      {state?.erro && <p role="alert" className="rounded-campo bg-error-bg px-3 py-2 text-sm font-medium text-error">{state.erro}</p>}
      <button className="btn btn-primario w-full" disabled={pending}>{pending ? 'Salvando…' : 'Salvar e continuar'}</button>
    </form>
  );
}
