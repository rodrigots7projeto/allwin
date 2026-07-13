"use client";

import { useState, useEffect, useRef } from "react";
import { IAEngineHubNav } from "@/components/IAEngineHubNav";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

// ── Constantes ─────────────────────────────────────────────────────────────────

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

// Defaults que o usuário nunca vê
const IA_DEFAULTS = {
  custo_pct:      0.04,
  slippage_pct:   0.05,
  fear_greed:     50,
  target_wr:      55,
  target_pf:      1.5,
  target_ops:     10,
  target_return:  15,
  max_geracoes:   8,
};

function todayStr() { return new Date().toISOString().slice(0,10); }
function daysAgoStr(n:number) { const d=new Date(); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); }

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface Metricas {
  total_trades:number; win_rate:number; profit_factor:number;
  max_drawdown:number; retorno_total:number; sharpe:number;
  capital_inicial:number; capital_final:number;
  gross_profit:number; gross_loss:number; avg_ganho:number; avg_perda:number;
  wins:number; losses:number; expectancia:number; payoff:number; sortino:number;
}
interface EquityPoint { ts:number; capital:number; }
interface Perfil {
  id:string; nome:string; score_compra:number; score_venda:number;
  sl_pct:number; tp_pct:number; capital_inicial:number; stake_base:number;
  bull_pct_min:number; aguardar_ok:boolean; apenas_aguardar:boolean;
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
  campeao:{perfil_id:string;perfil_nome:string;perfil_config:Perfil;dss:number;metricas:Metricas;resultado_id:string;equity?:EquityPoint[]}|null;
  converged:boolean; criado_em:string; config:Record<string,unknown>; erro?:string;
}
interface IAFuturesProfile {
  id:string; nome:string; nivel:string; emoji:string; cor:string;
  score_compra:number; dss:number; metricas_backtest:Record<string,number|null>;
  simbolo_backtest:string; periodo_backtest:string; deployado_em:string;
  descricao:string;
}

// ── DSS ────────────────────────────────────────────────────────────────────────

function calcDSS(m:Metricas):number {
  if (m.total_trades<3) return 0;
  const wr=m.win_rate*0.40, pf=Math.min(1,m.profit_factor/3)*25;
  const ret=Math.min(20,Math.max(-10,m.retorno_total*0.15));
  const dd=-Math.min(15,m.max_drawdown*0.5), sh=Math.min(5,Math.max(-5,m.sharpe*2.5));
  return Math.round(Math.max(0,Math.min(100,wr+pf+ret+dd+sh)));
}
function dssLabel(d:number) {
  if (d>=80) return {label:"Excelente",color:"#22c55e",bg:"rgba(34,197,94,0.12)"};
  if (d>=65) return {label:"Bom",       color:"#3b82f6",bg:"rgba(59,130,246,0.12)"};
  if (d>=50) return {label:"Regular",   color:"#f59e0b",bg:"rgba(245,158,11,0.12)"};
  if (d>=35) return {label:"Fraco",     color:"#f97316",bg:"rgba(249,115,22,0.12)"};
  return              {label:"Crítico",  color:"#ef4444",bg:"rgba(239,68,68,0.10)"};
}
function pct(v:number,d=1){return `${v>=0?"+":""}${v.toFixed(d)}%`;}
function mc(v:number,lo:number,hi:number){return v>=hi?"#22c55e":v>=lo?"#f59e0b":"#ef4444";}

// ── EquityChart ────────────────────────────────────────────────────────────────

function EquityChart({equity,height=120}:{equity:EquityPoint[];height?:number}) {
  if (!equity||equity.length<2) return (
    <div style={{height,display:"flex",alignItems:"center",justifyContent:"center",color:"var(--text-muted)",fontSize:11}}>
      Sem dados de equity
    </div>
  );
  const W=400,H=height,pad=8;
  const vals=equity.map(p=>p.capital), mn=Math.min(...vals), mx=Math.max(...vals), span=Math.max(mx-mn,1);
  const w=W-pad*2, h=H-pad*2;
  const pts=equity.map((p,i)=>`${pad+(i/(equity.length-1))*w},${pad+h-((p.capital-mn)/span)*h}`);
  const up=equity[equity.length-1].capital>=equity[0].capital;
  const clr=up?"#22c55e":"#ef4444";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{width:"100%",height,display:"block"}}>
      <defs><linearGradient id="eg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={clr} stopOpacity="0.35"/>
        <stop offset="100%" stopColor={clr} stopOpacity="0"/>
      </linearGradient></defs>
      <polygon points={`${pad},${pad+h} ${pts.join(" ")} ${pad+w},${pad+h}`} fill="url(#eg)"/>
      <polyline points={pts.join(" ")} fill="none" stroke={clr} strokeWidth="1.5"/>
      {/* Linha de base */}
      <line x1={pad} y1={pad+h-((equity[0].capital-mn)/span)*h} x2={pad+w} y2={pad+h-((equity[0].capital-mn)/span)*h}
        stroke="var(--border)" strokeWidth="0.8" strokeDasharray="4,3"/>
    </svg>
  );
}

