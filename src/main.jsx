import React, {useEffect,useMemo,useRef,useState} from "react";
import {createRoot} from "react-dom/client";
import {DndContext,DragOverlay,useDraggable,useDroppable,pointerWithin,rectIntersection} from "@dnd-kit/core";
import {Users,ClipboardCheck,BarChart3,Wand2,GripVertical,Plus,Trash2,Save,ArrowLeft,ChevronDown,ChevronRight,Presentation,Printer,Maximize2,UserRound,Building2,NotebookPen,MessageSquare,CalendarDays,Clock3,Store,LayoutGrid} from "lucide-react";
import {api,getAdminSession,setAdminSession} from "./api";
import {liveSocket} from "./live";
import "./styles.css";

const DEFAULT_OFFICE="MADHAV MEHTA";
const OFFICE_OPTIONS=[
 {id:"madhav-mehta",name:"MADHAV MEHTA",label:"Madhav Mehta"},
 {id:"canyon-tuman",name:"CANYON TUMAN",label:"Canyon Tuman"},
 {id:"collin-willhelm",name:"COLLIN WILLHELM",label:"Collin Willhelm"},
 {id:"keasel-broom",name:"KEASEL BROOM",label:"Keasel Broom"},
];
const officeLabel=value=>OFFICE_OPTIONS.find(office=>office.name===value)?.label||value;
const officeOwnerLastName=value=>{const parts=officeLabel(value).trim().split(/\s+/);return parts.at(-1)||"Office"};
const getStoredOffice=()=>{try{const saved=localStorage.getItem("atmo-selected-office");return OFFICE_OPTIONS.some(office=>office.name===saved)?saved:DEFAULT_OFFICE}catch{return DEFAULT_OFFICE}};
const blankAgent={repName:"",office:DEFAULT_OFFICE,repType:"New Rep",team:"",teamLead:"",trainer:"",attendance:"in",experienceLevel:"Newer"};
const TEAM_COLORS=["#d9eaf7","#e2f0d9","#fff2cc","#fce4d6","#e4dfec","#ddebf7","#eadcf8","#ddefef"];
const GAP_STYLES={
 "Talk → Stop":{bg:"#C6E0B4",text:"#274E13"},
 "Stop → Zip":{bg:"#9DC3E6",text:"#1F4E78"},
 "Zip → Presentation":{bg:"#FFD966",text:"#7F6000"},
 "Presentation → Info":{bg:"#F4B183",text:"#843C0C"},
 "Info → Close":{bg:"#DDEBF7",text:"#1F4E78"},
 "On Target":{bg:"#A9D18E",text:"#274E13"},
 "No Data":{bg:"#D9D9D9",text:"#555555"},
 "Unassigned Focus":{bg:"#D9D9D9",text:"#555555"},
};
const GAP_ORDER=["Talk → Stop","Stop → Zip","Zip → Presentation","Presentation → Info","Info → Close","On Target","No Data","Unassigned Focus"];
const normalizeGap=value=>{const v=String(value||"").trim().replace(/->/g,"→");if(/talk/i.test(v)&&/stop/i.test(v))return "Talk → Stop";if(/stop/i.test(v)&&/zip/i.test(v))return "Stop → Zip";if(/zip/i.test(v)&&( /pres/i.test(v)||/presentation/i.test(v)))return "Zip → Presentation";if((/pres/i.test(v)||/presentation/i.test(v))&&/info/i.test(v))return "Presentation → Info";if(/info/i.test(v)&&/close/i.test(v))return "Info → Close";if(/target/i.test(v))return "On Target";if(!v||/no data/i.test(v))return "No Data";return v};
const gapStyle=value=>GAP_STYLES[normalizeGap(value)]||GAP_STYLES["No Data"];
const stat=(a,...keys)=>{for(const key of keys){const value=a.stats?.[key];if(value!==undefined&&value!==null&&String(value).trim()!=="")return value}return "—"};
const primaryGap=a=>normalizeGap(stat(a,"Biggest Gap Stage","Primary Gap","Gap","focus","Current Week Gap","Last Worked Gap"));
const periodGap=(a,period)=>normalizeGap(period==="lastDay"?stat(a,"Last Worked Gap","Current Daily Gap","Last Day Gap","Daily Gap","Current Gap"):period==="currentWeek"?stat(a,"Current Week Gap","Current Weekly Gap","This Week Gap"):stat(a,"Last Week Gap","Previous Week Gap"));
const dailyGap=a=>periodGap(a,"lastDay");
const currentWeekGap=a=>periodGap(a,"currentWeek");
const lastWeekGap=a=>periodGap(a,"lastWeek");
const lastWorked=a=>stat(a,"Last Worked Date","Last Worked","Last Day Worked","Days Inactive");
const lastRecordedWorkDay=a=>a.performance?.lastWorked?.recordedDate||stat(a,"Last Worked Date","Last Worked","Last Day Worked");
const safeTeam=a=>a.team||"Unassigned";
const colorMap=items=>Object.fromEntries([...new Set(items)].sort().map((x,i)=>[x,TEAM_COLORS[i%TEAM_COLORS.length]]));
const gapRank=value=>{const i=GAP_ORDER.indexOf(normalizeGap(value));return i<0?999:i};
const PERIOD_LABELS={lastWorked:"Last worked day",currentWeek:"Current week",lastWeek:"Last week"};
const enrichGroups=(groups,agents)=>{const byKey=new Map(agents.map(a=>[a.repKey,a]));return (groups||[]).map(g=>({...g,members:(g.members||[]).map(m=>({...byKey.get(m.repKey),...m}))}))};
const FUNNEL=[
 {key:"talks",label:"Talks"},{key:"stops",label:"Stops"},{key:"zips",label:"Zips"},{key:"presentations",label:"Presentations"},{key:"info",label:"Info"},{key:"close",label:"Closes"}
];
const RATES=[
 {key:"talkToStop",label:"Talk → Stop"},{key:"stopToZip",label:"Stop → Zip"},{key:"zipToPresentation",label:"Zip → Presentation"},{key:"presentationToInfo",label:"Presentation → Info"},{key:"infoToClose",label:"Info → Close"}
];
const RATE_TARGETS={talkToStop:.5,stopToZip:.3,zipToPresentation:1,presentationToInfo:.3,infoToClose:1};
const rateNumber=value=>{if(value===undefined||value===null||value==="—"||value==="")return null;const text=String(value).trim();const n=Number(text.replace("%",""));if(!Number.isFinite(n))return null;return text.includes("%")||n>1?n/100:n};
const onTargetRate=(key,value)=>{const n=rateNumber(value);return n!==null&&n>=(RATE_TARGETS[key]??Infinity)};
const repExcellence=rep=>{const scored=RATES.map((item,index)=>{const values=Object.keys(PERIOD_LABELS).map(period=>rateNumber(rep.performance?.[period]?.rates?.[item.key])).filter(v=>v!==null);if(!values.length)return null;const avg=values.reduce((a,b)=>a+b,0)/values.length;const target=RATE_TARGETS[item.key]||1;return {...item,avg,ratio:avg/target,index};}).filter(Boolean).sort((a,b)=>b.ratio-a.ratio||a.index-b.index);return scored[0]||null};
const aggregatePeriod=(agents,period)=>{
 const counts={talks:0,stops:0,zips:0,presentations:0,info:0,close:0,electric:0,electricPartial:0};
 (agents||[]).forEach(agent=>{const source=agent.performance?.[period]?.counts||{};Object.keys(counts).forEach(key=>{counts[key]+=Number(source[key])||0})});
 const calc=(top,bottom)=>bottom>0?top/bottom:null;
 const rateValues={talkToStop:calc(counts.stops,counts.talks),stopToZip:calc(counts.zips,counts.stops),zipToPresentation:calc(counts.presentations,counts.zips),presentationToInfo:calc(counts.info,counts.presentations),infoToClose:calc(counts.close,counts.info)};
 const rates=Object.fromEntries(Object.entries(rateValues).map(([key,value])=>[key,value===null?"—":`${(value*100).toFixed(1)}%`]));
 const scored=RATES.map((item,index)=>{const value=rateValues[item.key];const target=RATE_TARGETS[item.key];return value===null?null:{...item,index,value,target,shortfall:Math.max(0,target-value)}}).filter(Boolean);
 const below=scored.filter(item=>item.shortfall>0).sort((a,b)=>b.shortfall-a.shortfall||a.index-b.index);
 return {counts,rates,gap:below[0]?.label||(scored.length?"On Target":"No Data")};
};
const campaignPeriods=agents=>Object.fromEntries(Object.keys(PERIOD_LABELS).map(period=>[period,aggregatePeriod(agents,period)]));
const makeRandomUser=()=>`User${Math.floor(1000+Math.random()*9000)}`;
const getStoredUser=()=>{
 try{
  const saved=localStorage.getItem("atmo-user-name");
  if(saved&&saved.trim())return saved.trim();
  const generated=makeRandomUser();
  localStorage.setItem("atmo-user-name",generated);
  return generated;
 }catch{return makeRandomUser()}
};
const activityFromGroups=groups=>{
 const activities=(groups||[]).map(g=>g?._activity).filter(Boolean).sort((a,b)=>String(b.at||"").localeCompare(String(a.at||"")));
 return activities[0]||null;
};
const withActivity=(group,actor,action)=>({...group,_activity:{actor,action,at:new Date().toISOString()}});
const timeAgo=iso=>{
 if(!iso)return "";
 const ms=Math.max(0,Date.now()-new Date(iso).getTime());
 const sec=Math.floor(ms/1000);
 if(sec<5)return "just now";
 if(sec<60)return `${sec}s ago`;
 const min=Math.floor(sec/60);
 return min<60?`${min}m ago`:`${Math.floor(min/60)}h ago`;
};
const easternToday=()=>{
 const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
 const part=type=>parts.find(item=>item.type===type)?.value||"";
 return `${part("year")}-${part("month")}-${part("day")}`;
};
const ADMIN_ROLE_TEST=value=>{const role=String(value||"").toLowerCase();return role==="trainer"||role==="manager"||role==="admin"||role==="owner"||role.includes("trainer")||role.includes("manager")||role.includes("director")};
const PUBLIC_VIEWS=new Set(["home","stats","campaign","suggestions","numbers","current","work","stores"]);

const HOME_SECTIONS={
 performance:{label:"Performance",description:"Numbers, trends, and campaign results"},
 coaching:{label:"Coaching",description:"People, notes, and program improvements"},
 matchups:{label:"Matchups",description:"Coaching groups and store pairings"},
};
const VIEW_TITLES={attendance:"Attendance & Agents",stats:"Team Gaps / Member Stats",campaign:"Campaign",notes:"Field Notes",suggestions:"Program Suggestions",numbers:"Manual Numbers",tracking:"Numbers Tracking",auto:"Auto Generate",manual:"Create Matchups",current:"Current Matchups",final:"Final Matchups",work:"Work Matchups",stores:"Store Matchups"};



