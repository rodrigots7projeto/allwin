"use client";

import { useState, useEffect } from "react";
import {
  Play, X, ChevronDown, ChevronUp, Check, RefreshCw, AlertTriangle,
  Sparkles, Brain, Loader2, Zap, Target, Shield, Rocket,
  Trophy, Table2, LayoutGrid, TrendingUp, TrendingDown,
  ArrowRight, CheckCircle2, XCircle, FlaskConical, Bot,
  Trash2, BarChart3,
} from "lucide-react";

// ── Constantes ────────────────────────────────────────────────────────────────

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

const SIMBOLOS = [
  "BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT",
  "DOGEUSDT","ADAUSDT","AVAXUSDT","LINKUSDT","LTCUSDT",
  "DOTUSDT","MATICUSDT","BCHUSDT","UNIUSDT","AAVEUSDT",
  "NEARUSDT","ARBUSDT","OPUSDT","SUIUSDT",
];

const PERIODOS = [
  { label:"30d",   dias:30 },
  { label:"90d",   dias:90 },
  { label:"180d",  dias:180 },
  { label:"1 ano", dias:365 },
  { label:"5 anos",dias:1825 },
];

function todayStr() { return new Date().toISOString().slice(0,10); }
function daysAgoStr(n:number) { const d=new Date(); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); }

const PERFIS_FALLBACK: Perfil[] = [
  { id:"cons_normal",  nome:"Conservador Normal",    score_compra:65, score_venda:40, bull_pct_min:55, sl_pct:1.5, tp_pct:5.0,  aguardar_ok:false, apenas_aguardar:false, capital_inicial:10000, stake_base:1000 },
  { id:"cons_pro",     nome:"Conservador PRO",        score_compra:63, score_venda:38, bull_pct_min:53, sl_pct:2.0, tp_pct:7.0,  aguardar_ok:false, apenas_aguardar:false, capital_inicial:10000, stake_base:1000 },
  { id:"cons_promax",  nome:"Conservador PRO MAX",    score_compra:60, score_venda:36, bull_pct_min:51, sl_pct:2.5, tp_pct:9.0,  aguardar_ok:false, apenas_aguardar:false, capital_inicial:10000, stake_base:1000 },
  { id:"mod_normal",   nome:"Moderado Normal",        score_compra:55, score_venda:33, bull_pct_min:48, sl_pct:3.0, tp_pct:10.0, aguardar_ok:true,  apenas_aguardar:false, capital_inicial:10000, stake_base:1000 },
  { id:"mod_pro",      nome:"Moderado PRO",           score_compra:52, score_venda:31, bull_pct_min:46, sl_pct:4.0, tp_pct:12.0, aguardar_ok:true,  apenas_aguardar:false, capital_inicial:10000, stake_base:1000 },
  { id:"mod_promax",   nome:"Moderado PRO MAX",       score_compra:49, score_venda:29, bull_pct_min:44, sl_pct:5.0, tp_pct:15.0, aguardar_ok:true,  apenas_aguardar:false, capital_inicial:10000, stake_base:1000 },
  { id:"agr_normal",   nome:"Agressivo Normal",       score_compra:45, score_venda:26, bull_pct_min:41, sl_pct:5.0, tp_pct:15.0, aguardar_ok:true,  apenas_aguardar:false, capital_inicial:10000, stake_base:1000 },
  { id:"agr_pro",      nome:"Agressivo PRO",          score_compra:42, score_venda:24, bull_pct_min:39, sl_pct:7.0, tp_pct:20.0, aguardar_ok:true,  apenas_aguardar:false, capital_inicial:10000, stake_base:1000 },
  { id:"agr_promax",   nome:"Agressivo PRO MAX",      score_compra:38, score_venda:22, bull_pct_min:37, sl_pct:8.0, tp_pct:25.0, aguardar_ok:true,  apenas_aguardar:false, capital_inicial:10000, stake_base:1000 },
  { id:"cons_alav",    nome:"Conservador Alavancado", score_compra:68, score_venda:45, bull_pct_min:55, sl_pct:2.0, tp_pct:5.0,  aguardar_ok:false, apenas_aguardar:false, capital_inicial:100000, stake_base:5000 },
  { id:"mod_alav",     nome:"Moderado Alavancado",    score_compra:62, score_venda:40, bull_pct_min:51, sl_pct:2.5, tp_pct:6.0,  aguardar_ok:true,  apenas_aguardar:false, capital_inicial:100000, stake_base:5000 },
  { id:"agr_alav",     nome:"Agressivo Alavancado",   score_compra:56, score_venda:35, bull_pct_min:47, sl_pct:3.0, tp_pct:7.0,  aguardar_ok:true,  apenas_aguardar:false, capital_inicial:100000, stake_base:5000 },
  { id:"sub_cons",     nome:"Subida Normal",          score_compra:42, score_venda:25, bull_pct_min:47, sl_pct:2.0, tp_pct:18.0, aguardar_ok:true,  apenas_aguardar:false, capital_inicial:100000, stake_base:500  },
  { id:"sub_mod",      nome:"Subida PRO",             score_compra:36, score_venda:22, bull_pct_min:44, sl_pct:2.5, tp_pct:20.0, aguardar_ok:true,  apenas_aguardar:false, capital_inicial:100000, stake_base:500  },
  { id:"sub_agr",      nome:"Subida PRO MAX",         score_compra:30, score_venda:18, bull_pct_min:41, sl_pct:3.0, tp_pct:25.0, aguardar_ok:true,  apenas_aguardar:false, capital_inicial:100000, stake_base:500  },
  { id:"sub_alav",     nome:"Subida Alavancado",      score_compra:38, score_venda:22, bull_pct_min:45, sl_pct:2.0, tp_pct:25.0, aguardar_ok:true,  apenas_aguardar:false, capital_inicial:100000, stake_base:500  },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface Perfil {
  id:string; nome:string; score_compra:number; score_venda:number; bull_pct_min:number;
  sl_pct:number; tp_pct:number; capital_inicial:number; stake_base:number;
  aguardar_ok:boolean; apenas_aguardar:boolean;
  score_max_compra?:number|null; stake_dupla_score?:number|null;
}
interface Metricas {
  total_trades:number; wins:number; losses:number; win_rate:number; profit_factor:number;
  max_drawdown:number; retorno_total:number; expectancia:number; payoff:number;
  recovery_factor:number; sharpe:number; sortino:number;
  gross_profit:number; gross_loss:number; avg_ganho:number; avg_perda:number;
  capital_inicial:number; capital_final:number; cagr:number;
}
interface Trade {
  simbolo:string; entrada_ts:number; saida_ts:number; entrada_preco:number; saida_preco:number;
  stake:number; pnl:number; pnl_pct:number; motivo:string; resultado:"ganho"|"perda"; capital_after:number;
}
interface EquityPoint { ts:number; capital:number; }
interface BacktestResult {
  id:string; simbolo:string; perfil_id:string; perfil_nome:string;
  periodo:{ inicio:string; fim:string; dias:number };
  config:{ custo_pct:number; slippage_pct:number };
  metricas:Metricas; equity:EquityPoint[]; trades:Trade[];
  overfitting:{ score_confianca:number; alertas:string[]; treino:Metricas; teste:Metricas };
  gerado_em:string;
}
interface Candidate {
  id:string; status:string; criado_em:string; perfil_candidato:Perfil; hipotese:string;
  alteracoes:{campo:string;de:number;para:number;motivo?:string}[];
  metricas_esperadas:Record<string,number>; confianca:number; riscos:string[];
  geração:number; base_perfil_id:string;
}
interface OptGen {
  numero:number; tipo:"baseline"|"otimizacao"|"erro";
  descricao?:string; hipotese?:string; confianca?:number;
  alteracoes?:{campo:string;de:number;para:number;motivo?:string}[];
  melhorou?:boolean; converged?:boolean;
  dss_anterior?:number; dss_novo?:number;
  perfil_nome?:string; perfil_config?:Perfil;
  metricas?:{win_rate:number|null;profit_factor:number|null;retorno_total:number|null;max_drawdown:number|null;total_trades:number|null;sharpe:number|null};
  campeao_nome?:string; campeao_dss?:number;
  resultados_baseline?:{perfil_nome:string;dss:number;win_rate:number;profit_factor:number;retorno_total:number;max_drawdown:number;total_trades:number}[];
  erro?:string;
}
interface OptTask {
  status:"running"|"done"|"error";
  geracoes:OptGen[];
  progresso:{fase:string;geracao_atual:number;total_geracoes:number};
  campeao:{perfil_id:string;perfil_nome:string;perfil_config:Perfil;dss:number;metricas:Metricas;resultado_id:string}|null;
  converged:boolean;
  criado_em:string;
  config:Record<string,unknown>;
  erro?:string;
}
interface IAFuturesProfile {
  id:string; nome:string; nivel:string; emoji:string; cor:string;
  score_compra:number; score_venda:number; bull_pct_min:number; sl_pct:number; tp_pct:number;
  capital_inicial:number; stake_base:number; direction_allowed:string;
  long_filter:{tec_min:number;flx_min:number;ctx_min:number;fnd_min:number};
  short_filter:{tec_max:number;flx_max:number;ctx_min:number;fnd_min:number};
  descricao:string; dss:number; metricas_backtest:Record<string,number|null>;
  simbolo_backtest:string; periodo_backtest:string; deployado_em:string;
}

// ── DSS ───────────────────────────────────────────────────────────────────────

function calcDSS(m:Metricas):number {
  if (m.total_trades<3) return 0;
  const wr=m.win_rate*0.40, pf=Math.min(1,m.profit_factor/3)*25;
  const ret=Math.min(20,Math.max(-10,m.retorno_total*0.15));
  const dd=-Math.min(15,m.max_drawdown*0.5), sh=Math.min(5,Math.max(-5,m.sharpe*2.5));
  return Math.round(Math.max(0,Math.min(100,wr+pf+ret+dd+sh)));
}
function dssLabel(d:number):{label:string;color:string;bg:string} {
  if (d>=80) return {label:"Excelente",color:"#22c55e",bg:"rgba(34,197,94,0.12)"};
  if (d>=65) return {label:"Bom",color:"#3b82f6",bg:"rgba(59,130,246,0.12)"};
  if (d>=50) return {label:"Regular",color:"#f59e0b",bg:"rgba(245,158,11,0.12)"};
  if (d>=35) return {label:"Fraco",color:"#f97316",bg:"rgba(249,115,22,0.12)"};
  return {label:"Crítico",color:"#ef4444",bg:"rgba(239,68,68,0.10)"};
}

function pct(v:number,d=1){return `${v>=0?"+":""}${v.toFixed(d)}%`;}
function brl(v:number){return v.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});}
function fmtTs(ms:number){return new Date(ms).toLocaleDateString("pt-BR",{day:"2-digit",month:"short"});}
function metricColor(val:number,thr:[number,number]):string{
  if (val>=thr[1]) return "#22c55e"; if (val>=thr[0]) return "#f59e0b"; return "#ef4444";
}

