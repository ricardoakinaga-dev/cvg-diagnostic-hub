"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true); setError("");
    try {
      const response = await fetch("/api/v1/session/login", { method: "POST", headers: { "content-type": "application/json" }, credentials: "include", body: JSON.stringify({ email, password }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Não foi possível entrar.");
      router.replace("/");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível entrar."); }
    finally { setSubmitting(false); }
  }

  return (
    <main className="login-screen">
      <section className="login-panel">
        <div className="login-brand"><span className="brand-mark">CVG</span><span><strong>Diagnostics</strong><small>HUB OPERACIONAL</small></span></div>
        <div className="login-heading"><p className="eyebrow">Acesso seguro</p><h1>Bom trabalho começa<br /><em>com contexto.</em></h1><p>Entre para acompanhar exames, pendências e resultados no escopo do seu setor.</p></div>
        <form onSubmit={submit} className="login-form">
          <label>E-mail profissional<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nome@hospital.com" autoComplete="username" required /></label>
          <label>Senha<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Sua senha" autoComplete="current-password" required /></label>
          {error && <div className="form-alert" role="alert">{error}</div>}
          <button className="button button-primary button-wide" type="submit" disabled={submitting}>{submitting ? "Entrando…" : "Entrar no Hub"}<span aria-hidden="true">→</span></button>
        </form>
        <p className="login-footnote">Acesso individual · atividade auditada · dados protegidos</p>
      </section>
      <aside className="login-aside"><div className="aside-grid" /><div className="aside-quote"><span className="quote-mark">“</span><p>Nenhuma solicitação importante deve se perder entre quem solicita, quem executa e quem precisa agir.</p><small>PRINCÍPIO DO HUB</small></div><div className="aside-orbit orbit-one" /><div className="aside-orbit orbit-two" /></aside>
    </main>
  );
}