function App(){
 const [view,setView]=useState("home"),[agents,setAgents]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const [selectedOffice,setSelectedOffice]=useState(()=>getStoredOffice());
 const [homeSection,setHomeSection]=useState("performance");
 const [groups,setGroups]=useState([]);
 const [finalGroups,setFinalGroups]=useState([]);
 const [userName,setUserName]=useState(()=>getStoredUser());
 const [adminSession,setAdminSessionState]=useState(()=>getAdminSession());
 const [showAdminLogin,setShowAdminLogin]=useState(false);
 const isAdmin=Boolean(adminSession?.token);
 const chooseOffice=value=>{const next=OFFICE_OPTIONS.some(office=>office.name===value)?value:DEFAULT_OFFICE;setSelectedOffice(next);try{localStorage.setItem("atmo-selected-office",next)}catch{}if(next!==DEFAULT_OFFICE&&(view==="work"||view==="stores"))setView("home")};
 const saveUserName=value=>{
  const typed=String(value||"").trim();
  const next=typed||makeRandomUser();
  setUserName(next);
  try{localStorage.setItem("atmo-user-name",next)}catch{}
 };
 const hydrated=useRef(false),suppressDraftSave=useRef(false),suppressSocketEmit=useRef(false),localDraftDirty=useRef(false),draftSaveInFlight=useRef(false);
 const [remoteDrags,setRemoteDrags]=useState({});
 const load=async()=>{setLoading(true);setError("");hydrated.current=false;try{const d=await api.bootstrap(selectedOffice);const nextAgents=Array.isArray(d.agents)?d.agents:[];setAgents(nextAgents);suppressDraftSave.current=true;setGroups(enrichGroups(d.draft?.groups||[],nextAgents));hydrated.current=true;if(d.meta?.degraded)setError("Live sheet refresh had a temporary issue. Showing the last known-good data.")}catch(e){setError(e.message)}finally{setLoading(false)}};
 useEffect(()=>{load()},[selectedOffice]);
 useEffect(()=>{document.title=`${officeOwnerLastName(selectedOffice)} | ATMO Matchups`},[selectedOffice]);
 useEffect(()=>{
  if(!adminSession?.token)return;
  let alive=true;
  api.adminMe().then(result=>{if(alive)setAdminSessionState(current=>current?{...current,user:result.user}:current)}).catch(()=>{if(alive){setAdminSession(null);setAdminSessionState(null);setView("home")}});
  return()=>{alive=false};
 },[]);
 useEffect(()=>{if(!isAdmin&&!PUBLIC_VIEWS.has(view))setView("home")},[isAdmin,view]);
 useEffect(()=>{
  if(!isAdmin){
   suppressDraftSave.current=false;
   suppressSocketEmit.current=false;
   localDraftDirty.current=false;
   return;
  }
  if(!hydrated.current||suppressDraftSave.current){
   suppressDraftSave.current=false;
   suppressSocketEmit.current=false;
   localDraftDirty.current=false;
   return;
  }

  localDraftDirty.current=true;

  // Broadcast structural changes immediately to every connected browser.
  if(!suppressSocketEmit.current){
   liveSocket.emit("matchups:state",{groups,office:selectedOffice,actor:userName,action:"updated the live matchup board",at:new Date().toISOString()});
  }else{
   suppressSocketEmit.current=false;
  }

  // Persist the completed state separately; high-frequency drag motion never hits Sheets.
  const timer=setTimeout(async()=>{
   draftSaveInFlight.current=true;
   try{
    await api.saveDraftMatchups(new Date().toISOString().slice(0,10),groups,userName,"updated the live matchup board",selectedOffice);
    localDraftDirty.current=false;
   }catch(error){console.error(error)}finally{draftSaveInFlight.current=false}
  },180);

  return()=>clearTimeout(timer);
 },[groups,userName,isAdmin,selectedOffice]);
 useEffect(()=>{
  const onState=payload=>{
   if((payload?.office||DEFAULT_OFFICE)!==selectedOffice)return;
   const incoming=enrichGroups(payload?.groups||[],agents);
   setGroups(current=>{
    if(JSON.stringify(current)===JSON.stringify(incoming))return current;
    suppressDraftSave.current=true;
    suppressSocketEmit.current=true;
    localDraftDirty.current=false;
    return incoming;
   });
  };
  const onDragStart=payload=>setRemoteDrags(current=>({...current,[payload.socketId]:payload}));
  const onDragMove=payload=>setRemoteDrags(current=>({...current,[payload.socketId]:{...(current[payload.socketId]||{}),...payload}}));
  const onDragEnd=({socketId})=>setRemoteDrags(current=>{const next={...current};delete next[socketId];return next});
  const onAgentUpdate=agent=>{if(agent?.repKey)setAgents(current=>current.map(item=>item.repKey===agent.repKey?{...item,...agent}:item))};

  liveSocket.auth={actor:userName,token:adminSession?.token||""};
  if(liveSocket.connected)liveSocket.disconnect();
  liveSocket.connect();
  liveSocket.emit("presence:join",{actor:userName});
  liveSocket.on("matchups:state",onState);
  liveSocket.on("drag:start",onDragStart);
  liveSocket.on("drag:move",onDragMove);
  liveSocket.on("drag:end",onDragEnd);
  liveSocket.on("agents:update",onAgentUpdate);

  // Slow REST fallback only for reconnect/recovery; Socket.IO handles live updates.
  const fallback=setInterval(async()=>{
   if(localDraftDirty.current||draftSaveInFlight.current||!document.hasFocus())return;
   try{
    const d=await api.getDraftMatchups(selectedOffice);
    const incoming=enrichGroups(d.groups||[],agents);
    setGroups(current=>{
     if(JSON.stringify(current)===JSON.stringify(incoming))return current;
     suppressDraftSave.current=true;
     suppressSocketEmit.current=true;
     return incoming;
    });
   }catch{}
  },10000);

  return()=>{
   clearInterval(fallback);
   liveSocket.off("matchups:state",onState);
   liveSocket.off("drag:start",onDragStart);
   liveSocket.off("drag:move",onDragMove);
   liveSocket.off("drag:end",onDragEnd);
   liveSocket.off("agents:update",onAgentUpdate);
  };
 },[agents,userName,adminSession?.token,selectedOffice]);
 useEffect(()=>{if(view!=="final"||!isAdmin)return;let alive=true;const refresh=async()=>{try{const d=await api.getFinalMatchups(selectedOffice);if(alive)setFinalGroups(d.groups||[])}catch(e){if(alive)setError(e.message)}};refresh();const id=setInterval(refresh,5000);return()=>{alive=false;clearInterval(id)}},[view,isAdmin,selectedOffice]);
 const content={attendance:<Attendance agents={agents} setAgents={setAgents} reload={load} office={selectedOffice}/>,stats:<Stats agents={agents}/>,campaign:<Campaign agents={agents}/>,notes:<FieldNotes agents={agents} author={userName} office={selectedOffice}/>,suggestions:<Suggestions author={userName}/>,numbers:<ManualNumbers agents={agents} author={userName} refresh={load} office={selectedOffice}/>,tracking:<NumbersTracking office={selectedOffice}/>,auto:<Auto groups={groups} setGroups={setGroups} goManual={()=>setView("manual")} office={selectedOffice}/>,manual:<Manual agents={agents} groups={groups} setGroups={setGroups} actorName={userName} remoteDrags={remoteDrags} office={selectedOffice}/>,current:<CurrentMatchups groups={groups} goEdit={()=>setView("manual")} readOnly={!isAdmin}/>,final:<CurrentMatchups groups={finalGroups} readOnly/>,work:<WorkMatchups isAdmin={isAdmin} agents={agents} actorName={userName} openStores={()=>setView("stores")}/>,stores:<StoreMatchups isAdmin={isAdmin} actorName={userName}/>,training:<TrainingWatch/>}[view];
 const loginAdmin=async({repKey,password})=>{const session=await api.adminLogin({repKey,password});setAdminSession(session);setAdminSessionState(session);setShowAdminLogin(false);if(session?.user?.repName)saveUserName(session.user.repName)};
 const logoutAdmin=()=>{setAdminSession(null);setAdminSessionState(null);setView("home")};
 const isMehta=selectedOffice===DEFAULT_OFFICE;
 if(view!=="home") return <><Shell title={`${officeOwnerLastName(selectedOffice)} · ${VIEW_TITLES[view]}`} back={()=>setView("home")} userName={userName} onUserNameChange={saveUserName} isAdmin={isAdmin} adminUser={adminSession?.user} onAdminLogin={()=>setShowAdminLogin(true)} onAdminLogout={logoutAdmin} selectedOffice={selectedOffice} onOfficeChange={chooseOffice}>{loading?<p>Loading {officeLabel(selectedOffice)}…</p>:error?<ErrorBox text={error}/>:content}</Shell>{showAdminLogin&&<AdminLogin agents={agents} onClose={()=>setShowAdminLogin(false)} onLogin={loginAdmin}/>}</>;
 const homeCards={
  performance:<><HomeCard icon={<BarChart3/>} title="Team Gaps / Member Stats" text="Review color-coded team sections and coaching trends." onClick={()=>setView("stats")}/><HomeCard icon={<Building2/>} title="Campaign" text="See the office gaps, then drill into each team’s combined numbers and gaps." onClick={()=>setView("campaign")}/><HomeCard icon={<Plus/>} title="Manual Numbers" text="Record a rep’s daily field numbers when they are not using WorkMyT." onClick={()=>setView("numbers")}/>{isAdmin&&<HomeCard icon={<Clock3/>} title="Numbers Tracking" text="Track how recently reps recorded numbers and review rep or team weekly averages." onClick={()=>setView("tracking")}/>}</>,
  coaching:<>{isAdmin&&<HomeCard icon={<ClipboardCheck/>} title="Attendance" text="Mark attendance, manage agents, and assign each trainee to a trainer." onClick={()=>setView("attendance")}/>} {isAdmin&&<HomeCard icon={<NotebookPen/>} title="Field Notes" text="Leave dated coaching notes for reps after working with them in the field." onClick={()=>setView("notes")}/>}<HomeCard icon={<MessageSquare/>} title="Program Suggestions" text="Suggest changes, fixes, and new ideas for the matchup program." onClick={()=>setView("suggestions")}/></>,
  matchups:<>{isAdmin&&<HomeCard icon={<Wand2/>} title="Auto Generate" text="Generate gap-focused coaching groups and leaders." onClick={()=>setView("auto")}/>} {isAdmin&&<HomeCard icon={<Users/>} title="Create Matchups" text="Organize by team or gap, then drag reps into trainer-led groups." onClick={()=>setView("manual")}/>}<HomeCard icon={<Presentation/>} title="Current Matchups" text="Open the shared live coaching matchup board." onClick={()=>setView("current")}/>{isAdmin&&<HomeCard icon={<Save/>} title="Final Matchups" text="View the final coaching matchups posted to Google Sheets." onClick={()=>setView("final")}/>} {isMehta&&<><HomeCard icon={<Users/>} title="Work Matchups" text="Build trainer-led work teams; assign stores on the Store Matchups page." onClick={()=>setView("work")}/><HomeCard icon={<Store/>} title="Store Matchups" text="Fine-tune every rep independently on the live store sheet." onClick={()=>setView("stores")}/></>}</>,
 };
 return <><Shell title={officeOwnerLastName(selectedOffice)} userName={userName} onUserNameChange={saveUserName} isAdmin={isAdmin} adminUser={adminSession?.user} onAdminLogin={()=>setShowAdminLogin(true)} onAdminLogout={logoutAdmin} selectedOffice={selectedOffice} onOfficeChange={chooseOffice}><div className="hero"><p>{officeLabel(selectedOffice)} · {isAdmin?"Admin workspace":"Rep workspace"}</p><h2>{isAdmin?"Build better matchups, faster.":"Performance, coaching, and today’s matchups."}</h2><span>{isAdmin?"Full trainer access":"Standard rep access"}</span></div><nav className="home-tabs" aria-label="Program sections">{Object.entries(HOME_SECTIONS).map(([key,item])=><button key={key} className={homeSection===key?"active":""} onClick={()=>setHomeSection(key)}><LayoutGrid size={19}/><span><b>{item.label}</b><small>{item.description}</small></span></button>)}</nav><div className="cards">{homeCards[homeSection]}</div></Shell>{showAdminLogin&&<AdminLogin agents={agents} onClose={()=>setShowAdminLogin(false)} onLogin={loginAdmin}/>}</>;
}
function Shell({title,back,children,userName,onUserNameChange,isAdmin,adminUser,onAdminLogin,onAdminLogout,selectedOffice,onOfficeChange}){const [draftName,setDraftName]=useState(userName||"");useEffect(()=>setDraftName(userName||""),[userName]);return <div className="app"><header>{back&&<button className="iconbtn" onClick={back}><ArrowLeft/></button>}<div className="shell-title"><small>FIELD DAY OPERATIONS</small><h1>{title}</h1></div><div className="shell-spacer"/>{onUserNameChange&&<label className="user-name-control"><UserRound size={16}/><span>Your name</span><input value={draftName} placeholder={userName||"User1234"} onChange={e=>setDraftName(e.target.value)} onBlur={()=>onUserNameChange(draftName)} onKeyDown={e=>{if(e.key==="Enter"){e.currentTarget.blur()}}}/><small>Shown on submissions and live actions</small></label>}<div className="admin-access">{isAdmin?<><div className="admin-badge"><small>ADMIN</small><b>{adminUser?.repName||"Trainer"}</b></div><button className="admin-login-btn" onClick={onAdminLogout}>Log out</button></>:<button className="admin-login-btn" onClick={onAdminLogin}>Admin login</button>}</div></header><main><section className="office-switcher-bar" aria-label="Office selection"><div><Building2 size={22}/><span><small>SELECT OFFICE</small><strong>{officeLabel(selectedOffice||DEFAULT_OFFICE)}</strong></span></div><label><span>Office owner</span><select value={selectedOffice||DEFAULT_OFFICE} onChange={event=>onOfficeChange?.(event.target.value)}>{OFFICE_OPTIONS.map(office=><option key={office.id} value={office.name}>{office.label}</option>)}</select></label><p>{selectedOffice===DEFAULT_OFFICE?"Store and work matchup tools are available for this office.":`Showing only ${officeLabel(selectedOffice)} office data.`}</p></section>{children}</main></div>}