// ── DSSGauge ──────────────────────────────────────────────────────────────────

function DSSGauge({dss}:{dss:number}) {
  const {label,color}=dssLabel(dss);
  const r=26, circ=2*Math.PI*r, arc=circ*(dss/100);
  return (
    <div style={{position:"relative",width:70,height:70,flexShrink:0}}>
      <svg width={70} height={70} viewBox="0 0 70 70">
        <circle cx={35} cy={35} r={r} fill="none" stroke="var(--border)" strokeWidth={5}/>
        <circle cx={35} cy={35} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeDasharray={`${arc} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 35 35)" style={{transition:"stroke-dasharray 0.8s ease"}}/>
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
        <div style={{fontSize:16,fontWeight:900,color,lineHeight:1}}>{dss}</div>
        <div style={{fontSize:8,color:"var(--text-muted)",fontWeight:600}}>{label}</div>
      </div>
    </div>
  );
}

// ── MetricChip ────────────────────────────────────────────────────────────────

function MetricChip({label,value,color}:{label:string;value:string;color:string}) {
  return (
    <div style={{background:"var(--bg)",border:"1px solid var(--border)",borderRadius:10,padding:"8px 12px",textAlign:"center"}}>
      <div style={{fontSize:9,color:"var(--text-muted)",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:3}}>{label}</div>
      <div style={{fontSize:16,fontWeight:900,color,fontVariantNumeric:"tabular-nums"}}>{value}</div>
    </div>
  );
}

// ── ChampionCard ──────────────────────────────────────────────────────────────

function ChampionCard({campeao,simbolo,periodo,onDeploy,deploying}:{
  campeao:NonNullable<OptTask["campeao"]>;
  simbolo:string; periodo:string;
  onDeploy:()=>void; deploying:boolean;
}) {
  const m=campeao.metricas, dss=campeao.dss, {label:dl,color:dc}=dssLabel(dss);
  const ret=m.retorno_total, rc=ret>=0?"#22c55e":"#ef4444";
  const cfg=campeao.perfil_config;

  return (
    <div style={{borderRadius:20,overflow:"hidden",border:`2px solid ${dc}40`,background:"var(--bg-card)"}}>
      {/* Header */}
      <div style={{padding:"20px 24px 16px",background:`linear-gradient(135deg,${dc}10,transparent)`,borderBottom:"1px solid var(--border)"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,flex:1}}>
            <div style={{fontSize:24}}>🏆</div>
            <div>
              <div style={{fontSize:11,color:"var(--text-muted)",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em"}}>Perfil Campeão</div>
              <div style={{fontSize:18,fontWeight:900,color:"var(--text-primary)",marginTop:2}}>{campeao.perfil_nome}</div>
              <div style={{fontSize:11,color:"var(--text-muted)",marginTop:2}}>
                {simbolo.replace("USDT","")} · {periodo} · DSS <b style={{color:dc}}>{dss} {dl}</b>
              </div>
            </div>
          </div>
          <DSSGauge dss={dss}/>
        </div>
      </div>

      {/* Equity */}
      {campeao.equity && campeao.equity.length>1 && (
        <div style={{padding:"12px 24px 8px"}}>
          <div style={{fontSize:10,color:"var(--text-muted)",fontWeight:600,marginBottom:6}}>CURVA DE CAPITAL</div>
          <div style={{borderRadius:12,overflow:"hidden",background:"var(--bg)"}}>
            <EquityChart equity={campeao.equity} height={140}/>
          </div>
        </div>
      )}

      {/* Métricas principais */}
      <div style={{padding:"8px 24px 16px"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:12}}>
          <MetricChip label="Retorno"     value={pct(ret)}                            color={rc}/>
          <MetricChip label="Win Rate"    value={`${m.win_rate.toFixed(0)}%`}         color={mc(m.win_rate,50,60)}/>
          <MetricChip label="P.Factor"    value={m.profit_factor===999?"∞":m.profit_factor.toFixed(2)} color={mc(m.profit_factor,1.2,1.8)}/>
          <MetricChip label="Drawdown"    value={`-${m.max_drawdown.toFixed(1)}%`}    color={m.max_drawdown<10?"#22c55e":m.max_drawdown<20?"#f59e0b":"#ef4444"}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:16}}>
          <MetricChip label="Entradas"    value={String(m.total_trades)}              color="var(--text-primary)"/>
          <MetricChip label="Sharpe"      value={m.sharpe.toFixed(2)}                 color={mc(m.sharpe,0.5,1)}/>
          <MetricChip label="Capital Ini" value={`R$${m.capital_inicial.toLocaleString("pt-BR")}`} color="var(--text-muted)"/>
          <MetricChip label="Capital Fin" value={`R$${m.capital_final.toLocaleString("pt-BR")}`}   color={rc}/>
        </div>

        {/* Parâmetros do perfil */}
        <div style={{background:"var(--bg)",borderRadius:12,padding:"12px 16px",marginBottom:16,fontSize:11}}>
          <div style={{color:"var(--text-muted)",fontWeight:700,marginBottom:8,fontSize:10,textTransform:"uppercase",letterSpacing:"0.05em"}}>Parâmetros do Perfil</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,color:"var(--text-secondary)"}}>
            {[
              ["Score entrada",`≥ ${cfg.score_compra}`],
              ["Score saída",  `≤ ${cfg.score_venda}`],
              ["Stop Loss",    `${cfg.sl_pct}%`],
              ["Take Profit",  `${cfg.tp_pct}%`],
              ["Bull mín",     `${cfg.bull_pct_min}%`],
              ["Stake",        `R$ ${cfg.stake_base.toLocaleString("pt-BR")}`],
            ].map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",gap:4}}>
                <span style={{color:"var(--text-muted)"}}>{k}</span>
                <span style={{fontWeight:700,color:"var(--text-primary)"}}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Botão deploy */}
        <button onClick={onDeploy} disabled={deploying}
          style={{width:"100%",padding:"14px 0",borderRadius:14,border:"none",cursor:deploying?"not-allowed":"pointer",
            background:deploying?"rgba(139,92,246,0.2)":"linear-gradient(135deg,#7c3aed,#3b82f6)",
            color:"#fff",fontSize:14,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center",gap:10,
            boxShadow:deploying?"none":"0 0 24px rgba(124,58,237,0.4)",opacity:deploying?0.7:1,transition:"all 0.2s"}}>
          {deploying?(
            <>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{animation:"spin 1s linear infinite"}}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              Enviando para Futures...
            </>
          ):(
            <>🚀 Colocar no Futures</>
          )}
        </button>
      </div>
    </div>
  );
}

// ── BaselineTable ─────────────────────────────────────────────────────────────

function BaselineTable({rows}:{rows:{perfil_nome:string;dss:number;win_rate:number;profit_factor:number;retorno_total:number;max_drawdown:number;total_trades:number}[]}) {
  const sorted=[...rows].sort((a,b)=>b.dss-a.dss);
  return (
    <div style={{borderRadius:12,overflow:"hidden",border:"1px solid var(--border)"}}>
      <table style={{width:"100%",fontSize:11,borderCollapse:"collapse"}}>
        <thead>
          <tr style={{background:"var(--bg)",borderBottom:"1px solid var(--border)"}}>
            {["#","Perfil","DSS","Win Rate","P.Factor","Retorno","DD","Ops"].map(h=>(
              <th key={h} style={{padding:"8px 10px",textAlign:h==="#"||h==="Perfil"?"left":"right",color:"var(--text-muted)",fontWeight:700,fontSize:10,textTransform:"uppercase"}}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r,i)=>{
            const {color:dc,label:dl}=dssLabel(r.dss);
            return (
              <tr key={r.perfil_nome} style={{borderBottom:"1px solid var(--border)",background:i===0?"rgba(34,197,94,0.04)":"transparent"}}>
                <td style={{padding:"8px 10px",color:i===0?"#f59e0b":"var(--text-muted)",fontWeight:700}}>{i===0?"★":i+1}</td>
                <td style={{padding:"8px 10px",fontWeight:700,color:"var(--text-primary)"}}>{r.perfil_nome}</td>
                <td style={{padding:"8px 10px",textAlign:"right"}}>
                  <span style={{padding:"2px 6px",borderRadius:6,fontSize:10,fontWeight:900,background:`${dc}18`,color:dc}}>{r.dss} {dl}</span>
                </td>
                <td style={{padding:"8px 10px",textAlign:"right",fontWeight:700,color:mc(r.win_rate,50,60)}}>{r.win_rate.toFixed(0)}%</td>
                <td style={{padding:"8px 10px",textAlign:"right",color:mc(r.profit_factor,1.2,1.8)}}>{r.profit_factor.toFixed(2)}</td>
                <td style={{padding:"8px 10px",textAlign:"right",fontWeight:700,color:r.retorno_total>=0?"#22c55e":"#ef4444"}}>{pct(r.retorno_total)}</td>
                <td style={{padding:"8px 10px",textAlign:"right",color:r.max_drawdown<10?"#22c55e":r.max_drawdown<20?"#f59e0b":"#ef4444"}}>{r.max_drawdown.toFixed(1)}%</td>
                <td style={{padding:"8px 10px",textAlign:"right",color:"var(--text-secondary)"}}>{r.total_trades}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── GenTimeline ───────────────────────────────────────────────────────────────

function GenTimeline({geracoes}:{geracoes:OptGen[]}) {
  const [expanded,setExpanded]=useState<number|null>(null);
  if (!geracoes.length) return null;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {geracoes.map((g)=>{
        const isBase=g.tipo==="baseline", isErr=g.tipo==="erro";
        const isExp=expanded===g.numero;
        const dssNew=g.dss_novo??0, dssOld=g.dss_anterior??0;
        const melhorou=g.melhorou&&!isBase, delta=dssNew-dssOld;
        const dotColor=isErr?"#ef4444":isBase?"#3b82f6":melhorou?"#22c55e":"#f59e0b";

        return (
          <div key={g.numero} style={{borderRadius:12,overflow:"hidden",border:`1px solid ${dotColor}30`,background:"var(--bg-card)"}}>
            <button onClick={()=>setExpanded(isExp?null:g.numero)}
              style={{width:"100%",padding:"12px 16px",background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:10,textAlign:"left"}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:dotColor,flexShrink:0,boxShadow:`0 0 6px ${dotColor}`}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                  <span style={{fontSize:11,fontWeight:700,color:"var(--text-primary)"}}>
                    {isBase?`Baseline — ${g.descricao}`:isErr?`Erro na geração ${g.numero}`:`Geração ${g.numero} — ${g.perfil_nome??""}`}
                  </span>
                  {!isBase&&!isErr&&g.dss_novo!=null&&(
                    <span style={{fontSize:10,fontWeight:700,color:dotColor}}>DSS {dssNew}</span>
                  )}
                  {melhorou&&<span style={{fontSize:9,padding:"1px 6px",borderRadius:6,background:"rgba(34,197,94,0.15)",color:"#22c55e",fontWeight:700}}>▲ +{delta.toFixed(0)}</span>}
                  {!melhorou&&!isBase&&!isErr&&<span style={{fontSize:9,padding:"1px 6px",borderRadius:6,background:"rgba(245,158,11,0.12)",color:"#f59e0b",fontWeight:600}}>= sem melhora</span>}
                  {g.converged&&<span style={{fontSize:9,padding:"1px 6px",borderRadius:6,background:"rgba(34,197,94,0.15)",color:"#22c55e",fontWeight:700}}>✓ Convergiu</span>}
                </div>
                {g.hipotese&&<div style={{fontSize:10,color:"var(--text-muted)",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.hipotese}</div>}
              </div>
              <span style={{fontSize:11,color:"var(--text-muted)",flexShrink:0}}>{isExp?"▲":"▼"}</span>
            </button>

            {isExp&&(
              <div style={{padding:"0 16px 14px",display:"flex",flexDirection:"column",gap:10,borderTop:"1px solid var(--border)"}}>
                {/* Baseline table */}
                {isBase&&g.resultados_baseline&&g.resultados_baseline.length>0&&(
                  <div style={{marginTop:10}}>
                    <div style={{fontSize:10,color:"var(--text-muted)",fontWeight:700,textTransform:"uppercase",marginBottom:6}}>Resultados Baseline</div>
                    <BaselineTable rows={g.resultados_baseline}/>
                  </div>
                )}

                {/* Otimização detail */}
                {!isBase&&!isErr&&(
                  <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:8}}>
                    {g.hipotese&&<p style={{fontSize:11,color:"var(--text-secondary)",lineHeight:1.5}}>{g.hipotese}</p>}

                    {/* Alterações */}
                    {g.alteracoes&&g.alteracoes.length>0&&(
                      <div>
                        <div style={{fontSize:10,color:"var(--text-muted)",fontWeight:700,textTransform:"uppercase",marginBottom:6}}>Alterações feitas</div>
                        <div style={{display:"flex",flexDirection:"column",gap:4}}>
                          {g.alteracoes.map((a,i)=>(
                            <div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:11,padding:"6px 10px",borderRadius:8,background:"var(--bg)"}}>
                              <span style={{color:"var(--text-muted)",minWidth:90}}>{a.campo}</span>
                              <span style={{color:"#ef4444"}}>{a.de}</span>
                              <span style={{color:"var(--text-muted)"}}>→</span>
                              <span style={{color:"#22c55e",fontWeight:700}}>{a.para}</span>
                              {a.motivo&&<span style={{color:"var(--text-muted)",fontSize:10,marginLeft:4}}>· {a.motivo}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Métricas */}
                    {g.metricas&&(
                      <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:6}}>
                        {[
                          {l:"Win%",    v:g.metricas.win_rate!=null?`${g.metricas.win_rate.toFixed(0)}%`:"—",      c:mc(g.metricas.win_rate??0,50,60)},
                          {l:"P.Factor",v:g.metricas.profit_factor!=null?g.metricas.profit_factor.toFixed(2):"—",  c:mc(g.metricas.profit_factor??0,1.2,1.8)},
                          {l:"Retorno", v:g.metricas.retorno_total!=null?pct(g.metricas.retorno_total):"—",        c:(g.metricas.retorno_total??0)>=0?"#22c55e":"#ef4444"},
                          {l:"DD",      v:g.metricas.max_drawdown!=null?`${g.metricas.max_drawdown.toFixed(1)}%`:"—",c:"var(--text-secondary)"},
                          {l:"Ops",     v:g.metricas.total_trades!=null?String(g.metricas.total_trades):"—",       c:"var(--text-secondary)"},
                          {l:"DSS",     v:g.dss_novo!=null?String(g.dss_novo):"—",                                 c:dssLabel(g.dss_novo??0).color},
                        ].map(({l,v,c})=>(
                          <div key={l} style={{background:"var(--bg)",borderRadius:8,padding:"6px 8px",textAlign:"center"}}>
                            <div style={{fontSize:9,color:"var(--text-muted)",fontWeight:600}}>{l}</div>
                            <div style={{fontSize:13,fontWeight:900,color:c,marginTop:2}}>{v}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Campeão atual */}
                    {g.campeao_nome&&(
                      <div style={{fontSize:10,color:"var(--text-muted)",padding:"6px 10px",borderRadius:8,background:"var(--bg)"}}>
                        🏆 Campeão atual: <b style={{color:"var(--text-primary)"}}>{g.campeao_nome}</b> · DSS {g.campeao_dss}
                      </div>
                    )}
                  </div>
                )}

                {isErr&&g.erro&&(
                  <div style={{marginTop:8,padding:"8px 12px",borderRadius:8,background:"rgba(239,68,68,0.08)",color:"#ef4444",fontSize:11}}>{g.erro}</div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Deployed profiles ─────────────────────────────────────────────────────────

function DeployedCard({p,onRemove}:{p:IAFuturesProfile;onRemove:()=>void}) {
  const {color:dc}=dssLabel(p.dss);
  const m=p.metricas_backtest;
  return (
    <div style={{borderRadius:14,padding:"14px 16px",background:"var(--bg-card)",border:`1px solid ${dc}35`,display:"flex",flexDirection:"column",gap:8}}>
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <span style={{fontSize:16}}>{p.emoji}</span>
        <div style={{flex:1}}>
          <div style={{fontSize:12,fontWeight:900,color:"var(--text-primary)"}}>{p.nome}</div>
          <div style={{fontSize:10,color:"var(--text-muted)"}}>{p.simbolo_backtest} · {p.periodo_backtest} · {new Date(p.deployado_em).toLocaleDateString("pt-BR")}</div>
        </div>
        <span style={{padding:"3px 8px",borderRadius:8,fontSize:11,fontWeight:900,background:`${dc}18`,color:dc}}>DSS {p.dss}</span>
        <button onClick={onRemove} style={{padding:"4px 8px",borderRadius:8,fontSize:10,fontWeight:700,background:"rgba(239,68,68,0.1)",color:"#ef4444",border:"1px solid rgba(239,68,68,0.25)",cursor:"pointer"}}>✕ Remover</button>
      </div>
      {m&&(
        <div style={{display:"flex",gap:10,fontSize:10,color:"var(--text-muted)",flexWrap:"wrap"}}>
          {m.win_rate!=null&&<span>WR <b style={{color:mc(m.win_rate as number,50,60)}}>{(m.win_rate as number).toFixed(0)}%</b></span>}
          {m.profit_factor!=null&&<span>PF <b style={{color:mc(m.profit_factor as number,1.2,1.8)}}>{(m.profit_factor as number).toFixed(2)}</b></span>}
          {m.retorno_total!=null&&<span>Ret <b style={{color:(m.retorno_total as number)>=0?"#22c55e":"#ef4444"}}>{pct(m.retorno_total as number)}</b></span>}
          {m.max_drawdown!=null&&<span>DD <b style={{color:"var(--text-secondary)"}}>{(m.max_drawdown as number).toFixed(1)}%</b></span>}
          {m.total_trades!=null&&<span>{m.total_trades} ops</span>}
        </div>
      )}
      <div style={{fontSize:10,color:"var(--text-muted)",lineHeight:1.4}}>{p.descricao.slice(0,120)}...</div>
    </div>
  );
}

// ── ProgressBar animada ───────────────────────────────────────────────────────

function ProgressBar({task}:{task:OptTask|null}) {
  if (!task) return null;
  const {fase,geracao_atual,total_geracoes}=task.progresso;
  const pct=total_geracoes>0?Math.round((geracao_atual/total_geracoes)*100):0;
  const isRunning=task.status==="running";

  return (
    <div style={{borderRadius:16,padding:"16px 20px",background:"linear-gradient(135deg,rgba(124,58,237,0.08),rgba(59,130,246,0.05))",border:"1px solid rgba(124,58,237,0.25)",display:"flex",flexDirection:"column",gap:10}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        {isRunning?(
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth={2.5} style={{animation:"spin 1s linear infinite",flexShrink:0}}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
        ):(
          <span style={{fontSize:16}}>✅</span>
        )}
        <div style={{flex:1}}>
          <div style={{fontSize:12,fontWeight:700,color:"var(--text-primary)"}}>{fase}</div>
          <div style={{fontSize:10,color:"var(--text-muted)"}}>
            {isRunning?`Geração ${geracao_atual} de ${total_geracoes}`:`Concluído — ${task.geracoes.length} gerações`}
          </div>
        </div>
        <div style={{fontSize:13,fontWeight:900,color:"#8b5cf6"}}>{pct}%</div>
      </div>
      <div style={{height:6,borderRadius:999,background:"var(--border)",overflow:"hidden"}}>
        <div style={{height:"100%",borderRadius:999,background:"linear-gradient(90deg,#7c3aed,#3b82f6)",width:`${pct}%`,transition:"width 0.5s ease"}}/>
      </div>
    </div>
  );
}

// ── CSS animation ─────────────────────────────────────────────────────────────

const spinStyle = `@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`;

// ── Page ───────────────────────────────────────────────────────────────────────

export default function BacktestPage() {
  const [simbolo,    setSimboloS]    = useState("BTCUSDT");
  const [diasSel,    setDiasSel]     = useState(365);
  const [taskId,     setTaskId]      = useState<string|null>(null);
  const [task,       setTask]        = useState<OptTask|null>(null);
  const [polling,    setPolling]     = useState(false);
  const [deploying,  setDeploying]   = useState(false);
  const [deployedOk, setDeployedOk]  = useState(false);
  const [erro,       setErro]        = useState("");
  const [deployed,   setDeployed]    = useState<IAFuturesProfile[]>([]);
  const pollingRef = useRef(false);

  // Carregar perfis IA já deployados
  useEffect(()=>{
    fetch(`${API}/cripto/backtest/ia-futures-profiles`)
      .then(r=>r.ok?r.json():[])
      .then(setDeployed)
      .catch(()=>{});
  },[]);

  // Polling loop
  useEffect(()=>{
    if (!polling||!taskId) return;
    pollingRef.current=true;
    const iv=setInterval(async()=>{
      if (!pollingRef.current) return;
      try {
        const r=await fetch(`${API}/cripto/backtest/ai/optimize-loop/${taskId}`);
        if (!r.ok) return;
        const d:OptTask=await r.json();
        setTask(d);
        if (d.status==="done"||d.status==="error") {
          setPolling(false);
          pollingRef.current=false;
        }
      } catch {}
    },4000);
    return ()=>{ clearInterval(iv); pollingRef.current=false; };
  },[polling,taskId]);

  const periodo=PERIODOS.find(p=>p.dias===diasSel)??PERIODOS[3];
  const dataFim=todayStr();
  const dataInicio=daysAgoStr(diasSel);

  async function iniciar() {
    setErro(""); setTask(null); setTaskId(null); setDeployedOk(false);
    try {
      const r=await fetch(`${API}/cripto/backtest/ai/optimize-loop/start`,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          simbolo, data_inicio:dataInicio, data_fim:dataFim,
          ...IA_DEFAULTS,
        }),
      });
      if (!r.ok) { const d=await r.json(); throw new Error(d.detail||"Erro ao iniciar"); }
      const d=await r.json();
      setTaskId(d.task_id);
      setPolling(true);
    } catch(e:unknown) {
      setErro(e instanceof Error?e.message:"Erro de conexão com o backend");
    }
  }

  async function deployarFutures() {
    if (!task?.campeao) return;
    setDeploying(true);
    try {
      const r=await fetch(`${API}/cripto/backtest/ia-futures-profiles`,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          campeao:task.campeao,
          simbolo,
          periodo:periodo.label,
        }),
      });
      if (!r.ok) throw new Error("Erro ao fazer deploy");
      const d=await r.json();
      setDeployedOk(true);
      if (d.perfil) setDeployed(prev=>[d.perfil,...prev.filter(x=>x.id!==d.perfil.id)]);
    } catch(e:unknown) {
      setErro(e instanceof Error?e.message:"Erro ao colocar no Futures");
    } finally { setDeploying(false); }
  }

  async function removeDeployed(pid:string) {
    try {
      await fetch(`${API}/cripto/backtest/ia-futures-profiles/${pid}`,{method:"DELETE"});
      setDeployed(prev=>prev.filter(x=>x.id!==pid));
    } catch {}
  }

  const isRunning=polling||task?.status==="running";
  const isDone=task?.status==="done";
  const isError=task?.status==="error";

  return (
    <>
      <style>{spinStyle}</style>
      <IAEngineHubNav />
      <div style={{maxWidth:900,margin:"0 auto",padding:"24px 16px 60px",display:"flex",flexDirection:"column",gap:24}}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div>
          <h1 style={{fontSize:26,fontWeight:900,background:"linear-gradient(135deg,#7c3aed,#3b82f6)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",margin:0}}>
            Backtest IA
          </h1>
          <p style={{fontSize:13,color:"var(--text-muted)",marginTop:6,lineHeight:1.5}}>
            Escolha o ativo e o período — a IA gera os perfis, roda os testes e encontra o mais lucrativo automaticamente.
          </p>
        </div>

        {/* ── Config: só símbolo + período ───────────────────────────────── */}
        <div style={{borderRadius:20,padding:"24px",background:"var(--bg-card)",border:"1px solid var(--border)",display:"flex",flexDirection:"column",gap:20}}>
          {/* Símbolo */}
          <div>
            <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",color:"var(--text-muted)",marginBottom:10}}>Ativo</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {SIMBOLOS.map(s=>{
                const sym=s.replace("USDT",""), active=simbolo===s;
                return (
                  <button key={s} onClick={()=>setSimboloS(s)} disabled={isRunning}
                    style={{padding:"8px 14px",borderRadius:10,fontSize:12,fontWeight:700,cursor:isRunning?"not-allowed":"pointer",transition:"all 0.15s",
                      background:active?"var(--primary-glow)":"var(--bg)",
                      color:active?"var(--primary)":"var(--text-secondary)",
                      border:active?"1px solid var(--primary-border)":"1px solid var(--border)"}}>
                    {sym}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Período */}
          <div>
            <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",color:"var(--text-muted)",marginBottom:10}}>Período de análise</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {PERIODOS.map(p=>{
                const active=diasSel===p.dias;
                return (
                  <button key={p.dias} onClick={()=>setDiasSel(p.dias)} disabled={isRunning}
                    style={{padding:"10px 20px",borderRadius:12,fontSize:13,fontWeight:700,cursor:isRunning?"not-allowed":"pointer",transition:"all 0.15s",
                      background:active?"linear-gradient(135deg,rgba(124,58,237,0.2),rgba(59,130,246,0.15))":"var(--bg)",
                      color:active?"#a78bfa":"var(--text-secondary)",
                      border:active?"1px solid rgba(124,58,237,0.5)":"1px solid var(--border)"}}>
                    {p.label}
                  </button>
                );
              })}
            </div>
            <div style={{fontSize:11,color:"var(--text-muted)",marginTop:8}}>
              {dataInicio} até {dataFim} · {diasSel} dias de histórico
            </div>
          </div>

          {/* Botão principal */}
          <button onClick={iniciar} disabled={isRunning}
            style={{width:"100%",padding:"18px 0",borderRadius:16,border:"none",cursor:isRunning?"not-allowed":"pointer",
              background:isRunning?"rgba(124,58,237,0.2)":"linear-gradient(135deg,#7c3aed,#3b82f6)",
              color:"#fff",fontSize:15,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center",gap:12,
              boxShadow:isRunning?"none":"0 0 32px rgba(124,58,237,0.45)",opacity:isRunning?0.7:1,transition:"all 0.2s"}}>
            {isRunning?(
              <>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{animation:"spin 1s linear infinite"}}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                IA analisando {simbolo.replace("USDT","")}...
              </>
            ):(
              <>🤖 Iniciar Análise IA — {simbolo.replace("USDT","")} · {periodo.label}</>
            )}
          </button>
        </div>

        {/* ── Erro ───────────────────────────────────────────────────────── */}
        {erro&&(
          <div style={{padding:"12px 16px",borderRadius:12,display:"flex",alignItems:"center",gap:10,fontSize:13,background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.25)",color:"#ef4444"}}>
            ⚠️ {erro}
            <button onClick={()=>setErro("")} style={{marginLeft:"auto",background:"none",border:"none",cursor:"pointer",color:"#ef4444",fontSize:16}}>✕</button>
          </div>
        )}

        {/* ── Progresso ──────────────────────────────────────────────────── */}
        {task&&<ProgressBar task={task}/>}

        {/* ── Erro da task ───────────────────────────────────────────────── */}
        {isError&&task?.erro&&(
          <div style={{padding:"14px 16px",borderRadius:12,background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.25)",color:"#ef4444",fontSize:13}}>
            ❌ Erro na otimização: {task.erro}
          </div>
        )}

        {/* ── Campeão ────────────────────────────────────────────────────── */}
        {isDone&&task.campeao&&(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {deployedOk&&(
              <div style={{padding:"12px 16px",borderRadius:12,background:"rgba(34,197,94,0.1)",border:"1px solid rgba(34,197,94,0.3)",color:"#22c55e",fontSize:13,fontWeight:700}}>
                ✅ Perfil enviado para Futures! Vá até a aba Futures para ver em ação.
              </div>
            )}
            <ChampionCard
              campeao={task.campeao}
              simbolo={simbolo}
              periodo={periodo.label}
              onDeploy={deployarFutures}
              deploying={deploying}
            />
          </div>
        )}

        {/* ── Timeline de gerações ───────────────────────────────────────── */}
        {task&&task.geracoes.length>0&&(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{fontSize:13,fontWeight:700,color:"var(--text-primary)"}}>
              🔬 Processo de Otimização — {task.geracoes.length} gerações
              {task.converged&&<span style={{marginLeft:8,fontSize:11,color:"#22c55e",fontWeight:600}}>✓ Convergiu</span>}
            </div>
            <GenTimeline geracoes={task.geracoes}/>
          </div>
        )}

        {/* ── Perfis já deployados no Futures ────────────────────────────── */}
        {deployed.length>0&&(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:13,fontWeight:700,color:"var(--text-primary)"}}>🚀 Perfis IA no Futures</span>
              <span style={{fontSize:11,padding:"2px 8px",borderRadius:8,background:"rgba(124,58,237,0.12)",color:"#a78bfa",fontWeight:700}}>{deployed.length}</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(380px,1fr))",gap:10}}>
              {deployed.map(p=><DeployedCard key={p.id} p={p} onRemove={()=>removeDeployed(p.id)}/>)}
            </div>
          </div>
        )}

      </div>
    </>
  );
}
