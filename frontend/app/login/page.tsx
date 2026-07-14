"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { TrendingUp, Eye, EyeOff, Zap, BrainCircuit, Shield, Activity } from "lucide-react";
import { login, isAuthenticated } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
    if (isAuthenticated()) {
      router.replace("/");
      return;
    }
    setTimeout(() => inputRef.current?.focus(), 300);
  }, [router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!usuario.trim() || !senha) { setErro("Preencha usuário e senha."); return; }
    setLoading(true);
    setErro("");
    await new Promise((r) => setTimeout(r, 600));
    const ok = login(usuario, senha);
    if (ok) { router.replace("/"); }
    else { setErro("Usuário ou senha incorretos."); setLoading(false); }
  }

  if (!mounted) return null;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#07080c",
      display: "flex",
      alignItems: "stretch",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Top accent line */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 2,
        background: "linear-gradient(90deg, transparent, #6366f1 30%, #fbbf24 65%, transparent)",
        opacity: 0.9, zIndex: 20,
      }} />

      {/* ── LADO ESQUERDO — Login form ── */}
      <div style={{
        flex: "0 0 auto",
        width: "100%",
        maxWidth: 480,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 48px",
        position: "relative",
        zIndex: 10,
        background: "rgba(9,10,16,0.96)",
        borderRight: "1px solid rgba(99,102,241,0.12)",
      }}>
        {/* Grid dots subtle */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.1,
          backgroundImage: "radial-gradient(circle, rgba(99,102,241,0.5) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }} />

        <div style={{ width: "100%", maxWidth: 360, position: "relative" }}>
          {/* Logo */}
          <div style={{ marginBottom: 36 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: "linear-gradient(135deg, rgba(99,102,241,0.25), rgba(251,191,36,0.1))",
                border: "1px solid rgba(99,102,241,0.4)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 0 20px rgba(99,102,241,0.3)",
              }}>
                <TrendingUp size={20} style={{ color: "#6366f1" }} />
              </div>
              <div>
                <div style={{
                  fontSize: 22, fontWeight: 900, letterSpacing: "-0.5px",
                  background: "linear-gradient(135deg, #6366f1 0%, #fbbf24 100%)",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
                }}>
                  AllWin
                </div>
                <div style={{ fontSize: 10, color: "#3a4060", letterSpacing: "2px", textTransform: "uppercase", marginTop: 1 }}>
                  Plataforma Quant · Cripto
                </div>
              </div>
            </div>

            <div>
              <h1 style={{ fontSize: 26, fontWeight: 900, color: "#dde1f0", letterSpacing: "-0.04em", marginBottom: 6, lineHeight: 1.2 }}>
                Bem-vindo de volta
              </h1>
              <p style={{ fontSize: 13, color: "#5a6480", lineHeight: 1.5 }}>
                Acesse sua plataforma de análise quantitativa
              </p>
            </div>
          </div>

          {/* Security badge */}
          <div style={{
            background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.15)",
            borderRadius: 12, padding: "10px 14px",
            display: "flex", alignItems: "center", gap: 8, marginBottom: 24,
          }}>
            <Shield size={14} style={{ color: "#6366f1", flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: "#a5b4fc" }}>Área privada — acesso restrito</span>
          </div>

          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Usuário */}
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", color: "#5a6480", marginBottom: 6 }}>
                Usuário
              </label>
              <input
                ref={inputRef}
                type="text"
                value={usuario}
                onChange={(e) => { setUsuario(e.target.value); setErro(""); }}
                placeholder="Seu nome"
                autoComplete="username"
                style={{
                  width: "100%", padding: "12px 14px", borderRadius: 12,
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(99,102,241,0.2)",
                  color: "#dde1f0", fontSize: 14, outline: "none", boxSizing: "border-box",
                }}
                onFocus={(e) => { e.target.style.borderColor = "rgba(99,102,241,0.55)"; e.target.style.boxShadow = "0 0 0 3px rgba(99,102,241,0.1)"; }}
                onBlur={(e) => { e.target.style.borderColor = "rgba(99,102,241,0.2)"; e.target.style.boxShadow = "none"; }}
              />
            </div>

            {/* Senha */}
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", color: "#5a6480", marginBottom: 6 }}>
                Senha
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showSenha ? "text" : "password"}
                  value={senha}
                  onChange={(e) => { setSenha(e.target.value); setErro(""); }}
                  placeholder="••••••"
                  autoComplete="current-password"
                  style={{
                    width: "100%", padding: "12px 42px 12px 14px", borderRadius: 12,
                    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(99,102,241,0.2)",
                    color: "#dde1f0", fontSize: 14, outline: "none", boxSizing: "border-box",
                  }}
                  onFocus={(e) => { e.target.style.borderColor = "rgba(99,102,241,0.55)"; e.target.style.boxShadow = "0 0 0 3px rgba(99,102,241,0.1)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "rgba(99,102,241,0.2)"; e.target.style.boxShadow = "none"; }}
                />
                <button type="button" onClick={() => setShowSenha((v) => !v)}
                  style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#5a6480", padding: 4, display: "flex", alignItems: "center" }}>
                  {showSenha ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Erro */}
            {erro && (
              <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 12.5, color: "#f87171", display: "flex", alignItems: "center", gap: 8 }}>
                <span>⚠️</span>{erro}
              </div>
            )}

            {/* Botão */}
            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 4, padding: "14px", borderRadius: 14,
                background: loading ? "rgba(99,102,241,0.3)" : "linear-gradient(135deg, #6366f1 0%, #4f52cc 100%)",
                border: "1px solid rgba(99,102,241,0.4)",
                color: "#fff", fontSize: 14.5, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
                boxShadow: loading ? "none" : "0 0 24px rgba(99,102,241,0.3)",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.boxShadow = "0 0 36px rgba(99,102,241,0.5)"; e.currentTarget.style.transform = "translateY(-1px)"; } }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 0 24px rgba(99,102,241,0.3)"; e.currentTarget.style.transform = "translateY(0)"; }}
            >
              {loading ? (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <span style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "spin 0.7s linear infinite", display: "inline-block" }} />
                  Entrando...
                </span>
              ) : "Entrar na Plataforma"}
            </button>
          </form>

          {/* Módulos */}
          <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "center", gap: 24 }}>
            {[
              { Icon: Zap, label: "Sinais IA", color: "#8b5cf6" },
              { Icon: BrainCircuit, label: "CÉREBRO", color: "#6366f1" },
              { Icon: Activity, label: "Auto Trade", color: "#10b981" },
            ].map(({ Icon, label, color }) => (
              <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ width: 30, height: 30, borderRadius: 9, background: `${color}15`, border: `1px solid ${color}25`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon size={13} style={{ color }} />
                </div>
                <span style={{ fontSize: 10, color: "#5a6480" }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── LADO DIREITO — Bitcoin hero ── */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
        background: "linear-gradient(135deg, #07080c 0%, #0a0e1a 50%, #060c12 100%)",
      }}
        className="hidden md:flex"
      >
        {/* Background glow */}
        <div style={{
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          width: 700, height: 700, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(251,191,36,0.06) 0%, rgba(99,102,241,0.04) 40%, transparent 70%)",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", bottom: "10%", right: "10%", width: 300, height: 300, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        {/* Grid dots */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.07,
          backgroundImage: "radial-gradient(circle, rgba(251,191,36,0.6) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
        }} />

        {/* Bitcoin image */}
        <div style={{ position: "relative", zIndex: 2, textAlign: "center" }}>
          <div style={{
            width: 340, height: 340,
            margin: "0 auto",
            filter: "drop-shadow(0 0 60px rgba(251,191,36,0.3)) drop-shadow(0 0 120px rgba(251,191,36,0.15))",
            animation: "floatBtc 4s ease-in-out infinite",
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/bitcoin-hero.png"
              alt="Bitcoin"
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          </div>

          {/* Tagline below image */}
          <div style={{ marginTop: 32, textAlign: "center" }}>
            <div style={{
              fontSize: 24, fontWeight: 900, letterSpacing: "-0.04em",
              background: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 60%, #fbbf24 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
              marginBottom: 8,
            }}>
              Análise Quantitativa
            </div>
            <p style={{ fontSize: 13, color: "#3a4870", lineHeight: 1.6, maxWidth: 320, margin: "0 auto" }}>
              Brain Score · Cérebro Central · Auto Trade 24/7<br />
              Dados em tempo real via Binance API
            </p>

            {/* Stats pills */}
            <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
              {["47 Perfis IA", "30+ Bots", "Brain Score 0-100"].map((t) => (
                <span key={t} style={{
                  fontSize: 11, fontWeight: 600, padding: "5px 12px", borderRadius: 99,
                  background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)",
                  color: "rgba(251,191,36,0.7)",
                }}>
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes floatBtc {
          0%, 100% { transform: translateY(0px) rotate(-2deg); }
          50% { transform: translateY(-16px) rotate(2deg); }
        }
      `}</style>
    </div>
  );
}
