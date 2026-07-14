"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { IAEngineHubNav } from "@/components/IAEngineHubNav";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

// ── Símbolos disponíveis ───────────────────────────────────────────────────────

const SIMBOLOS = [
  "BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT",
  "DOGEUSDT","ADAUSDT","AVAXUSDT","LINKUSDT","LTCUSDT",
  "DOTUSDT","ARBUSDT","OPUSDT","SUIUSDT","NEARUSDT",
];

const PERIODOS = [
  { label:"30 dias",  dias:30   },
  { label:"90 dias",  dias:90   },
  { label:"6 meses",  dias:180  },
  { label:"1 ano",    dias:365  },
  { label:"2 anos",   dias:730  },
];

// Presets de estratégia
const PRESETS = {
  volume: {
    label: "Volume",
    desc: "Foco em muitas entradas lucrativas",
    icon: "📊",
    color: "#10B981",
    target_wr: 50,
    target_pf: 1.2,
    target_ops: 60,
    target_return: 0,
    max_geracoes: 15,
  },
  lucratividade: {
    label: "Lucratividade",
    desc: "Equilíbrio entre retorno e operações",
    icon: "💰",
    color: "#3B82F6",
    target_wr: 58,
    target_pf: 1.8,
    target_ops: 25,
    target_return: 20,
    max_geracoes: 12,
  },
  conservador: {
    label: "Conservador",
    desc: "Alta precisão, menos operações",
    icon: "🛡️",
    color: "#F59E0B",
    target_wr: 65,
    target_pf: 2.5,
    target_ops: 10,
    target_return: 30,
    max_geracoes: 8,
  },
};

type PresetKey = keyof typeof PRESETS;
type Mode = "ia" | "scan" | "compare";

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface Metricas {
  total_trades:number; wins:number; losses:number;
  win_rate:number; profit_factor:number; max_drawdown:number;
  retorno_total:number; sharpe:number; sortino:number;
  capital_inicial:number; capital_final:number;
  gross_profit:number; gross_loss:number;
  avg_ganho:number; avg_perda:number;
  expectancia:number; payoff:number; cagr:number;
}

interface TradeResult {
  simbolo:string; entrada_ts:number; saida_ts:number;
  entrada_preco:number; saida_preco:number;
  stake:number; pnl:number; pnl_pct:number;
  motivo:string; resultado:"ganho"|"perda";
  capital_after:number;
}

interface EquityPoint { ts:number; capital:number; }

interface OptGen {
  numero:number; tipo:"baseline"|"otimizacao"|"erro";
  descricao?:string; hipotese?:string; confianca?:number;
  alteracoes?:{campo:string;de:number;para:number;motivo?:string}[];
  melhorou?:boolean; converged?:boolean;
  dss_anterior?:number; dss_novo?:number;
  perfil_nome?:string;
  metricas?:{win_rate:number|null;profit_factor:number|null;retorno_total:number|null;max_drawdown:number|null;total_trades:number|null;sharpe:number|null};
  campeao_nome?:string; campeao_dss?:number;
  resultados_baseline?:{perfil_nome:string;dss:number;win_rate:number;profit_factor:number;retorno_total:number;max_drawdown:number;total_trades:number}[];
  erro?:string;
}

interface Campeao {
  perfil_id:string; perfil_nome:string; perfil_config:Record<string,unknown>;
  dss:number; metricas:Metricas; resultado_id:string;
  equity?:EquityPoint[]; trades?:TradeResult[]; trades_total?:number;
}

interface OptTask {
  status:"running"|"done"|"error";
  geracoes:OptGen[];
  progresso:{fase:string;geracao_atual:number;total_geracoes:number};
  campeao:Campeao|null;
  converged:boolean; erro?:string;
}

interface ScanResult {
  simbolo:string; dss:number; win_rate:number; profit_factor:number;
  retorno_total:number; max_drawdown:number; total_trades:number;
  sharpe:number; cagr:number; equity?:EquityPoint[]; erro?:string;
}

interface ProfileRankResult {
  id:string; nome:string; dss:number; win_rate:number; profit_factor:number;
  retorno_total:number; max_drawdown:number; total_trades:number;
  sharpe:number; cagr:number; aguardar_ok:boolean; apenas_aguardar:boolean;
  score_compra:number; sl_pct:number; tp_pct:number;
  equity?:EquityPoint[]; erro?:string;
}

// ── Utilitários ────────────────────────────────────────────────────────────────

function todayStr() { return new Date().toISOString().slice(0,10); }
function daysAgoStr(n:number) {
  const d=new Date(); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10);
}
function pct(v:number,d=1){return `${v>=0?"+":""}${v.toFixed(d)}%`;}
function mc(v:number,lo:number,hi:number){return v>=hi?"#22c55e":v>=lo?"#f59e0b":"#ef4444";}
function fmtTs(ms:number):string {
  return new Date(ms).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"});
}
function fmtDate(ms:number):string {
  return new Date(ms).toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"2-digit"});
}

function calcDSS(m:Metricas):number {
  if (!m || m.total_trades<3) return 0;
  const wr=m.win_rate*0.40, pf=Math.min(1,m.profit_factor/3)*25;
  const ret=Math.min(20,Math.max(-10,m.retorno_total*0.15));
  const dd=-Math.min(15,m.max_drawdown*0.5), sh=Math.min(5,Math.max(-5,m.sharpe*2.5));
  return Math.round(Math.max(0,Math.min(100,wr+pf+ret+dd+sh)));
}

function dssLabel(d:number){
  if (d>=80) return {label:"Excelente",color:"#22c55e",bg:"rgba(34,197,94,0.12)"};
  if (d>=65) return {label:"Bom",       color:"#3b82f6",bg:"rgba(59,130,246,0.12)"};
  if (d>=50) return {label:"Regular",   color:"#f59e0b",bg:"rgba(245,158,11,0.12)"};
  if (d>=35) return {label:"Fraco",     color:"#f97316",bg:"rgba(249,115,22,0.12)"};
  return            {label:"Crítico",   color:"#ef4444",bg:"rgba(239,68,68,0.10)"};
}

// ── CSS Animations ────────────────────────────────────────────────────────────

const CSS = `
@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
@keyframes slideDown { from { opacity:0;transform:translateY(-8px) } to { opacity:1;transform:translateY(0) } }
.bt-spin { animation: spin 1s linear infinite; }
.bt-slide { animation: slideDown 0.2s ease forwards; }
`;

// ── DSSGauge ──────────────────────────────────────────────────────────────────

function DSSGauge({dss,size=72}:{dss:number;size?:number}) {
  const {label,color}=dssLabel(dss);
  const r=size/2-6, circ=2*Math.PI*r, arc=circ*(dss/100);
  return (
    <div style={{position:"relative",width:size,height:size,flexShrink:0}}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border)" strokeWidth={5}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeDasharray={`${arc} ${circ}`} strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{transition:"stroke-dasharray 0.8s ease",filter:`drop-shadow(0 0 4px ${color}80)`}}/>
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
        <div style={{fontSize:size>60?18:13,fontWeight:900,color,lineHeight:1}}>{dss}</div>
        <div style={{fontSize:size>60?8:7,color:"var(--text-muted)",fontWeight:700}}>{label.toUpperCase()}</div>
      </div>
    </div>
  );
}

// ── Equity Chart ──────────────────────────────────────────────────────────────