// ── EquityChart ───────────────────────────────────────────────────────────────

function EquityChart({equity,height=160}:{equity:EquityPoint[];height?:number}) {
  if (equity.length<2) return null;
  const W=100,pad={t:4,r:1,b:0,l:0};
  const h=height-pad.t-pad.b, w=W-pad.l-pad.r;
  const vals=equity.map(p=>p.capital), mn=Math.min(...vals), mx=Math.max(...vals), span=Math.max(mx-mn,1);
  const pts=equity.map((p,i)=>`${(pad.l+(i/(equity.length-1))*w).toFixed(1)},${(pad.t+h-((p.capital-mn)/span)*h).toFixed(1)}`);
  const up=equity[equity.length-1].capital>=equity[0].capital, clr=up?"#22C55E":"#EF4444";
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{width:"100%",height,display:"block"}}>
      <defs><linearGradient id="eg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={clr} stopOpacity="0.3"/><stop offset="100%" stopColor={clr} stopOpacity="0"/></linearGradient></defs>
      <polygon points={`${pts[0]} ${pts.join(" ")} ${pad.l+w},${pad.t+h} ${pad.l},${pad.t+h}`} fill="url(#eg2)"/>
      <polyline points={pts.join(" ")} fill="none" stroke={clr} strokeWidth="0.7"/>
    </svg>
  );
}

// ── DSSGauge ──────────────────────────────────────────────────────────────────

function DSSGauge({dss}:{dss:number}) {
  const {color,label}=dssLabel(dss); const r=18,c=2*Math.PI*r;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <svg width="52" height="44" viewBox="0 0 52 44">
        <circle cx="26" cy="28" r={r} fill="none" stroke="var(--border)" strokeWidth="4"
          strokeDasharray={`${c*0.75} ${c}`} strokeLinecap="round" transform="rotate(135 26 28)"/>
        <circle cx="26" cy="28" r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={`${(dss/100)*c*0.75} ${c}`} strokeLinecap="round" transform="rotate(135 26 28)"/>
        <text x="26" y="31" textAnchor="middle" fill={color} fontSize="10" fontWeight="bold">{dss}</text>
      </svg>
      <span className="text-[8px] font-bold" style={{color}}>{label}</span>
    </div>
  );
}

// ── DecisionPanel ─────────────────────────────────────────────────────────────