function AdminLogin({agents,onClose,onLogin}){const admins=useMemo(()=>agents.filter(a=>ADMIN_ROLE_TEST(a.repType)).sort((a,b)=>a.repName.localeCompare(b.repName)),[agents]);const [repKey,setRepKey]=useState(admins[0]?.repKey||"");const [password,setPassword]=useState("");const [busy,setBusy]=useState(false);const [error,setError]=useState("");useEffect(()=>{if(!repKey&&admins[0])setRepKey(admins[0].repKey)},[admins,repKey]);const submit=async e=>{e.preventDefault();setError("");setBusy(true);try{await onLogin({repKey,password})}catch(err){setError(err.message||"Could not log in") }finally{setBusy(false)}};return <div className="admin-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className="admin-modal" role="dialog" aria-modal="true" aria-label="Admin login"><div className="admin-modal-head"><div><small>TRAINERS & ABOVE</small><h2>Admin login</h2><p>Admin access unlocks attendance, field notes, matchup generation, editing, and final matchups.</p></div><button className="iconbtn admin-close" onClick={onClose}>×</button></div><form onSubmit={submit}><label>Admin<select value={repKey} onChange={e=>setRepKey(e.target.value)} required><option value="" disabled>Select trainer or manager</option>{admins.map(a=><option key={a.repKey} value={a.repKey}>{a.repName} · {a.repType}</option>)}</select></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required/></label>{error&&<ErrorBox text={error}/>}<button className="primary" disabled={busy||!repKey}>{busy?"Logging in…":"Log in as admin"}</button></form></section></div>}

function HomeCard({icon,title,text,onClick}){return <button className="homecard" onClick={onClick}><span className="cardicon">{icon}</span><h3>{title}</h3><p>{text}</p><b>Open →</b></button>}
function ErrorBox({text}){return <div className="error">{text}</div>}

function CurrentMatchups({groups,goEdit,readOnly=false}){
 const activity=activityFromGroups(groups);
 const [,setTick]=useState(0);
 useEffect(()=>{const id=setInterval(()=>setTick(x=>x+1),1000);return()=>clearInterval(id)},[]);
 const dated=new Intl.DateTimeFormat("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"}).format(new Date());
 const teamNames=groups.map(g=>g.team||g.members?.[0]?.team||"Mixed Team");
 const colors=colorMap(teamNames);
 const total=groups.reduce((sum,g)=>sum+(g.members?.length||0),0);
 const printView=()=>window.print();
 const fullscreen=()=>{if(!document.fullscreenElement)document.documentElement.requestFullscreen?.();else document.exitFullscreen?.()};
 if(!groups.length)return <div className="current-empty"><Presentation size={52}/><h2>No current matchups yet</h2><p>Generate or create today’s groups, then they will appear here in a room-ready layout.</p>{!readOnly&&<button className="primary" onClick={goEdit}>Create matchups</button>}</div>;
 return <div className="current-matchups-view">
  <div className="room-header"><div><small>TODAY’S MATCHUPS</small><h2>{dated}</h2><p>{groups.length} groups · {total} reps</p></div><div className="room-actions">{!readOnly&&<button className="secondary" onClick={goEdit}>Edit groups</button>}<button className="secondary" onClick={printView}><Printer size={17}/> Print</button><button className="primary" onClick={fullscreen}><Maximize2 size={17}/> Full screen</button></div></div>
  <div className="room-groups">{groups.map((group,index)=>{const team=group.team||group.members?.[0]?.team||"Mixed Team";const color=colors[team];return <article className="room-group" key={group.id||index} style={{"--room-team":color}}>
   <div className="room-group-number">{index+1}</div>
   <div className="room-group-heading"><div><span className="room-team-pill">{team}</span><h3>{group.name||`Group ${index+1}`}</h3></div><div className="room-coach"><small>TRAINER / COACH</small><strong>{group.coach||"Not assigned"}</strong></div></div>
   {group.focus&&<div className="room-focus"><small>COACHING FOCUS</small><strong>{normalizeGap(group.focus)}</strong></div>}
   <ol className="room-member-list">{(group.members||[]).map((member,memberIndex)=><li key={member.repKey||memberIndex}><span>{memberIndex+1}</span><strong>{member.repName}</strong><small>{safeTeam(member)}</small></li>)}</ol>
   {!group.members?.length&&<div className="room-no-members">No reps assigned</div>}
  </article>})}</div>
 </div>;
}

function Attendance({agents,setAgents,reload,office=DEFAULT_OFFICE}){
  const teams=useMemo(
    ()=>[...new Set(agents.map(safeTeam))].sort(),
    [agents]
  );

  const leaders=useMemo(
    ()=>agents
      .filter(a=>["leader","trainer","manager"].includes(
        (a.repType||"").toLowerCase()
      ))
      .sort((a,b)=>a.repName.localeCompare(b.repName)),
    [agents]
  );

  const trainers=useMemo(
    ()=>agents
      .filter(a=>["trainer","manager"].includes((a.repType||"").toLowerCase()))
      .sort((a,b)=>a.repName.localeCompare(b.repName)),
    [agents]
  );

  const roles=[
    "",
    "New Rep",
    "Leader",
    "Trainer",
    "Manager",
    "Absent"
  ];

  const experienceLevels=["Newer","Experienced","Vetted"];

  const [team,setTeam]=useState(teams[0]||"Unassigned");
  const [draft,setDraft]=useState({...blankAgent,office});
  const [saving,setSaving]=useState("");
  const [teamNameDraft,setTeamNameDraft]=useState("");
  const [teamLeadDraft,setTeamLeadDraft]=useState("");
  const [teamSaving,setTeamSaving]=useState(false);
  const [error,setError]=useState("");

  useEffect(()=>{
    if(!teams.includes(team)){
      setTeam(teams[0]||"Unassigned");
    }
  },[teams,team]);

  useEffect(()=>setDraft(current=>({...blankAgent,office,team:current.team||""})),[office]);

  const members=agents.filter(a=>safeTeam(a)===team);

  useEffect(()=>{
    setTeamNameDraft(team==="Unassigned"?"":team);

    const currentLead=
      members.find(a=>a.teamLead)?.teamLead||"";

    setTeamLeadDraft(currentLead);
  },[team]);

  const update=async(agent,patch)=>{
    setSaving(agent.repKey);
    setError("");

    const previousAgent={...agent};

    // Update UI immediately without doing a full reload.
    setAgents(current=>
      current.map(a=>
        a.repKey===agent.repKey
          ? {...a,...patch}
          : a
      )
    );

    try{
      await api.updateAgent(agent.repKey,patch);
    }catch(err){
      // Put the old values back if the API save fails.
      setAgents(current=>
        current.map(a=>
          a.repKey===agent.repKey
            ? previousAgent
            : a
        )
      );

      setError(err.message||"Could not save agent.");
    }finally{
      setSaving("");
    }
  };

  const saveTeamInfo=async()=>{
    if(!team||team==="Unassigned") return;

    const oldTeam=team;
    const newTeam=teamNameDraft.trim()||oldTeam;

    setTeamSaving(true);
    setError("");

    const affectedAgents=agents.filter(
      a=>safeTeam(a)===oldTeam
    );

    // Save each member of this team.
    try{
      for(const agent of affectedAgents){
        await api.updateAgent(agent.repKey,{
          team:newTeam,
          teamLead:teamLeadDraft
        });
      }

      // Update everything locally instead of reload().
      setAgents(current=>
        current.map(agent=>{
          if(safeTeam(agent)!==oldTeam){
            return agent;
          }

          return {
            ...agent,
            team:newTeam,
            teamLead:teamLeadDraft
          };
        })
      );

      setTeam(newTeam);
    }catch(err){
      setError(err.message||"Could not update team.");
    }finally{
      setTeamSaving(false);
    }
  };

  const add=async(e)=>{
    e.preventDefault();

    setError("");

    try{
      const created=await api.addAgent({
        ...draft,
        team:draft.team||(
          team==="Unassigned"?"":team
        )
      });

      // If API returns the created agent, append it locally.
      if(created?.repKey){
        setAgents(current=>[
          ...current,
          created
        ]);
      }else{
        // Keep reload for adding only if your backend
        // doesn't return the newly-created agent.
        await reload();
      }

      setDraft({
        ...blankAgent,
        office,
        team:team==="Unassigned"?"":team
      });
    }catch(err){
      setError(err.message||"Could not add agent.");
    }
  };

  const remove=async(agent)=>{
    if(!confirm(`Remove ${agent.repName}?`)){
      return;
    }

    setError("");

    try{
      await api.deleteAgent(agent.repKey);

      setAgents(current=>
        current.filter(
          a=>a.repKey!==agent.repKey
        )
      );
    }catch(err){
      setError(err.message||"Could not remove agent.");
    }
  };

  return <>
    {error&&<ErrorBox text={error}/>}

    <div className="toolbar">
      <label>
        Choose team
        <select
          value={team}
          onChange={e=>setTeam(e.target.value)}
        >
          {teams.map(t=>
            <option key={t}>{t}</option>
          )}
        </select>
      </label>

      <span>{members.length} members</span>
    </div>

    {team!=="Unassigned"&&
      <div className="addform">
        <h3>Edit team info</h3>

        <div className="formgrid">
          <label>
            Team name
            <input
              value={teamNameDraft}
              onChange={e=>
                setTeamNameDraft(e.target.value)
              }
              placeholder="Team name"
            />
          </label>

          <label>
            Team lead
            <select
              value={teamLeadDraft}
              onChange={e=>
                setTeamLeadDraft(e.target.value)
              }
            >
              <option value="">
                No team lead
              </option>

              {leaders.map(l=>
                <option
                  key={l.repKey}
                  value={l.repName}
                >
                  {l.repName}
                </option>
              )}
            </select>
          </label>

          <button
            type="button"
            className="primary"
            onClick={saveTeamInfo}
            disabled={teamSaving}
          >
            <Save size={17}/>
            {teamSaving
              ?"Saving…"
              :"Save team info"}
          </button>
        </div>
      </div>
    }

    <div className="memberlist">
      {members.map(a=>
        <div
          className="member"
          key={a.repKey}
        >
          <div>
            <strong>{a.repName}</strong>
            <small>
              {a.repType||"No role"}
            </small>
          </div>

          <div className="rowactions">
            <button
              className={
                a.attendance==="in"
                  ?"active"
                  :""
              }
              disabled={saving===a.repKey}
              onClick={()=>
                update(a,{
                  attendance:"in"
                })
              }
            >
              In
            </button>

            <button
              className={
                a.attendance!=="in"
                  ?"danger active"
                  :"danger"
              }
              disabled={saving===a.repKey}
              onClick={()=>
                update(a,{
                  attendance:"absent"
                })
              }
            >
              Absent
            </button>

            <label className="compactlabel">
              Role
              <select
                value={a.repType||""}
                disabled={saving===a.repKey}
                onChange={e=>
                  update(a,{
                    repType:e.target.value
                  })
                }
              >
                {roles.map(role=>
                  <option
                    key={role||"none"}
                    value={role}
                  >
                    {role||"No role"}
                  </option>
                )}
              </select>
            </label>

            {(a.repType||"").toLowerCase()==="leader"&&
              <label className="compactlabel">
                Leadership readiness
                <select
                  value={a.experienceLevel||"Newer"}
                  disabled={saving===a.repKey}
                  onChange={e=>
                    update(a,{
                      experienceLevel:e.target.value
                    })
                  }
                >
                  {experienceLevels.map(level=>
                    <option key={level} value={level}>{level}</option>
                  )}
                </select>
              </label>
            }

            <label className="compactlabel">
              Team
              <select
                value={a.team||""}
                disabled={saving===a.repKey}
                onChange={e=>
                  update(a,{
                    team:e.target.value
                  })
                }
              >
                <option value="">
                  Unassigned
                </option>

                {teams
                  .filter(t=>t!=="Unassigned")
                  .map(t=>
                    <option
                      key={t}
                      value={t}
                    >
                      {t}
                    </option>
                  )}
              </select>
            </label>

            <label className="compactlabel">
              Team lead
              <select
                value={a.teamLead||""}
                disabled={saving===a.repKey}
                onChange={e=>
                  update(a,{
                    teamLead:e.target.value
                  })
                }
              >
                <option value="">
                  No team lead
                </option>

                {leaders
                  .filter(
                    l=>l.repKey!==a.repKey
                  )
                  .map(l=>
                    <option
                      key={l.repKey}
                      value={l.repName}
                    >
                      {l.repName}
                    </option>
                  )}
              </select>
            </label>

            <label className="compactlabel">
              Trainer
              <select
                value={a.trainer||""}
                disabled={saving===a.repKey}
                onChange={e=>update(a,{trainer:e.target.value})}
              >
                <option value="">No trainer</option>
                {trainers.filter(t=>t.repKey!==a.repKey).map(t=><option key={t.repKey} value={t.repName}>{t.repName}</option>)}
              </select>
            </label>

            <button
              className="ghost danger"
              onClick={()=>remove(a)}
            >
              <Trash2 size={16}/>
            </button>
          </div>
        </div>
      )}
    </div>

    <form
      className="addform"
      onSubmit={add}
    >
      <h3>Add agent</h3>

      <div className="formgrid">
        <input
          required
          placeholder="Rep name"
          value={draft.repName}
          onChange={e=>
            setDraft({
              ...draft,
              repName:e.target.value
            })
          }
        />

        <input
          placeholder="Office"
          value={officeLabel(office)}
          readOnly
        />

        <select
          value={draft.repType}
          onChange={e=>
            setDraft({
              ...draft,
              repType:e.target.value
            })
          }
        >
          {[
            "New Rep",
            "Leader",
            "Trainer",
            "Manager",
            "Absent"
          ].map(x=>
            <option key={x}>{x}</option>
          )}
        </select>

        {(draft.repType||"").toLowerCase()==="leader"&&
          <select
            aria-label="Leadership readiness"
            value={draft.experienceLevel||"Newer"}
            onChange={e=>
              setDraft({
                ...draft,
                experienceLevel:e.target.value
              })
            }
          >
            {experienceLevels.map(level=>
              <option key={level} value={level}>{level}</option>
            )}
          </select>
        }

        <input
          placeholder="Team"
          value={draft.team}
          onChange={e=>
            setDraft({
              ...draft,
              team:e.target.value
            })
          }
        />

        <select
          value={draft.teamLead}
          onChange={e=>
            setDraft({
              ...draft,
              teamLead:e.target.value
            })
          }
        >
          <option value="">
            No team lead
          </option>

          {leaders.map(l=>
            <option
              key={l.repKey}
              value={l.repName}
            >
              {l.repName}
            </option>
          )}
        </select>

        <select
          aria-label="Trainer"
          value={draft.trainer}
          onChange={e=>setDraft({...draft,trainer:e.target.value})}
        >
          <option value="">No trainer</option>
          {trainers.map(t=><option key={t.repKey} value={t.repName}>{t.repName}</option>)}
        </select>

        <button className="primary">
          <Plus size={17}/>
          Add agent
        </button>
      </div>
    </form>
  </>;
}