function EquityChart({equity,height=120}:{equity:EquityPoint[];height?:number}) {
  if (!equity||equity.length<2) return (
    <div style={{height,display:"flex",alignItems:"center",justifyContent:"center",color:"var(--text-muted)",fontSize:11}}>
      Sem dados de equity
    </div>
  );
  // Downsampling para performance visual
  const sampled = equity.length > 400
    ? equity.filter((_,i)=>i % Math.ceil(equity.length/400)===0)
    : equity;

  const W=600,H=height,pad=8;
  const vals=sampled.map(p=>p.capital), mn=Math.min(...vals), mx=Math.max(...vals), span=Math.max(mx-mn,1);
  const w=W-pad*2, h=H-pad*2;
  const pts=sampled.map((p,i)=>`${pad+(i/(sampled.length-1))*w},${pad+h-((p.capital-mn)/span)*h}`);
  const up=sampled[sampled.length-1].capital>=sampled[0].capital;
  const clr=up?"#22c55e":"#ef4444";
  const baseline_y = pad+h-((sampled[0].capital-mn)/span)*h;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{width:"100%",height,display:"block"}}>
      <defs>
        <linearGradient id="eg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={clr} stopOpacity="0.3"/>
          <stop offset="100%" stopColor={clr} stopOpacity="0.02"/>
        </linearGradient>
      </defs>
      <polygon points={`${pad},${pad+h} ${pts.join(" ")} ${pad+w},${pad+h}`} fill="url(#eg)"/>
      <polyline points={pts.join(" ")} fill="none" stroke={clr} strokeWidth="2"/>
      <line x1={pad} y1={baseline_y} x2={pad+w} y2={baseline_y}
        stroke="var(--border)" strokeWidth="1" strokeDasharray="4,3"/>
      {/* Ponto final */}
      <circle cx={pad+(sampled.length-1)/(sampled.length-1)*w} cy={parseFloat(pts[pts.length-1].split(",")[1])}
        r={3} fill={clr} style={{filter:`drop-shadow(0 0 4px ${clr})`}}/>
    </svg>
  );
}

// ── MetricChip ────────────────────────────────────────────────────────────────