function DecisionPanel({results}:{results:BacktestResult[]}) {
  if (!results.length) return null;
  const withDSS=results.map(r=>({r,dss:calcDSS(r.metricas)}));
  const bestDSS=[...withDSS].sort((a,b)=>b.dss-a.dss)[0];
  const bestRet=[...results].sort((a,b)=>b.metricas.retorno_total-a.metricas.retorno_total)[0];
  const bestWR=[...results].filter(r=>r.metricas.total_trades>=5).sort((a,b)=>b.metricas.win_rate-a.metricas.win_rate)[0];
  const lowestDD=[...results].filter(r=>r.metricas.retorno_total>0).sort((a,b)=>a.metricas.max_drawdown-b.metricas.max_drawdown)[0];
  const {color:dc}=dssLabel(bestDSS.dss);
  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4" style={{background:"linear-gradient(135deg,rgba(59,130,246,0.05),rgba(6,182,212,0.03))",border:"1px solid rgba(59,130,246,0.25)"}}>
      <div className="flex items-center gap-2"><Zap size={15} style={{color:"#3b82f6"}}/><span className="text-sm font-black" style={{color:"var(--text-primary)"}}>PAINEL DE DECISÃO</span><span className="text-[10px] px-2 py-0.5 rounded-full" style={{background:"rgba(59,130,246,0.15)",color:"#3b82f6"}}>{results.length} perfis</span></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {icon:<Trophy size={13}/>,label:"MAIS EQUILIBRADO (DSS)",nome:bestDSS.r.perfil_nome,metric:`DSS ${bestDSS.dss} · WR ${bestDSS.r.metricas.win_rate}% · ${pct(bestDSS.r.metricas.retorno_total)}`,note:bestDSS.dss>=65?"✅ Recomendado":bestDSS.dss>=50?"⚠️ Regular":"❌ Risco elevado",color:dc,hi:true},
          {icon:<Rocket size={13}/>,label:"MAIOR RETORNO",nome:bestRet.perfil_nome,metric:`${pct(bestRet.metricas.retorno_total)} · PF ${bestRet.metricas.profit_factor.toFixed(1)} · DD -${bestRet.metricas.max_drawdown.toFixed(1)}%`,note:bestRet.metricas.max_drawdown>25?"⚠️ Drawdown alto":"✅ Retorno sólido",color:"#22c55e",hi:false},
          {icon:<Target size={13}/>,label:"MAIOR WIN RATE",nome:bestWR?.perfil_nome??"—",metric:bestWR?`WR ${bestWR.metricas.win_rate}% · PF ${bestWR.metricas.profit_factor.toFixed(1)} · ${bestWR.metricas.total_trades} ops`:"—",note:bestWR&&bestWR.metricas.win_rate>=55?"✅ Alta consistência":"⚠️ Moderado",color:"#3b82f6",hi:false},
          {icon:<Shield size={13}/>,label:"MENOR RISCO",nome:lowestDD?.perfil_nome??"—",metric:lowestDD?`DD -${lowestDD.metricas.max_drawdown.toFixed(1)}% · WR ${lowestDD.metricas.win_rate}%`:"—",note:lowestDD?"✅ Capital protegido":"—",color:"#a855f7",hi:false},
        ].map((c,i)=>(
          <div key={i} className="rounded-xl p-4 flex flex-col gap-2" style={{background:c.hi?`${c.color}12`:"var(--bg-card)",border:`1px solid ${c.hi?c.color+"40":"var(--border)"}`,boxShadow:c.hi?`0 0 16px ${c.color}15`:"none"}}>
            <div className="flex items-center gap-1.5" style={{color:c.color}}>{c.icon}<span className="text-[9px] font-black uppercase tracking-wider">{c.label}</span></div>
            <div className="text-sm font-black leading-tight" style={{color:"var(--text-primary)"}}>{c.nome}</div>
            <div className="text-[10px] font-medium" style={{color:"var(--text-secondary)"}}>{c.metric}</div>
            <div className="text-[10px] font-semibold mt-auto" style={{color:c.color}}>{c.note}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── RankingTable ──────────────────────────────────────────────────────────────

function RankingTable({results,onSelect}:{results:BacktestResult[];onSelect:(id:string)=>void}) {
  const rows=[...results].map(r=>({r,dss:calcDSS(r.metricas)})).sort((a,b)=>b.dss-a.dss);
  return (
    <div className="overflow-x-auto rounded-xl" style={{border:"1px solid var(--border)"}}>
      <table className="w-full" style={{fontSize:"11px",minWidth:720}}>
        <thead><tr style={{background:"var(--bg)",borderBottom:"1px solid var(--border)"}}>
          {["#","Perfil","DSS","Retorno","Win Rate","P.Factor","Drawdown","Sharpe","Ops","Expectância"].map(h=>(
            <th key={h} className="px-3 py-2.5 text-left font-bold text-[10px] uppercase tracking-wider" style={{color:"var(--text-muted)",whiteSpace:"nowrap"}}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {rows.map(({r,dss},i)=>{
            const m=r.metricas; const {color:dc,label:dl}=dssLabel(dss);
            return (
              <tr key={r.perfil_id} onClick={()=>onSelect(r.perfil_id)}
                className="cursor-pointer hover:bg-white/5 transition-colors"
                style={{borderBottom:"1px solid rgba(255,255,255,0.04)",background:i===0?"rgba(34,197,94,0.03)":"transparent"}}>
                <td className="px-3 py-2 font-black text-[10px]" style={{color:"var(--text-muted)"}}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`}</td>
                <td className="px-3 py-2 font-semibold" style={{color:"var(--text-primary)",whiteSpace:"nowrap"}}>{r.perfil_nome}</td>
                <td className="px-3 py-2"><span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black" style={{background:dc+"20",color:dc,border:`1px solid ${dc}40`}}>{dss} {dl}</span></td>
                <td className="px-3 py-2 tabular-nums font-bold" style={{color:m.retorno_total>=0?"#22c55e":"#ef4444"}}>{pct(m.retorno_total)}</td>
                <td className="px-3 py-2 tabular-nums" style={{color:metricColor(m.win_rate,[45,55])}}>{m.win_rate}%</td>
                <td className="px-3 py-2 tabular-nums" style={{color:metricColor(m.profit_factor,[1.0,1.5])}}>{m.profit_factor.toFixed(2)}</td>
                <td className="px-3 py-2 tabular-nums" style={{color:metricColor(100-m.max_drawdown,[80,90])}}>-{m.max_drawdown.toFixed(1)}%</td>
                <td className="px-3 py-2 tabular-nums" style={{color:metricColor(m.sharpe,[0.5,1.5])}}>{m.sharpe.toFixed(2)}</td>
                <td className="px-3 py-2 tabular-nums" style={{color:"var(--text-secondary)"}}>{m.total_trades}</td>
                <td className="px-3 py-2 tabular-nums" style={{color:m.expectancia>=0?"#22c55e":"#ef4444"}}>{brl(m.expectancia)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── MonthlyHeatmap ────────────────────────────────────────────────────────────

function MonthlyHeatmap({trades}:{trades:Trade[]}) {
  const byMonth:Record<string,{pnl:number;trades:number}>={};
  for (const t of trades) {
    const d=new Date(t.saida_ts); const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    if (!byMonth[key]) byMonth[key]={pnl:0,trades:0};
    byMonth[key].pnl+=t.pnl; byMonth[key].trades+=1;
  }
  const entries=Object.entries(byMonth).sort(([a],[b])=>a.localeCompare(b));
  if (!entries.length) return null;
  const maxAbs=Math.max(...entries.map(([,v])=>Math.abs(v.pnl)),1);
  const MESES=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return (
    <div>
      <p className="text-xs font-semibold mb-2" style={{color:"var(--text-muted)"}}>RESULTADO MENSAL</p>
      <div className="flex flex-wrap gap-1.5">
        {entries.map(([key,v])=>{
          const [year,month]=key.split("-"); const label=`${MESES[+month-1]}/${year.slice(2)}`;
          const intensity=Math.abs(v.pnl)/maxAbs;
          const bg=v.pnl>=0?`rgba(34,197,94,${0.1+intensity*0.55})`:`rgba(239,68,68,${0.1+intensity*0.55})`;
          return (
            <div key={key} title={`${label}: ${brl(v.pnl)}`} className="rounded-lg px-2 py-1.5 text-center" style={{background:bg,border:"1px solid rgba(255,255,255,0.06)",minWidth:52}}>
              <p className="text-[10px] font-medium" style={{color:"var(--text-secondary)"}}>{label}</p>
              <p className="text-[11px] font-bold tabular-nums" style={{color:v.pnl>=0?"#22C55E":"#EF4444"}}>{v.pnl>=0?"+":""}{brl(v.pnl).replace("R$","").trim()}</p>
              <p className="text-[9px]" style={{color:"var(--text-muted)"}}>{v.trades} ops</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── ResultPanel ───────────────────────────────────────────────────────────────

function ResultPanel({result,onClose}:{result:BacktestResult;onClose?:()=>void}) {
  const [showTrades,setShowTrades]=useState(false);
  const m=result.metricas, of_=result.overfitting;
  const dss=calcDSS(m); const {color:dc,label:dl}=dssLabel(dss);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg font-bold" style={{color:"var(--text-primary)"}}>{result.simbolo.replace("USDT","")} — {result.perfil_nome}</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black" style={{background:dc+"20",color:dc,border:`1px solid ${dc}40`}}>DSS {dss} · {dl}</span>
          </div>
          <p className="text-xs mt-0.5" style={{color:"var(--text-muted)"}}>{result.periodo.inicio} → {result.periodo.fim} · {result.periodo.dias}d</p>
        </div>
        {onClose&&<button onClick={onClose} className="p-1 rounded-lg hover:bg-white/5" style={{color:"var(--text-muted)"}}><X size={15}/></button>}
      </div>
      <div className="rounded-xl overflow-hidden" style={{background:"var(--bg-card)",border:"1px solid var(--border)"}}>
        <div className="px-4 pt-3 pb-1 flex justify-between"><span className="text-xs font-semibold" style={{color:"var(--text-muted)"}}>CURVA DE CAPITAL</span><span className="text-sm font-bold tabular-nums" style={{color:m.retorno_total>=0?"#22C55E":"#EF4444"}}>{brl(m.capital_inicial)} → {brl(m.capital_final)} ({pct(m.retorno_total)})</span></div>
        <EquityChart equity={result.equity} height={180}/>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl" style={{background:`${dc}08`,border:`1px solid ${dc}30`}}>
        {[{l:"DSS Score",v:String(dss),c:dc},{l:"Retorno",v:pct(m.retorno_total),c:m.retorno_total>=0?"#22c55e":"#ef4444"},{l:"Win Rate",v:`${m.win_rate}%`,c:m.win_rate>=55?"#22c55e":m.win_rate>=45?"#f59e0b":"#ef4444"},{l:"Profit Factor",v:m.profit_factor.toFixed(2),c:m.profit_factor>=1.5?"#22c55e":m.profit_factor>=1?"#f59e0b":"#ef4444"}].map(({l,v,c})=>(
          <div key={l} className="text-center"><div className="text-[10px] font-bold uppercase" style={{color:"var(--text-muted)"}}>{l}</div><div className="text-2xl font-black mt-1 tabular-nums" style={{color:c}}>{v}</div></div>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[{l:"Max Drawdown",v:`-${m.max_drawdown.toFixed(2)}%`,c:m.max_drawdown<=10?"#22C55E":m.max_drawdown<=20?"#F59E0B":"#EF4444"},{l:"Sharpe",v:m.sharpe.toFixed(2),c:m.sharpe>=1.5?"#22C55E":m.sharpe>=0.5?"#F59E0B":"#EF4444"},{l:"Sortino",v:m.sortino.toFixed(2)},{l:"Recovery",v:m.recovery_factor.toFixed(2)},{l:"Expectância",v:brl(m.expectancia),c:m.expectancia>=0?"#22C55E":"#EF4444"},{l:"Operações",v:String(m.total_trades)}].map(({l,v,c})=>(
          <div key={l} className="rounded-xl p-3 flex flex-col gap-1" style={{background:"var(--bg-card)",border:"1px solid var(--border)"}}><span className="text-xs font-medium" style={{color:"var(--text-muted)"}}>{l}</span><span className="text-lg font-bold tabular-nums" style={{color:c??"var(--text-primary)"}}>{v}</span></div>
        ))}
      </div>
      <MonthlyHeatmap trades={result.trades}/>
      {of_&&(
        <div className="rounded-xl p-4" style={{background:of_.score_confianca>=70?"rgba(34,197,94,0.05)":"rgba(239,68,68,0.05)",border:`1px solid ${of_.score_confianca>=70?"rgba(34,197,94,0.2)":"rgba(239,68,68,0.2)"}`}}>
          <div className="flex justify-between mb-3"><span className="text-sm font-semibold" style={{color:"var(--text-primary)"}}>Overfitting (70/30 split)</span><span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{background:of_.score_confianca>=70?"rgba(34,197,94,0.15)":"rgba(239,68,68,0.15)",color:of_.score_confianca>=70?"#22C55E":"#EF4444"}}>Confiança {of_.score_confianca}/100</span></div>
          <div className="grid grid-cols-4 gap-3 text-xs mb-3">{[["Retorno Treino",pct(of_.treino?.retorno_total??0)],["Retorno Teste",pct(of_.teste?.retorno_total??0)],["WR Treino",`${of_.treino?.win_rate??0}%`],["WR Teste",`${of_.teste?.win_rate??0}%`]].map(([l,v])=>(<div key={l} className="text-center"><p style={{color:"var(--text-muted)"}}>{l}</p><p className="font-bold mt-0.5" style={{color:"var(--text-primary)"}}>{v}</p></div>))}</div>
          {of_.alertas?.map((a,i)=>(<div key={i} className="flex items-start gap-2 text-xs"><AlertTriangle size={11} style={{color:"#F59E0B",flexShrink:0,marginTop:1}}/><span style={{color:"var(--text-secondary)"}}>{a}</span></div>))}
        </div>
      )}
      <div>
        <button onClick={()=>setShowTrades(v=>!v)} className="flex items-center gap-2 text-sm font-semibold mb-2" style={{color:"var(--text-secondary)"}}>{showTrades?<ChevronUp size={13}/>:<ChevronDown size={13}/>}{result.trades.length} Operações</button>
        {showTrades&&(
          <div className="overflow-x-auto rounded-xl" style={{border:"1px solid var(--border)"}}>
            <table className="w-full text-xs"><thead><tr style={{background:"var(--bg-elevated)",borderBottom:"1px solid var(--border)"}}>{["Entrada","Saída","Preço Ent.","Preço Saí.","PnL","PnL%","Motivo","Capital"].map(h=>(<th key={h} className="px-3 py-2 text-left font-medium" style={{color:"var(--text-muted)"}}>{h}</th>))}</tr></thead>
            <tbody>{result.trades.slice(0,200).map((t,i)=>(<tr key={i} style={{borderBottom:"1px solid rgba(255,255,255,0.03)",background:t.resultado==="ganho"?"rgba(34,197,94,0.03)":"rgba(239,68,68,0.03)"}}><td className="px-3 py-1.5 tabular-nums" style={{color:"var(--text-secondary)"}}>{fmtTs(t.entrada_ts)}</td><td className="px-3 py-1.5 tabular-nums" style={{color:"var(--text-secondary)"}}>{fmtTs(t.saida_ts)}</td><td className="px-3 py-1.5 tabular-nums" style={{color:"var(--text-primary)"}}>{t.entrada_preco.toFixed(2)}</td><td className="px-3 py-1.5 tabular-nums" style={{color:"var(--text-primary)"}}>{t.saida_preco.toFixed(2)}</td><td className="px-3 py-1.5 tabular-nums font-medium" style={{color:t.pnl>=0?"#22C55E":"#EF4444"}}>{brl(t.pnl)}</td><td className="px-3 py-1.5 tabular-nums" style={{color:t.pnl>=0?"#22C55E":"#EF4444"}}>{pct(t.pnl_pct)}</td><td className="px-3 py-1.5" style={{color:"var(--text-muted)"}}>{t.motivo}</td><td className="px-3 py-1.5 tabular-nums" style={{color:"var(--text-secondary)"}}>{brl(t.capital_after)}</td></tr>))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── CandidateCard ─────────────────────────────────────────────────────────────

function CandidateCard({c,onApprove,onReject,onRevise}:{c:Candidate;onApprove:(id:string)=>void;onReject:(id:string)=>void;onRevise:(id:string)=>void}) {
  const p=c.perfil_candidato; const cc=c.confianca>=80?"#22C55E":c.confianca>=60?"#F59E0B":"#EF4444";
  return (
    <div className="rounded-xl p-4 flex flex-col gap-3" style={{background:"var(--bg-card)",border:"1px solid var(--primary-border)"}}>
      <div className="flex items-start justify-between gap-3">
        <div><div className="flex items-center gap-2"><Brain size={13} style={{color:"var(--primary)"}}/><span className="font-semibold text-sm" style={{color:"var(--text-primary)"}}>Gen {c.geração} — {p?.nome}</span></div><p className="text-xs mt-1 leading-relaxed" style={{color:"var(--text-secondary)"}}>{c.hipotese}</p></div>
        <div className="text-center"><div className="text-lg font-bold" style={{color:cc}}>{c.confianca}%</div><div className="text-[10px]" style={{color:cc}}>Confiança</div></div>
      </div>
      {c.alteracoes?.length>0&&<div className="flex flex-col gap-1">{c.alteracoes.map((a,i)=>(<div key={i} className="flex items-center justify-between text-xs rounded-lg px-3 py-1.5" style={{background:"var(--bg-surface)",border:"1px solid var(--border-subtle)"}}><span className="font-mono" style={{color:"var(--text-primary)"}}>{a.campo}</span><div className="flex items-center gap-1.5"><span style={{color:"var(--text-muted)"}}>{a.de}</span><ArrowRight size={9} style={{color:"var(--text-muted)"}}/><span className="font-bold" style={{color:a.para>a.de?"#22C55E":"#EF4444"}}>{a.para}</span></div></div>))}</div>}
      {c.riscos?.length>0&&<div className="flex flex-col gap-1">{c.riscos.map((r,i)=><div key={i} className="flex items-start gap-2 text-xs"><AlertTriangle size={11} style={{color:"#F59E0B",flexShrink:0,marginTop:1}}/><span style={{color:"var(--text-secondary)"}}>{r}</span></div>)}</div>}
      <div className="flex gap-2 pt-1">
        <button onClick={()=>onApprove(c.id)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold flex-1 justify-center" style={{background:"rgba(34,197,94,0.15)",color:"#22C55E",border:"1px solid rgba(34,197,94,0.3)"}}><Check size={12}/>Aprovar</button>
        <button onClick={()=>onRevise(c.id)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold flex-1 justify-center" style={{background:"var(--primary-glow)",color:"var(--primary)",border:"1px solid var(--primary-border)"}}><RefreshCw size={12}/>Revisar</button>
        <button onClick={()=>onReject(c.id)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold flex-1 justify-center" style={{background:"rgba(239,68,68,0.1)",color:"#EF4444",border:"1px solid rgba(239,68,68,0.25)"}}><X size={12}/>Rejeitar</button>
      </div>
    </div>
  );
}

// ── OptGenCard ────────────────────────────────────────────────────────────────

function OptGenCard({gen}:{gen:OptGen}) {
  const [open,setOpen]=useState(gen.numero===0);
  if (gen.tipo==="erro") return (
    <div className="rounded-xl px-4 py-3 flex items-center gap-2 text-xs" style={{background:"rgba(239,68,68,0.06)",border:"1px solid rgba(239,68,68,0.2)"}}>
      <XCircle size={13} style={{color:"#ef4444",flexShrink:0}}/><span style={{color:"var(--text-secondary)"}}>Gen {gen.numero}: {gen.erro}</span>
    </div>
  );
  const improved=gen.melhorou===true, converged=gen.converged===true;
  const hBg=converged?"rgba(34,197,94,0.08)":improved?"rgba(59,130,246,0.06)":"var(--bg-card)";
  const hBd=converged?"rgba(34,197,94,0.3)":improved?"rgba(59,130,246,0.2)":"var(--border)";
  return (
    <div className="rounded-xl overflow-hidden" style={{background:hBg,border:`1px solid ${hBd}`}}>
      <button className="w-full flex items-center gap-3 px-4 py-3" onClick={()=>setOpen(v=>!v)}>
        <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0" style={{background:converged?"rgba(34,197,94,0.2)":improved?"rgba(59,130,246,0.2)":"rgba(255,255,255,0.05)",color:converged?"#22c55e":improved?"#3b82f6":"var(--text-muted)"}}>
          {gen.numero===0?"B":gen.numero}
        </div>
        <div className="flex-1 text-left">
          <div className="text-xs font-semibold" style={{color:"var(--text-primary)"}}>
            {gen.numero===0?"Baseline — Testando perfis padrão":gen.perfil_nome??`Geração ${gen.numero}`}
            {converged&&<span className="ml-2 text-[10px] font-black" style={{color:"#22c55e"}}>✅ CRITÉRIOS ATINGIDOS</span>}
          </div>
          {gen.numero>0&&gen.dss_anterior!=null&&gen.dss_novo!=null&&(
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px]" style={{color:"var(--text-muted)"}}>DSS {gen.dss_anterior}</span>
              <ArrowRight size={9} style={{color:"var(--text-muted)"}}/>
              <span className="text-[10px] font-bold" style={{color:gen.dss_novo>gen.dss_anterior?"#22c55e":gen.dss_novo<gen.dss_anterior?"#ef4444":"var(--text-muted)"}}>DSS {gen.dss_novo}</span>
              {improved?<TrendingUp size={11} style={{color:"#22c55e"}}/>:<TrendingDown size={11} style={{color:"#ef4444"}}/>}
            </div>
          )}
        </div>
        {gen.numero===0&&gen.campeao_dss!=null&&<span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{background:"rgba(59,130,246,0.15)",color:"#3b82f6"}}>DSS {gen.campeao_dss}</span>}
        {open?<ChevronUp size={13} style={{color:"var(--text-muted)"}}/>:<ChevronDown size={13} style={{color:"var(--text-muted)"}}/>}
      </button>
      {open&&(
        <div className="px-4 pb-4 flex flex-col gap-3">
          {gen.hipotese&&<p className="text-xs leading-relaxed" style={{color:"var(--text-secondary)"}}>{gen.hipotese}</p>}
          {gen.alteracoes&&gen.alteracoes.length>0&&(
            <div className="flex flex-col gap-1">
              <p className="text-[10px] font-bold uppercase" style={{color:"var(--text-muted)"}}>Alterações</p>
              {gen.alteracoes.map((a,i)=>(
                <div key={i} className="flex items-center justify-between text-xs rounded-lg px-3 py-1.5" style={{background:"rgba(255,255,255,0.03)"}}>
                  <span className="font-mono" style={{color:"var(--text-primary)"}}>{a.campo}</span>
                  <div className="flex items-center gap-1.5"><span style={{color:"var(--text-muted)"}}>{a.de}</span><ArrowRight size={9} style={{color:"var(--text-muted)"}}/><span className="font-bold" style={{color:a.para>a.de?"#22c55e":"#ef4444"}}>{a.para}</span></div>
                </div>
              ))}
            </div>
          )}
          {gen.metricas&&(
            <div className="grid grid-cols-3 gap-2">
              {[
                {l:"Win Rate",v:`${gen.metricas.win_rate??"-"}%`,c:gen.metricas.win_rate!=null?metricColor(gen.metricas.win_rate,[45,55]):"var(--text-muted)"},
                {l:"P.Factor",v:gen.metricas.profit_factor?.toFixed(2)??"-",c:gen.metricas.profit_factor!=null?metricColor(gen.metricas.profit_factor,[1.0,1.5]):"var(--text-muted)"},
                {l:"Retorno",v:gen.metricas.retorno_total!=null?pct(gen.metricas.retorno_total):"-",c:gen.metricas.retorno_total!=null?(gen.metricas.retorno_total>=0?"#22c55e":"#ef4444"):"var(--text-muted)"},
                {l:"Drawdown",v:gen.metricas.max_drawdown!=null?`-${gen.metricas.max_drawdown}%`:"-",c:gen.metricas.max_drawdown!=null?metricColor(100-(gen.metricas.max_drawdown??0),[80,90]):"var(--text-muted)"},
                {l:"Ops",v:String(gen.metricas.total_trades??"-"),c:"var(--text-secondary)"},
                {l:"Sharpe",v:gen.metricas.sharpe?.toFixed(2)??"-",c:gen.metricas.sharpe!=null?metricColor(gen.metricas.sharpe,[0.5,1.5]):"var(--text-muted)"},
              ].map(({l,v,c})=>(
                <div key={l} className="rounded-lg p-2 text-center" style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.05)"}}>
                  <div className="text-[9px]" style={{color:"var(--text-muted)"}}>{l}</div>
                  <div className="text-sm font-bold tabular-nums mt-0.5" style={{color:c}}>{v}</div>
                </div>
              ))}
            </div>
          )}
          {gen.resultados_baseline&&gen.resultados_baseline.length>0&&(
            <div className="overflow-x-auto rounded-lg" style={{border:"1px solid rgba(255,255,255,0.06)"}}>
              <table className="w-full" style={{fontSize:"10px",minWidth:400}}>
                <thead><tr style={{background:"rgba(255,255,255,0.03)"}}>{["Perfil","DSS","WR","PF","Retorno","Ops"].map(h=><th key={h} className="px-2 py-1.5 text-left font-bold" style={{color:"var(--text-muted)"}}>{h}</th>)}</tr></thead>
                <tbody>{gen.resultados_baseline.map((b,i)=>(
                  <tr key={i} style={{borderTop:"1px solid rgba(255,255,255,0.04)"}}>
                    <td className="px-2 py-1.5" style={{color:"var(--text-primary)"}}>{i===0?"🥇 ":""}{b.perfil_nome}</td>
                    <td className="px-2 py-1.5 font-bold" style={{color:dssLabel(b.dss).color}}>{b.dss}</td>
                    <td className="px-2 py-1.5" style={{color:metricColor(b.win_rate,[45,55])}}>{b.win_rate}%</td>
                    <td className="px-2 py-1.5" style={{color:metricColor(b.profit_factor,[1.0,1.5])}}>{b.profit_factor}</td>
                    <td className="px-2 py-1.5" style={{color:b.retorno_total>=0?"#22c55e":"#ef4444"}}>{pct(b.retorno_total)}</td>
                    <td className="px-2 py-1.5" style={{color:"var(--text-muted)"}}>{b.total_trades}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── ChampionPanel ─────────────────────────────────────────────────────────────

function ChampionPanel({task,simbolo,periodo,onDeploy}:{task:OptTask;simbolo:string;periodo:string;onDeploy:(p:IAFuturesProfile)=>void}) {
  const [deploying,setDeploying]=useState(false);
  const [deployed,setDeployed]=useState(false);
  const [deployErr,setDeployErr]=useState("");
  const cam=task.campeao!; const m=cam.metricas; const cfg=cam.perfil_config;
  const {color:dc,label:dl}=dssLabel(cam.dss);

  async function handleDeploy() {
    setDeploying(true); setDeployErr("");
    try {
      const r=await fetch(`${API}/cripto/backtest/ia-futures-profiles`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({campeao:cam,simbolo,periodo})});
      if (!r.ok){const d=await r.json();throw new Error(d.detail||"Erro");}
      const d=await r.json(); setDeployed(true); onDeploy(d.perfil);
    } catch(e:unknown){setDeployErr(e instanceof Error?e.message:"Erro ao deployar");}
    finally{setDeploying(false);}
  }

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-5" style={{background:task.converged?"rgba(34,197,94,0.05)":"rgba(59,130,246,0.05)",border:`2px solid ${task.converged?"rgba(34,197,94,0.35)":"rgba(59,130,246,0.35)"}`}}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">{task.converged?<CheckCircle2 size={18} style={{color:"#22c55e"}}/>:<Trophy size={18} style={{color:"#3b82f6"}}/>}<span className="font-black text-base" style={{color:"var(--text-primary)"}}>{task.converged?"PERFIL ENCONTRADO — CRITÉRIOS ATINGIDOS":"MELHOR PERFIL ENCONTRADO"}</span></div>
          <p className="text-sm font-semibold" style={{color:"var(--text-secondary)"}}>{cam.perfil_nome}</p>
        </div>
        <DSSGauge dss={cam.dss}/>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {l:"Win Rate",v:`${m.win_rate??"-"}%`,c:m.win_rate!=null?(m.win_rate>=55?"#22c55e":m.win_rate>=45?"#f59e0b":"#ef4444"):"var(--text-muted)"},
          {l:"Profit Factor",v:m.profit_factor?.toFixed(2)??"-",c:m.profit_factor!=null?(m.profit_factor>=1.5?"#22c55e":m.profit_factor>=1?"#f59e0b":"#ef4444"):"var(--text-muted)"},
          {l:"Retorno Total",v:m.retorno_total!=null?pct(m.retorno_total):"-",c:m.retorno_total!=null?(m.retorno_total>=0?"#22c55e":"#ef4444"):"var(--text-muted)"},
          {l:"Max Drawdown",v:m.max_drawdown!=null?`-${m.max_drawdown.toFixed(1)}%`:"-",c:m.max_drawdown!=null?(m.max_drawdown<=10?"#22c55e":m.max_drawdown<=20?"#f59e0b":"#ef4444"):"var(--text-muted)"},
          {l:"Operações",v:String(m.total_trades??"-"),c:"var(--text-secondary)"},
          {l:"Sharpe",v:m.sharpe?.toFixed(2)??"-",c:m.sharpe!=null?(m.sharpe>=1.5?"#22c55e":m.sharpe>=0.5?"#f59e0b":"#ef4444"):"var(--text-muted)"},
          {l:"Expectância",v:m.expectancia!=null?brl(m.expectancia):"-",c:m.expectancia!=null?(m.expectancia>=0?"#22c55e":"#ef4444"):"var(--text-muted)"},
          {l:"Recovery Factor",v:m.recovery_factor?.toFixed(2)??"-",c:"var(--text-secondary)"},
        ].map(({l,v,c})=>(
          <div key={l} className="rounded-xl p-3 flex flex-col gap-0.5" style={{background:"var(--bg-card)",border:"1px solid var(--border)"}}>
            <span className="text-[10px] font-medium" style={{color:"var(--text-muted)"}}>{l}</span>
            <span className="text-lg font-bold tabular-nums" style={{color:c}}>{v}</span>
          </div>
        ))}
      </div>

      {cfg&&(
        <div className="rounded-xl p-4" style={{background:"var(--bg-card)",border:"1px solid var(--border)"}}>
          <p className="text-[10px] font-bold uppercase mb-3" style={{color:"var(--text-muted)"}}>Configuração do Perfil</p>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {[["Sc. Compra",cfg.score_compra],["Sc. Venda",cfg.score_venda],["Bull% Min",cfg.bull_pct_min],["SL%",cfg.sl_pct],["TP%",cfg.tp_pct],["R:R",(cfg.tp_pct/cfg.sl_pct).toFixed(1)]].map(([l,v])=>(
              <div key={String(l)} className="text-center rounded-lg p-2" style={{background:"var(--bg-surface)",border:"1px solid var(--border-subtle)"}}><div className="text-[9px] mb-0.5" style={{color:"var(--text-muted)"}}>{l}</div><div className="text-sm font-bold" style={{color:"var(--text-primary)"}}>{v}</div></div>
            ))}
          </div>
        </div>
      )}

      {!deployed?(
        <div className="flex flex-col gap-2">
          {deployErr&&<p className="text-xs" style={{color:"#ef4444"}}>{deployErr}</p>}
          <button onClick={handleDeploy} disabled={deploying}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-xl text-sm font-black transition-all"
            style={{background:deploying?"rgba(139,92,246,0.2)":"linear-gradient(135deg,#8b5cf6,#3b82f6)",color:"#fff",cursor:deploying?"not-allowed":"pointer",boxShadow:deploying?"none":"0 0 28px rgba(139,92,246,0.45)",opacity:deploying?0.7:1}}>
            {deploying?<><Loader2 size={16} className="animate-spin"/>Salvando no Futures...</>:<><Bot size={16}/>Colocar no Futures<ArrowRight size={14}/></>}
          </button>
          <p className="text-[10px] text-center" style={{color:"var(--text-muted)"}}>O perfil ficará disponível na aba Futures IA como [IA] {cfg?.nome}</p>
        </div>
      ):(
        <div className="flex items-center gap-3 px-4 py-4 rounded-xl" style={{background:"rgba(34,197,94,0.1)",border:"1px solid rgba(34,197,94,0.3)"}}>
          <CheckCircle2 size={20} style={{color:"#22c55e",flexShrink:0}}/>
          <div><p className="text-sm font-bold" style={{color:"#22c55e"}}>Perfil deployado com sucesso!</p><p className="text-xs mt-0.5" style={{color:"var(--text-secondary)"}}>Disponível na aba Futures IA como <strong>[IA] {cfg?.nome}</strong></p></div>
        </div>
      )}
    </div>
  );
}

// ── IAFuturesCard ─────────────────────────────────────────────────────────────

function IAFuturesCard({p,onRemove}:{p:IAFuturesProfile;onRemove:(id:string)=>void}) {
  const {color,label}=dssLabel(p.dss); const m=p.metricas_backtest;
  return (
    <div className="rounded-xl p-4 flex flex-col gap-3" style={{background:"var(--bg-card)",border:"1px solid rgba(139,92,246,0.3)"}}>
      <div className="flex items-start justify-between gap-2">
        <div><div className="flex items-center gap-2"><span>{p.emoji}</span><span className="text-sm font-bold" style={{color:"var(--text-primary)"}}>{p.nome}</span></div><p className="text-[10px] mt-0.5" style={{color:"var(--text-muted)"}}>Backtest em {p.simbolo_backtest} · {p.periodo_backtest}</p></div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black" style={{background:color+"20",color,border:`1px solid ${color}40`}}>DSS {p.dss} {label}</span>
          <button onClick={()=>onRemove(p.id)} className="p-1.5 rounded-lg hover:bg-white/5" style={{color:"var(--text-muted)"}}><Trash2 size={12}/></button>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {[
          {l:"Win Rate",v:`${m.win_rate??"-"}%`,c:m.win_rate!=null?metricColor(m.win_rate as number,[45,55]):"var(--text-muted)"},
          {l:"P.Factor",v:m.profit_factor!=null?(m.profit_factor as number).toFixed(2):"-",c:m.profit_factor!=null?metricColor(m.profit_factor as number,[1.0,1.5]):"var(--text-muted)"},
          {l:"Retorno",v:m.retorno_total!=null?pct(m.retorno_total as number):"-",c:m.retorno_total!=null?((m.retorno_total as number)>=0?"#22c55e":"#ef4444"):"var(--text-muted)"},
          {l:"Drawdown",v:m.max_drawdown!=null?`-${(m.max_drawdown as number).toFixed(1)}%`:"-",c:m.max_drawdown!=null?metricColor(100-(m.max_drawdown as number),[80,90]):"var(--text-muted)"},
        ].map(({l,v,c})=>(<div key={l} className="text-center rounded-lg p-1.5" style={{background:"var(--bg-surface)"}}><div className="text-[9px]" style={{color:"var(--text-muted)"}}>{l}</div><div className="text-xs font-bold tabular-nums" style={{color:c}}>{v}</div></div>))}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {[{l:"SL",v:`${(p.sl_pct*100).toFixed(2)}%`},{l:"TP",v:`${(p.tp_pct*100).toFixed(2)}%`},{l:"R:R",v:`1:${(p.tp_pct/p.sl_pct).toFixed(1)}`}].map(({l,v})=>(<div key={l} className="text-center rounded-lg p-1.5" style={{background:"var(--bg-surface)"}}><div className="text-[9px]" style={{color:"var(--text-muted)"}}>{l}</div><div className="text-xs font-bold" style={{color:"var(--text-primary)"}}>{v}</div></div>))}
      </div>
      <p className="text-[10px] leading-relaxed" style={{color:"var(--text-muted)"}}>{p.descricao}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════

export default function BacktestPage() {
  const [tab,setTab]=useState<"manual"|"ia">("manual");

  // ── Manual ────────────────────────────────────────────────────────────────
  const [simbolo,setSimboloS]=useState("BTCUSDT");
  const [dateInicio,setDateInicio]=useState(()=>daysAgoStr(365));
  const [dateFim,setDateFim]=useState(()=>todayStr());
  const [capital,setCapital]=useState(10000);
  const [stakeBase,setStakeBase]=useState(1000);
  const [custoPct,setCustoPct]=useState(0.04);
  const [perfis,setPerfis]=useState<{builtin:Perfil[];custom:Perfil[]}>({builtin:PERFIS_FALLBACK,custom:[]});
  const [running,setRunning]=useState(false);
  const [progress,setProgress]=useState<{current:number;total:number;nome:string}|null>(null);
  const [allResults,setAllResults]=useState<BacktestResult[]>([]);
  const [expanded,setExpanded]=useState<string|null>(null);
  const [erro,setErro]=useState("");
  const [viewMode,setViewMode]=useState<"cards"|"tabela">("tabela");
  const [sortBy,setSortBy]=useState<"dss"|"retorno"|"winrate"|"pf"|"entradas">("dss");
  const [candidates,setCandidates]=useState<Candidate[]>([]);
  const [aiAnalysis,setAiAnalysis]=useState<Record<string,unknown>|null>(null);
  const [analyzing,setAnalyzing]=useState(false);
  const [gerandoPerfil,setGerandoPerfil]=useState(false);

  // ── IA ────────────────────────────────────────────────────────────────────
  const [iaSimbolo,setIaSimbolo]=useState("BTCUSDT");
  const [iaDateInicio,setIaDateInicio]=useState(()=>daysAgoStr(365));
  const [iaDateFim,setIaDateFim]=useState(()=>todayStr());
  const [iaTargetWR,setIaTargetWR]=useState(50);
  const [iaTargetPF,setIaTargetPF]=useState(1.3);
  const [iaTargetOps,setIaTargetOps]=useState(30);
  const [iaTargetReturn,setIaTargetReturn]=useState(0);
  const [iaMaxGeracoes,setIaMaxGeracoes]=useState(8);
  const [iaTaskId,setIaTaskId]=useState<string|null>(null);
  const [iaTask,setIaTask]=useState<OptTask|null>(null);
  const [iaPolling,setIaPolling]=useState(false);
  const [iaDeployed,setIaDeployed]=useState<IAFuturesProfile[]>([]);
  const [iaErro,setIaErro]=useState("");

  // Carregar dados iniciais
  useEffect(()=>{
    fetch(`${API}/cripto/backtest/profiles`).then(r=>r.json()).then(d=>{if(d?.builtin?.length>0)setPerfis(d);}).catch(()=>{});
    fetch(`${API}/cripto/backtest/ia-futures-profiles`).then(r=>r.json()).then(d=>{if(Array.isArray(d))setIaDeployed(d);}).catch(()=>{});
  },[]);

  // Polling loop IA
  useEffect(()=>{
    if (!iaPolling||!iaTaskId) return;
    const iv=setInterval(async()=>{
      try {
        const r=await fetch(`${API}/cripto/backtest/ai/optimize-loop/${iaTaskId}`);
        if (!r.ok) return; const d:OptTask=await r.json(); setIaTask(d);
        if (d.status==="done"||d.status==="error") setIaPolling(false);
      } catch {}
    },4000);
    return ()=>clearInterval(iv);
  },[iaPolling,iaTaskId]);

  const allPerfis=[...(perfis.builtin??[]),...(perfis.custom??[])];
  const diasPeriodo=dateInicio&&dateFim?Math.round((new Date(dateFim).getTime()-new Date(dateInicio).getTime())/86_400_000):0;
  const iaDias=iaDateInicio&&iaDateFim?Math.round((new Date(iaDateFim).getTime()-new Date(iaDateInicio).getTime())/86_400_000):0;

  // ── Funções Manual ────────────────────────────────────────────────────────
  async function runAll() {
    if (!dateInicio||!dateFim||dateInicio>=dateFim){setErro("Período inválido");return;}
    setRunning(true);setErro("");setAllResults([]);setExpanded(null);
    const results:BacktestResult[]=[];
    for (let i=0;i<allPerfis.length;i++){
      const p=allPerfis[i]; setProgress({current:i+1,total:allPerfis.length,nome:p.nome});
      try{const r=await fetch(`${API}/cripto/backtest/run`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({simbolo,perfil_id:p.id,data_inicio:dateInicio,data_fim:dateFim,capital,custo_pct:custoPct,slippage_pct:0.05})});if(r.ok){const d:BacktestResult=await r.json();results.push(d);setAllResults([...results]);}}catch{}
    }
    setRunning(false);setProgress(null);
  }

  async function analisarIA(){if(!allResults.length)return;setAnalyzing(true);try{const r=await fetch(`${API}/cripto/backtest/ai/analyze`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({result_ids:allResults.map(r=>r.id).filter(Boolean)})});const d=await r.json();setAiAnalysis(d);}catch{setErro("Erro na análise IA");}finally{setAnalyzing(false);}}
  async function gerarPerfil(){if(!allResults.length)return;setGerandoPerfil(true);try{const best=[...allResults].sort((a,b)=>b.metricas.retorno_total-a.metricas.retorno_total).slice(0,3);const r=await fetch(`${API}/cripto/backtest/ai/generate`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({perfil_id:best[0].perfil_id,result_ids:best.map(x=>x.id),geracao:1})});if(!r.ok)throw new Error();const d:Candidate=await r.json();setCandidates(p=>[d,...p]);}catch{setErro("Erro ao gerar perfil");}finally{setGerandoPerfil(false);}}
  async function approveC(cid:string){try{await fetch(`${API}/cripto/backtest/candidates/${cid}/approve`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({nota:"Aprovado"})});setCandidates(p=>p.filter(c=>c.id!==cid));}catch{setErro("Erro");}}
  async function rejectC(cid:string){try{await fetch(`${API}/cripto/backtest/candidates/${cid}/reject`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({nota:"Rejeitado"})});setCandidates(p=>p.filter(c=>c.id!==cid));}catch{}}
  async function reviseC(cid:string){try{const best=[...allResults].sort((a,b)=>b.metricas.retorno_total-a.metricas.retorno_total).slice(0,2);const r=await fetch(`${API}/cripto/backtest/candidates/${cid}/revise`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({perfil_id:best[0]?.perfil_id??"cons_normal",result_ids:best.map(x=>x.id),geracao:1})});const d=await r.json();setCandidates(p=>[d,...p.filter(c=>c.id!==cid)]);}catch{}}

  // ── Funções IA ────────────────────────────────────────────────────────────
  async function startLoop(){
    setIaErro("");setIaTask(null);setIaTaskId(null);
    if (!iaDateInicio||!iaDateFim||iaDateInicio>=iaDateFim){setIaErro("Período inválido");return;}
    try{
      const r=await fetch(`${API}/cripto/backtest/ai/optimize-loop/start`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({simbolo:iaSimbolo,data_inicio:iaDateInicio,data_fim:iaDateFim,target_wr:iaTargetWR,target_pf:iaTargetPF,target_ops:iaTargetOps,target_return:iaTargetReturn,max_geracoes:iaMaxGeracoes,custo_pct:0.04,slippage_pct:0.05,fear_greed:50})});
      if(!r.ok){const d=await r.json();throw new Error(d.detail||"Erro");}
      const d=await r.json(); setIaTaskId(d.task_id); setIaPolling(true);
    }catch(e:unknown){setIaErro(e instanceof Error?e.message:"Erro ao iniciar");}
  }

  async function removeIA(pid:string){try{await fetch(`${API}/cripto/backtest/ia-futures-profiles/${pid}`,{method:"DELETE"});setIaDeployed(p=>p.filter(x=>x.id!==pid));}catch{}}

  const sortedResults=[...allResults].sort((a,b)=>{
    const ma=a.metricas,mb=b.metricas;
    if(sortBy==="dss")return calcDSS(mb)-calcDSS(ma);
    if(sortBy==="winrate")return mb.win_rate-ma.win_rate;
    if(sortBy==="pf")return mb.profit_factor-ma.profit_factor;
    if(sortBy==="entradas")return mb.total_trades-ma.total_trades;
    return mb.retorno_total-ma.retorno_total;
  });
  const expandedResult=expanded?allResults.find(r=>r.perfil_id===expanded)??null:null;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col gap-6">

      {/* Título + Tabs */}
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{background:"linear-gradient(135deg,var(--primary),var(--accent))",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>Backtest — Análise de Estratégias</h1>
          <p className="text-sm mt-1" style={{color:"var(--text-muted)"}}>Simule perfis em dados históricos · deixe a IA encontrar o perfil lucrativo ideal · depois cole no Futures.</p>
        </div>
        <div className="flex items-center gap-1 p-1 rounded-xl self-start" style={{background:"var(--bg-card)",border:"1px solid var(--border)"}}>
          {([{key:"manual",label:"Backtest Manual",icon:<FlaskConical size={13}/>},{key:"ia",label:"IA Automático",icon:<Bot size={13}/>}] as const).map(({key,label,icon})=>(
            <button key={key} onClick={()=>setTab(key)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
              style={{background:tab===key?"linear-gradient(135deg,rgba(59,130,246,0.2),rgba(139,92,246,0.15))":"transparent",color:tab===key?"var(--text-primary)":"var(--text-muted)",border:tab===key?"1px solid rgba(59,130,246,0.35)":"1px solid transparent"}}>
              {icon}{label}
            </button>
          ))}
        </div>
      </div>

      {/* ══ TAB MANUAL ══════════════════════════════════════════════════════ */}
      {tab==="manual"&&(
        <div className="flex flex-col gap-5">
          {erro&&<div className="px-4 py-3 rounded-xl flex items-center gap-2 text-sm" style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.25)",color:"#EF4444"}}><AlertTriangle size={13}/>{erro}<button onClick={()=>setErro("")} className="ml-auto"><X size={12}/></button></div>}

          {/* Config */}
          <div className="rounded-2xl p-5 flex flex-col gap-5" style={{background:"var(--bg-card)",border:"1px solid var(--border)"}}>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{color:"var(--text-muted)"}}>Ativo</p>
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                {SIMBOLOS.map(s=>{const sym=s.replace("USDT",""),active=simbolo===s;return(<button key={s} onClick={()=>setSimboloS(s)} className="py-2 rounded-xl text-xs font-bold transition-all" style={{background:active?"var(--primary-glow)":"var(--bg-surface)",color:active?"var(--primary)":"var(--text-secondary)",border:active?"1px solid var(--primary-border)":"1px solid var(--border)"}}>{sym}</button>);})}
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{color:"var(--text-muted)"}}>Período</p>
                <div className="flex gap-2 flex-wrap mb-3">{PERIODOS.map(p=>(<button key={p.dias} onClick={()=>{setDateFim(todayStr());setDateInicio(daysAgoStr(p.dias));}} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all" style={{background:diasPeriodo===p.dias?"var(--primary-glow)":"var(--bg-surface)",color:diasPeriodo===p.dias?"var(--primary)":"var(--text-secondary)",border:diasPeriodo===p.dias?"1px solid var(--primary-border)":"1px solid var(--border)"}}>{p.label}</button>))}</div>
                <div className="grid grid-cols-2 gap-3">{[{l:"Início",v:dateInicio,s:setDateInicio,max:dateFim||todayStr()},{l:"Fim",v:dateFim,s:setDateFim,max:todayStr()}].map(({l,v,s,max})=>(<div key={l}><label className="block text-[11px] font-medium mb-1" style={{color:"var(--text-muted)"}}>{l}</label><input type="date" value={v} max={max} onChange={e=>s(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm" style={{background:"var(--bg-surface)",border:"1px solid var(--border)",color:"var(--text-primary)",colorScheme:"dark"}}/></div>))}</div>
                {diasPeriodo>0&&<p className="text-xs mt-1.5" style={{color:"var(--text-muted)"}}>{diasPeriodo} dias</p>}
              </div>
              <div className="flex flex-col gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{color:"var(--text-muted)"}}>Parâmetros</p>
                  <div className="flex flex-col gap-3">
                    {[{l:"Banca (R$)",v:capital,s:setCapital,min:1000,max:1_000_000,step:1000,fmt:(v:number)=>v.toLocaleString("pt-BR")},{l:"Stake por entrada (R$)",v:stakeBase,s:setStakeBase,min:100,max:50000,step:100,fmt:(v:number)=>v.toLocaleString("pt-BR")},{l:"Corretagem (%)",v:custoPct,s:setCustoPct,min:0,max:0.5,step:0.01,fmt:(v:number)=>v.toFixed(2)}].map(({l,v,s,min,max,step,fmt})=>(<div key={l}><div className="flex justify-between text-xs mb-1"><span style={{color:"var(--text-secondary)"}}>{l}</span><span className="font-bold tabular-nums" style={{color:"var(--text-primary)"}}>{fmt(v)}</span></div><input type="range" min={min} max={max} step={step} value={v} onChange={e=>s(+e.target.value)} className="w-full accent-blue-500"/></div>))}
                  </div>
                </div>
                <button onClick={runAll} disabled={running} className="w-full flex items-center justify-center gap-2 py-4 rounded-xl text-sm font-black transition-all" style={{background:running?"rgba(59,130,246,0.2)":"linear-gradient(135deg,#3B82F6,#06B6D4)",color:"#fff",cursor:running?"not-allowed":"pointer",boxShadow:running?"none":"0 0 24px rgba(59,130,246,0.4)",opacity:running?0.7:1}}>
                  {running&&progress?<><Loader2 size={16} className="animate-spin"/>Rodando {progress.current}/{progress.total} — {progress.nome}</>:<><Play size={16}/>Rodar todos os perfis ({allPerfis.length})</>}
                </button>
                {running&&progress&&(<div><div className="w-full h-1.5 rounded-full overflow-hidden" style={{background:"var(--border)"}}><div className="h-full rounded-full transition-all" style={{width:`${(progress.current/progress.total)*100}%`,background:"linear-gradient(90deg,#3B82F6,#06B6D4)"}}/></div><p className="text-[10px] mt-1 text-center" style={{color:"var(--text-muted)"}}>{progress.current}/{progress.total} concluídos</p></div>)}
              </div>
            </div>
          </div>

          {/* Resultados */}
          {allResults.length>0&&(
            <div className="flex flex-col gap-5">
              <DecisionPanel results={allResults}/>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div><h2 className="text-base font-bold" style={{color:"var(--text-primary)"}}>Ranking — {simbolo.replace("USDT","")} · {diasPeriodo}d</h2><p className="text-xs mt-0.5" style={{color:"var(--text-muted)"}}>{sortedResults.length} perfis · clique para detalhar · ordenado por DSS</p></div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1 p-1 rounded-xl" style={{background:"var(--bg-card)",border:"1px solid var(--border)"}}>
                    {([{key:"dss",l:"DSS"},{key:"retorno",l:"Retorno"},{key:"winrate",l:"Win Rate"},{key:"pf",l:"P.Factor"},{key:"entradas",l:"Entradas"}] as const).map(({key,l})=>(<button key={key} onClick={()=>setSortBy(key)} className="px-3 py-1 rounded-lg text-[11px] font-semibold transition-all" style={{background:sortBy===key?"var(--primary-glow)":"transparent",color:sortBy===key?"var(--primary)":"var(--text-muted)",border:sortBy===key?"1px solid var(--primary-border)":"1px solid transparent"}}>{l}</button>))}
                  </div>
                  <div className="flex items-center gap-1 p-1 rounded-xl" style={{background:"var(--bg-card)",border:"1px solid var(--border)"}}>
                    {([{k:"tabela",i:<Table2 size={13}/>},{k:"cards",i:<LayoutGrid size={13}/>}] as const).map(({k,i})=>(<button key={k} onClick={()=>setViewMode(k as "cards"|"tabela")} className="p-1.5 rounded-lg transition-all" style={{background:viewMode===k?"var(--primary-glow)":"transparent",color:viewMode===k?"var(--primary)":"var(--text-muted)"}}>{i}</button>))}
                  </div>
                </div>
              </div>

              {viewMode==="tabela"?(
                <RankingTable results={sortedResults} onSelect={id=>setExpanded(expanded===id?null:id)}/>
              ):(
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {sortedResults.map((r,rank)=>{
                    const m=r.metricas,dss=calcDSS(m),{color:dc}=dssLabel(dss),isX=expanded===r.perfil_id,rc=m.retorno_total>=0?"#22C55E":"#EF4444";
                    return(
                      <button key={r.perfil_id} onClick={()=>setExpanded(isX?null:r.perfil_id)} className="rounded-xl p-0 overflow-hidden text-left transition-all" style={{background:"var(--bg-card)",border:isX?"2px solid var(--primary)":rank<3?"1px solid rgba(255,255,255,0.12)":"1px solid var(--border)"}}>
                        <div style={{height:60,background:"var(--bg-surface)"}}><EquityChart equity={r.equity} height={60}/></div>
                        <div className="p-3 flex flex-col gap-2">
                          <div className="flex items-center justify-between gap-2"><span className="text-[11px] font-semibold truncate" style={{color:"var(--text-primary)"}}>{rank===0?"🥇 ":rank===1?"🥈 ":rank===2?"🥉 ":""}{r.perfil_nome}</span><DSSGauge dss={dss}/></div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <div className="rounded-lg p-2 text-center" style={{background:`${rc}10`,border:`1px solid ${rc}25`}}><div className="text-[8px]" style={{color:"var(--text-muted)"}}>Retorno</div><div className="text-sm font-black tabular-nums" style={{color:rc}}>{pct(m.retorno_total)}</div></div>
                            <div className="rounded-lg p-2 text-center" style={{background:"var(--bg-surface)",border:"1px solid var(--border)"}}><div className="text-[8px]" style={{color:"var(--text-muted)"}}>Win Rate</div><div className="text-sm font-black" style={{color:m.win_rate>=55?"#22C55E":m.win_rate>=45?"#F59E0B":"#EF4444"}}>{m.win_rate}%</div></div>
                          </div>
                          <div className="flex justify-between text-[9px]" style={{color:"var(--text-muted)"}}><span>DD -{m.max_drawdown.toFixed(1)}%</span><span>PF {m.profit_factor.toFixed(1)}</span><span>{m.total_trades} ops</span></div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {expandedResult&&(<div className="rounded-2xl p-5" style={{background:"var(--bg-card)",border:"2px solid var(--primary-border)"}}><ResultPanel result={expandedResult} onClose={()=>setExpanded(null)}/></div>)}

              {/* IA Generator manual */}
              <div className="rounded-2xl p-5 flex flex-col gap-4" style={{background:"linear-gradient(135deg,rgba(139,92,246,0.06),rgba(59,130,246,0.04))",border:"1px solid rgba(139,92,246,0.3)"}}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div><div className="flex items-center gap-2 mb-1"><Brain size={15} style={{color:"#8B5CF6"}}/><span className="font-bold text-sm" style={{color:"var(--text-primary)"}}>Gerador de Perfil IA (manual)</span></div><p className="text-xs" style={{color:"var(--text-secondary)"}}>IA analisa os resultados e gera um perfil candidato para aprovação.</p></div>
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={analisarIA} disabled={analyzing} className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all" style={{background:"var(--primary-glow)",color:"var(--primary)",border:"1px solid var(--primary-border)",cursor:analyzing?"not-allowed":"pointer"}}>{analyzing?<><Loader2 size={12} className="animate-spin"/>Analisando...</>:<><Sparkles size={12}/>Analisar</>}</button>
                    <button onClick={gerarPerfil} disabled={gerandoPerfil} className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all" style={{background:"linear-gradient(135deg,rgba(139,92,246,0.25),rgba(59,130,246,0.15))",color:"#8B5CF6",border:"1px solid rgba(139,92,246,0.4)",cursor:gerandoPerfil?"not-allowed":"pointer"}}>{gerandoPerfil?<><Loader2 size={12} className="animate-spin"/>Gerando...</>:<><Brain size={12}/>Gerar Perfil</>}</button>
                  </div>
                </div>
                {aiAnalysis&&(
                  <div className="flex flex-col gap-3">
                    {typeof (aiAnalysis?.analise_ia as {resumo_executivo?:string})?.resumo_executivo==="string"&&<p className="text-sm leading-relaxed" style={{color:"var(--text-secondary)"}}>{(aiAnalysis.analise_ia as {resumo_executivo:string}).resumo_executivo}</p>}
                  </div>
                )}
                {candidates.length>0&&(<div className="flex flex-col gap-3"><p className="text-xs font-bold uppercase" style={{color:"var(--text-muted)"}}>Candidatos ({candidates.length})</p>{candidates.map(c=><CandidateCard key={c.id} c={c} onApprove={approveC} onReject={rejectC} onRevise={reviseC}/>)}</div>)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ TAB IA AUTOMÁTICO ═══════════════════════════════════════════════ */}
      {tab==="ia"&&(
        <div className="flex flex-col gap-5">
          {iaErro&&<div className="px-4 py-3 rounded-xl flex items-center gap-2 text-sm" style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.25)",color:"#EF4444"}}><AlertTriangle size={13}/>{iaErro}<button onClick={()=>setIaErro("")} className="ml-auto"><X size={12}/></button></div>}

          {/* Explicação */}
          <div className="rounded-2xl p-5 flex flex-col gap-3" style={{background:"linear-gradient(135deg,rgba(139,92,246,0.06),rgba(59,130,246,0.03))",border:"1px solid rgba(139,92,246,0.3)"}}>
            <div className="flex items-center gap-2"><Bot size={17} style={{color:"#8b5cf6"}}/><span className="font-black text-base" style={{color:"var(--text-primary)"}}>IA Automático — Otimização Iterativa</span></div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[{n:"1",t:"Fase Baseline",d:"Testa os 6 perfis padrão, encontra o mais lucrativo"},
                {n:"2",t:"Otimização Iterativa",d:"IA gera variações, roda backtest, mantém o melhor a cada geração"},
                {n:"3",t:"Deploy no Futures",d:"Perfil aprovado aparece na aba Futures IA com botão de deploy"}].map(({n,t,d})=>(
                <div key={n} className="rounded-xl p-4 flex gap-3" style={{background:"var(--bg-card)",border:"1px solid var(--border)"}}>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0" style={{background:"rgba(139,92,246,0.2)",color:"#8b5cf6"}}>{n}</div>
                  <div><p className="text-xs font-bold" style={{color:"var(--text-primary)"}}>{t}</p><p className="text-[10px] mt-1 leading-relaxed" style={{color:"var(--text-secondary)"}}>{d}</p></div>
                </div>
              ))}
            </div>
          </div>

          {/* Config */}
          <div className="rounded-2xl p-5 flex flex-col gap-5" style={{background:"var(--bg-card)",border:"1px solid var(--border)"}}>
            <p className="text-sm font-bold" style={{color:"var(--text-primary)"}}>Configuração da Otimização</p>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{color:"var(--text-muted)"}}>Ativo</p>
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                {SIMBOLOS.map(s=>{const sym=s.replace("USDT",""),active=iaSimbolo===s;return(<button key={s} onClick={()=>setIaSimbolo(s)} className="py-2 rounded-xl text-xs font-bold transition-all" style={{background:active?"var(--primary-glow)":"var(--bg-surface)",color:active?"var(--primary)":"var(--text-secondary)",border:active?"1px solid var(--primary-border)":"1px solid var(--border)"}}>{sym}</button>);})}
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{color:"var(--text-muted)"}}>Período de Teste</p>
                <div className="flex gap-2 flex-wrap mb-3">{PERIODOS.map(p=>(<button key={p.dias} onClick={()=>{setIaDateFim(todayStr());setIaDateInicio(daysAgoStr(p.dias));}} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all" style={{background:iaDias===p.dias?"var(--primary-glow)":"var(--bg-surface)",color:iaDias===p.dias?"var(--primary)":"var(--text-secondary)",border:iaDias===p.dias?"1px solid var(--primary-border)":"1px solid var(--border)"}}>{p.label}</button>))}</div>
                <div className="grid grid-cols-2 gap-3">{[{l:"Início",v:iaDateInicio,s:setIaDateInicio,max:iaDateFim},{l:"Fim",v:iaDateFim,s:setIaDateFim,max:todayStr()}].map(({l,v,s,max})=>(<div key={l}><label className="block text-[11px] font-medium mb-1" style={{color:"var(--text-muted)"}}>{l}</label><input type="date" value={v} max={max} onChange={e=>s(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm" style={{background:"var(--bg-surface)",border:"1px solid var(--border)",color:"var(--text-primary)",colorScheme:"dark"}}/></div>))}</div>
                {iaDias>0&&<p className="text-xs mt-1.5" style={{color:"var(--text-muted)"}}>{iaDias} dias de histórico</p>}
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{color:"var(--text-muted)"}}>Critérios Mínimos para Parar</p>
                <div className="flex flex-col gap-3">
                  {[
                    {l:`Win Rate mínimo: ${iaTargetWR}%`,v:iaTargetWR,s:setIaTargetWR,min:30,max:75,step:1},
                    {l:`Profit Factor mínimo: ${iaTargetPF}`,v:iaTargetPF,s:setIaTargetPF,min:0.8,max:3.0,step:0.1},
                    {l:`Operações mínimas: ${iaTargetOps}`,v:iaTargetOps,s:setIaTargetOps,min:10,max:100,step:5},
                    {l:`Retorno mínimo: ${iaTargetReturn}%`,v:iaTargetReturn,s:setIaTargetReturn,min:-10,max:50,step:1},
                    {l:`Gerações máximas: ${iaMaxGeracoes}`,v:iaMaxGeracoes,s:setIaMaxGeracoes,min:3,max:15,step:1},
                  ].map(({l,v,s,min,max,step})=>(<div key={l}><p className="text-xs mb-1" style={{color:"var(--text-secondary)"}}>{l}</p><input type="range" min={min} max={max} step={step} value={v} onChange={e=>s(+e.target.value)} className="w-full accent-purple-500"/></div>))}
                </div>
              </div>
            </div>
            <button onClick={startLoop} disabled={iaPolling}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-xl text-base font-black transition-all"
              style={{background:iaPolling?"rgba(139,92,246,0.2)":"linear-gradient(135deg,#8b5cf6,#3b82f6)",color:"#fff",cursor:iaPolling?"not-allowed":"pointer",boxShadow:iaPolling?"none":"0 0 28px rgba(139,92,246,0.45)",opacity:iaPolling?0.7:1}}>
              {iaPolling?<><Loader2 size={18} className="animate-spin"/>IA rodando — aguarde...</>:<><Bot size={18}/>Iniciar Otimização IA</>}
            </button>
          </div>

          {/* Progresso */}
          {(iaPolling||iaTask)&&(
            <div className="rounded-2xl p-5 flex flex-col gap-4" style={{background:"var(--bg-card)",border:"1px solid var(--border)"}}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {iaPolling?<Loader2 size={14} className="animate-spin" style={{color:"#8b5cf6"}}/>:iaTask?.status==="done"?<CheckCircle2 size={14} style={{color:"#22c55e"}}/>:<XCircle size={14} style={{color:"#ef4444"}}/>}
                  <span className="text-sm font-semibold" style={{color:"var(--text-primary)"}}>{iaPolling?"Otimização em andamento...":iaTask?.status==="done"?"Otimização concluída!":"Erro na otimização"}</span>
                </div>
                {iaTask&&<span className="text-xs px-2 py-0.5 rounded-full" style={{background:"rgba(139,92,246,0.1)",color:"#8b5cf6",border:"1px solid rgba(139,92,246,0.25)"}}>{iaTask.geracoes.length} gerações</span>}
              </div>
              {iaPolling&&iaTask&&(
                <div>
                  <div className="flex justify-between text-xs mb-1" style={{color:"var(--text-muted)"}}><span>{iaTask.progresso?.fase}</span><span>{iaTask.progresso?.geracao_atual}/{iaTask.progresso?.total_geracoes}</span></div>
                  <div className="w-full h-2 rounded-full overflow-hidden" style={{background:"var(--border)"}}><div className="h-full rounded-full transition-all animate-pulse" style={{width:`${((iaTask.progresso?.geracao_atual??0)/(iaTask.progresso?.total_geracoes||1))*100}%`,background:"linear-gradient(90deg,#8b5cf6,#3b82f6)"}}/></div>
                </div>
              )}
              {iaTask?.status==="error"&&<div className="px-4 py-3 rounded-xl text-sm" style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.25)",color:"#EF4444"}}>{iaTask.erro}</div>}
              {iaTask&&iaTask.geracoes.length>0&&(
                <div className="flex flex-col gap-2">
                  <p className="text-[10px] font-bold uppercase" style={{color:"var(--text-muted)"}}>HISTÓRICO DE GERAÇÕES</p>
                  {iaTask.geracoes.map((g,i)=><OptGenCard key={i} gen={g}/>)}
                </div>
              )}
            </div>
          )}

          {/* Campeão */}
          {iaTask?.campeao&&(
            <ChampionPanel task={iaTask} simbolo={iaSimbolo} periodo={`${iaDias}d`} onDeploy={p=>setIaDeployed(prev=>[p,...prev])}/>
          )}

          {/* Perfis deployados */}
          {iaDeployed.length>0&&(
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <Zap size={15} style={{color:"#8b5cf6"}}/>
                <span className="text-sm font-bold" style={{color:"var(--text-primary)"}}>Perfis IA no Futures ({iaDeployed.length})</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full" style={{background:"rgba(139,92,246,0.1)",color:"#8b5cf6",border:"1px solid rgba(139,92,246,0.25)"}}>Disponíveis na aba Futures IA</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {iaDeployed.map(p=><IAFuturesCard key={p.id} p={p} onRemove={removeIA}/>)}
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