function ManualNumbers({agents,author,refresh,office=DEFAULT_OFFICE}){
 const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`};
 const empty=()=>({date:today(),repName:"",repKey:"",team:"",talks:"",stops:"",zips:"",presentations:"",info:"",electric:"",electricPartial:"",gas:""});
 const [form,setForm]=useState(empty);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setLocalError]=useState("");
 const selected=agents.find(a=>a.repKey===form.repKey)||agents.find(a=>String(a.repName||"").toLowerCase()===String(form.repName||"").trim().toLowerCase());
 const chooseRep=name=>{const match=agents.find(a=>String(a.repName||"").trim().toLowerCase()===String(name||"").trim().toLowerCase());setForm(v=>({...v,repName:name,repKey:match?.repKey||"",team:match?.team||""}))};
 const day=form.date?new Intl.DateTimeFormat("en-US",{weekday:"long"}).format(new Date(`${form.date}T12:00:00`)):"";
 const numberFields=[
  ["talks","Talks"],["stops","Stops"],["zips","Zips"],["presentations","Presentations"],["info","Info"],
  ["electric","Electric sales"],["electricPartial","Electric partial"],["gas","Gas sales"]
 ];
 const electricClose=(Number(form.electric)||0)+(Number(form.electricPartial)||0);
 const totalSales=electricClose+(Number(form.gas)||0);
 const submit=async e=>{e.preventDefault();setMessage("");setLocalError("");if(!form.repName.trim()){setLocalError("Choose or type a rep name.");return}setBusy(true);try{const saved=await api.saveManualNumbers({...form,office,enteredBy:author});setMessage(`Saved ${saved.repName} · ${saved.date}. WorkMyT will still take priority when WorkMyT data exists.`);setForm(v=>({...empty(),date:v.date}));await refresh?.()}catch(err){setLocalError(err.message||"Could not save numbers.")}finally{setBusy(false)}};
 return <div className="manual-numbers-view">
  <section className="manual-number-entry">
   <div className="manual-number-heading"><div><small>DAILY REP TRACKING</small><h2>Enter field numbers</h2><p>Use this when a rep records outside WorkMyT. Entries are saved by rep + date, and saving the same rep/date again updates that day instead of duplicating it.</p></div><Plus size={34}/></div>
   <form className="manual-number-form" onSubmit={submit}>
    <div className="manual-number-meta">
     <label>Date<input type="date" value={form.date} onChange={e=>setForm(v=>({...v,date:e.target.value}))}/></label>
     <div className="manual-number-day"><small>DAY</small><strong>{day||"—"}</strong></div>
     <label>Rep<input list="manual-number-reps" placeholder="Choose or type a rep" value={form.repName} onChange={e=>chooseRep(e.target.value)}/><datalist id="manual-number-reps">{agents.slice().sort((a,b)=>a.repName.localeCompare(b.repName)).map(a=><option key={a.repKey} value={a.repName}>{safeTeam(a)}</option>)}</datalist></label>
     <div className="manual-number-rep"><small>TEAM</small><strong>{selected?.team||form.team||"Manual / unlisted"}</strong></div>
    </div>
    <div className="manual-number-grid">{numberFields.map(([key,label])=><label key={key}><span>{label}</span><input type="number" min="0" step="1" inputMode="numeric" value={form[key]} placeholder="0" onChange={e=>setForm(v=>({...v,[key]:e.target.value}))}/></label>)}</div>
    <div className="manual-number-summary"><div><small>E + EP CLOSES</small><b>{electricClose}</b></div><div><small>TOTAL SALES incl. gas</small><b>{totalSales}</b></div><div className="manual-priority-note"><strong>WorkMyT first</strong><span>If this rep also has WorkMyT activity for the displayed period, the app uses WorkMyT instead of these manual totals to avoid double-counting.</span></div></div>
    {error&&<div className="error">{error}</div>}{message&&<div className="manual-number-success">{message}</div>}
    <div className="manual-number-submit"><span>Entered by <b>{author||"Unknown"}</b></span><button className="primary" disabled={busy}><Save size={17}/>{busy?"Saving…":"Save daily numbers"}</button></div>
   </form>
  </section>

 </div>;
}

function TrackingCounts({counts={}}){return <div className="tracking-counts"><span><small>Talks</small><b>{counts.talks??0}</b></span><span><small>Stops</small><b>{counts.stops??0}</b></span><span><small>Zips</small><b>{counts.zips??0}</b></span><span><small>Pres</small><b>{counts.presentations??0}</b></span><span><small>Info</small><b>{counts.info??0}</b></span><span><small>E</small><b>{counts.electric??0}</b></span><span><small>EP</small><b>{counts.electricPartial??0}</b></span></div>}
function NumbersTracking({office=DEFAULT_OFFICE}){
 const [data,setData]=useState(null),[mode,setMode]=useState("individual"),[team,setTeam]=useState("all"),[error,setError]=useState("");
 useEffect(()=>{let alive=true;setData(null);setError("");api.getNumbersTracking(office).then(d=>{if(alive)setData(d)}).catch(e=>{if(alive)setError(e.message)});return()=>{alive=false}},[office]);
 const reps=data?.reps||[];
 const teams=useMemo(()=>[...new Set(reps.map(r=>r.team||"Unassigned"))].sort(),[reps]);
 const visible=team==="all"?reps:reps.filter(r=>(r.team||"Unassigned")===team);
 const teamRows=useMemo(()=>teams.map(name=>{
  const members=reps.filter(r=>(r.team||"Unassigned")===name&&r.lastRecordedDate);
  const fields=["talks","stops","zips","presentations","info","electric","electricPartial"];
  const avg=Object.fromEntries(fields.map(field=>[field,members.length?Math.round((members.reduce((sum,r)=>sum+Number(r.latestCounts?.[field]||0),0)/members.length)*10)/10:0]));
  const avgDays=members.length?Math.round((members.reduce((sum,r)=>sum+Number(r.daysAgo||0),0)/members.length)*10)/10:null;
  const status=avgDays===null?"black":avgDays<=2?"green":avgDays<=5?"yellow":"black";
  return {name,members:members.length,avgDays,status,avg};
 }),[reps,teams]);
 if(error)return <ErrorBox text={error}/>;
 if(!data)return <p>Loading numbers tracking…</p>;
 return <div className="numbers-tracking-view"><section className="tracking-hero"><div><small>ADMIN · NUMBERS ACCOUNTABILITY</small><h2>Numbers tracking</h2><p>Green = recorded within 2 days, yellow = 3–5 days, black = 6+ days or no recorded numbers.</p></div><Clock3 size={34}/></section><div className="tracking-toolbar"><label>View<select value={mode} onChange={e=>setMode(e.target.value)}><option value="individual">Individual reps</option><option value="team">Team overall average</option></select></label>{mode==="individual"&&<label>Team<select value={team} onChange={e=>setTeam(e.target.value)}><option value="all">All teams</option>{teams.map(name=><option key={name}>{name}</option>)}</select></label>}<span>Current week: <b>{data.weekStart}</b> – <b>{data.weekEnd}</b></span></div>{mode==="individual"?<div className="tracking-rep-list">{visible.slice().sort((a,b)=>(b.daysAgo??999)-(a.daysAgo??999)||a.repName.localeCompare(b.repName)).map(rep=><article className={`tracking-rep tracking-${rep.status}`} key={rep.repKey}><header><div><strong>{rep.repName}</strong><small>{rep.team} · {rep.repType||"Rep"}</small></div><div className="tracking-recency"><b>{rep.lastRecordedDate||"No record"}</b><span>{rep.daysAgo===null?"No numbers":rep.daysAgo===0?"Today":`${rep.daysAgo} days ago`}</span></div></header><div className="tracking-section"><h4>Last day tracked <small>{rep.latestSource}</small></h4><TrackingCounts counts={rep.latestCounts}/></div><div className="tracking-section"><h4>Average of recorded days this week <small>{rep.weekRecordedDays} days recorded</small></h4><TrackingCounts counts={rep.weekAverage}/></div></article>)}</div>:<div className="tracking-team-grid">{teamRows.map(row=><article className={`tracking-team-card tracking-${row.status}`} key={row.name}><header><div><strong>{row.name}</strong><small>{row.members} reps with recorded numbers</small></div><span>{row.avgDays===null?"No records":`${row.avgDays} avg days since record`}</span></header><h4>Team average · each rep's last tracked day</h4><TrackingCounts counts={row.avg}/></article>)}</div>}</div>
}

function FieldNotes({agents,author,office=DEFAULT_OFFICE}){
 const today=()=>{
  const now=new Date();
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
  const get=t=>parts.find(p=>p.type===t)?.value||"";
  return `${get("year")}-${get("month")}-${get("day")}`;
 };
 const [date,setDate]=useState(today);
 const [repName,setRepName]=useState("");
 const [note,setNote]=useState("");
 const [notes,setNotes]=useState([]);
 const [filter,setFilter]=useState("");
 const [saving,setSaving]=useState(false);
 const [loadingNotes,setLoadingNotes]=useState(true);
 const [error,setError]=useState("");
 const sortedAgents=useMemo(()=>[...agents].sort((a,b)=>a.repName.localeCompare(b.repName)),[agents]);
 const selectedAgent=useMemo(()=>sortedAgents.find(a=>String(a.repName||"").toLowerCase()===repName.trim().toLowerCase()),[sortedAgents,repName]);
 const weekday=useMemo(()=>{
  if(!date)return "";
  return new Intl.DateTimeFormat("en-US",{weekday:"long",timeZone:"America/New_York"}).format(new Date(`${date}T12:00:00-04:00`));
 },[date]);

 const mergeNote=incoming=>setNotes(current=>{
  if(!incoming?.id)return current;
  if(current.some(item=>item.id===incoming.id))return current;
  return [incoming,...current];
 });

 useEffect(()=>{
  let alive=true;
  setLoadingNotes(true);setNotes([]);
  api.getFieldNotes(office).then(data=>{if(alive)setNotes(Array.isArray(data)?data:[])}).catch(err=>{if(alive)setError(err.message||"Could not load field notes.")}).finally(()=>{if(alive)setLoadingNotes(false)});
  const onNew=incoming=>{if((incoming?.office||DEFAULT_OFFICE)===office)mergeNote(incoming)};
  liveSocket.on("field-notes:new",onNew);
  return()=>{alive=false;liveSocket.off("field-notes:new",onNew)};
 },[office]);

 const submit=async e=>{
  e.preventDefault();
  if(!repName.trim()||!note.trim())return;
  setSaving(true);setError("");
  try{
   const saved=await api.addFieldNote({
    office,
    date,
    repKey:selectedAgent?.repKey||"",
    repName:repName.trim(),
    team:selectedAgent?.team||"",
    author,
    note:note.trim()
   });
   mergeNote(saved);
   setRepName("");
   setNote("");
  }catch(err){setError(err.message||"Could not save field note.")}
  finally{setSaving(false)}
 };

 const visible=notes.filter(item=>{
  const q=filter.trim().toLowerCase();
  if(!q)return true;
  return [item.repName,item.team,item.author,item.note,item.date,item.day].some(value=>String(value||"").toLowerCase().includes(q));
 });

 return <div className="field-notes-view">
  <section className="field-note-entry">
   <div className="field-note-heading"><div><small>FIELD COACHING</small><h2>Leave a rep note</h2><p>Any rep can leave a note. This page is designed for trainers and leaders documenting field coaching.</p></div><NotebookPen size={34}/></div>
   {error&&<ErrorBox text={error}/>}
   <form className="field-note-form" onSubmit={submit}>
    <div className="field-note-meta">
     <label>Date<input type="date" value={date} onChange={e=>setDate(e.target.value)} required/></label>
     <div className="field-note-day"><small>DAY</small><strong>{weekday||"—"}</strong></div>
     <label>Rep name
      <input list="field-note-reps" value={repName} onChange={e=>setRepName(e.target.value)} placeholder="Choose a rep or type a name" required autoComplete="off"/>
      <datalist id="field-note-reps">{sortedAgents.map(agent=><option key={agent.repKey} value={agent.repName}>{safeTeam(agent)}</option>)}</datalist>
     </label>
     <div className="field-note-rep-detail"><small>TEAM</small><strong>{selectedAgent?safeTeam(selectedAgent):repName.trim()?"Typed name":"—"}</strong></div>
    </div>
    <label className="field-note-text">Coaching note
     <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="What did you work on? What improved? What should they focus on next time?" rows={6} maxLength={5000} required/>
     <small>{note.length}/5000</small>
    </label>
    <div className="field-note-submit"><span>Saved as <strong>{author||"Unknown"}</strong></span><button className="primary" disabled={saving||!repName.trim()||!note.trim()}><Save size={17}/>{saving?"Saving…":"Save field note"}</button></div>
   </form>
  </section>

  <section className="field-note-history">
   <div className="field-note-history-head"><div><small>NOTE HISTORY</small><h3>Recent field notes</h3></div><input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Search rep, trainer, team, or note…"/></div>
   {loadingNotes?<p>Loading notes…</p>:visible.length===0?<div className="field-note-empty"><NotebookPen size={34}/><strong>No notes found</strong><span>New coaching notes will appear here.</span></div>:<div className="field-note-list">{visible.map(item=><article className="field-note-card" key={item.id}>
    <div className="field-note-card-top"><div><strong>{item.repName}</strong><span>{item.team||"No team"}</span></div><time><b>{item.day}</b>{item.date}</time></div>
    <p>{item.note}</p>
    <footer><span>Left by <strong>{item.author||"Unknown"}</strong></span>{item.createdAt&&<small>{new Date(item.createdAt).toLocaleString()}</small>}</footer>
   </article>)}</div>}
  </section>
 </div>;
}

function Stats({agents}){
 const teams=useMemo(()=>[...new Set(agents.map(safeTeam))].sort(),[agents]);
 const colors=useMemo(()=>colorMap(teams),[teams]);
 const [open,setOpen]=useState("");
 return <div className="teamsections">{teams.map(team=><section className="teamsection" key={team} style={{"--team-color":colors[team]}}><div className="teamtitle"><span className="teamswatch"/>{team}<small>{agents.filter(a=>safeTeam(a)===team).length} members</small></div><div className="memberstatslist">{agents.filter(a=>safeTeam(a)===team).sort((a,b)=>a.repName.localeCompare(b.repName)).map(a=>{const expanded=open===a.repKey;return <div className="statmember" key={a.repKey}><button className="statmemberhead" onClick={()=>setOpen(expanded?"":a.repKey)}>{expanded?<ChevronDown size={18}/>:<ChevronRight size={18}/>}<span><strong>{a.repName}</strong><small>{a.repType||"No role"} · Lead: {a.teamLead||"—"}</small><small className="last-recorded-work">Last recorded work day: <b>{lastRecordedWorkDay(a)}</b></small></span><GapChip value={dailyGap(a)} label="Last day"/><GapChip value={currentWeekGap(a)} label="Current week"/><GapChip value={lastWeekGap(a)} label="Last week"/><AvgOnTargetChip rep={a}/></button>{expanded&&<MemberPerformance rep={a}/>}</div>})}</div></section>)}</div>;
}
function Campaign({agents}){
 const [openTeam,setOpenTeam]=useState("");
 const teams=useMemo(()=>[...new Set(agents.map(safeTeam))].sort(),[agents]);
 const colors=useMemo(()=>colorMap(teams),[teams]);
 const office=useMemo(()=>campaignPeriods(agents),[agents]);
 return <div className="campaign-view">
  <section className="campaign-office">
   <div className="campaign-office-heading"><div><small>OFFICE OVERVIEW</small><h2>Overall office gaps</h2><p>Combined from every team using the same three performance periods.</p></div><Building2 size={34}/></div>
   <div className="campaign-gap-grid">{Object.entries(PERIOD_LABELS).map(([period,label])=><GapChip key={period} value={office[period].gap} label={label}/>)}</div>
   <div className="campaign-office-rates">{Object.entries(PERIOD_LABELS).map(([period,label])=><OfficeRateCard key={period} label={label} data={office[period]}/>)}</div>
  </section>
  <div className="campaign-team-list">{teams.map(team=>{const teamAgents=agents.filter(agent=>safeTeam(agent)===team);const totals=campaignPeriods(teamAgents);const expanded=openTeam===team;return <section className="campaign-team" key={team} style={{"--team-color":colors[team]}}>
   <button className="campaign-team-head" onClick={()=>setOpenTeam(expanded?"":team)}>{expanded?<ChevronDown size={20}/>:<ChevronRight size={20}/>}<span className="teamswatch"/><span className="campaign-team-name"><strong>{team}</strong><small>{teamAgents.length} members</small></span>{Object.entries(PERIOD_LABELS).map(([period,label])=><GapChip key={period} value={totals[period].gap} label={label}/>)}</button>
   {expanded&&<div className="campaign-team-detail">{Object.entries(PERIOD_LABELS).map(([period,label])=><CampaignPeriodCard key={period} label={label} data={totals[period]}/>)}</div>}
  </section>})}</div>
 </div>;
}
function OfficeRateCard({label,data}){
 return <section className="periodcard campaign-office-rate-card"><div className="campaign-rate-card-heading"><div><small>OFFICE GAPS</small><h4>{label}</h4></div><GapChip value={data.gap} label="Biggest gap"/></div><div className="rategrid">{RATES.map(item=>{const value=data.rates?.[item.key];const isOnTarget=onTargetRate(item.key,value);const style=isOnTarget?{bg:"#D9EAD3",text:"#274E13"}:gapStyle(item.label);return <div className={`ratecell ${isOnTarget?"ratecell-on-target":""}`} key={item.key} style={{background:style.bg,color:style.text}}><span>{item.label}{isOnTarget&&<small>✓ On target</small>}</span><b>{value||"—"}</b></div>})}</div></section>;
}
function CampaignPeriodCard({label,data}){
 return <section className="periodcard campaign-period-card"><h4>{label}</h4><div className="funnelcounts">{FUNNEL.map(item=><div key={item.key} className={item.key==="close"?"close-count":""}><span>{item.label}</span><b>{data.counts?.[item.key]??0}</b>{item.key==="close"&&<small><em>E: {data.counts?.electric??0}</em><em>EP: {data.counts?.electricPartial??0}</em></small>}</div>)}</div><div className="rategrid">{RATES.map(item=>{const value=data.rates?.[item.key];const isOnTarget=onTargetRate(item.key,value);const style=isOnTarget?{bg:"#D9EAD3",text:"#274E13"}:gapStyle(item.label);return <div className={`ratecell ${isOnTarget?"ratecell-on-target":""}`} key={item.key} style={{background:style.bg,color:style.text}}><span>{item.label}{isOnTarget&&<small>✓ On target</small>}</span><b>{value||"—"}</b></div>})}</div></section>;
}
function GapChip({value,label}){const style=gapStyle(value);return <span className="sheetgap" style={{background:style.bg,color:style.text}}><small>{label}</small><b>{normalizeGap(value)}</b></span>}
function AvgOnTargetChip({rep,label="Avg on target"}){const excels=repExcellence(rep);const onTarget=Boolean(excels&&excels.ratio>=1);const style=onTarget?{bg:"#D9EAD3",text:"#274E13"}:GAP_STYLES["No Data"];return <span className="sheetgap avg-on-target-chip" style={{background:style.bg,color:style.text}} title={onTarget&&excels?`${(excels.avg*100).toFixed(1)}% average · ${(excels.ratio*100).toFixed(0)}% of target`:"No stage is on target on average"}><small>{label}</small><b>{onTarget?excels.label:"None yet"}</b></span>}
function PerformanceCard({label,data}){
 const safe=data||{counts:{},rates:{}};
 const onTarget=RATES.filter(item=>onTargetRate(item.key,safe.rates?.[item.key]));
 return <section className="periodcard"><div className="period-title-row"><h4>{label}</h4><span className={`data-source-badge ${String(safe.source||"").toLowerCase()==="manual"?"manual":"workmyt"}`}>{safe.source||"WorkMyT"}</span></div><div className="on-target-summary"><span>On target</span><div>{onTarget.length?onTarget.map(item=><span key={item.key} className="on-target-pill">{item.label}</span>):<em>None</em>}</div></div><div className="funnelcounts">{FUNNEL.map(item=><div key={item.key} className={item.key==="close"?"close-count":""}><span>{item.label}</span><b>{safe.counts?.[item.key]??0}</b>{item.key==="close"&&<small><em>E: {safe.counts?.electric??0}</em><em>EP: {safe.counts?.electricPartial??0}</em></small>}</div>)}</div><div className="rategrid">{RATES.map(item=>{const isOnTarget=onTargetRate(item.key,safe.rates?.[item.key]);const style=isOnTarget?{bg:"#D9EAD3",text:"#274E13"}:gapStyle(item.label);return <div className={`ratecell ${isOnTarget?"ratecell-on-target":""}`} key={item.key} style={{background:style.bg,color:style.text}}><span>{item.label}{isOnTarget&&<small>✓ On target</small>}</span><b>{safe.rates?.[item.key]||"—"}</b></div>})}</div></section>
}
function MemberPerformance({rep}){
 const excels=repExcellence(rep);
 const history=useMemo(()=>{
  const map=new Map();
  const current=rep.performance?.lastWorked;
  if(current?.recordedDate)map.set(current.recordedDate,current);
  for(const item of rep.performanceHistory||[]){if(item.recordedDate&&!map.has(item.recordedDate))map.set(item.recordedDate,item)}
  return [...map.entries()].sort((a,b)=>b[0].localeCompare(a[0]));
 },[rep]);
 const [dayDate,setDayDate]=useState(history[0]?.[0]||rep.performance?.lastWorked?.recordedDate||"");
 const [showCalendar,setShowCalendar]=useState(false);
 const [weekPeriod,setWeekPeriod]=useState("currentWeek");
 const [comparePeriod,setComparePeriod]=useState("lastWeek");
 useEffect(()=>{if(history.length&&!history.some(([date])=>date===dayDate))setDayDate(history[0][0])},[history,dayDate]);
 const dayData=history.find(([date])=>date===dayDate)?.[1]||rep.performance?.lastWorked;
 const weekOptions=[['currentWeek','Current week'],['lastWeek','Last week'],['twoWeeksAgo','2 weeks ago'],['threeWeeksAgo','3 weeks ago']];
 const compareOptions=[['lastWeek','Last week'],['twoWeeksAgo','2 weeks ago'],['threeWeeksAgo','3 weeks ago']];
 return <div className="performance-detail-wrap">
  <div className="excel-summary"><span>Excels at on average</span><b>{excels?.label||"No Data"}</b>{excels&&<small>{(excels.avg*100).toFixed(1)}% avg · {(excels.ratio*100).toFixed(0)}% of target</small>}</div>
  <div className="performance-history-controls">
   <div className="history-control"><span>Last day worked</span><button type="button" className="secondary compact-action" onClick={()=>setShowCalendar(v=>!v)}><CalendarDays size={16}/>{dayDate||"Choose date"}</button>{showCalendar&&<select value={dayDate} onChange={e=>{setDayDate(e.target.value);setShowCalendar(false)}}>{history.length?history.map(([date])=><option key={date} value={date}>{date}</option>):<option value="">No history yet</option>}</select>}</div>
   <label className="history-control"><span>Week view</span><select value={weekPeriod} onChange={e=>setWeekPeriod(e.target.value)}>{weekOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   <label className="history-control"><span>Compare to</span><select value={comparePeriod} onChange={e=>setComparePeriod(e.target.value)}>{compareOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
  </div>
  <div className="performancegrid"><PerformanceCard label={`Last worked · ${dayDate||"No date"}`} data={dayData}/><PerformanceCard label={weekOptions.find(([value])=>value===weekPeriod)?.[1]||"Week"} data={rep.performance?.[weekPeriod]}/><PerformanceCard label={compareOptions.find(([value])=>value===comparePeriod)?.[1]||"Comparison"} data={rep.performance?.[comparePeriod]}/></div>
 </div>
}



function Suggestions({author}){
 const [items,setItems]=useState([]),[category,setCategory]=useState("Change / Update"),[suggestion,setSuggestion]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const load=async()=>{try{setItems(await api.getSuggestions())}catch(e){setMessage(e.message)}};
 useEffect(()=>{load();const onNew=item=>setItems(current=>[item,...current.filter(x=>x.id!==item.id)]);liveSocket.on("suggestions:new",onNew);return()=>liveSocket.off("suggestions:new",onNew)},[]);
 const submit=async e=>{e.preventDefault();if(!suggestion.trim())return;setBusy(true);setMessage("");try{const saved=await api.addSuggestion({author,category,suggestion:suggestion.trim()});setItems(current=>[saved,...current.filter(x=>x.id!==saved.id)]);setSuggestion("");setMessage("Suggestion submitted.")}catch(e){setMessage(e.message)}finally{setBusy(false)}};
 return <div className="suggestions-view"><section className="suggestion-entry"><div className="suggestion-heading"><div><small>PROGRAM FEEDBACK</small><h2>Suggest a change or update</h2><p>Anyone can send an idea for improving the matchup program.</p></div><MessageSquare size={34}/></div><form className="suggestion-form" onSubmit={submit}><label>Type<select value={category} onChange={e=>setCategory(e.target.value)}><option>Change / Update</option><option>Bug / Fix</option><option>New Feature</option><option>Other</option></select></label><label className="suggestion-text">Suggestion<textarea value={suggestion} maxLength={5000} placeholder="What should we change or add?" onChange={e=>setSuggestion(e.target.value)}/><small>{suggestion.length}/5000</small></label><div className="suggestion-submit"><span>Submitted by <b>{author}</b></span><button className="primary" disabled={busy||!suggestion.trim()}><MessageSquare size={17}/>{busy?"Submitting…":"Submit suggestion"}</button></div>{message&&<div className="suggestion-message">{message}</div>}</form></section><section className="suggestion-history"><div className="suggestion-history-head"><div><small>RECENT FEEDBACK</small><h3>Program suggestions</h3></div><span>{items.length} submitted</span></div><div className="suggestion-list">{items.length?items.map(item=><article className="suggestion-card" key={item.id}><header><div><strong>{item.category}</strong><span>{item.status||"New"}</span></div><time>{item.day} · {item.date}</time></header><p>{item.suggestion}</p><footer>Submitted by <b>{item.author}</b></footer></article>):<div className="field-note-empty"><MessageSquare/><strong>No suggestions yet</strong><span>Be the first to send an improvement idea.</span></div>}</div></section></div>
}

function storeRepProduction(agent){
 return Math.round((Number(agent?.productionLog?.production)||0)*10)/10;
}
function repElectric(agent){
 const log=agent?.productionLog||{};
 return (Number(log.electric)||0)+(Number(log.partials)||0);
}
function repGas(agent){return Number(agent?.productionLog?.gas)||0}
function ProductionTotals({electric=0,gas=0,production=0,compact=false}){
 return <div className={`production-totals ${compact?"compact":""}`}><span><small>Total E</small><b>{Number(electric)||0}</b></span><span><small>Total G</small><b>{Number(gas)||0}</b></span><span><small>Total Production</small><b>{Number(production||0).toFixed(0)}</b></span></div>;
}
function ProductionDetail({rep}){
 const log=rep?.productionLog||{};
 return <small className="production-detail">Total E {repElectric(rep)} · Total G {repGas(rep)} · Total Production {Number(rep.production??log.production??0).toFixed(0)}</small>;
}
function WorkRep({rep,isAdmin}){
 const {attributes,listeners,setNodeRef,transform,isDragging}=useDraggable({id:`work-rep:${rep.repKey}`,data:{rep},disabled:!isAdmin});
 return <div ref={setNodeRef} {...attributes} {...listeners} className={`work-rep ${isDragging?"dragging":""}`} style={{transform:transform?`translate3d(${transform.x}px,${transform.y}px,0)`:undefined}}><GripVertical size={16}/><div><strong>{rep.repName}</strong><small>{rep.repType||"Rep"} · {rep.team||"Unassigned"}</small></div><ProductionTotals electric={repElectric(rep)} gas={repGas(rep)} production={rep.production}/></div>;
}
function WorkDrop({id,className="",children}){
 const {setNodeRef,isOver}=useDroppable({id});
 return <div ref={setNodeRef} className={`${className} ${isOver?"over":""}`}>{children}</div>;
}
function WorkMatchups({isAdmin,agents,actorName,openStores}){
 const [repSearch,setRepSearch]=useState(""),[productionDirectory,setProductionDirectory]=useState([]),[groups,setGroups]=useState([]),[catalog,setCatalog]=useState([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(""),[message,setMessage]=useState(""),[savedDate,setSavedDate]=useState(""),[activity,setActivity]=useState(null),[activeRep,setActiveRep]=useState(null);
 const hydrated=useRef(false),suppress=useRef(false),saving=useRef(false),saveQueue=useRef(Promise.resolve());
 const byKey=useMemo(()=>new Map((agents||[]).map(agent=>[agent.repKey,agent])),[agents]);
 const activeAgents=useMemo(()=>(agents||[]).filter(agent=>(agent.attendance||"in").toLowerCase()==="in"&&(agent.repType||"").toLowerCase()!=="absent").map(agent=>({...agent,production:storeRepProduction(agent)})).sort((a,b)=>b.production-a.production||a.repName.localeCompare(b.repName)),[agents]);
 const normalize=list=>(list||[]).map((group,index)=>{const members=(group.members||[]).map(member=>{const live=byKey.get(member.repKey);return {...member,...live,production:live?storeRepProduction(live):Number(member.production)||0}});const electric=members.reduce((sum,member)=>sum+repElectric(member),0),gas=members.reduce((sum,member)=>sum+repGas(member),0);return {...group,priority:index+1,electric,gas,production:electric*40+gas*18,members}});
 useEffect(()=>{fetch(`${(import.meta.env.VITE_API_URL || "https://atmo-matchups-backend.onrender.com").replace(/\/$/, "")}/api/production-reps`).then(r=>r.ok?r.json():Promise.reject()).then(data=>setProductionDirectory(data.reps||[])).catch(()=>{})},[]);
 const searchNames=productionDirectory.filter(rep=>rep.repName.toLowerCase().includes(repSearch.trim().toLowerCase()));
 const assigned=new Set(groups.flatMap(group=>(group.members||[]).map(member=>member.repKey)));
 const available=activeAgents.filter(agent=>!assigned.has(agent.repKey));
 const load=async()=>{setLoading(true);setMessage("");try{const [stores,data]=await Promise.all([api.getStoreCatalog(),api.getWorkMatchups()]);setCatalog(stores.stores||[]);let incoming=normalize(data.groups||[]),generatedDefault=false;if(!data.initialized&&isAdmin){const generated=await api.generateWorkMatchups();incoming=normalize(generated.groups||[]);generatedDefault=true}suppress.current=!generatedDefault;setGroups(incoming);setSavedDate(data.date||"");hydrated.current=true}catch(error){setMessage(error.message||"Could not load work matchups.")}finally{setLoading(false)}};
 useEffect(()=>{load()},[]);
 useEffect(()=>{if(!isAdmin||!hydrated.current)return;if(suppress.current){suppress.current=false;return}liveSocket.emit("work:state",{groups,actor:actorName,action:"updated the live work board",at:new Date().toISOString()});const snapshot=groups;saveQueue.current=saveQueue.current.catch(()=>{}).then(async()=>{saving.current=true;try{await api.saveWorkMatchups(easternToday(),snapshot,actorName,"updated the live work board");setSavedDate(easternToday())}catch(error){setMessage(error.message||"Could not auto-save work matchups.")}finally{saving.current=false}})},[groups,isAdmin,actorName]);
 useEffect(()=>{const onState=payload=>{if(payload?.actor===actorName&&saving.current)return;const incoming=normalize(payload?.groups||[]);setGroups(current=>{if(JSON.stringify(current)===JSON.stringify(incoming))return current;suppress.current=true;return incoming});setActivity({actor:payload?.actor||"Someone",action:payload?.action||"updated the work board",at:payload?.at||new Date().toISOString()})};liveSocket.on("work:state",onState);const fallback=setInterval(async()=>{if(saving.current||!document.hasFocus())return;try{const data=await api.getWorkMatchups();const incoming=normalize(data.groups||[]);setGroups(current=>{if(JSON.stringify(current)===JSON.stringify(incoming))return current;suppress.current=true;return incoming})}catch{}},10000);return()=>{clearInterval(fallback);liveSocket.off("work:state",onState)}},[agents,actorName]);
 const moveRep=(repKey,targetId)=>{const rep=activeAgents.find(item=>item.repKey===repKey)||groups.flatMap(group=>group.members||[]).find(item=>item.repKey===repKey);if(!rep)return;if(targetId){const target=groups.find(group=>group.id===targetId);if((target?.members||[]).length>=3&&!target.members.some(member=>member.repKey===repKey)){setMessage(`${target.name} already has 3 people.`);return}}setGroups(current=>normalize(current.map(group=>({...group,members:(group.members||[]).filter(member=>member.repKey!==repKey)})).map(group=>group.id===targetId?{...group,members:[...(group.members||[]),rep]}:group)));setMessage(targetId?`${rep.repName} moved to a work team.`:`${rep.repName} moved to Available.`)};
 const updateGroup=(id,changes)=>setGroups(current=>normalize(current.map(group=>group.id===id?{...group,...changes}:group)));
 const addTeam=()=>setGroups(current=>normalize([...current,{id:crypto.randomUUID(),name:`Work Team ${current.length+1}`,storeId:"",storeName:"",members:[]}])) ;
 const removeTeam=id=>{if(!confirm("Remove this work team? Its reps will return to Available."))return;setGroups(current=>normalize(current.filter(group=>group.id!==id)))};
 const reset=async()=>{if(!confirm("Hard reset Work Matchups? This replaces every current team with the trainer-and-trainee defaults."))return;setBusy("reset");try{const data=await api.generateWorkMatchups();setGroups(normalize(data.groups||[]));setSavedDate("");setMessage("Work Matchups reset to trainer-and-trainee defaults. Autosaving now.")}catch(error){setMessage(error.message||"Could not reset Work Matchups.")}finally{setBusy("")}};
 if(loading)return <p>Loading work matchups…</p>;
 return <DndContext onDragStart={event=>setActiveRep(event.active.data.current?.rep||null)} onDragCancel={()=>setActiveRep(null)} onDragEnd={event=>{const rep=event.active.data.current?.rep;const over=String(event.over?.id||"");if(rep){if(over==="work-pool")moveRep(rep.repKey,"");else if(over.startsWith("work-team:"))moveRep(rep.repKey,over.replace("work-team:",""))}setActiveRep(null)}}>
  <div className="work-matchups-view">{activity&&<div className="live-activity"><span className="live-dot"/><b>{activity.actor}</b><span>{activity.action}</span><small>{timeAgo(activity.at)}</small></div>}<section className="store-matchup-hero"><div><small>TSV PRODUCTION · E 40 · G 18</small><h2>Work Matchups</h2><details><summary>Weekly training focus</summary><TrainingWatch/></details><p>Only trainers with their trainees are created automatically. Everyone else stays Available until you build or change the day's teams.</p></div>{isAdmin&&<div className="store-actions"><button className="secondary" onClick={addTeam}><Plus size={17}/>Add team</button><button className="secondary danger" onClick={reset} disabled={!!busy}><Trash2 size={17}/>{busy==="reset"?"Resetting…":"Hard reset"}</button></div>}</section>{message&&<div className="save-status">{message}</div>}<div className="work-meta"><span>{groups.length} teams · {available.length} available</span>{savedDate&&<span>Autosaved: <b>{savedDate}</b></span>}</div><div className="work-layout"><WorkDrop id="work-pool" className="work-pool"><header><div><small>INDIVIDUAL REPS</small><h3>Available</h3></div><span>{available.length}</span></header><div style={{padding:"10px"}}><input aria-label="Search all production reps" style={{width:"100%",minHeight:48,fontSize:17}} placeholder="Search reps across all production logs…" value={repSearch} onChange={event=>setRepSearch(event.target.value)}/>{repSearch&&<small>{searchNames.length} production-log matches</small>}</div><div>{available.filter(rep=>!repSearch||rep.repName.toLowerCase().includes(repSearch.toLowerCase())).map(rep=><WorkRep key={rep.repKey} rep={rep} isAdmin={isAdmin}/>)}</div>{repSearch&&<div style={{padding:12}}><b>All production logs</b>{searchNames.slice(0,60).map(rep=><div key={rep.repName} style={{padding:"9px 3px"}}>{rep.repName} <small>({rep.sourceFile})</small></div>)}</div>}</WorkDrop><section className="work-team-grid">{groups.map(group=><WorkDrop key={group.id} id={`work-team:${group.id}`} className="work-team-card"><header><input value={group.name} disabled={!isAdmin} onChange={event=>updateGroup(group.id,{name:event.target.value})}/><ProductionTotals compact electric={group.electric} gas={group.gas} production={group.production}/>{isAdmin&&<button className="ghost danger" onClick={()=>removeTeam(group.id)} title="Remove team">×</button>}</header><div className="work-team-members">{group.members?.length?group.members.map(rep=><WorkRep key={rep.repKey} rep={rep} isAdmin={isAdmin}/>):<div className="work-empty">Drop reps here</div>}</div><footer>{group.members?.length||0}/3 people · {"Assign stores on Store Matchups"}</footer></WorkDrop>)}</section></div></div>
  <DragOverlay dropAnimation={null}>{activeRep?<div className="work-rep work-rep-overlay"><strong>{activeRep.repName}</strong><ProductionTotals compact electric={repElectric(activeRep)} gas={repGas(activeRep)} production={activeRep.production}/></div>:null}</DragOverlay>
 </DndContext>;
}
const STORE_MENTOR_ROLE=value=>["leader","trainer","manager","admin","owner","director"].includes(String(value||"").trim().toLowerCase());
function StoreRepCard({rep,assignedStore,stores,trainers,workGroups=[],assignedWorkGroup,isAdmin,canChangeTrainer=true,busy,onAssign,onTrainerChange,onWorkGroupChange}){
 const {attributes,listeners,setNodeRef,transform,isDragging}=useDraggable({id:`store-rep:${rep.repKey}`,data:{rep},disabled:!isAdmin});
 return <div ref={setNodeRef} {...attributes} {...listeners} className={`store-rep-card ${isDragging?"dragging":""}`} style={{transform:transform?`translate3d(${transform.x}px,${transform.y}px,0)`:undefined}} title={rep.productionLog?.sourceFile?`Production: ${rep.productionLog.sourceFile}`:"No matching production TSV row"}><div><strong>{rep.repName}</strong><small>{rep.repType||"Rep"} · {rep.team||"Unassigned"}</small></div><ProductionTotals compact electric={repElectric(rep)} gas={repGas(rep)} production={rep.production}/>{isAdmin&&<>{canChangeTrainer&&<select value={rep.trainer||""} disabled={busy===`trainer:${rep.repKey}`} onPointerDown={event=>event.stopPropagation()} onChange={event=>onTrainerChange(rep,event.target.value)}><option value="">No Team Lead / trainer</option>{trainers.filter(trainer=>trainer.repKey!==rep.repKey).map(trainer=><option key={trainer.repKey} value={trainer.repName}>{trainer.repName} · {trainer.repType}</option>)}</select>}<select className="work-team-select" value={assignedWorkGroup?.id||""} onPointerDown={event=>event.stopPropagation()} onChange={event=>onWorkGroupChange(rep.repKey,event.target.value)}><option value="">Available / no work team</option>{workGroups.map(group=><option key={group.id} value={group.id} disabled={group.id!==assignedWorkGroup?.id&&(group.members||[]).length>=3}>{group.name} ({(group.members||[]).length}/3)</option>)}</select><select value={assignedStore?.id||""} onPointerDown={event=>event.stopPropagation()} onChange={event=>onAssign(rep.repKey,event.target.value)}><option value="">Unassigned store</option>{stores.map(store=><option key={store.id} value={store.id} disabled={store.id!==assignedStore?.id&&(store.members||[]).length>=3}>{store.name} ({(store.members||[]).length}/3)</option>)}</select></>}</div>;
}
function StoreAssignmentRow({store,isAdmin,onRemove}){
 const {setNodeRef,isOver}=useDroppable({id:`store:${store.id}`,disabled:!isAdmin});
 return <article ref={setNodeRef} className={`catalog-store-row tier-${store.tier||"neutral"} ${isOver?"over":""}`}><div className="catalog-store-main"><span className="catalog-store-tier"/><div><strong>{store.name}</strong><small>{store.storeNumber?`Store #${store.storeNumber}`:"No store number"}</small></div><span className="catalog-store-production">{Number(store.production||0).toFixed(1)}</span></div><div className="catalog-store-meta"><span><small>WHERE TO STAFF</small>{store.staffing||"—"}</span><span><small>STORE MANAGER</small>{store.manager||"—"}</span></div><div className="catalog-store-slots">{[0,1,2].map(index=>{const member=store.members?.[index];return member?<div className="catalog-store-member" key={member.repKey}><span>{index+1}</span><div><strong>{member.repName}</strong><small>{member.trainer?`Trainer: ${member.trainer}`:member.repType||"Rep"}</small></div><b>{Number(member.production||0).toFixed(1)}</b>{isAdmin&&<button className="ghost danger" onClick={()=>onRemove(member.repKey)} title={`Remove ${member.repName}`}>×</button>}</div>:<div className="catalog-store-empty" key={index}>Drop rep here</div>})}</div></article>;
}
function StoreMatchups({isAdmin,actorName}){
 const [teams,setTeams]=useState([]),[stores,setStores]=useState([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const read=async()=>{try{const [work,plan,catalog]=await Promise.all([api.getWorkMatchups(),api.getStoreMatchups(),api.getStoreCatalog()]);setTeams(work.groups||[]);setStores((catalog.stores||[]).map(store=>({...store,...(plan.groups||[]).find(item=>String(item.id)===String(store.id)),teamIds:(plan.groups||[]).find(item=>String(item.id)===String(store.id))?.teamIds||[]})))}catch(error){setMessage(error.message||"Could not load teams")}finally{setLoading(false)}};
 useEffect(()=>{read();const onChange=()=>read();liveSocket.on("work:state",onChange);liveSocket.on("stores:state",onChange);const timer=setInterval(read,10000);return()=>{liveSocket.off("work:state",onChange);liveSocket.off("stores:state",onChange);clearInterval(timer)}},[]);
 const assign=async(teamId,storeId)=>{if(!isAdmin)return;setBusy(true);setMessage("");const next=stores.map(store=>({...store,teamIds:(store.teamIds||[]).filter(id=>String(id)!==String(teamId))})).map(store=>String(store.id)===String(storeId)?{...store,teamIds:[...(store.teamIds||[]),String(teamId)]}:store);
  try{await api.saveStoreMatchups(easternToday(),next,actorName,"assigned team to store");await read()}catch(error){setMessage(error.message||"Store assignment failed")}finally{setBusy(false)}};
 const assigned=new Set(stores.flatMap(store=>store.teamIds||[]).map(String));
 if(loading)return <p>Loading Store Matchups…</p>;
 return <div className="store-matchups-view"><section className="store-matchup-hero"><div><h2>Store Matchups</h2><p>Teams and members are managed in Work Matchups. Assign each complete team to a store here.</p></div></section>{message&&<p className="save-status">{message}</p>}
 <section className="work-team-grid"><article className="work-team-card"><h3>Unassigned teams</h3>{teams.filter(team=>!assigned.has(String(team.id))).map(team=><div key={team.id} style={{padding:12,borderBottom:"1px solid #ddd"}}><strong>{team.name}</strong><p>{(team.members||[]).map(m=>m.repName).join(", ")||"No members"}</p>{isAdmin&&<select disabled={busy} value="" onChange={e=>assign(team.id,e.target.value)}><option value="">Assign store…</option>{stores.map(store=><option key={store.id} value={store.id}>{store.name}</option>)}</select>}</div>)}</article>
 {stores.map(store=><article key={store.id} className="work-team-card"><h3>{store.name}</h3><small>{store.staffing||""}</small>{(store.teamIds||[]).map(id=>{const team=teams.find(t=>String(t.id)===String(id));if(!team)return null;return <div key={id} style={{padding:12,borderBottom:"1px solid #ddd"}}><strong>{team.name}</strong><p>{(team.members||[]).map(m=>m.repName).join(", ")||"No members"}</p>{isAdmin&&<select disabled={busy} value={store.id} onChange={e=>assign(id,e.target.value)}><option value="">Unassign store</option>{stores.map(dest=><option key={dest.id} value={dest.id}>{dest.name}</option>)}</select>}</div>})}</article>)}</section></div>;
}

function TrainingWatch(){
 const [mode,setMode]=useState("both"),[threshold,setThreshold]=useState(20),[rows,setRows]=useState([]),[error,setError]=useState("");
 useEffect(()=>{let active=true;api.getTrainingWatch(mode,threshold).then(data=>{if(active){setRows(data.reps||[]);setError("")}}).catch(e=>active&&setError(e.message));return()=>{active=false}},[mode,threshold]);
 return <div className="store-matchups-view"><section className="store-matchup-hero"><div><h2>Weekly Training Focus</h2><p>New reps and leaders below the previous week's production threshold.</p></div></section><div style={{display:"flex",gap:14,flexWrap:"wrap",padding:12}}><label>Show <select value={mode} onChange={e=>setMode(e.target.value)}><option value="both">Both</option><option value="new">New Reps</option><option value="leaders">Leaders</option></select></label><label>Under <input type="number" min="0" value={threshold} onChange={e=>setThreshold(Number(e.target.value)||0)}/></label></div>{error&&<p>{error}</p>}<div className="work-team-grid">{rows.map(rep=><article key={rep.repKey} className="work-team-card"><h3>{rep.repName}</h3><p>{rep.office} · {rep.role}</p><b>Last week: {rep.previousWeek}</b><p>Training focus: {rep.focus}</p></article>)}</div>{!rows.length&&!error&&<p>No matching reps with recorded previous-week production.</p>}</div>;
}

function Auto({groups,setGroups,goManual,office=DEFAULT_OFFICE}){
 const [busy,setBusy]=useState(false),[groupingMode,setGroupingMode]=useState("gaps"),[trainersOnly,setTrainersOnly]=useState(false),[error,setError]=useState("");
 const run=async()=>{setBusy(true);setError("");try{const d=await api.autoGenerate({groupSize:4,groupingMode,trainersOnly,office});setGroups(d.groups||[])}catch(e){setError(e.message)}finally{setBusy(false)}};
 return <div className="auto-view"><div className="actionpanel auto-panel"><div><small>AUTO MATCHUP ENGINE</small><h2>Generate gap-focused groups</h2><p>By default, reps are grouped by their weakest average gap across Last Day Worked, Current Week, and Last Week. Auto-generated groups are capped at 4 reps.</p></div><button className="primary" onClick={run} disabled={busy}><Wand2 size={18}/>{busy?"Generating…":"Generate matchups"}</button><div className="auto-settings"><label><span>How should reps be matched?</span><select value={groupingMode} onChange={e=>setGroupingMode(e.target.value)}><option value="gaps">Rep averages / gaps (default)</option><option value="team">Team composition</option></select><small>Gap mode matches reps who need the same coaching focus.</small></label><label className="auto-toggle"><input type="checkbox" checked={trainersOnly} onChange={e=>setTrainersOnly(e.target.checked)}/><span><b>Only trainers/managers can lead groups</b><small>Off: high-performing reps can also lead when last week full sales + 50% of partials reaches 20.</small></span></label></div>{error&&<div className="error">{error}</div>}</div>{groups.length>0&&<><div className="auto-summary"><b>{groups.length} groups generated</b><span>Maximum 4 reps per auto-generated group. Manual editing can still exceed 4.</span></div><GroupPreview groups={groups}/><button className="primary" onClick={goManual}>Open in matchup editor</button></>}</div>
}
function GroupPreview({groups}){const colors=colorMap(groups.map(g=>g.team||"Unassigned"));return <div className="groupgrid">{groups.map(g=><div className="groupcard" key={g.id} style={{"--team-color":colors[g.team||"Unassigned"]}}><h3>{g.name}</h3><small>{g.coach||"No coach"} · {g.focus}</small>{g.members.map(m=><RepDetails key={m.repKey} rep={m} compact/>)}</div>)}</div>}
function RepDetails({rep,compact=false,collapsed=false,onToggle}){return <div className={`${compact?"mini ":""}repdetails ${collapsed?"repdetails-collapsed":""}`}><div className="rep-summary"><div className="rep-summary-text"><strong>{rep.repName}</strong><small>{safeTeam(rep)}</small></div>{onToggle&&<button type="button" className="rep-fold-button" title={collapsed?"Expand rep":"Collapse rep"} aria-label={`${collapsed?"Expand":"Collapse"} ${rep.repName}`} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.preventDefault();e.stopPropagation();onToggle()}}>{collapsed?<ChevronDown size={16}/>:<ChevronRight size={16}/>}</button>}</div>{!collapsed&&<div className="rep-expanded-info"><div className="rep-gap-row"><GapChip value={dailyGap(rep)} label="Day"/><GapChip value={currentWeekGap(rep)} label="Week"/><GapChip value={lastWeekGap(rep)} label="Last"/><AvgOnTargetChip rep={rep} label="Avg on target"/></div><div className="workedline">Last worked: <b>{lastWorked(rep)}</b></div></div>}</div>}