function MetricChip({label,value,color,sub}:{label:string;value:string;color:string;sub?:string}) {
  return (
    <div style={{background:"var(--bg-surface)",border:"1px solid var(--border)",borderRadius:10,padding:"10px 12px",textAlign:"center"}}>
      <div style={{fontSize:9,color:"var(--text-muted)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:4}}>{label}</div>
      <div style={{fontSize:15,fontWeight:900,color,fontVariantNumeric:"tabular-nums",lineHeight:1}}>{value}</div>
      {sub && <div style={{fontSize:9,color:"var(--text-muted)",marginTop:3}}>{sub}</div>}
    </div>
  );
}

// ── Trade Table ────────────────────────────────────────────────────────────────

function TradeTable({trades,total}:{trades:TradeResult[];total:number}) {
  const [page,setPage] = useState(0);
  const PER_PAGE = 50;
  const pages = Math.ceil(trades.length/PER_PAGE);
  const slice = trades.slice(page*PER_PAGE, (page+1)*PER_PAGE);
  const wins = trades.filter(t=>t.resultado==="ganho").length;
  const totalPnl = trades.reduce((acc,t)=>acc+t.pnl,0);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {/* Summary bar */}
      <div style={{display:"flex",gap:12,flexWrap:"wrap",fontSize:11,color:"var(--text-muted)",padding:"8px 12px",borderRadius:10,background:"var(--bg-surface)",border:"1px solid var(--border)"}}>
        <span>📋 <b style={{color:"var(--text-primary)"}}>{total}</b> trades{total>500?" (exibindo 500)":""}</span>
        <span>✅ <b style={{color:"#22c55e"}}>{wins}</b> ganhos</span>
        <span>❌ <b style={{color:"#ef4444"}}>{trades.length-wins}</b> perdas</span>
        <span>💰 P&L total: <b style={{color:totalPnl>=0?"#22c55e":"#ef4444"}}>R$ {totalPnl.toLocaleString("pt-BR",{minimumFractionDigits:2})}</b></span>
      </div>

      {/* Table */}
      <div style={{borderRadius:10,overflow:"hidden",border:"1px solid var(--border)"}}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",fontSize:11,borderCollapse:"collapse",minWidth:700}}>
            <thead>
              <tr style={{background:"var(--bg-surface)",borderBottom:"1px solid var(--border)"}}>
                {["#","Entrada","Saída","Duração","P. Entrada","P. Saída","P&L%","P&L R$","Motivo","Capital"].map(h=>(
                  <th key={h} style={{padding:"8px 10px",textAlign:h==="#"||h==="Motivo"?"left":"right",color:"var(--text-muted)",fontWeight:700,fontSize:9,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slice.map((t,i)=>{
                const ganho=t.resultado==="ganho";
                const dur = Math.round((t.saida_ts-t.entrada_ts)/(1000*60*60));
                const num = page*PER_PAGE+i+1;
                return (
                  <tr key={i} style={{borderBottom:"1px solid var(--border-subtle)",background:ganho?"rgba(34,197,94,0.03)":"rgba(239,68,68,0.03)"}}>
                    <td style={{padding:"7px 10px",color:"var(--text-muted)",fontWeight:600}}>{num}</td>
                    <td style={{padding:"7px 10px",color:"var(--text-secondary)",whiteSpace:"nowrap"}}>{fmtTs(t.entrada_ts)}</td>
                    <td style={{padding:"7px 10px",color:"var(--text-secondary)",whiteSpace:"nowrap"}}>{fmtTs(t.saida_ts)}</td>
                    <td style={{padding:"7px 10px",textAlign:"right",color:"var(--text-muted)"}}>{dur < 24 ? `${dur}h` : `${Math.round(dur/24)}d`}</td>
                    <td style={{padding:"7px 10px",textAlign:"right",color:"var(--text-secondary)",fontVariantNumeric:"tabular-nums"}}>${t.entrada_preco.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:4})}</td>
                    <td style={{padding:"7px 10px",textAlign:"right",color:"var(--text-secondary)",fontVariantNumeric:"tabular-nums"}}>${t.saida_preco.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:4})}</td>
                    <td style={{padding:"7px 10px",textAlign:"right",fontWeight:700,color:ganho?"#22c55e":"#ef4444",fontVariantNumeric:"tabular-nums"}}>{pct(t.pnl_pct,2)}</td>
                    <td style={{padding:"7px 10px",textAlign:"right",fontWeight:700,color:ganho?"#22c55e":"#ef4444",fontVariantNumeric:"tabular-nums"}}>R$ {t.pnl.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                    <td style={{padding:"7px 10px",color:"var(--text-muted)",whiteSpace:"nowrap"}}>{t.motivo}</td>
                    <td style={{padding:"7px 10px",textAlign:"right",color:"var(--text-secondary)",fontVariantNumeric:"tabular-nums"}}>R$ {t.capital_after.toLocaleString("pt-BR",{maximumFractionDigits:0})}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div style={{display:"flex",gap:6,justifyContent:"center",flexWrap:"wrap"}}>
          {Array.from({length:pages},(_,p)=>(
            <button key={p} onClick={()=>setPage(p)}
              style={{width:28,height:28,borderRadius:6,fontSize:11,fontWeight:700,cursor:"pointer",border:"1px solid var(--border)",
                background:p===page?"var(--primary)":"var(--bg-card)",
                color:p===page?"#fff":"var(--text-secondary)"}}>
              {p+1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Monthly P&L breakdown ─────────────────────────────────────────────────────

function MonthlyPnL({trades}:{trades:TradeResult[]}) {
  if (!trades.length) return null;

  const byMonth: Record<string, {pnl:number;wins:number;total:number}> = {};
  for (const t of trades) {
    const d = new Date(t.saida_ts);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    if (!byMonth[key]) byMonth[key] = {pnl:0,wins:0,total:0};
    byMonth[key].pnl += t.pnl;
    byMonth[key].total++;
    if (t.resultado==="ganho") byMonth[key].wins++;
  }
  const months = Object.entries(byMonth).sort((a,b)=>a[0]<b[0]?-1:1);
  const maxAbs = Math.max(...months.map(([,v])=>Math.abs(v.pnl)),1);

  return (
    <div>
      <div style={{fontSize:10,color:"var(--text-muted)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:10}}>P&L por Mês</div>
      <div style={{display:"flex",flexDirection:"column",gap:4}}>
        {months.map(([m,v])=>{
          const pos = v.pnl >= 0;
          const barW = Math.abs(v.pnl)/maxAbs * 100;
          const label = m.replace("-","/")+` ${pos?"":""}${v.pnl>=0?"+":""}${v.pnl.toLocaleString("pt-BR",{maximumFractionDigits:0})}`;
          const wr = v.total ? Math.round(v.wins/v.total*100) : 0;
          return (
            <div key={m} style={{display:"flex",alignItems:"center",gap:8,fontSize:10}}>
              <div style={{width:46,flexShrink:0,color:"var(--text-muted)",textAlign:"right"}}>{m.slice(2)}</div>
              <div style={{flex:1,height:14,borderRadius:4,background:"var(--bg-surface)",overflow:"hidden",position:"relative"}}>
                <div style={{position:"absolute",top:0,bottom:0,left:0,width:`${barW}%`,background:pos?"rgba(34,197,94,0.4)":"rgba(239,68,68,0.4)",borderRadius:4,transition:"width 0.3s"}}/>
              </div>
              <div style={{width:90,flexShrink:0,fontWeight:700,color:pos?"#22c55e":"#ef4444",textAlign:"right",fontVariantNumeric:"tabular-nums"}}>{label}</div>
              <div style={{width:40,flexShrink:0,color:"var(--text-muted)",textAlign:"right"}}>{wr}%WR</div>
              <div style={{width:26,flexShrink:0,color:"var(--text-muted)",textAlign:"right"}}>{v.total}op</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Progress Bar ──────────────────────────────────────────────────────────────

function ProgressBar({task}:{task:OptTask}) {
  const {fase,geracao_atual,total_geracoes}=task.progresso;
  const pctVal=total_geracoes>0?Math.round((geracao_atual/total_geracoes)*100):0;
  const isRunning=task.status==="running";

  return (
    <div style={{borderRadius:16,padding:"16px 20px",background:"linear-gradient(135deg,rgba(124,58,237,0.08),rgba(59,130,246,0.05))",border:"1px solid rgba(124,58,237,0.25)"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
        {isRunning ? (
          <svg className="bt-spin" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth={2.5}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
        ) : <span style={{fontSize:14}}>✅</span>}
        <div style={{flex:1}}>
          <div style={{fontSize:12,fontWeight:700,color:"var(--text-primary)"}}>{fase}</div>
          <div style={{fontSize:10,color:"var(--text-muted)",marginTop:2}}>
            {isRunning ? `Geração ${geracao_atual} de ${total_geracoes} — aguarde…` : `Concluído — ${task.geracoes.length} gerações`}
          </div>
        </div>
        <div style={{fontSize:14,fontWeight:900,color:"#8b5cf6"}}>{pctVal}%</div>
      </div>
      <div style={{height:6,borderRadius:999,background:"var(--border)",overflow:"hidden"}}>
        <div style={{height:"100%",borderRadius:999,background:"linear-gradient(90deg,#7c3aed,#3b82f6)",width:`${pctVal}%`,transition:"width 0.5s ease"}}/>
      </div>
    </div>
  );
}

// ── Baseline Table ─────────────────────────────────────────────────────────────

function BaselineTable({rows}:{rows:{perfil_nome:string;dss:number;win_rate:number;profit_factor:number;retorno_total:number;max_drawdown:number;total_trades:number}[]}) {
  const sorted=[...rows].sort((a,b)=>b.dss-a.dss);
  return (
    <div style={{borderRadius:10,overflow:"auto",border:"1px solid var(--border)"}}>
      <table style={{width:"100%",fontSize:11,borderCollapse:"collapse",minWidth:580}}>
        <thead>
          <tr style={{background:"var(--bg-surface)",borderBottom:"1px solid var(--border)"}}>
            {["#","Perfil","DSS","Win%","P.Factor","Retorno","DD%","Ops"].map(h=>(
              <th key={h} style={{padding:"8px 10px",textAlign:h==="#"||h==="Perfil"?"left":"right",color:"var(--text-muted)",fontWeight:700,fontSize:9,textTransform:"uppercase"}}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r,i)=>{
            const {color:dc,label:dl}=dssLabel(r.dss);
            return (
              <tr key={r.perfil_nome} style={{borderBottom:"1px solid var(--border-subtle)",background:i===0?"rgba(34,197,94,0.04)":"transparent"}}>
                <td style={{padding:"7px 10px",color:i===0?"#f59e0b":"var(--text-muted)",fontWeight:700}}>{i===0?"★":i+1}</td>
                <td style={{padding:"7px 10px",fontWeight:600,color:"var(--text-primary)"}}>{r.perfil_nome}</td>
                <td style={{padding:"7px 10px",textAlign:"right"}}>
                  <span style={{padding:"2px 7px",borderRadius:6,fontSize:10,fontWeight:900,background:`${dc}18`,color:dc}}>{r.dss} {dl}</span>
                </td>
                <td style={{padding:"7px 10px",textAlign:"right",fontWeight:700,color:mc(r.win_rate,50,60),fontVariantNumeric:"tabular-nums"}}>{r.win_rate?.toFixed(0)}%</td>
                <td style={{padding:"7px 10px",textAlign:"right",color:mc(r.profit_factor,1.2,1.8),fontVariantNumeric:"tabular-nums"}}>{r.profit_factor?.toFixed(2)}</td>
                <td style={{padding:"7px 10px",textAlign:"right",fontWeight:700,color:r.retorno_total>=0?"#22c55e":"#ef4444",fontVariantNumeric:"tabular-nums"}}>{pct(r.retorno_total)}</td>
                <td style={{padding:"7px 10px",textAlign:"right",color:r.max_drawdown<10?"#22c55e":r.max_drawdown<20?"#f59e0b":"#ef4444",fontVariantNumeric:"tabular-nums"}}>{r.max_drawdown?.toFixed(1)}%</td>
                <td style={{padding:"7px 10px",textAlign:"right",color:"var(--text-secondary)"}}>{r.total_trades}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Generation Timeline ────────────────────────────────────────────────────────

function GenTimeline({geracoes}:{geracoes:OptGen[]}) {
  const [expanded,setExpanded]=useState<number|null>(null);
  if (!geracoes.length) return null;
  const opts = geracoes.filter(g=>g.tipo==="otimizacao");
  const baseline = geracoes.find(g=>g.tipo==="baseline");

  return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {/* Baseline expandível */}
      {baseline && (
        <div style={{borderRadius:10,border:"1px solid rgba(59,130,246,0.2)",background:"var(--bg-card)",overflow:"hidden"}}>
          <button onClick={()=>setExpanded(expanded===0?null:0)}
            style={{width:"100%",padding:"10px 14px",background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:8,textAlign:"left"}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:"#3b82f6",flexShrink:0,boxShadow:"0 0 6px #3b82f680"}}/>
            <span style={{fontSize:11,fontWeight:700,color:"var(--text-primary)",flex:1}}>
              Baseline — {baseline.descricao} <span style={{color:"var(--text-muted)",fontWeight:400}}>· clique para ver ranking</span>
            </span>
            <span style={{fontSize:10,color:"var(--text-muted)"}}>{expanded===0?"▲":"▼"}</span>
          </button>
          {expanded===0 && baseline.resultados_baseline && (
            <div style={{padding:"0 14px 12px",borderTop:"1px solid var(--border)"}}>
              <BaselineTable rows={baseline.resultados_baseline}/>
            </div>
          )}
        </div>
      )}

      {/* Gerações de otimização */}
      {opts.map((g)=>{
        const isExp=expanded===g.numero;
        const melhorou=g.melhorou, delta=(g.dss_novo??0)-(g.dss_anterior??0);
        const dotColor=melhorou?"#22c55e":"#f59e0b";
        return (
          <div key={g.numero} style={{borderRadius:10,border:`1px solid ${dotColor}25`,background:"var(--bg-card)",overflow:"hidden"}}>
            <button onClick={()=>setExpanded(isExp?null:g.numero)}
              style={{width:"100%",padding:"10px 14px",background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:8,textAlign:"left"}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:dotColor,flexShrink:0,boxShadow:`0 0 6px ${dotColor}80`}}/>
              <span style={{fontSize:11,fontWeight:600,color:"var(--text-primary)",flex:1}}>
                Gen {g.numero} — {g.perfil_nome}
              </span>
              {g.dss_novo!=null && <span style={{fontSize:10,fontWeight:700,color:dotColor}}>DSS {g.dss_novo}</span>}
              {melhorou && <span style={{fontSize:9,padding:"1px 6px",borderRadius:5,background:"rgba(34,197,94,0.12)",color:"#22c55e",fontWeight:700}}>▲ +{delta.toFixed(0)}</span>}
              {!melhorou && <span style={{fontSize:9,padding:"1px 6px",borderRadius:5,background:"rgba(245,158,11,0.1)",color:"#f59e0b",fontWeight:600}}>= sem melhora</span>}
              {g.converged && <span style={{fontSize:9,padding:"1px 6px",borderRadius:5,background:"rgba(34,197,94,0.12)",color:"#22c55e",fontWeight:700}}>✓</span>}
              <span style={{fontSize:10,color:"var(--text-muted)"}}>{isExp?"▲":"▼"}</span>
            </button>
            {isExp && (
              <div style={{padding:"0 14px 12px",borderTop:"1px solid var(--border)",display:"flex",flexDirection:"column",gap:10}} className="bt-slide">
                {g.hipotese && <p style={{fontSize:11,color:"var(--text-secondary)",lineHeight:1.5,margin:0,marginTop:8}}>{g.hipotese}</p>}
                {g.alteracoes && g.alteracoes.length>0 && (
                  <div>
                    <div style={{fontSize:9,color:"var(--text-muted)",fontWeight:700,textTransform:"uppercase",marginBottom:6}}>Parâmetros alterados</div>
                    <div style={{display:"flex",flexDirection:"column",gap:3}}>
                      {g.alteracoes.map((a,i)=>(
                        <div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:11,padding:"5px 10px",borderRadius:7,background:"var(--bg-surface)"}}>
                          <span style={{color:"var(--text-muted)",minWidth:80}}>{a.campo}</span>
                          <span style={{color:"#ef4444",fontVariantNumeric:"tabular-nums"}}>{a.de}</span>
                          <span style={{color:"var(--text-muted)"}}>→</span>
                          <span style={{color:"#22c55e",fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{a.para}</span>
                          {a.motivo && <span style={{color:"var(--text-muted)",fontSize:9}}>· {a.motivo}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {g.metricas && (
                  <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:6}}>
                    {[
                      {l:"Win%",v:g.metricas.win_rate!=null?`${g.metricas.win_rate?.toFixed(0)}%`:"—",c:mc(g.metricas.win_rate??0,50,60)},
                      {l:"PF",  v:g.metricas.profit_factor!=null?g.metricas.profit_factor?.toFixed(2):"—",c:mc(g.metricas.profit_factor??0,1.2,1.8)},
                      {l:"Ret", v:g.metricas.retorno_total!=null?pct(g.metricas.retorno_total):"—",c:(g.metricas.retorno_total??0)>=0?"#22c55e":"#ef4444"},
                      {l:"DD",  v:g.metricas.max_drawdown!=null?`${g.metricas.max_drawdown?.toFixed(1)}%`:"—",c:"var(--text-secondary)"},
                      {l:"Ops", v:g.metricas.total_trades!=null?String(g.metricas.total_trades):"—",c:"var(--text-secondary)"},
                      {l:"DSS", v:g.dss_novo!=null?String(g.dss_novo):"—",c:dssLabel(g.dss_novo??0).color},
                    ].map(({l,v,c})=>(
                      <div key={l} style={{background:"var(--bg-surface)",borderRadius:7,padding:"5px 7px",textAlign:"center"}}>
                        <div style={{fontSize:8,color:"var(--text-muted)",fontWeight:600}}>{l}</div>
                        <div style={{fontSize:12,fontWeight:900,color:c,marginTop:1,fontVariantNumeric:"tabular-nums"}}>{v}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Champion Card ─────────────────────────────────────────────────────────────

function ChampionCard({campeao,simbolo,periodo,onDeploy,deploying,deployedOk}:{
  campeao:Campeao; simbolo:string; periodo:string;
  onDeploy:()=>void; deploying:boolean; deployedOk:boolean;
}) {
  const [tab,setTab] = useState<"overview"|"trades"|"monthly">("overview");
  const m=campeao.metricas;
  const {label:dl,color:dc}=dssLabel(campeao.dss);
  const ret=m.retorno_total; const rc=ret>=0?"#22c55e":"#ef4444";
  const cfg=campeao.perfil_config as Record<string,unknown>;

  const tabStyle = (t:string) => ({
    padding:"6px 14px", borderRadius:8, fontSize:11, fontWeight:600, cursor:"pointer",
    border:"1px solid", transition:"all 0.15s",
    background: tab===t ? "var(--primary)" : "transparent",
    borderColor: tab===t ? "var(--primary)" : "var(--border)",
    color: tab===t ? "#fff" : "var(--text-secondary)",
  });

  return (
    <div style={{borderRadius:18,overflow:"hidden",border:`1px solid ${dc}30`,background:"var(--bg-card)"}}>
      {/* Header */}
      <div style={{padding:"18px 22px 14px",background:`linear-gradient(135deg,${dc}08,transparent)`,borderBottom:"1px solid var(--border)"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <div style={{fontSize:22}}>🏆</div>
          <div style={{flex:1}}>
            <div style={{fontSize:10,color:"var(--text-muted)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em"}}>Perfil Campeão</div>
            <div style={{fontSize:17,fontWeight:900,color:"var(--text-primary)",marginTop:1}}>{campeao.perfil_nome}</div>
            <div style={{fontSize:10,color:"var(--text-muted)",marginTop:2}}>
              {simbolo.replace("USDT","")} · {periodo} · DSS <b style={{color:dc}}>{campeao.dss} {dl}</b>
              {campeao.trades_total && campeao.trades_total>0 && (
                <span> · <b style={{color:"var(--text-secondary)"}}>{campeao.trades_total} operações</b></span>
              )}
            </div>
          </div>
          <DSSGauge dss={campeao.dss} size={68}/>
        </div>

        {/* Tabs */}
        <div style={{display:"flex",gap:6,marginTop:12}}>
          <button style={tabStyle("overview")} onClick={()=>setTab("overview")}>Visão Geral</button>
          {campeao.trades && campeao.trades.length>0 && (
            <button style={tabStyle("trades")} onClick={()=>setTab("trades")}>
              📋 Trades ({campeao.trades_total ?? campeao.trades.length})
            </button>
          )}
          {campeao.trades && campeao.trades.length>0 && (
            <button style={tabStyle("monthly")} onClick={()=>setTab("monthly")}>📅 Mensal</button>
          )}
        </div>
      </div>

      <div style={{padding:"14px 22px 18px",display:"flex",flexDirection:"column",gap:14}}>
        {/* TAB: Overview */}
        {tab==="overview" && (
          <>
            {/* Equity curve */}
            {campeao.equity && campeao.equity.length>1 && (
              <div>
                <div style={{fontSize:9,color:"var(--text-muted)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:6}}>Curva de Capital</div>
                <div style={{borderRadius:10,overflow:"hidden",background:"var(--bg-surface)",border:"1px solid var(--border)"}}>
                  <EquityChart equity={campeao.equity} height={140}/>
                </div>
              </div>
            )}

            {/* Main metrics */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
              <MetricChip label="Retorno Total" value={pct(ret)} color={rc} sub={`CAGR ${pct(m.cagr)}`}/>
              <MetricChip label="Win Rate"      value={`${m.win_rate?.toFixed(0)}%`} color={mc(m.win_rate,50,60)} sub={`${m.wins}W / ${m.losses}L`}/>
              <MetricChip label="Profit Factor" value={m.profit_factor===999?"∞":m.profit_factor?.toFixed(2)} color={mc(m.profit_factor,1.2,1.8)}/>
              <MetricChip label="Max Drawdown"  value={`-${m.max_drawdown?.toFixed(1)}%`} color={m.max_drawdown<10?"#22c55e":m.max_drawdown<20?"#f59e0b":"#ef4444"}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
              <MetricChip label="Operações"    value={String(m.total_trades)}          color="var(--text-primary)"/>
              <MetricChip label="Sharpe"        value={m.sharpe?.toFixed(2)}           color={mc(m.sharpe,0.5,1)}/>
              <MetricChip label="Expectância"   value={`R$ ${m.expectancia?.toFixed(0)}`} color="var(--text-secondary)"/>
              <MetricChip label="Payoff"        value={m.payoff?.toFixed(2)}           color="var(--text-secondary)"/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8}}>
              <MetricChip label="Capital Inicial" value={`R$ ${m.capital_inicial?.toLocaleString("pt-BR",{maximumFractionDigits:0})}`} color="var(--text-muted)"/>
              <MetricChip label="Capital Final"   value={`R$ ${m.capital_final?.toLocaleString("pt-BR",{maximumFractionDigits:0})}`}   color={rc}/>
            </div>

            {/* Profile parameters */}
            <div style={{background:"var(--bg-surface)",borderRadius:10,padding:"12px 14px"}}>
              <div style={{fontSize:9,color:"var(--text-muted)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:8}}>Parâmetros do Perfil Otimizado</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,fontSize:11}}>
                {[
                  ["Score entrada",`≥ ${cfg.score_compra}`],
                  ["Score saída",  `≤ ${cfg.score_venda}`],
                  ["Stop Loss",    `${cfg.sl_pct}%`],
                  ["Take Profit",  `${cfg.tp_pct}%`],
                  ["Bull mín",     `${cfg.bull_pct_min}%`],
                  ["Stake",        `R$ ${Number(cfg.stake_base).toLocaleString("pt-BR")}`],
                ].map(([k,v])=>(
                  <div key={k} style={{display:"flex",justifyContent:"space-between",gap:4}}>
                    <span style={{color:"var(--text-muted)"}}>{k}</span>
                    <span style={{fontWeight:700,color:"var(--text-primary)"}}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Deploy button */}
            {deployedOk ? (
              <div style={{padding:"12px",borderRadius:12,background:"rgba(34,197,94,0.08)",border:"1px solid rgba(34,197,94,0.2)",color:"#22c55e",fontSize:12,fontWeight:700,textAlign:"center"}}>
                ✅ Perfil ativo no IA Engine Futures!
              </div>
            ) : (
              <button onClick={onDeploy} disabled={deploying}
                style={{width:"100%",padding:"13px 0",borderRadius:12,border:"none",cursor:deploying?"not-allowed":"pointer",
                  background:deploying?"rgba(139,92,246,0.2)":"linear-gradient(135deg,#7c3aed,#3b82f6)",
                  color:"#fff",fontSize:13,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center",gap:10,
                  boxShadow:deploying?"none":"0 0 20px rgba(124,58,237,0.35)",opacity:deploying?0.7:1,transition:"all 0.2s"}}>
                {deploying ? (
                  <><svg className="bt-spin" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Enviando…</>
                ) : <>🚀 Colocar no IA Engine — Futures</>}
              </button>
            )}
          </>
        )}

        {/* TAB: Trades */}
        {tab==="trades" && campeao.trades && (
          <TradeTable trades={campeao.trades} total={campeao.trades_total ?? campeao.trades.length}/>
        )}

        {/* TAB: Monthly */}
        {tab==="monthly" && campeao.trades && (
          <MonthlyPnL trades={campeao.trades}/>
        )}
      </div>
    </div>
  );
}

// ── Multi-symbol Scan Results ─────────────────────────────────────────────────

function ScanResults({data}:{data:{resultados:ScanResult[];perfil_nome:string;periodo:{dias:number}}}) {
  const ok=data.resultados.filter(r=>!r.erro);
  const errs=data.resultados.filter(r=>r.erro);
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{fontSize:13,fontWeight:700,color:"var(--text-primary)"}}>
        🌐 Scan Multi-Símbolo — <span style={{color:"var(--text-muted)"}}>{data.perfil_nome} · {data.periodo.dias} dias</span>
      </div>
      <div style={{borderRadius:10,overflow:"auto",border:"1px solid var(--border)"}}>
        <table style={{width:"100%",fontSize:11,borderCollapse:"collapse",minWidth:620}}>
          <thead>
            <tr style={{background:"var(--bg-surface)",borderBottom:"1px solid var(--border)"}}>
              {["#","Símbolo","DSS","Win%","P.Factor","Retorno","DD%","Ops","Sharpe"].map(h=>(
                <th key={h} style={{padding:"8px 10px",textAlign:h==="#"||h==="Símbolo"?"left":"right",color:"var(--text-muted)",fontWeight:700,fontSize:9,textTransform:"uppercase"}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ok.map((r,i)=>{
              const {color:dc,label:dl}=dssLabel(r.dss);
              return (
                <tr key={r.simbolo} style={{borderBottom:"1px solid var(--border-subtle)",background:i===0?"rgba(251,191,36,0.04)":"transparent"}}>
                  <td style={{padding:"8px 10px",color:i===0?"#fbbf24":"var(--text-muted)",fontWeight:700}}>{i===0?"🥇":i+1}</td>
                  <td style={{padding:"8px 10px",fontWeight:700,color:"var(--text-primary)"}}>{r.simbolo.replace("USDT","")}</td>
                  <td style={{padding:"8px 10px",textAlign:"right"}}>
                    <span style={{padding:"2px 7px",borderRadius:6,fontSize:10,fontWeight:900,background:`${dc}18`,color:dc}}>{r.dss} {dl}</span>
                  </td>
                  <td style={{padding:"8px 10px",textAlign:"right",fontWeight:700,color:mc(r.win_rate,50,60),fontVariantNumeric:"tabular-nums"}}>{r.win_rate?.toFixed(0)}%</td>
                  <td style={{padding:"8px 10px",textAlign:"right",color:mc(r.profit_factor,1.2,1.8),fontVariantNumeric:"tabular-nums"}}>{r.profit_factor?.toFixed(2)}</td>
                  <td style={{padding:"8px 10px",textAlign:"right",fontWeight:700,color:r.retorno_total>=0?"#22c55e":"#ef4444",fontVariantNumeric:"tabular-nums"}}>{pct(r.retorno_total)}</td>
                  <td style={{padding:"8px 10px",textAlign:"right",color:r.max_drawdown<10?"#22c55e":r.max_drawdown<20?"#f59e0b":"#ef4444",fontVariantNumeric:"tabular-nums"}}>{r.max_drawdown?.toFixed(1)}%</td>
                  <td style={{padding:"8px 10px",textAlign:"right",color:"var(--text-secondary)"}}>{r.total_trades}</td>
                  <td style={{padding:"8px 10px",textAlign:"right",color:mc(r.sharpe,0.5,1),fontVariantNumeric:"tabular-nums"}}>{r.sharpe?.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {errs.length>0 && (
        <div style={{fontSize:11,color:"var(--text-muted)"}}>
          ⚠️ Falhas: {errs.map(e=>`${e.simbolo.replace("USDT","")}`).join(", ")}
        </div>
      )}
    </div>
  );
}

// ── Compare Profiles Results ──────────────────────────────────────────────────

function CompareResults({data}:{data:{ranking:ProfileRankResult[];simbolo:string;periodo:{dias:number}}}) {
  const ok=data.ranking.filter(r=>!r.erro);
  const campeao=ok[0];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{fontSize:13,fontWeight:700,color:"var(--text-primary)"}}>
        ⚖️ Ranking de Perfis — <span style={{color:"var(--text-muted)"}}>{data.simbolo.replace("USDT","")} · {data.periodo.dias} dias · {ok.length} perfis testados</span>
      </div>
      {campeao && (
        <div style={{padding:"12px 16px",borderRadius:12,background:"rgba(251,191,36,0.06)",border:"1px solid rgba(251,191,36,0.2)",display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
          <span style={{fontSize:18}}>🏆</span>
          <div>
            <div style={{fontSize:11,color:"#fbbf24",fontWeight:700}}>Melhor Perfil</div>
            <div style={{fontSize:14,fontWeight:900,color:"var(--text-primary)"}}>{campeao.nome}</div>
          </div>
          <div style={{marginLeft:"auto",display:"flex",gap:12,fontSize:11,color:"var(--text-muted)",flexWrap:"wrap"}}>
            <span>DSS <b style={{color:dssLabel(campeao.dss).color}}>{campeao.dss}</b></span>
            <span>WR <b style={{color:mc(campeao.win_rate,50,60)}}>{campeao.win_rate?.toFixed(0)}%</b></span>
            <span>Ret <b style={{color:campeao.retorno_total>=0?"#22c55e":"#ef4444"}}>{pct(campeao.retorno_total)}</b></span>
            <span><b style={{color:"var(--text-primary)"}}>{campeao.total_trades}</b> ops</span>
          </div>
        </div>
      )}
      <div style={{borderRadius:10,overflow:"auto",border:"1px solid var(--border)"}}>
        <table style={{width:"100%",fontSize:11,borderCollapse:"collapse",minWidth:700}}>
          <thead>
            <tr style={{background:"var(--bg-surface)",borderBottom:"1px solid var(--border)"}}>
              {["#","Perfil","DSS","Win%","PF","Retorno","DD%","Ops","Sharpe","Score Ent.","SL","TP"].map(h=>(
                <th key={h} style={{padding:"7px 9px",textAlign:h==="#"||h==="Perfil"?"left":"right",color:"var(--text-muted)",fontWeight:700,fontSize:9,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ok.map((r,i)=>{
              const {color:dc,label:dl}=dssLabel(r.dss);
              return (
                <tr key={r.id} style={{borderBottom:"1px solid var(--border-subtle)",background:i===0?"rgba(34,197,94,0.04)":"transparent"}}>
                  <td style={{padding:"7px 9px",color:i===0?"#f59e0b":"var(--text-muted)",fontWeight:700}}>{i===0?"★":i+1}</td>
                  <td style={{padding:"7px 9px",fontWeight:600,color:"var(--text-primary)",whiteSpace:"nowrap"}}>{r.nome}</td>
                  <td style={{padding:"7px 9px",textAlign:"right"}}>
                    <span style={{padding:"2px 7px",borderRadius:5,fontSize:9,fontWeight:900,background:`${dc}18`,color:dc}}>{r.dss} {dl}</span>
                  </td>
                  <td style={{padding:"7px 9px",textAlign:"right",fontWeight:700,color:mc(r.win_rate,50,60),fontVariantNumeric:"tabular-nums"}}>{r.win_rate?.toFixed(0)}%</td>
                  <td style={{padding:"7px 9px",textAlign:"right",color:mc(r.profit_factor,1.2,1.8),fontVariantNumeric:"tabular-nums"}}>{r.profit_factor?.toFixed(2)}</td>
                  <td style={{padding:"7px 9px",textAlign:"right",fontWeight:700,color:r.retorno_total>=0?"#22c55e":"#ef4444",fontVariantNumeric:"tabular-nums"}}>{pct(r.retorno_total)}</td>
                  <td style={{padding:"7px 9px",textAlign:"right",color:r.max_drawdown<10?"#22c55e":r.max_drawdown<20?"#f59e0b":"#ef4444",fontVariantNumeric:"tabular-nums"}}>{r.max_drawdown?.toFixed(1)}%</td>
                  <td style={{padding:"7px 9px",textAlign:"right",color:"var(--text-secondary)"}}>{r.total_trades}</td>
                  <td style={{padding:"7px 9px",textAlign:"right",color:mc(r.sharpe,0.5,1),fontVariantNumeric:"tabular-nums"}}>{r.sharpe?.toFixed(2)}</td>
                  <td style={{padding:"7px 9px",textAlign:"right",color:"var(--text-muted)",fontVariantNumeric:"tabular-nums"}}>{r.score_compra}</td>
                  <td style={{padding:"7px 9px",textAlign:"right",color:"var(--text-muted)",fontVariantNumeric:"tabular-nums"}}>{r.sl_pct}%</td>
                  <td style={{padding:"7px 9px",textAlign:"right",color:"var(--text-muted)",fontVariantNumeric:"tabular-nums"}}>{r.tp_pct}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function BacktestPage() {
  const [mode, setMode] = useState<Mode>("ia");
  const [preset, setPreset] = useState<PresetKey>("volume");
  const [simbolo, setSimboloS] = useState("BTCUSDT");
  const [diasSel, setDiasSel] = useState(365);
  const [scanSimbolos, setScanSimbolos] = useState<string[]>(["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","DOGEUSDT"]);
  const [comparePerfil, setComparePerfil] = useState("mod_pro");

  // IA mode state
  const [taskId, setTaskId] = useState<string|null>(null);
  const [task, setTask] = useState<OptTask|null>(null);
  const [polling, setPolling] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployedOk, setDeployedOk] = useState(false);
  const pollingRef = useRef(false);

  // Scan mode state
  const [scanLoading, setScanLoading] = useState(false);
  const [scanResult, setScanResult] = useState<{resultados:ScanResult[];perfil_nome:string;periodo:{dias:number}}|null>(null);

  // Compare mode state
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareResult, setCompareResult] = useState<{ranking:ProfileRankResult[];simbolo:string;periodo:{dias:number}}|null>(null);

  const [erro, setErro] = useState("");

  function todayStr2() { return new Date().toISOString().slice(0,10); }
  const dataFim = todayStr2();
  const dataInicio = daysAgoStr(diasSel);
  const periodo = PERIODOS.find(p=>p.dias===diasSel)??PERIODOS[3];

  // Polling loop for IA mode
  useEffect(()=>{
    if (!polling || !taskId) return;
    pollingRef.current = true;
    const iv = setInterval(async()=>{
      if (!pollingRef.current) return;
      try {
        const r = await fetch(`${API}/cripto/backtest/ai/optimize-loop/${taskId}`);
        if (!r.ok) return;
        const d:OptTask = await r.json();
        setTask(d);
        if (d.status==="done" || d.status==="error") {
          setPolling(false);
          pollingRef.current = false;
        }
      } catch {}
    }, 3500);
    return ()=>{ clearInterval(iv); pollingRef.current=false; };
  }, [polling, taskId]);

  const p = PRESETS[preset];

  async function iniciarIA() {
    setErro(""); setTask(null); setTaskId(null); setDeployedOk(false);
    try {
      const r = await fetch(`${API}/cripto/backtest/ai/optimize-loop/start`, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          simbolo, data_inicio:dataInicio, data_fim:dataFim,
          custo_pct:0.04, slippage_pct:0.05, fear_greed:50,
          target_wr:    p.target_wr,
          target_pf:    p.target_pf,
          target_ops:   p.target_ops,
          target_return:p.target_return,
          max_geracoes: p.max_geracoes,
        }),
      });
      if (!r.ok) { const d=await r.json(); throw new Error(d.detail||"Erro ao iniciar"); }
      const d = await r.json();
      setTaskId(d.task_id);
      setPolling(true);
    } catch(e:unknown) {
      setErro(e instanceof Error ? e.message : "Erro de conexão com o backend");
    }
  }

  async function deployarFutures() {
    if (!task?.campeao) return;
    setDeploying(true);
    try {
      const r = await fetch(`${API}/cripto/backtest/ia-futures-profiles`, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ campeao:task.campeao, simbolo, periodo:periodo.label }),
      });
      if (!r.ok) throw new Error("Erro ao fazer deploy");
      setDeployedOk(true);
    } catch(e:unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao enviar para Futures");
    } finally { setDeploying(false); }
  }

  async function iniciarScan() {
    setErro(""); setScanResult(null); setScanLoading(true);
    try {
      const r = await fetch(`${API}/cripto/backtest/scan-multi`, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          simbolos: scanSimbolos,
          perfil_id: comparePerfil,
          data_inicio: dataInicio,
          data_fim: dataFim,
          custo_pct:0.04, slippage_pct:0.05, fear_greed:50,
        }),
      });
      if (!r.ok) { const d=await r.json(); throw new Error(d.detail||"Erro ao iniciar scan"); }
      setScanResult(await r.json());
    } catch(e:unknown) {
      setErro(e instanceof Error ? e.message : "Erro de conexão");
    } finally { setScanLoading(false); }
  }

  async function iniciarCompare() {
    setErro(""); setCompareResult(null); setCompareLoading(true);
    try {
      const r = await fetch(`${API}/cripto/backtest/compare-profiles`, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          simbolo,
          data_inicio: dataInicio,
          data_fim: dataFim,
          custo_pct:0.04, slippage_pct:0.05, fear_greed:50,
        }),
      });
      if (!r.ok) { const d=await r.json(); throw new Error(d.detail||"Erro ao comparar perfis"); }
      setCompareResult(await r.json());
    } catch(e:unknown) {
      setErro(e instanceof Error ? e.message : "Erro de conexão");
    } finally { setCompareLoading(false); }
  }

  const isRunningIA = polling || task?.status==="running";
  const isDoneIA = task?.status==="done";
  const isError = task?.status==="error";
  const isLoading = isRunningIA || scanLoading || compareLoading;

  const toggleScanSimbolo = useCallback((sym:string)=>{
    setScanSimbolos(prev=> prev.includes(sym) ? prev.filter(s=>s!==sym) : [...prev,sym]);
  },[]);

  return (
    <>
      <style>{CSS}</style>
      <IAEngineHubNav />
      <div style={{maxWidth:920,margin:"0 auto",padding:"20px 16px 60px",display:"flex",flexDirection:"column",gap:20}}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div>
          <h1 style={{fontSize:24,fontWeight:900,background:"linear-gradient(135deg,#7c3aed,#3b82f6)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",margin:0,letterSpacing:"-0.03em"}}>
            Backtest Profissional
          </h1>
          <p style={{fontSize:12,color:"var(--text-muted)",marginTop:5,lineHeight:1.5}}>
            IA testa todos os 16 perfis, otimiza por gerações e entrega o melhor setup com lista completa de trades.
          </p>
        </div>

        {/* ── Mode selector ──────────────────────────────────────────────── */}
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {([
            {id:"ia" as Mode,     label:"🤖 IA Otimização",    desc:"Encontra o melhor perfil automaticamente"},
            {id:"scan" as Mode,   label:"🌐 Scan Multi-Símbolo",desc:"Compara vários ativos com um perfil"},
            {id:"compare" as Mode,label:"⚖️ Comparar Perfis",   desc:"Todos os 16 perfis em um ativo"},
          ] as {id:Mode;label:string;desc:string}[]).map(m=>(
            <button key={m.id} onClick={()=>{setMode(m.id);setErro("");}}
              style={{flex:1,minWidth:180,padding:"12px 14px",borderRadius:14,border:"1px solid",cursor:"pointer",transition:"all 0.15s",textAlign:"left",
                background: mode===m.id ? "linear-gradient(135deg,rgba(124,58,237,0.15),rgba(59,130,246,0.1))" : "var(--bg-card)",
                borderColor: mode===m.id ? "rgba(124,58,237,0.4)" : "var(--border)",
              }}>
              <div style={{fontSize:12,fontWeight:700,color: mode===m.id ? "#a78bfa" : "var(--text-primary)"}}>{m.label}</div>
              <div style={{fontSize:10,color:"var(--text-muted)",marginTop:2}}>{m.desc}</div>
            </button>
          ))}
        </div>

        {/* ── Config Panel ───────────────────────────────────────────────── */}
        <div style={{borderRadius:18,padding:"20px",background:"var(--bg-card)",border:"1px solid var(--border)",display:"flex",flexDirection:"column",gap:18}}>

          {/* IA Mode: presets */}
          {mode==="ia" && (
            <div>
              <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",color:"var(--text-muted)",marginBottom:8}}>Objetivo de Otimização</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {(Object.entries(PRESETS) as [PresetKey,typeof PRESETS[PresetKey]][]).map(([key,pr])=>(
                  <button key={key} onClick={()=>setPreset(key)} disabled={isRunningIA}
                    style={{flex:1,minWidth:140,padding:"10px 12px",borderRadius:12,fontSize:11,fontWeight:600,cursor:isRunningIA?"not-allowed":"pointer",transition:"all 0.15s",textAlign:"left",
                      background: preset===key ? `${pr.color}12` : "var(--bg-surface)",
                      border: preset===key ? `1px solid ${pr.color}40` : "1px solid var(--border)",
                      color: preset===key ? pr.color : "var(--text-secondary)"}}>
                    <div style={{fontSize:14,marginBottom:2}}>{pr.icon}</div>
                    <div style={{fontWeight:800}}>{pr.label}</div>
                    <div style={{fontSize:9,color:"var(--text-muted)",marginTop:2}}>{pr.desc}</div>
                    <div style={{fontSize:9,color:"var(--text-muted)",marginTop:4}}>
                      {pr.target_ops}+ ops · WR≥{pr.target_wr}% · PF≥{pr.target_pf} · {pr.max_geracoes} gerações
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Compare mode: profile selector */}
          {mode==="scan" && (
            <div>
              <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",color:"var(--text-muted)",marginBottom:8}}>Perfil a testar em todos os ativos</div>
              <select value={comparePerfil} onChange={e=>setComparePerfil(e.target.value)}
                style={{width:"100%",padding:"10px 12px",borderRadius:10,background:"var(--bg-surface)",color:"var(--text-primary)",border:"1px solid var(--border)",fontSize:12,cursor:"pointer"}}>
                {[
                  {id:"cons_normal",nome:"Conservador Normal"},
                  {id:"cons_pro",nome:"Conservador PRO"},
                  {id:"mod_normal",nome:"Moderado Normal"},
                  {id:"mod_pro",nome:"Moderado PRO"},
                  {id:"agr_normal",nome:"Agressivo Normal"},
                  {id:"agr_pro",nome:"Agressivo PRO"},
                  {id:"mod_alav",nome:"Moderado Alavancado"},
                  {id:"sub_mod",nome:"Subida Moderado"},
                ].map(p=>(
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
            </div>
          )}

          {/* Symbol selection — for IA and Compare modes */}
          {mode !== "scan" && (
            <div>
              <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",color:"var(--text-muted)",marginBottom:8}}>Ativo</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {SIMBOLOS.map(s=>{
                  const sym=s.replace("USDT",""), active=simbolo===s;
                  return (
                    <button key={s} onClick={()=>setSimboloS(s)} disabled={isLoading}
                      style={{padding:"7px 12px",borderRadius:8,fontSize:11,fontWeight:700,cursor:isLoading?"not-allowed":"pointer",transition:"all 0.15s",
                        background:active?"var(--primary-glow)":"var(--bg-surface)",
                        color:active?"var(--primary)":"var(--text-secondary)",
                        border:active?"1px solid var(--primary-border)":"1px solid var(--border)"}}>
                      {sym}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Multi-symbol selection — for Scan mode */}
          {mode==="scan" && (
            <div>
              <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",color:"var(--text-muted)",marginBottom:8}}>
                Ativos a comparar <span style={{fontWeight:400,color:"var(--text-muted)"}}>({scanSimbolos.length} selecionados)</span>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {SIMBOLOS.map(s=>{
                  const sym=s.replace("USDT",""), active=scanSimbolos.includes(s);
                  return (
                    <button key={s} onClick={()=>toggleScanSimbolo(s)} disabled={scanLoading}
                      style={{padding:"7px 12px",borderRadius:8,fontSize:11,fontWeight:700,cursor:scanLoading?"not-allowed":"pointer",transition:"all 0.15s",
                        background:active?"rgba(16,185,129,0.1)":"var(--bg-surface)",
                        color:active?"#10b981":"var(--text-secondary)",
                        border:active?"1px solid rgba(16,185,129,0.3)":"1px solid var(--border)"}}>
                      {sym}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Period */}
          <div>
            <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",color:"var(--text-muted)",marginBottom:8}}>Período</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {PERIODOS.map(p=>{
                const active=diasSel===p.dias;
                return (
                  <button key={p.dias} onClick={()=>setDiasSel(p.dias)} disabled={isLoading}
                    style={{padding:"9px 16px",borderRadius:10,fontSize:12,fontWeight:600,cursor:isLoading?"not-allowed":"pointer",transition:"all 0.15s",
                      background:active?"linear-gradient(135deg,rgba(124,58,237,0.2),rgba(59,130,246,0.12))":"var(--bg-surface)",
                      color:active?"#a78bfa":"var(--text-secondary)",
                      border:active?"1px solid rgba(124,58,237,0.4)":"1px solid var(--border)"}}>
                    {p.label}
                  </button>
                );
              })}
            </div>
            <div style={{fontSize:10,color:"var(--text-muted)",marginTop:6}}>
              {dataInicio} → {dataFim} · {diasSel} dias de histórico real da Binance
            </div>
          </div>

          {/* Action button */}
          {mode==="ia" && (
            <button onClick={iniciarIA} disabled={isRunningIA}
              style={{width:"100%",padding:"16px 0",borderRadius:14,border:"none",cursor:isRunningIA?"not-allowed":"pointer",
                background:isRunningIA?"rgba(124,58,237,0.2)":"linear-gradient(135deg,#7c3aed,#3b82f6)",
                color:"#fff",fontSize:14,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center",gap:12,
                boxShadow:isRunningIA?"none":"0 0 28px rgba(124,58,237,0.4)",opacity:isRunningIA?0.7:1,transition:"all 0.2s"}}>
              {isRunningIA ? (
                <><svg className="bt-spin" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  IA otimizando {simbolo.replace("USDT","")} — {PRESETS[preset].label}…</>
              ) : (
                <>🤖 Iniciar IA — {simbolo.replace("USDT","")} · {periodo.label} · Modo {PRESETS[preset].label}</>
              )}
            </button>
          )}
          {mode==="scan" && (
            <button onClick={iniciarScan} disabled={scanLoading || scanSimbolos.length<2}
              style={{width:"100%",padding:"16px 0",borderRadius:14,border:"none",cursor:(scanLoading||scanSimbolos.length<2)?"not-allowed":"pointer",
                background:(scanLoading||scanSimbolos.length<2)?"rgba(16,185,129,0.2)":"linear-gradient(135deg,#059669,#10b981)",
                color:"#fff",fontSize:14,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center",gap:12,
                boxShadow:scanLoading?"none":"0 0 24px rgba(16,185,129,0.35)",opacity:(scanLoading||scanSimbolos.length<2)?0.7:1,transition:"all 0.2s"}}>
              {scanLoading ? (
                <><svg className="bt-spin" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  Testando {scanSimbolos.length} ativos… pode levar 1-2 min</>
              ) : (
                <>🌐 Comparar {scanSimbolos.length} ativos · {periodo.label}</>
              )}
            </button>
          )}
          {mode==="compare" && (
            <button onClick={iniciarCompare} disabled={compareLoading}
              style={{width:"100%",padding:"16px 0",borderRadius:14,border:"none",cursor:compareLoading?"not-allowed":"pointer",
                background:compareLoading?"rgba(245,158,11,0.2)":"linear-gradient(135deg,#d97706,#f59e0b)",
                color:"#fff",fontSize:14,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center",gap:12,
                boxShadow:compareLoading?"none":"0 0 24px rgba(245,158,11,0.35)",opacity:compareLoading?0.7:1,transition:"all 0.2s"}}>
              {compareLoading ? (
                <><svg className="bt-spin" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  Comparando 16 perfis em {simbolo.replace("USDT","")}… 1-3 min</>
              ) : (
                <>⚖️ Comparar 16 Perfis — {simbolo.replace("USDT","")} · {periodo.label}</>
              )}
            </button>
          )}
        </div>

        {/* ── Erro ───────────────────────────────────────────────────────── */}
        {erro && (
          <div style={{padding:"12px 16px",borderRadius:10,display:"flex",alignItems:"center",gap:10,fontSize:12,background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.2)",color:"#ef4444"}}>
            ⚠️ {erro}
            <button onClick={()=>setErro("")} style={{marginLeft:"auto",background:"none",border:"none",cursor:"pointer",color:"#ef4444",fontSize:16}}>✕</button>
          </div>
        )}

        {/* ── IA Mode Results ─────────────────────────────────────────────── */}
        {mode==="ia" && (
          <>
            {task && <ProgressBar task={task}/>}
            {isError && task?.erro && (
              <div style={{padding:"12px 16px",borderRadius:10,background:"rgba(239,68,68,0.07)",border:"1px solid rgba(239,68,68,0.2)",color:"#ef4444",fontSize:12}}>
                ❌ {task.erro}
              </div>
            )}
            {isDoneIA && task.campeao && (
              <ChampionCard
                campeao={task.campeao}
                simbolo={simbolo}
                periodo={periodo.label}
                onDeploy={deployarFutures}
                deploying={deploying}
                deployedOk={deployedOk}
              />
            )}
            {task && task.geracoes.length>0 && (
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <div style={{fontSize:12,fontWeight:700,color:"var(--text-primary)"}}>
                  🔬 Processo de Otimização
                  <span style={{marginLeft:8,fontSize:10,color:"var(--text-muted)",fontWeight:400}}>{task.geracoes.length} gerações{task.converged?" · ✓ Convergiu":""}</span>
                </div>
                <GenTimeline geracoes={task.geracoes}/>
              </div>
            )}
          </>
        )}

        {/* ── Scan Mode Results ───────────────────────────────────────────── */}
        {mode==="scan" && scanResult && (
          <ScanResults data={scanResult}/>
        )}

        {/* ── Compare Mode Results ────────────────────────────────────────── */}
        {mode==="compare" && compareResult && (
          <CompareResults data={compareResult}/>
        )}

      </div>
    </>
  );
}