function DraggableRep({rep,teamColor,gapColor,collapsed=false,onToggle}){const {attributes,listeners,setNodeRef,transform,isDragging}=useDraggable({id:`rep:${rep.repKey}`,data:{rep}});return <div ref={setNodeRef} {...attributes} {...listeners} className={`dragrep ${collapsed?"dragrep-collapsed":""} ${isDragging?"dragrep-dragging":""}`} style={{transform:transform?`translate3d(${transform.x}px,${transform.y}px,0)`:undefined,borderLeftColor:gapColor||teamColor||"#94a3b8","--rep-team":teamColor||"#e2e8f0"}} title={`Drag ${rep.repName}`}><div className="drag-handle" aria-hidden="true"><GripVertical size={16}/></div><RepDetails rep={rep} collapsed={collapsed} onToggle={onToggle}/></div>}
function DragRepOverlay({rep,teamColor}){if(!rep)return null;return <div className="dragrep dragrep-overlay" style={{borderLeftColor:teamColor||"#94a3b8","--rep-team":teamColor||"#e2e8f0"}}><div className="drag-handle"><GripVertical size={16}/></div><RepDetails rep={rep}/></div>}
function RemoteDragLayer({drags={}}){const items=Object.values(drags);if(!items.length)return null;return <div className="remote-drag-layer">{items.map(d=><div className="remote-drag-ghost" key={d.socketId} style={{left:`${Math.max(0,Math.min(1,Number(d.x)||0))*100}vw`,top:`${Math.max(0,Math.min(1,Number(d.y)||0))*100}vh`}}><span>{d.actor||"Someone"}</span><strong>{d.repName||"Moving rep"}</strong></div>)}</div>}
function DropGroup({group,children}){const {setNodeRef,isOver}=useDroppable({id:`group:${group.id}`});return <div ref={setNodeRef} className={`dropgroup ${isOver?"over":""}`}>{children}</div>}
function LeaderDropZone({group,leaderRep,teamColor,collapsed=false,onToggle}){const {setNodeRef,isOver}=useDroppable({id:`leader:${group.id}`});return <div ref={setNodeRef} className={`leader-drop-zone ${isOver?"over":""}`}><div className="leader-drop-label"><span>Group leader</span><small>Drag any rep, leader, or trainer here</small></div>{leaderRep?<DraggableRep rep={leaderRep} teamColor={teamColor} collapsed={collapsed} onToggle={onToggle}/>:<div className="leader-empty">Drop group leader here</div>}</div>}

function matchupCollisionDetection(args){
 const pointerHits=pointerWithin(args);
 const leaderHit=pointerHits.find(hit=>String(hit.id).startsWith("leader:"));
 if(leaderHit)return [leaderHit];
 const groupHit=pointerHits.find(hit=>String(hit.id).startsWith("group:"));
 if(groupHit)return [groupHit];
 const rectHits=rectIntersection(args);
 const rectLeader=rectHits.find(hit=>String(hit.id).startsWith("leader:"));
 if(rectLeader)return [rectLeader];
 const rectGroup=rectHits.find(hit=>String(hit.id).startsWith("group:"));
 return rectGroup?[rectGroup]:rectHits;
}


function CoachingFocusInput({group,setGroups,markActivity}){
 const [value,setValue]=useState(group.focus||"");
 const editingRef=useRef(false);
 const timerRef=useRef(null);

 useEffect(()=>{
  if(!editingRef.current){
   setValue(group.focus||"");
  }
 },[group.focus]);

 useEffect(()=>()=>clearTimeout(timerRef.current),[]);

 const commit=nextValue=>{
  clearTimeout(timerRef.current);
  setGroups(gs=>{
   const current=gs.find(x=>x.id===group.id);
   if(!current||current.focus===nextValue)return gs;
   return markActivity(
    gs.map(x=>x.id===group.id?{...x,focus:nextValue}:x),
    group.id,
    `updated ${group.name||"group"} coaching focus`
   );
  });
 };

 const scheduleCommit=nextValue=>{
  clearTimeout(timerRef.current);
  timerRef.current=setTimeout(()=>commit(nextValue),350);
 };

 return <input
  placeholder="Coaching focus"
  value={value}
  onFocus={()=>{editingRef.current=true}}
  onChange={e=>{
   const next=e.target.value;
   setValue(next);
   scheduleCommit(next);
  }}
  onBlur={()=>{
   editingRef.current=false;
   commit(value);
  }}
 />;
}

function Manual({agents,groups,setGroups,actorName,remoteDrags={},office=DEFAULT_OFFICE}){
 const [organizeBy,setOrganizeBy]=useState("team"),[gapSort,setGapSort]=useState("lastDay"),[savingMatchups,setSavingMatchups]=useState(false),[saveMessage,setSaveMessage]=useState("");
 const [collapsedRepIds,setCollapsedRepIds]=useState(()=>new Set());
 const [activeDragRep,setActiveDragRep]=useState(null);
 const activity=activityFromGroups(groups);
 const [,setActivityTick]=useState(0);
 useEffect(()=>{const id=setInterval(()=>setActivityTick(x=>x+1),1000);return()=>clearInterval(id)},[]);
 const dragFrame=useRef(0);
 const livePointer=useRef(null);
 useEffect(()=>{
  if(!activeDragRep)return;
  const rememberPointer=e=>{
   if(Number.isFinite(e.clientX)&&Number.isFinite(e.clientY)){
    livePointer.current={clientX:e.clientX,clientY:e.clientY};
   }
  };
  // Capture the real viewport pointer. This stays correct even when the rep
  // sidebar auto-scrolls while dragging; dnd-kit's delta can include scroll
  // movement and makes remote ghosts drift toward the top of the screen.
  window.addEventListener("pointermove",rememberPointer,{capture:true,passive:true});
  window.addEventListener("mousemove",rememberPointer,{capture:true,passive:true});
  return()=>{
   window.removeEventListener("pointermove",rememberPointer,true);
   window.removeEventListener("mousemove",rememberPointer,true);
   livePointer.current=null;
  };
 },[activeDragRep]);
 const dragPoint=event=>{
  const pointer=livePointer.current;
  if(pointer){
   return {
    x:Math.max(0,Math.min(1,pointer.clientX/Math.max(1,window.innerWidth))),
    y:Math.max(0,Math.min(1,pointer.clientY/Math.max(1,window.innerHeight)))
   };
  }

  // Fallback for the first drag event (before pointermove fires) and keyboard dragging.
  const translated=event?.active?.rect?.current?.translated;
  if(translated){
   const cx=translated.left+translated.width/2;
   const cy=translated.top+translated.height/2;
   return {
    x:Math.max(0,Math.min(1,cx/Math.max(1,window.innerWidth))),
    y:Math.max(0,Math.min(1,cy/Math.max(1,window.innerHeight)))
   };
  }
  const source=event?.activatorEvent;
  return {
   x:Math.max(0,Math.min(1,(Number(source?.clientX)||0)/Math.max(1,window.innerWidth))),
   y:Math.max(0,Math.min(1,(Number(source?.clientY)||0)/Math.max(1,window.innerHeight)))
  };
 };
 const broadcastDrag=(type,event,rep)=>{
  if(!rep)return;
  const send=()=>liveSocket.emit(type,{actor:actorName,repKey:rep.repKey,repName:rep.repName,team:safeTeam(rep),...dragPoint(event)});
  if(type!=="drag:move"){send();return}
  if(dragFrame.current)return;
  dragFrame.current=requestAnimationFrame(()=>{dragFrame.current=0;send()});
 };
 const markActivity=(gs,groupId,action)=>{
  if(!gs.length)return gs;
  const targetId=groupId||gs[0].id;
  return gs.map(g=>g.id===targetId?withActivity(g,actorName,action):g);
 };
 const toggleRepCollapsed=repKey=>setCollapsedRepIds(current=>{const next=new Set(current);next.has(repKey)?next.delete(repKey):next.add(repKey);return next});
 const activeAgents=agents.filter(a=>(a.attendance||"in").toLowerCase()==="in"&&(a.repType||"").toLowerCase()!=="absent");
 const byName=new Map(activeAgents.map(a=>[a.repName,a]));
 const leaderKeyFor=g=>g.leaderRepKey||byName.get(g.coach)?.repKey||"";
 const leaderKeys=new Set(groups.map(leaderKeyFor).filter(Boolean));
 const memberKeys=new Set(groups.flatMap(g=>(g.members||[]).map(m=>m.repKey)));
 const assigned=new Set([...leaderKeys,...memberKeys]);
 const trainers=activeAgents.filter(a=>["trainer","manager"].includes((a.repType||"").toLowerCase())&&!assigned.has(a.repKey)).sort((a,b)=>a.repName.localeCompare(b.repName));
 const pool=activeAgents.filter(a=>!assigned.has(a.repKey)&&!["trainer","manager"].includes((a.repType||"").toLowerCase()));
 const collapseAll=()=>setCollapsedRepIds(new Set([...pool,...trainers,...groups.flatMap(g=>g.members||[]),...groups.map(g=>byName.get(g.coach)).filter(Boolean)].map(rep=>rep.repKey)));
 const expandAll=()=>setCollapsedRepIds(new Set());
 const teamColors=useMemo(()=>colorMap(agents.map(safeTeam)),[agents]);
 const addGroup=()=>{const id=crypto.randomUUID();setGroups(gs=>[...gs,withActivity({id,name:`Group ${gs.length+1}`,team:"",coach:"",leaderRepKey:"",focus:"",members:[]},actorName,"created a new group")])};
 const dragEnd=({active,over})=>{
  if(!over)return;
  const rep=active.data.current?.rep;if(!rep)return;
  const overId=String(over.id);
  if(overId.startsWith("leader:")){
   const gid=overId.replace("leader:","");
   setGroups(gs=>{
    const target=gs.find(g=>g.id===gid);
    const targetName=target?.name||"a group";
    const next=gs.map(g=>{
     const sameLeader=leaderKeyFor(g)===rep.repKey;
     const base={...g,members:(g.members||[]).filter(m=>m.repKey!==rep.repKey)};
     if(g.id===gid)return {...base,coach:rep.repName,leaderRepKey:rep.repKey};
     return sameLeader?{...base,coach:"",leaderRepKey:""}:base;
    });
    return markActivity(next,gid,`set ${rep.repName} as Group Leader in ${targetName}`);
   });
   return;
  }
  if(overId.startsWith("group:")){
   const gid=overId.replace("group:","");
   setGroups(gs=>{
    const target=gs.find(g=>g.id===gid);
    const targetName=target?.name||"a group";
    const next=gs.map(g=>{
     const wasLeader=leaderKeyFor(g)===rep.repKey;
     const base={...g,members:(g.members||[]).filter(m=>m.repKey!==rep.repKey),...(wasLeader?{coach:"",leaderRepKey:""}:{})};
     return g.id===gid?{...base,members:[...base.members,rep]}:base;
    });
    return markActivity(next,gid,`moved ${rep.repName} to ${targetName}`);
   });
  }
 };
 const save=async()=>{
  if(!groups.length){setSaveMessage("Add at least one group before saving.");return;}
  setSavingMatchups(true);setSaveMessage("");
  try{const date=new Date().toISOString().slice(0,10);await api.saveMatchups(date,groups,office);localStorage.setItem(`atmo-current-matchups:${office}`,JSON.stringify(groups));setSaveMessage(`Saved ${groups.length} group${groups.length===1?"":"s"} to Google Sheets for ${officeLabel(office)} on ${date}.`)}catch(error){setSaveMessage(`Could not save matchups: ${error.message}`)}finally{setSavingMatchups(false)}
 };
 const selectedGap=rep=>periodGap(rep,gapSort);
 const sections=organizeBy==="team"
  ? [...new Set(pool.map(safeTeam))].sort().map(name=>({name,reps:pool.filter(r=>safeTeam(r)===name).sort((a,b)=>a.repName.localeCompare(b.repName))}))
  : [...new Set(pool.map(selectedGap))].sort((a,b)=>gapRank(a)-gapRank(b)||a.localeCompare(b)).map(name=>({name,reps:pool.filter(r=>selectedGap(r)===name).sort((a,b)=>safeTeam(a).localeCompare(safeTeam(b))||a.repName.localeCompare(b.repName))}));
 return <DndContext collisionDetection={matchupCollisionDetection} onDragStart={event=>{const rep=event.active.data.current?.rep||null;setActiveDragRep(rep);broadcastDrag("drag:start",event,rep)}} onDragMove={event=>broadcastDrag("drag:move",event,activeDragRep||event.active.data.current?.rep)} onDragCancel={()=>{liveSocket.emit("drag:end");setActiveDragRep(null)}} onDragEnd={event=>{dragEnd(event);liveSocket.emit("drag:end");setActiveDragRep(null)}}>
  <RemoteDragLayer drags={remoteDrags}/>
  {activity&&<div className="live-activity"><span className="live-dot"/><b>{activity.actor||"Someone"}</b><span>{activity.action}</span><small>{timeAgo(activity.at)}</small></div>}
  <div className="manualhead"><div className="manualfilters"><label>Organize reps<select value={organizeBy} onChange={e=>setOrganizeBy(e.target.value)}><option value="team">By team</option><option value="gap">By gaps</option></select></label>{organizeBy==="gap"&&<label>Gap period<select value={gapSort} onChange={e=>setGapSort(e.target.value)}><option value="lastDay">Last worked day</option><option value="currentWeek">Current week</option><option value="lastWeek">Last week</option></select></label>}<div className="fold-all-controls"><button type="button" className="secondary compact-action" onClick={collapseAll}>Fold all reps</button><button type="button" className="secondary compact-action" onClick={expandAll}>Unfold all reps</button></div></div><div><button className="secondary" onClick={addGroup}><Plus size={17}/>Add group</button> <button className="primary" onClick={save} disabled={savingMatchups}><Save size={17}/>{savingMatchups?"Saving to sheet…":"Save matchups to sheet"}</button></div></div>
  {saveMessage&&<div className={`save-status ${saveMessage.startsWith("Could not")?"save-status-error":""}`}>{saveMessage}</div>}
  <div className="builder"><aside>
   <div className="trainer-pool"><h3>Trainers / Managers <span>{trainers.length}</span></h3><p>Drag one directly into a group's leader spot.</p>{trainers.length?trainers.map(r=><DraggableRep key={r.repKey} rep={r} teamColor={teamColors[safeTeam(r)]} collapsed={collapsedRepIds.has(r.repKey)} onToggle={()=>toggleRepCollapsed(r.repKey)}/>):<small>No available trainers.</small>}</div>
   <h3>Available reps</h3>{sections.map(section=>{const gs=gapStyle(section.name);return <div className="poolsection" key={section.name} style={{"--section-color":organizeBy==="team"?teamColors[section.name]:gs.bg,"--section-text":organizeBy==="team"?"#1f2937":gs.text}}><h4>{section.name}<span>{section.reps.length}</span></h4>{section.reps.map(r=><DraggableRep key={r.repKey} rep={r} teamColor={teamColors[safeTeam(r)]} gapColor={organizeBy==="gap"?gapStyle(selectedGap(r)).bg:undefined} collapsed={collapsedRepIds.has(r.repKey)} onToggle={()=>toggleRepCollapsed(r.repKey)}/>)}</div>})}
  </aside><section className="groupgrid">{groups.map(g=>{const leaderRep=activeAgents.find(a=>a.repKey===leaderKeyFor(g))||byName.get(g.coach);return <DropGroup key={g.id} group={g}><div className="groupcontrols"><input value={g.name} onChange={e=>{const value=e.target.value;setGroups(gs=>markActivity(gs.map(x=>x.id===g.id?{...x,name:value}:x),g.id,`renamed ${g.name||"a group"} to ${value||"Untitled group"}`))}}/><button className="ghost danger" onClick={()=>setGroups(gs=>{const remaining=gs.filter(x=>x.id!==g.id);return markActivity(remaining,remaining[0]?.id,`deleted ${g.name||"a group"}`)})}><Trash2 size={16}/></button></div><LeaderDropZone group={g} leaderRep={leaderRep} teamColor={leaderRep?teamColors[safeTeam(leaderRep)]:undefined} collapsed={leaderRep?collapsedRepIds.has(leaderRep.repKey):false} onToggle={leaderRep?()=>toggleRepCollapsed(leaderRep.repKey):undefined}/><CoachingFocusInput group={g} setGroups={setGroups} markActivity={markActivity}/><div className="group-member-label">Reps</div>{(g.members||[]).map(r=><DraggableRep key={r.repKey} rep={r} teamColor={teamColors[safeTeam(r)]} collapsed={collapsedRepIds.has(r.repKey)} onToggle={()=>toggleRepCollapsed(r.repKey)}/>)}</DropGroup>})}</section></div>
  <DragOverlay dropAnimation={null} zIndex={10000}>{activeDragRep?<DragRepOverlay rep={activeDragRep} teamColor={teamColors[safeTeam(activeDragRep)]}/>:null}</DragOverlay>
 </DndContext>;
}


createRoot(document.getElementById("root")).render(<App/>);
