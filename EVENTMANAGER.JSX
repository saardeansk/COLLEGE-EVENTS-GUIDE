import { useState, useEffect, useRef, useCallback, memo } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const MAP_W = 740, MAP_H = 500;
const ENTRANCE = { x: 370, y: 470 };
const HALL_COLORS = ["#4F46E5","#7C3AED","#0891B2","#D97706","#059669","#DC2626","#BE185D","#84CC16"];

const CAMPUS_BOUNDS = {
  minLat: 11.9350, maxLat: 11.9420,
  minLng: 79.8280, maxLng: 79.8370,
};
 
function gpsToSVG(lat, lng) {
  const x = ((lng - CAMPUS_BOUNDS.minLng) / (CAMPUS_BOUNDS.maxLng - CAMPUS_BOUNDS.minLng)) * MAP_W;
  const y = MAP_H - ((lat - CAMPUS_BOUNDS.minLat) / (CAMPUS_BOUNDS.maxLat - CAMPUS_BOUNDS.minLat)) * MAP_H;
  return { x: Math.max(10, Math.min(MAP_W-10, x)), y: Math.max(10, Math.min(MAP_H-10, y)) };
}

const INIT_HALLS = [
  { id:"h1", hall_no:"A101", hall_name:"Main Auditorium",  floor:1, block:"A",    x:60,  y:60,  w:140, h:80,  color:"#4F46E5" },
  { id:"h2", hall_no:"A102", hall_name:"Seminar Hall",     floor:1, block:"A",    x:230, y:60,  w:120, h:80,  color:"#7C3AED" },
  { id:"h3", hall_no:"B201", hall_name:"Computer Lab",     floor:2, block:"B",    x:60,  y:200, w:120, h:80,  color:"#0891B2" },
  { id:"h4", hall_no:"B202", hall_name:"Electronics Lab",  floor:2, block:"B",    x:210, y:200, w:130, h:80,  color:"#0891B2" },
  { id:"h5", hall_no:"C301", hall_name:"Conference Room",  floor:3, block:"C",    x:400, y:60,  w:110, h:80,  color:"#D97706" },
  { id:"h6", hall_no:"C302", hall_name:"Workshop Hall",    floor:3, block:"C",    x:400, y:200, w:110, h:80,  color:"#D97706" },
  { id:"h7", hall_no:"D101", hall_name:"Sports Arena",     floor:1, block:"D",    x:550, y:130, w:150, h:100, color:"#059669" },
  { id:"h8", hall_no:"LIB",  hall_name:"Library",          floor:1, block:"Main", x:240, y:350, w:160, h:70,  color:"#DC2626" },
];
const INIT_EVENTS = [
  { id:"e1", name:"TechFest 2024 — Coding Marathon", date:"2024-12-20", hall_no:"A101", category:"Technical", description:"24-hour coding competition. Bring your laptops!", reg_desk:"Main Gate Security",  dest_lat:11.9415, dest_lng:79.8290 },
  { id:"e2", name:"Cultural Nite — Dance & Music",   date:"2024-12-21", hall_no:"A101", category:"Cultural",  description:"Annual cultural extravaganza with performances",   reg_desk:"Auditorium Lobby",    dest_lat:11.9415, dest_lng:79.8290 },
  { id:"e3", name:"Robotics Workshop",               date:"2024-12-22", hall_no:"B201", category:"Workshop",  description:"Hands-on robotics building session",                reg_desk:"Block B Ground Floor",dest_lat:11.9395, dest_lng:79.8292 },
  { id:"e4", name:"AI/ML Hackathon",                 date:"2024-12-23", hall_no:"C301", category:"Technical", description:"Build AI solutions for real-world problems",        reg_desk:"Block C Lobby",       dest_lat:11.9410, dest_lng:79.8340 },
  { id:"e5", name:"Sports Meet 2024",                date:"2024-12-24", hall_no:"D101", category:"Sports",    description:"Inter-college athletics and team sports",           reg_desk:"Sports Complex Gate", dest_lat:11.9400, dest_lng:79.8358 },
];
const INIT_REGS = [
  { id:"r1", reg_id:"REG-DEMO001", name:"Arjun Kumar", email:"arjun@abc.edu", college:"ABC Engineering", event_id:"e1", hall_no:"A101" },
  { id:"r2", reg_id:"REG-DEMO002", name:"Priya Singh", email:"priya@xyz.edu", college:"XYZ College",     event_id:"e3", hall_no:"B201" },
];

function genId()    { return Math.random().toString(36).substr(2,8).toUpperCase(); }
function genRegId() { return "REG-"+Math.random().toString(36).substr(2,8).toUpperCase(); }

// Get SVG destination point — prefer event's pinned GPS, else fall back to hall box centre
function getDestPoint(hall, event) {
  if (event?.dest_lat && event?.dest_lng) return gpsToSVG(event.dest_lat, event.dest_lng);
  if (!hall) return null;
  return { x: hall.x + hall.w/2, y: hall.y + hall.h/2 };
}

function buildPath(fromPt, destPt) {
  if (!destPt) return "";
  const from = fromPt || ENTRANCE;
  const midY = Math.min(from.y - 40, destPt.y + 80);
  return `M ${from.x},${from.y} L ${from.x},${midY} L ${destPt.x},${midY} L ${destPt.x},${destPt.y}`;
}
function svgDist(a, b) { return Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2); }

// Haversine distance in metres between two GPS points
function gpsDist(lat1, lng1, lat2, lng2) {
  const R = 6371000, dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ─── FRIENDLY VOICE / STEP GUIDE ENGINE ──────────────────────────────────────
function getFriendlySteps(hall, livePos, name, event, gpsCoords) {
  if (!hall && !event?.dest_lat) return [];
  const n = name ? name.split(" ")[0] : "friend";

  // Compute distance: use real GPS metres if both available, else SVG pixels
  let approxM = 0;
  if (gpsCoords && event?.dest_lat && event?.dest_lng) {
    approxM = Math.round(gpsDist(gpsCoords.lat, gpsCoords.lng, event.dest_lat, event.dest_lng));
  } else if (hall) {
    const tx = hall.x + hall.w/2, ty = hall.y + hall.h/2;
    const from = livePos || ENTRANCE;
    approxM = Math.round(svgDist(from, { x:tx, y:ty }) * (780/MAP_H));
  }

  const hasPin = !!(event?.dest_lat && event?.dest_lng);
  const hallName = hall ? `${hall.hall_no} (${hall.hall_name})` : event?.hall_no || "your hall";

  if (approxM < 20) return [
    { icon:"🎉", text:`You made it, ${n}! You're right at ${hallName}!`, type:"arrived", speak: true },
    { icon:"📋", text:"Head inside and show your registration ID at the desk.", type:"info" },
  ];

  const steps = [];
  steps.push({ icon:"👋", text:`Hey ${n}! I'll guide you to ${hallName}. It's about ${approxM}m away. Let's go!`, type:"greeting", speak: true });

  if (!livePos) {
    steps.push({ icon:"🚪", text:`First, enter through the main campus entrance — look for the green arch straight ahead.`, type:"step" });
    steps.push({ icon:"📍", text:`Once inside, you're at the START point. The yellow path on the map shows your exact route.`, type:"step" });
  }

  if (hasPin) {
    steps.push({ icon:"🛰️", text:`I have the exact GPS pin for this hall — the 📍 red pin on the map is the precise destination. Head towards it!`, type:"step", speak:true });
  }

  const goRight = hall && livePos ? (hall.x + hall.w/2) > livePos.x + 30 : hall ? (hall.x + hall.w/2) > ENTRANCE.x + 30 : false;
  const goLeft  = hall && livePos ? (hall.x + hall.w/2) < livePos.x - 30 : hall ? (hall.x + hall.w/2) < ENTRANCE.x - 30 : false;
  const from = livePos || ENTRANCE;
  const ty = hall ? hall.y + hall.h/2 : 0;

  if (hall && from.y > ty + 60) {
    steps.push({ icon:"⬆️", text:`Walk straight ahead towards the top of the campus. Keep going — don't turn yet!`, type:"step", speak: true });
  }
  if (goRight) {
    steps.push({ icon:"➡️", text:`Now turn RIGHT. You'll see Block ${hall?.block || "A"} signs on the wall — follow those.`, type:"step", speak: true });
  } else if (goLeft) {
    steps.push({ icon:"⬅️", text:`Now turn LEFT. Block ${hall?.block || "A"} is on this side — the signboards will help.`, type:"step", speak: true });
  }

  if (hall?.floor > 1) {
    steps.push({ icon:"🪜", text:`Take the staircase up to Floor ${hall.floor}. The stairs are usually near the centre of each block.`, type:"step", speak: true });
    steps.push({ icon:"🏢", text:`Once on Floor ${hall.floor}, look for room number ${hall.hall_no} on the door plates.`, type:"step" });
  } else if (hall) {
    steps.push({ icon:"🚶", text:`Stay on the ground floor — no stairs needed! Walk along the corridor until you see the room plate.`, type:"step" });
  }

  steps.push({ icon:"🏁", text:`Almost there! The red 📍 pin marks the exact spot. When the GPS dot overlaps it, you've arrived!`, type:"step", speak: true });
  steps.push({ icon:"✅", text:`Show your registration ID at the door and enjoy the event! Have a great time, ${n}! 🎊`, type:"final" });

  return steps;
}

// ─── SPEECH SYNTHESIS HELPER ──────────────────────────────────────────────────
function speak(text, micGranted) {
  if (!micGranted || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.92;
  u.pitch = 1.05;
  u.volume = 1;
  // Pick a friendly voice if available
  const voices = window.speechSynthesis.getVoices();
  const friendly = voices.find(v => v.name.includes("Google") || v.name.includes("Natural") || v.lang === "en-IN") || voices[0];
  if (friendly) u.voice = friendly;
  window.speechSynthesis.speak(u);
}

// ─── SHARED STYLES ────────────────────────────────────────────────────────────
const S = {
  card: { background:"rgba(255,255,255,0.025)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:16, padding:24, marginBottom:20 },
  lbl:  { display:"block", fontSize:11, fontFamily:"monospace", color:"#555", letterSpacing:1.5, marginBottom:7 },
  inp:  { width:"100%", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:10, padding:"11px 14px", color:"#fff", outline:"none", fontSize:14, fontFamily:"inherit", boxSizing:"border-box" },
  r2:   { display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 },
  tag:  (c="#4F46E5") => ({ display:"inline-block", background:`${c}22`, border:`1px solid ${c}55`, borderRadius:7, padding:"4px 10px", fontSize:12, color:c, fontFamily:"monospace", fontWeight:700 }),
  btn:  (v="p") => {
    if(v==="d")    return {background:"rgba(239,68,68,0.12)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:10,padding:"9px 18px",color:"#EF4444",fontWeight:700,cursor:"pointer",fontSize:13,fontFamily:"inherit"};
    if(v==="g")    return {background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:"9px 18px",color:"#aaa",fontWeight:700,cursor:"pointer",fontSize:13,fontFamily:"inherit"};
    if(v==="teal") return {background:"linear-gradient(135deg,#0891B2,#0e7490)",border:"none",borderRadius:10,padding:"11px 22px",color:"#fff",fontWeight:700,cursor:"pointer",fontSize:14,fontFamily:"inherit"};
    if(v==="green")return {background:"linear-gradient(135deg,#059669,#047857)",border:"none",borderRadius:10,padding:"11px 22px",color:"#fff",fontWeight:700,cursor:"pointer",fontSize:14,fontFamily:"inherit"};
    return {background:"linear-gradient(135deg,#4F46E5,#7C3AED)",border:"none",borderRadius:10,padding:"11px 22px",color:"#fff",fontWeight:700,cursor:"pointer",fontSize:14,fontFamily:"inherit"};
  },
  err: { background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.25)",borderRadius:12,padding:"12px 16px",color:"#EF4444",fontSize:14,marginBottom:16 },
  ok:  { background:"rgba(34,197,94,0.08)",border:"1px solid rgba(34,197,94,0.25)",borderRadius:12,padding:"12px 16px",color:"#22C55E",fontSize:14,marginBottom:16 },
};
function foc(e){ e.target.style.borderColor="rgba(79,70,229,.7)"; }
function blr(e){ e.target.style.borderColor="rgba(255,255,255,.09)"; }

// ─── PERMISSION SETUP MODAL ───────────────────────────────────────────────────
// This is shown once when participant first logs in — asks BOTH mic + location
function PermissionSetupModal({ name, onComplete }) {
  const [step,       setStep]      = useState(0); // 0=intro, 1=location, 2=mic, 3=done
  const [locGranted, setLocGranted]= useState(false);
  const [micGranted, setMicGranted]= useState(false);
  const [locLoading, setLocLoading]= useState(false);
  const [micLoading, setMicLoading]= useState(false);
  const firstName = name?.split(" ")[0] || "there";

  const requestLoc = async () => {
    setLocLoading(true);
    if (!navigator.geolocation) { setLocGranted(false); setLocLoading(false); setStep(2); return; }
    navigator.geolocation.getCurrentPosition(
      () => { setLocGranted(true); setLocLoading(false); setStep(2); },
      ()  => { setLocGranted(false); setLocLoading(false); setStep(2); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const requestMic = async () => {
    setMicLoading(true);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicGranted(true);
    } catch {
      setMicGranted(false);
    }
    setMicLoading(false);
    setStep(3);
  };

  const skipMic = () => { setMicGranted(false); setStep(3); };
  const skipLoc = () => { setLocGranted(false); setStep(2); };

  const screens = [
    // Intro
    <div key="intro" style={{ textAlign:"center", animation:"fadeInUp .4s ease" }}>
      <div style={{ fontSize:60, marginBottom:16 }}>👋</div>
      <div style={{ fontSize:26, fontWeight:900, marginBottom:10, letterSpacing:-0.5 }}>
        Hey {firstName}!
      </div>
      <div style={{ fontSize:15, color:"#888", lineHeight:1.8, marginBottom:32, maxWidth:360, margin:"0 auto 32px" }}>
        I'm your <span style={{ color:"#22D3EE", fontWeight:700 }}>CampusNav buddy</span>! I'll walk you through this campus step by step — just like a friend showing you around. 😊
        <br/><br/>
        I just need two quick things to guide you properly. It'll take 10 seconds!
      </div>
      <button style={{ ...S.btn(), fontSize:15, padding:"14px 36px" }} onClick={()=>setStep(1)}>
        Let's set up! →
      </button>
    </div>,

    // Location
    <div key="loc" style={{ textAlign:"center", animation:"fadeInUp .3s ease" }}>
      <div style={{ fontSize:56, marginBottom:16 }}>📍</div>
      <div style={{ fontSize:22, fontWeight:900, marginBottom:10 }}>Step 1 of 2 — Location</div>
      <div style={{ fontSize:14, color:"#888", lineHeight:1.8, marginBottom:8, maxWidth:380, margin:"0 auto 8px" }}>
        Allow me to see <strong style={{ color:"#fff" }}>where you are on campus</strong> so I can draw your path in real-time and tell you exactly how far you've walked.
      </div>
      <div style={{ fontSize:13, color:"#555", marginBottom:28 }}>Your location stays on your device only — never stored or shared.</div>
      <div style={{ display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap" }}>
        <button style={{ ...S.btn("teal"), fontSize:14, padding:"13px 28px", opacity: locLoading?0.7:1 }} onClick={requestLoc} disabled={locLoading}>
          {locLoading ? "⏳ Requesting…" : "📍 Allow Location Access"}
        </button>
        <button style={{ ...S.btn("g"), fontSize:14 }} onClick={skipLoc}>Skip for now</button>
      </div>
    </div>,

    // Mic
    <div key="mic" style={{ textAlign:"center", animation:"fadeInUp .3s ease" }}>
      <div style={{ fontSize:56, marginBottom:16 }}>🎙️</div>
      <div style={{ fontSize:22, fontWeight:900, marginBottom:10 }}>Step 2 of 2 — Voice Guide</div>
      <div style={{ fontSize:14, color:"#888", lineHeight:1.8, marginBottom:8, maxWidth:380, margin:"0 auto 8px" }}>
        Want me to <strong style={{ color:"#fff" }}>speak directions out loud</strong>? I'll talk to you like a friend — telling you where to turn, which floor to take, and when you've arrived!
      </div>
      <div style={{ fontSize:13, color:"#555", marginBottom:8 }}>Microphone is only used for audio output — I won't record anything you say.</div>
      <div style={{ background:"rgba(79,70,229,0.08)", border:"1px solid rgba(79,70,229,0.2)", borderRadius:10, padding:"12px 16px", marginBottom:28, fontSize:13, color:"#8B83FF", maxWidth:380, margin:"0 auto 28px" }}>
        💡 Even without this, you'll still see written step-by-step instructions on screen.
      </div>
      <div style={{ display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap" }}>
        <button style={{ ...S.btn("green"), fontSize:14, padding:"13px 28px", opacity: micLoading?0.7:1 }} onClick={requestMic} disabled={micLoading}>
          {micLoading ? "⏳ Requesting…" : "🎙️ Enable Voice Guide"}
        </button>
        <button style={{ ...S.btn("g"), fontSize:14 }} onClick={skipMic}>Text only is fine</button>
      </div>
    </div>,

    // Done
    <div key="done" style={{ textAlign:"center", animation:"fadeInUp .35s ease" }}>
      <div style={{ fontSize:60, marginBottom:16 }}>{micGranted && locGranted ? "🚀" : locGranted ? "📍" : micGranted ? "🎙️" : "👍"}</div>
      <div style={{ fontSize:24, fontWeight:900, marginBottom:12 }}>All set, {firstName}!</div>
      <div style={{ display:"flex", gap:12, justifyContent:"center", marginBottom:28, flexWrap:"wrap" }}>
        <div style={{ background: locGranted?"rgba(34,197,94,0.1)":"rgba(255,255,255,0.04)", border:`1px solid ${locGranted?"rgba(34,197,94,0.3)":"rgba(255,255,255,0.1)"}`, borderRadius:12, padding:"12px 20px", fontSize:13, color: locGranted?"#22C55E":"#555" }}>
          {locGranted ? "✅ Live GPS active" : "⬜ Location skipped"}
        </div>
        <div style={{ background: micGranted?"rgba(34,197,94,0.1)":"rgba(255,255,255,0.04)", border:`1px solid ${micGranted?"rgba(34,197,94,0.3)":"rgba(255,255,255,0.1)"}`, borderRadius:12, padding:"12px 20px", fontSize:13, color: micGranted?"#22C55E":"#555" }}>
          {micGranted ? "✅ Voice guide on" : "⬜ Text guide only"}
        </div>
      </div>
      <div style={{ fontSize:14, color:"#888", marginBottom:28, lineHeight:1.7 }}>
        {micGranted ? `I'll talk you through every step, ${firstName}. Let's find your hall! 🗣️` : `I'll show you written directions step by step. Let's go, ${firstName}! 👀`}
      </div>
      <button style={{ ...S.btn(), fontSize:15, padding:"14px 36px" }} onClick={()=>onComplete(locGranted, micGranted)}>
        Open My Campus Map →
      </button>
    </div>
  ];

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:500, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:"#0d0d1a", border:"1px solid rgba(79,70,229,0.35)", borderRadius:20, padding:"48px 40px", maxWidth:520, width:"100%", boxShadow:"0 24px 80px rgba(0,0,0,0.8)" }}>
        {/* Step dots */}
        <div style={{ display:"flex", justifyContent:"center", gap:8, marginBottom:36 }}>
          {[0,1,2,3].map(i=>(
            <div key={i} style={{ width: i===step?24:8, height:8, borderRadius:4, background: i<=step?"#4F46E5":"rgba(255,255,255,0.1)", transition:"all .3s" }}/>
          ))}
        </div>
        {screens[step]}
      </div>
    </div>
  );
}

// ─── FRIEND GUIDE PANEL ───────────────────────────────────────────────────────
function FriendGuide({ steps, currentStep, micGranted, svgPos, onSpeak }) {
  const [expanded, setExpanded] = useState(true);

  if (!steps.length) return null;

  const cs = steps[currentStep] || steps[steps.length-1];
  const isArrived = cs.type === "arrived";

  return (
    <div style={{ background: isArrived ? "rgba(34,197,94,0.08)" : "rgba(8,145,178,0.07)", border:`1px solid ${isArrived?"rgba(34,197,94,0.3)":"rgba(8,145,178,0.3)"}`, borderRadius:16, overflow:"hidden", marginBottom:20, animation:"fadeInUp .4s ease" }}>
      {/* Header */}
      <div style={{ padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:`1px solid ${isArrived?"rgba(34,197,94,0.15)":"rgba(8,145,178,0.15)"}`, cursor:"pointer" }}
        onClick={()=>setExpanded(e=>!e)}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:"50%", background: isArrived?"rgba(34,197,94,0.2)":"rgba(34,211,238,0.15)", border:`2px solid ${isArrived?"#22C55E":"#22D3EE"}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>
            🤖
          </div>
          <div>
            <div style={{ fontSize:11, fontFamily:"monospace", color: isArrived?"#22C55E":"#22D3EE", letterSpacing:1.5, marginBottom:2 }}>
              {isArrived ? "✅ ARRIVED" : `CAMPUSNAV BUDDY · STEP ${currentStep+1} OF ${steps.length}`}
            </div>
            <div style={{ fontSize:14, fontWeight:700, color:"#fff", lineHeight:1.4 }}>{cs.icon} {cs.text}</div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
          {micGranted && cs.speak && (
            <button style={{ background:"rgba(34,211,238,0.1)", border:"1px solid rgba(34,211,238,0.3)", borderRadius:8, padding:"5px 12px", color:"#22D3EE", fontSize:12, cursor:"pointer", fontFamily:"inherit", fontWeight:600 }}
              onClick={e=>{ e.stopPropagation(); onSpeak(cs.text); }}>
              🔊 Repeat
            </button>
          )}
          <span style={{ color:"#555", fontSize:18 }}>{expanded?"▲":"▼"}</span>
        </div>
      </div>

      {/* Steps list */}
      {expanded && (
        <div style={{ padding:"16px 18px" }}>
          <div style={{ fontSize:11, fontFamily:"monospace", color:"#555", letterSpacing:1.5, marginBottom:14 }}>ALL STEPS</div>
          {steps.map((s, i) => (
            <div key={i} style={{ display:"flex", gap:12, padding:"10px 0", borderBottom: i<steps.length-1?"1px solid rgba(255,255,255,0.04)":"none", opacity: i<currentStep?0.45:1, transition:"opacity .3s" }}>
              <div style={{ width:28, height:28, borderRadius:"50%", background: i<currentStep?"rgba(34,197,94,0.15)": i===currentStep?"rgba(34,211,238,0.15)":"rgba(255,255,255,0.05)", border:`1.5px solid ${i<currentStep?"#22C55E":i===currentStep?"#22D3EE":"rgba(255,255,255,0.1)"}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, flexShrink:0, marginTop:2 }}>
                {i < currentStep ? "✓" : s.icon}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, color: i===currentStep?"#fff": i<currentStep?"#555":"#aaa", lineHeight:1.55, fontWeight: i===currentStep?600:400 }}>
                  {s.text}
                </div>
                {i === currentStep && (
                  <div style={{ marginTop:6, fontSize:11, color:"#22D3EE", fontFamily:"monospace" }}>← CURRENT STEP</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── LIVE DOT ─────────────────────────────────────────────────────────────────
function LiveDot({ pos, tick }) {
  if (!pos) return null;
  const pulse = 0.3 + Math.abs(Math.sin(tick * 0.12)) * 0.7;
  return (
    <g>
      <circle cx={pos.x} cy={pos.y} r={22} fill="none" stroke="#22D3EE" strokeWidth={1.5} opacity={pulse * 0.45}/>
      <circle cx={pos.x} cy={pos.y} r={14} fill="rgba(34,211,238,0.14)" stroke="#22D3EE" strokeWidth={1.5} opacity={0.6 + pulse * 0.4}/>
      <circle cx={pos.x} cy={pos.y} r={7} fill="#22D3EE" filter="url(#locglow)"/>
      <circle cx={pos.x} cy={pos.y} r={3} fill="#fff"/>
      <rect x={pos.x-22} y={pos.y-32} width={44} height={17} rx={4} fill="rgba(34,211,238,0.92)"/>
      <text x={pos.x} y={pos.y-21} textAnchor="middle" fill="#000" fontSize={9} fontWeight="900" fontFamily="monospace">YOU</text>
    </g>
  );
}

// ─── CAMPUS MAP ───────────────────────────────────────────────────────────────
const CampusMap = memo(function CampusMap({ halls, targetHallNo, interactive, onDragEnd, livePos, showLive, destPt }) {
  const svgRef = useRef(null);
  const [localHalls, setLocalHalls] = useState(halls);
  const [dragging,   setDragging]   = useState(null);
  const dragOff = useRef({ x:0, y:0 });
  const [tick, setTick] = useState(0);

  useEffect(() => { setLocalHalls(halls); }, [halls]);
  useEffect(() => {
    const t = setInterval(() => setTick(v => (v+1)%300), 100);
    return () => clearInterval(t);
  }, []);

  const target   = localHalls.find(h => h.hall_no?.toLowerCase() === targetHallNo?.toLowerCase());
  // Use explicit destPt (GPS pin) if provided, else fall back to hall centre
  const pinPt    = destPt || (target ? { x: target.x + target.w/2, y: target.y + target.h/2 } : null);
  const pathFrom = (showLive && livePos) ? livePos : ENTRANCE;
  const pathStr  = buildPath(pathFrom, pinPt);
  const dashOff  = -(tick * 2.5);

  const getSVGCoords = useCallback((e) => {
    const rect = svgRef.current.getBoundingClientRect();
    return { x:(e.clientX-rect.left)*(MAP_W/rect.width), y:(e.clientY-rect.top)*(MAP_H/rect.height) };
  }, []);

  const onMD = useCallback((e, hall) => {
    if (!interactive) return;
    e.preventDefault();
    const p = getSVGCoords(e);
    dragOff.current = { x:p.x-hall.x, y:p.y-hall.y };
    setDragging(hall.id);
  }, [interactive, getSVGCoords]);

  const onMM = useCallback((e) => {
    if (!dragging) return;
    const p = getSVGCoords(e);
    setLocalHalls(prev => prev.map(h => h.id===dragging
      ? { ...h, x:Math.max(0,Math.min(MAP_W-80,p.x-dragOff.current.x)), y:Math.max(0,Math.min(MAP_H-50,p.y-dragOff.current.y)) }
      : h));
  }, [dragging, getSVGCoords]);

  const onMU = useCallback(() => {
    if (dragging && onDragEnd) { const m=localHalls.find(h=>h.id===dragging); if(m) onDragEnd(m); }
    setDragging(null);
  }, [dragging, localHalls, onDragEnd]);

  let distLabel = null;
  if (showLive && livePos && pinPt) {
    const d = svgDist(livePos, pinPt);
    const m = Math.round(d*(780/MAP_H));
    distLabel = m < 20 ? "🎯 Arrived!" : `~${m}m away`;
  }

  return (
    <div style={{ width:"100%", background:"#080810", borderRadius:14, overflow:"hidden", border:"1px solid rgba(255,255,255,0.07)" }}>
      <div style={{ padding:"10px 18px", display:"flex", gap:14, alignItems:"center", borderBottom:"1px solid rgba(255,255,255,0.05)", flexWrap:"wrap" }}>
        <span style={{ fontFamily:"monospace", fontSize:10, color:"#333", letterSpacing:2 }}>CAMPUS MAP</span>
        <span style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"#666" }}><span style={{ width:11,height:11,background:"#4F46E5",borderRadius:3,display:"inline-block" }}/>Hall</span>
        {destPt  && <span style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"#EF4444", fontWeight:700 }}><span style={{ fontSize:12 }}>📍</span>GPS Pin</span>}
        {!destPt && target && <span style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"#22C55E" }}><span style={{ width:11,height:11,background:"#22C55E",borderRadius:3,display:"inline-block" }}/>Destination</span>}
        {showLive && livePos && <span style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"#22D3EE" }}><span style={{ width:9,height:9,background:"#22D3EE",borderRadius:"50%",display:"inline-block" }}/>You</span>}
        <span style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"#F59E0B" }}><span style={{ width:16,height:3,background:"#F59E0B",borderRadius:2,display:"inline-block" }}/>Path</span>
        {distLabel && <span style={{ marginLeft:"auto", fontSize:12, color: distLabel.includes("Arrived")?"#22C55E":"#F59E0B", fontWeight:700, fontFamily:"monospace" }}>{distLabel}</span>}
        {interactive && <span style={{ marginLeft:"auto", fontSize:10, color:"#444", fontFamily:"monospace" }}>DRAG HALLS</span>}
      </div>
      <svg ref={svgRef} viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        style={{ width:"100%", height:"auto", display:"block", cursor:dragging?"grabbing":"default" }}
        onMouseMove={onMM} onMouseUp={onMU} onMouseLeave={onMU}>
        <defs>
          <pattern id="mapgrid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.025)" strokeWidth="1"/></pattern>
          <marker id="arr" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="#F59E0B"/></marker>
          <filter id="glow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          <filter id="locglow"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          <filter id="pinglow"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <rect width={MAP_W} height={MAP_H} fill="#080810"/>
        <rect width={MAP_W} height={MAP_H} fill="url(#mapgrid)"/>
        {pathStr && pinPt && <>
          <path d={pathStr} fill="none" stroke="rgba(245,158,11,0.1)" strokeWidth={18} strokeLinecap="round" strokeLinejoin="round"/>
          <path d={pathStr} fill="none" stroke="#F59E0B" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="14 7" strokeDashoffset={dashOff} markerEnd="url(#arr)"/>
        </>}
        {localHalls.map(hall => {
          const isTgt = hall.hall_no?.toLowerCase() === targetHallNo?.toLowerCase();
          const pulse = isTgt ? 0.4+Math.sin(tick*0.18)*0.5 : 0;
          return (
            <g key={hall.id} onMouseDown={e=>onMD(e,hall)} style={{ cursor:interactive?"grab":"default" }}>
              {isTgt && !destPt && <rect x={hall.x-7} y={hall.y-7} width={hall.w+14} height={hall.h+14} rx={10} fill="none" stroke="#22C55E" strokeWidth={2} strokeDasharray="6 4" opacity={0.3+pulse*0.7}/>}
              <rect x={hall.x} y={hall.y} width={hall.w} height={hall.h} rx={7}
                fill={isTgt?"rgba(34,197,94,0.12)":`${hall.color}18`}
                stroke={isTgt?"#22C55E":hall.color} strokeWidth={isTgt?2.5:1.5}
                filter={isTgt?"url(#glow)":"none"}/>
              <text x={hall.x+hall.w/2} y={hall.y+hall.h/2-5} textAnchor="middle" fill={isTgt?"#22C55E":"#fff"} fontSize={13} fontWeight="700" fontFamily="monospace">{hall.hall_no}</text>
              <text x={hall.x+hall.w/2} y={hall.y+hall.h/2+11} textAnchor="middle" fill={isTgt?"rgba(34,197,94,0.7)":"rgba(255,255,255,0.4)"} fontSize={9} fontFamily="sans-serif">
                {hall.hall_name.length>14?hall.hall_name.slice(0,14)+"…":hall.hall_name}
              </text>
            </g>
          );
        })}

        {/* ── RED GPS DESTINATION PIN ── rendered above halls, below live dot */}
        {destPt && (()=>{
          const px=destPt.x, py=destPt.y;
          const blink = 0.55 + Math.abs(Math.sin(tick*0.14))*0.45;
          return (
            <g>
              <circle cx={px} cy={py} r={34} fill="rgba(239,68,68,0.07)" stroke="rgba(239,68,68,0.25)" strokeWidth={1} strokeDasharray="5 3" opacity={blink}/>
              <circle cx={px} cy={py} r={20} fill="rgba(239,68,68,0.12)" stroke="rgba(239,68,68,0.5)" strokeWidth={1.5} opacity={blink}/>
              {/* pin shadow */}
              <ellipse cx={px} cy={py+22} rx={8} ry={4} fill="rgba(0,0,0,0.5)" filter="url(#pinglow)"/>
              {/* pin body circle */}
              <circle cx={px} cy={py} r={14} fill="#EF4444" filter="url(#pinglow)"/>
              <circle cx={px} cy={py} r={14} fill="none" stroke="#fff" strokeWidth={2}/>
              {/* inner white dot */}
              <circle cx={px} cy={py} r={5} fill="#fff"/>
              {/* pin tail teardrop */}
              <path d={`M ${px-6},${py+11} Q ${px},${py+26} ${px+6},${py+11}`} fill="#EF4444"/>
              {/* label badge */}
              <rect x={px-38} y={py-46} width={76} height={20} rx={6} fill="rgba(239,68,68,0.95)"/>
              <text x={px} y={py-32} textAnchor="middle" fill="#fff" fontSize={9} fontWeight="900" fontFamily="monospace">📍 DESTINATION</text>
            </g>
          );
        })()}

        <g>
          <circle cx={ENTRANCE.x} cy={ENTRANCE.y} r={20} fill="rgba(34,197,94,0.1)" stroke="#22C55E" strokeWidth={1.5}/>
          <circle cx={ENTRANCE.x} cy={ENTRANCE.y} r={12} fill="#22C55E" opacity={0.85}/>
          <text x={ENTRANCE.x} y={ENTRANCE.y+5} textAnchor="middle" fill="#fff" fontSize={10} fontWeight="900">↑</text>
          <text x={ENTRANCE.x} y={ENTRANCE.y+32} textAnchor="middle" fill="#22C55E" fontSize={9} fontFamily="monospace" letterSpacing={1}>ENTRANCE</text>
        </g>
        {showLive && <LiveDot pos={livePos} tick={tick}/>}
        {localHalls.length===0 && <text x={MAP_W/2} y={MAP_H/2} textAnchor="middle" fill="rgba(255,255,255,0.12)" fontSize={16}>Add halls using the panel →</text>}
      </svg>
      {(target||destPt) && (
        <div style={{ padding:"11px 18px", borderTop:`1px solid ${destPt?"rgba(239,68,68,0.2)":"rgba(34,197,94,0.15)"}`, background:destPt?"rgba(239,68,68,0.04)":"rgba(34,197,94,0.04)", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
          <span style={{ color: destPt?"#EF4444":"#22C55E", fontFamily:"monospace", fontWeight:700, fontSize:13 }}>
            {destPt ? `📍 GPS Pin — ${target?.hall_no||""} ${target?.hall_name||""}` : `📍 ${target?.hall_no} — ${target?.hall_name}`}
          </span>
          <span style={{ color:"#555", fontSize:12 }}>
            {target && `Floor ${target.floor} · Block ${target.block} · `}
            {destPt ? "Exact GPS destination" : ""}{showLive&&livePos?" · Live path from your GPS":" · Path from entrance"}
          </span>
        </div>
      )}
    </div>
  );
});

// ─── useGeoLocation hook ──────────────────────────────────────────────────────
function useGeoLocation() {
  const [locState,  setLocState]  = useState("idle");
  const [gpsCoords, setGpsCoords] = useState(null);
  const [svgPos,    setSvgPos]    = useState(null);
  const watchId = useRef(null);

  const startTracking = useCallback((granted) => {
    if (!granted || !navigator.geolocation) { setLocState(granted?"denied":"denied"); return; }
    setLocState("granted");
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        const { latitude:la, longitude:lo, accuracy:ac } = p.coords;
        setGpsCoords({ lat:la, lng:lo, accuracy:ac });
        setSvgPos(gpsToSVG(la, lo));
      },
      () => {},
      { enableHighAccuracy:true, maximumAge:3000, timeout:10000 }
    );
  }, []);

  const stop = useCallback(() => {
    if (watchId.current!==null) { navigator.geolocation.clearWatch(watchId.current); watchId.current=null; }
    setLocState("idle"); setGpsCoords(null); setSvgPos(null);
  }, []);

  useEffect(() => () => { if (watchId.current!==null) navigator.geolocation.clearWatch(watchId.current); }, []);

  return { locState, gpsCoords, svgPos, startTracking, stop };
}

// ─── HOME PAGE ────────────────────────────────────────────────────────────────
function HomePage({ setView, setActiveNavHall }) {
  const [q, setQ] = useState("");
  const go = () => { if (q.trim()) { setActiveNavHall(q.trim()); setView("search"); } };
  return (
    <div style={{ minHeight:"90vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", textAlign:"center", padding:"40px 20px", position:"relative" }}>
      <div style={{ position:"absolute", inset:0, backgroundImage:"linear-gradient(rgba(79,70,229,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(79,70,229,0.04) 1px,transparent 1px)", backgroundSize:"60px 60px", pointerEvents:"none" }}/>
      <div style={{ ...S.tag("#8B83FF"), marginBottom:20, fontSize:12, letterSpacing:2 }}>⚡ INTER-COLLEGE EVENT NAVIGATOR</div>
      <h1 style={{ fontSize:"clamp(32px,6vw,68px)", fontWeight:900, letterSpacing:-2, lineHeight:1.05, marginBottom:16 }}>
        <span style={{ background:"linear-gradient(135deg,#fff 0%,#a5b4fc 45%,#4F46E5 100%)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
          Never Get Lost<br/>On Campus Again
        </span>
      </h1>
      <p style={{ fontSize:17, color:"#666", maxWidth:480, lineHeight:1.75, marginBottom:44 }}>
        Your AI campus buddy guides you with live GPS, voice directions, and step-by-step instructions — just like a friend showing you around.
      </p>
      <div style={{ display:"flex", gap:10, width:"100%", maxWidth:520, marginBottom:48, background:"rgba(255,255,255,0.03)", border:"2px solid rgba(79,70,229,0.35)", borderRadius:14, padding:"8px 8px 8px 20px", alignItems:"center" }}>
        <span style={{ fontSize:18 }}>🔍</span>
        <input style={{ ...S.inp, border:"none", background:"none", fontSize:17, fontFamily:"monospace", letterSpacing:1 }}
          placeholder="Enter Hall No (e.g. A101, B201)…"
          value={q} onChange={e=>setQ(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&go()}/>
        <button style={{ ...S.btn(), flexShrink:0 }} onClick={go}>Find Hall →</button>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:20, maxWidth:840, width:"100%", marginBottom:48 }}>
        {[
          { icon:"🗺️", title:"Interactive Map",   desc:"Admin-built campus maps with drag-and-drop hall placement", view:"admin",       btn:"Map Builder" },
          { icon:"🎫", title:"Event Registration", desc:"Browse events and register. Get your unique ID in seconds", view:"events",      btn:"Browse Events" },
          { icon:"🤖", title:"AI Buddy Navigation",desc:"Voice + GPS + step-by-step friend guide to your hall",      view:"participant", btn:"Navigate Live" },
        ].map((f,i) => (
          <div key={i} style={{ ...S.card, textAlign:"left", animation:`fadeInUp .5s ease ${i*.1}s both` }}>
            <div style={{ fontSize:32, marginBottom:14 }}>{f.icon}</div>
            <div style={{ fontWeight:800, marginBottom:8, fontSize:15 }}>{f.title}</div>
            <div style={{ fontSize:13, color:"#555", lineHeight:1.65, marginBottom:16 }}>{f.desc}</div>
            <button style={{ ...S.btn(), fontSize:12, padding:"8px 16px" }} onClick={()=>setView(f.view)}>{f.btn}</button>
          </div>
        ))}
      </div>
      <div style={{ padding:"20px 28px", background:"rgba(79,70,229,0.06)", border:"1px solid rgba(79,70,229,0.2)", borderRadius:14, maxWidth:680, width:"100%", textAlign:"left" }}>
        <div style={{ fontFamily:"monospace", fontSize:11, color:"#4F46E5", letterSpacing:2, marginBottom:14 }}>DEMO CREDENTIALS</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
          <div>
            <div style={{ fontWeight:700, marginBottom:6, color:"#aaa", fontSize:13 }}>👨‍💼 Admin</div>
            <div style={{ fontFamily:"monospace", fontSize:12, color:"#666", lineHeight:2 }}>
              Username: <span style={{ color:"#4F46E5" }}>admin</span><br/>
              Password: <span style={{ color:"#4F46E5" }}>admin123</span>
            </div>
          </div>
          <div>
            <div style={{ fontWeight:700, marginBottom:6, color:"#aaa", fontSize:13 }}>🎫 Participant IDs</div>
            <div style={{ fontFamily:"monospace", fontSize:12, color:"#666", lineHeight:2 }}>
              <span style={{ color:"#22C55E" }}>REG-DEMO001</span><br/>
              <span style={{ color:"#22C55E" }}>REG-DEMO002</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── EVENTS PAGE ──────────────────────────────────────────────────────────────
function EventsPage({ events, registrations, setRegistrations, setView, setRegIdInput, showToast }) {
  const [selectedId, setSelectedId] = useState(null);
  const [regDone,    setRegDone]    = useState(null);
  const [err,        setErr]        = useState("");
  const [name,       setName]       = useState("");
  const [email,      setEmail]      = useState("");
  const [college,    setCollege]    = useState("");
  const [phone,      setPhone]      = useState("");

  const doRegister = () => {
    if (!name||!email||!college) { setErr("Fill all required fields"); return; }
    const ev = events.find(e=>e.id===selectedId);
    const nr = { id:genId(), reg_id:genRegId(), name, email, college, phone, event_id:selectedId, hall_no:ev.hall_no };
    setRegistrations(prev=>[...prev,nr]);
    setRegDone(nr);
    showToast("Registered successfully!");
  };
  const resetForm = () => { setName(""); setEmail(""); setCollege(""); setPhone(""); setErr(""); };

  if (regDone) return (
    <div style={{ padding:"40px 28px", display:"flex", justifyContent:"center" }}>
      <div style={{ ...S.card, maxWidth:480, width:"100%", textAlign:"center", animation:"fadeInUp .4s ease" }}>
        <div style={{ fontSize:56, marginBottom:16 }}>🎉</div>
        <div style={{ fontSize:26, fontWeight:900, marginBottom:8 }}>You're in!</div>
        <div style={{ color:"#888", marginBottom:24 }}>Save this ID — your buddy will use it to find your hall</div>
        <div style={{ fontFamily:"monospace", fontSize:26, fontWeight:900, color:"#22C55E", background:"rgba(34,197,94,0.08)", border:"1px solid rgba(34,197,94,0.2)", borderRadius:12, padding:"16px 24px", marginBottom:20, letterSpacing:2 }}>{regDone.reg_id}</div>
        <div style={{ fontSize:14, color:"#666", marginBottom:6 }}>Hall: <span style={S.tag("#22C55E")}>{regDone.hall_no}</span></div>
        <div style={{ display:"flex", gap:10, marginTop:24 }}>
          <button style={{ ...S.btn(), flex:1 }} onClick={()=>{ setRegIdInput(regDone.reg_id); setView("participant"); }}>Start Navigation →</button>
          <button style={{ ...S.btn("g"), flex:1 }} onClick={()=>{ setRegDone(null); setSelectedId(null); resetForm(); }}>Register Another</button>
        </div>
      </div>
    </div>
  );

  if (selectedId) {
    const ev = events.find(e=>e.id===selectedId);
    return (
      <div style={{ padding:"32px 28px", display:"flex", justifyContent:"center" }}>
        <div style={{ maxWidth:520, width:"100%", animation:"fadeInUp .35s ease" }}>
          <button style={{ ...S.btn("g"), marginBottom:20 }} onClick={()=>{ setSelectedId(null); resetForm(); }}>← Back</button>
          <div style={{ ...S.card, background:"rgba(79,70,229,0.07)", border:"1px solid rgba(79,70,229,0.25)", marginBottom:20 }}>
            <div style={{ fontSize:11, color:"#8B83FF", fontFamily:"monospace", letterSpacing:2, marginBottom:8 }}>REGISTERING FOR</div>
            <div style={{ fontSize:20, fontWeight:800, marginBottom:6 }}>{ev.name}</div>
            <div style={{ fontSize:13, color:"#666" }}>🏛️ MIT Chennai · 📅 {ev.date} · Hall: <span style={S.tag("#22C55E")}>{ev.hall_no}</span></div>
          </div>
          {err && <div style={S.err}>{err}</div>}
          <div style={S.card}>
            <div style={{ fontWeight:800, marginBottom:20 }}>Your Details</div>
            {[["NAME *","text",name,setName],["EMAIL *","email",email,setEmail],["YOUR COLLEGE *","text",college,setCollege],["PHONE (optional)","tel",phone,setPhone]].map(([l,t,v,sv])=>(
              <div key={l} style={{ marginBottom:14 }}>
                <label style={S.lbl}>{l}</label>
                <input style={S.inp} type={t} value={v} onChange={e=>sv(e.target.value)} onFocus={foc} onBlur={blr}/>
              </div>
            ))}
            <button style={{ ...S.btn(), width:"100%", padding:14, fontSize:15, marginTop:6 }} onClick={doRegister}>Complete Registration →</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding:"32px 28px", maxWidth:1160, margin:"0 auto" }}>
      <div style={{ marginBottom:32 }}>
        <div style={{ fontSize:11, fontFamily:"monospace", color:"#555", letterSpacing:2, marginBottom:8 }}>EVENTS</div>
        <div style={{ fontSize:32, fontWeight:900, letterSpacing:-1 }}>All Events</div>
        <div style={{ color:"#555", marginTop:6, fontSize:14 }}>{events.length} events · MIT Chennai Campus</div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:18 }}>
        {events.map((ev,i) => (
          <div key={ev.id} style={{ ...S.card, animation:`fadeInUp .4s ease ${i*.07}s both`, cursor:"pointer", transition:"border-color .2s,transform .2s" }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(79,70,229,.5)";e.currentTarget.style.transform="translateY(-3px)";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,.07)";e.currentTarget.style.transform="none";}}>
            <div style={{ marginBottom:12 }}><span style={S.tag(ev.category==="Technical"?"#4F46E5":ev.category==="Cultural"?"#EC4899":ev.category==="Workshop"?"#D97706":"#059669")}>{ev.category}</span></div>
            <div style={{ fontSize:17, fontWeight:800, marginBottom:8, lineHeight:1.3 }}>{ev.name}</div>
            <div style={{ fontSize:13, color:"#666", lineHeight:1.6, marginBottom:16 }}>{ev.description}</div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ fontSize:12, color:"#555", marginBottom:6, fontFamily:"monospace" }}>📅 {ev.date}</div>
                <span style={S.tag("#22C55E")}>Hall: {ev.hall_no}</span>
              </div>
              <button style={{ ...S.btn(), fontSize:13, padding:"9px 18px" }} onClick={()=>setSelectedId(ev.id)}>Register →</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── PARTICIPANT PAGE ─────────────────────────────────────────────────────────
function ParticipantPage({ events, halls, registrations, regIdInput, setRegIdInput, participant, setParticipant, showToast }) {
  const [err,          setErr]          = useState("");
  const [navHall,      setNavHall]      = useState("");
  const [searchVal,    setSearchVal]    = useState("");
  const [showSetup,    setShowSetup]    = useState(false);
  const [micGranted,   setMicGranted]   = useState(false);
  const [currentStep,  setCurrentStep]  = useState(0);
  const lastSpokenStep = useRef(-1);

  const { locState, gpsCoords, svgPos, startTracking, stop } = useGeoLocation();

  const login = () => {
    const reg = registrations.find(r => r.reg_id === regIdInput.trim().toUpperCase());
    if (!reg) { setErr("ID not found. Try REG-DEMO001 or REG-DEMO002"); return; }
    const ev = events.find(e => e.id === reg.event_id);
    setParticipant({ ...reg, event: ev });
    setNavHall(reg.hall_no);
    setSearchVal(reg.hall_no);
    setErr("");
    // Show setup modal after a brief delay
    setTimeout(() => setShowSetup(true), 300);
  };

  const handleSetupComplete = (locG, micG) => {
    setShowSetup(false);
    setMicGranted(micG);
    startTracking(locG);
    // Greet with voice
    if (micG && participant) {
      const n = participant.name.split(" ")[0];
      setTimeout(() => speak(`Hey ${n}! Welcome to MIT Chennai Campus. I'll guide you to your hall step by step. Let's go!`, true), 500);
    }
  };

  const logout = () => {
    stop();
    setParticipant(null);
    setRegIdInput("");
    setNavHall("");
    setSearchVal("");
    setMicGranted(false);
    setCurrentStep(0);
    lastSpokenStep.current = -1;
  };

  const showLive   = locState === "granted" && svgPos !== null;
  const targetHall = halls.find(h => h.hall_no?.toLowerCase() === navHall?.toLowerCase());
  const navEvent   = events.find(e => e.hall_no?.toLowerCase() === navHall?.toLowerCase());
  const eventDestPt = (navEvent?.dest_lat && navEvent?.dest_lng)
    ? gpsToSVG(navEvent.dest_lat, navEvent.dest_lng)
    : null;
  const steps = getFriendlySteps(targetHall, showLive ? svgPos : null, participant?.name, navEvent, gpsCoords);

  // Auto-advance step based on position
  useEffect(() => {
    if (!showLive || !svgPos || !targetHall || !steps.length) return;
    const tx = targetHall.x + targetHall.w/2, ty = targetHall.y + targetHall.h/2;
    const dist = svgDist(svgPos, { x:tx, y:ty });
    const m = dist * (780/MAP_H);
    let newStep = 0;
    if (m < 20) newStep = steps.length - 1;
    else if (m < 60) newStep = Math.min(steps.length-2, steps.length-1);
    else if (m < 120) newStep = Math.min(Math.floor(steps.length*0.6), steps.length-2);
    else if (m < 200) newStep = Math.min(Math.floor(steps.length*0.35), steps.length-2);
    else newStep = Math.min(1, steps.length-1);
    if (newStep !== currentStep) setCurrentStep(newStep);
  }, [svgPos, showLive]);

  // Auto-speak when step changes
  useEffect(() => {
    if (!steps.length || currentStep === lastSpokenStep.current) return;
    const s = steps[currentStep];
    if (s && s.speak) {
      speak(s.text, micGranted);
      lastSpokenStep.current = currentStep;
    }
  }, [currentStep, steps, micGranted]);

  // Re-calculate steps when navHall changes
  useEffect(() => { setCurrentStep(0); lastSpokenStep.current = -1; }, [navHall]);

  const doSpeak = useCallback((text) => speak(text, micGranted), [micGranted]);

  if (!participant) return (
    <div style={{ padding:"60px 28px", display:"flex", justifyContent:"center" }}>
      <div style={{ maxWidth:420, width:"100%", animation:"fadeInUp .4s ease" }}>
        <div style={{ textAlign:"center", marginBottom:36 }}>
          <div style={{ fontSize:52, marginBottom:14 }}>🤖</div>
          <div style={{ fontSize:28, fontWeight:900, letterSpacing:-1, marginBottom:8 }}>Participant Login</div>
          <div style={{ fontSize:14, color:"#666", lineHeight:1.8 }}>Enter your Registration ID and your campus buddy will set up GPS + voice navigation for you personally.</div>
        </div>
        {err && <div style={S.err}>{err}</div>}
        <div style={S.card}>
          <label style={S.lbl}>REGISTRATION ID</label>
          <input style={{ ...S.inp, fontFamily:"monospace", fontSize:18, letterSpacing:2, textAlign:"center", marginBottom:16 }}
            placeholder="REG-XXXXXXXX" value={regIdInput}
            onChange={e=>setRegIdInput(e.target.value.toUpperCase())}
            onKeyDown={e=>e.key==="Enter"&&login()} onFocus={foc} onBlur={blr}/>
          <button style={{ ...S.btn(), width:"100%", padding:14, fontSize:15 }} onClick={login}>Enter Campus →</button>
          <div style={{ marginTop:16, padding:"10px 14px", background:"rgba(79,70,229,0.06)", borderRadius:10, fontSize:12, color:"#666", fontFamily:"monospace", lineHeight:2.2 }}>
            Try:{" "}
            <span style={{ color:"#22C55E", cursor:"pointer", textDecoration:"underline" }} onClick={()=>setRegIdInput("REG-DEMO001")}>REG-DEMO001</span>
            {" "}or{" "}
            <span style={{ color:"#22C55E", cursor:"pointer", textDecoration:"underline" }} onClick={()=>setRegIdInput("REG-DEMO002")}>REG-DEMO002</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {showSetup && <PermissionSetupModal name={participant.name} onComplete={handleSetupComplete}/>}

      <div style={{ padding:"22px 20px", maxWidth:1160, margin:"0 auto" }}>
        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:18, flexWrap:"wrap", gap:14 }}>
          <div>
            <div style={{ fontSize:22, fontWeight:900, letterSpacing:-0.5 }}>Hey {participant.name.split(" ")[0]}! 👋</div>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:8, flexWrap:"wrap" }}>
              <span style={S.tag("#8B83FF")}>{participant.reg_id}</span>
              {locState === "granted" && gpsCoords && (
                <span style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:"#22D3EE", fontWeight:700 }}>
                  <span style={{ width:7,height:7,background:"#22D3EE",borderRadius:"50%",display:"inline-block",animation:"livepulse 1.2s ease infinite" }}/>
                  GPS LIVE ±{gpsCoords.accuracy?Math.round(gpsCoords.accuracy):"-"}m
                </span>
              )}
              {micGranted && <span style={{ fontSize:12, color:"#22C55E", fontWeight:700 }}>🎙️ VOICE ON</span>}
            </div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            {!showSetup && (
              <button style={{ ...S.btn("teal"), fontSize:12, padding:"8px 16px" }} onClick={()=>setShowSetup(true)}>
                ⚙️ Permissions
              </button>
            )}
            <button style={S.btn("d")} onClick={logout}>Logout</button>
          </div>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"300px 1fr", gap:20 }}>
          {/* Left panel */}
          <div>
            {/* Event info */}
            <div style={S.card}>
              <div style={{ fontSize:11, fontFamily:"monospace", color:"#555", letterSpacing:2, marginBottom:14 }}>YOUR EVENT</div>
              <div style={{ textAlign:"center", background:"rgba(34,197,94,0.06)", border:"1px solid rgba(34,197,94,0.2)", borderRadius:12, padding:"14px 20px", marginBottom:16 }}>
                <div style={{ fontSize:10, color:"#555", fontFamily:"monospace", marginBottom:5 }}>ASSIGNED HALL</div>
                <div style={{ fontFamily:"monospace", fontSize:30, fontWeight:900, color:"#22C55E", letterSpacing:2 }}>{participant.hall_no}</div>
              </div>
              {[["Event",participant.event?.name],["Date",participant.event?.date],["Reg. Desk",participant.event?.reg_desk||"Main Entrance"]].map(([l,v])=>(
                <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid rgba(255,255,255,0.04)", fontSize:12 }}>
                  <span style={{ color:"#555" }}>{l}</span>
                  <span style={{ fontWeight:600, textAlign:"right", maxWidth:160, fontSize:11 }}>{v}</span>
                </div>
              ))}

              {/* GPS pin info */}
              {navEvent?.dest_lat && navEvent?.dest_lng ? (
                <div style={{ marginTop:14, background:"rgba(239,68,68,0.06)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:12, padding:"12px 14px" }}>
                  <div style={{ fontSize:10, fontFamily:"monospace", color:"#EF4444", letterSpacing:1.5, marginBottom:8 }}>📍 GPS DESTINATION PIN</div>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5, fontSize:12 }}>
                    <span style={{ color:"#888" }}>Latitude</span>
                    <span style={{ fontFamily:"monospace", color:"#EF9999", fontSize:11 }}>{Number(navEvent.dest_lat).toFixed(6)}°</span>
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10, fontSize:12 }}>
                    <span style={{ color:"#888" }}>Longitude</span>
                    <span style={{ fontFamily:"monospace", color:"#EF9999", fontSize:11 }}>{Number(navEvent.dest_lng).toFixed(6)}°</span>
                  </div>
                  {gpsCoords && (
                    <div style={{ paddingTop:8, borderTop:"1px solid rgba(239,68,68,0.15)", fontSize:12 }}>
                      <div style={{ display:"flex", justifyContent:"space-between" }}>
                        <span style={{ color:"#888" }}>Distance to pin</span>
                        <span style={{ fontFamily:"monospace", color:"#F59E0B", fontWeight:700 }}>
                          {(()=>{
                            const d = gpsDist(gpsCoords.lat, gpsCoords.lng, navEvent.dest_lat, navEvent.dest_lng);
                            return d < 1000 ? `${Math.round(d)}m` : `${(d/1000).toFixed(2)}km`;
                          })()}
                        </span>
                      </div>
                    </div>
                  )}
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${navEvent.dest_lat},${navEvent.dest_lng}`}
                    target="_blank" rel="noreferrer"
                    style={{ display:"block", marginTop:10, textAlign:"center", background:"rgba(239,68,68,0.12)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:8, padding:"7px 0", color:"#EF4444", fontSize:12, fontWeight:700, textDecoration:"none" }}>
                    🗺️ Open in Google Maps →
                  </a>
                </div>
              ) : (
                <div style={{ marginTop:14, padding:"10px 12px", background:"rgba(255,255,255,0.02)", borderRadius:10, fontSize:11, color:"#555", fontFamily:"monospace" }}>
                  ⬜ No GPS pin set for this event
                </div>
              )}
            </div>

            {/* Hall search */}
            <div style={S.card}>
              <div style={{ fontSize:11, fontFamily:"monospace", color:"#555", letterSpacing:2, marginBottom:12 }}>NAVIGATE TO HALL</div>
              <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                <input style={{ ...S.inp, fontFamily:"monospace", letterSpacing:1 }}
                  placeholder="Hall No…" value={searchVal}
                  onChange={e=>setSearchVal(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&setNavHall(searchVal)}
                  onFocus={foc} onBlur={blr}/>
                <button style={{ ...S.btn(), padding:"10px 14px", flexShrink:0 }} onClick={()=>setNavHall(searchVal)}>Go</button>
              </div>
              <button style={{ ...S.btn("g"), width:"100%", fontSize:13, marginBottom:12 }}
                onClick={()=>{ setSearchVal(participant.hall_no); setNavHall(participant.hall_no); }}>
                📍 My Event Hall
              </button>
              <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                {halls.map(h=>(
                  <button key={h.id}
                    style={{ ...S.tag(h.hall_no===navHall?"#22C55E":"#4F46E5"), cursor:"pointer", border:`1px solid ${h.hall_no===navHall?"#22C55E55":"#4F46E555"}`, background:`${h.hall_no===navHall?"#22C55E":"#4F46E5"}22`, fontSize:11 }}
                    onClick={()=>{ setSearchVal(h.hall_no); setNavHall(h.hall_no); }}>
                    {h.hall_no}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right panel: buddy guide + map */}
          <div>
            {/* Friend guide */}
            {navHall && <FriendGuide steps={steps} currentStep={currentStep} micGranted={micGranted} svgPos={svgPos} onSpeak={doSpeak}/>}

            {/* Map */}
            <div style={{ ...S.card, padding:0, overflow:"hidden" }}>
              <div style={{ padding:"13px 20px", borderBottom:"1px solid rgba(255,255,255,0.05)", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10 }}>
                <span style={{ fontFamily:"monospace", fontSize:11, color:"#555", letterSpacing:2 }}>MIT CHENNAI CAMPUS MAP</span>
                <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                  {navHall && <span style={{ fontSize:12, color:"#22C55E", fontFamily:"monospace" }}>→ {navHall}</span>}
                  {eventDestPt && <span style={{ fontSize:11, color:"#EF4444", fontWeight:700, display:"flex", alignItems:"center", gap:4 }}>
                    <span>📍</span>GPS PIN ACTIVE
                  </span>}
                  {showLive && <span style={{ fontSize:11, color:"#22D3EE", fontWeight:700, display:"flex", alignItems:"center", gap:5 }}><span style={{ width:7,height:7,background:"#22D3EE",borderRadius:"50%",display:"inline-block",animation:"livepulse 1s ease infinite" }}/>LIVE GPS</span>}
                </div>
              </div>
              <div style={{ padding:16 }}>
                <CampusMap halls={halls} targetHallNo={navHall} interactive={false} livePos={svgPos} showLive={showLive} destPt={eventDestPt}/>
              </div>
              {!showLive && (
                <div style={{ padding:"11px 20px", borderTop:"1px solid rgba(255,255,255,0.04)", background:"rgba(255,255,255,0.01)", fontSize:12, color:"#555", display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                  {eventDestPt
                    ? <span>📍 <strong style={{ color:"#EF4444" }}>GPS pin set</strong> — red pin marks the exact hall entrance. Enable live GPS above for a real-time path from your location.</span>
                    : <span>💡 Click <strong style={{ color:"#22D3EE" }}>⚙️ Permissions</strong> above to enable live GPS tracking on the map.</span>
                  }
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── HALL SEARCH PAGE ─────────────────────────────────────────────────────────
function SearchPage({ halls, events, activeNavHall, setActiveNavHall }) {
  const [q, setQ] = useState(activeNavHall||"");
  const [confirmed, setConfirmed] = useState(activeNavHall||"");
  const confirm = (val) => { setConfirmed(val); setActiveNavHall(val); };
  const found = halls.find(h=>h.hall_no?.toLowerCase()===confirmed?.toLowerCase());
  const hallEvents = events.filter(e=>e.hall_no?.toLowerCase()===confirmed?.toLowerCase());
  return (
    <div style={{ padding:"32px 28px", maxWidth:1160, margin:"0 auto" }}>
      <div style={{ fontSize:11, fontFamily:"monospace", color:"#555", letterSpacing:2, marginBottom:16 }}>HALL FINDER</div>
      <div style={{ display:"flex", gap:12, marginBottom:24, background:"rgba(255,255,255,0.025)", border:"2px solid rgba(79,70,229,.4)", borderRadius:14, padding:"8px 8px 8px 22px", alignItems:"center" }}>
        <span style={{ fontSize:18 }}>🔍</span>
        <input style={{ ...S.inp, border:"none", background:"none", fontSize:18, fontFamily:"monospace", letterSpacing:2 }}
          placeholder="Enter Hall Number…" value={q} onChange={e=>setQ(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&confirm(q)}/>
        <button style={{ ...S.btn(), fontSize:15, padding:"12px 24px" }} onClick={()=>confirm(q)}>Search</button>
      </div>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:28 }}>
        {halls.map(h=>(
          <button key={h.id}
            style={{ ...S.tag(h.hall_no===confirmed?"#22C55E":"#4F46E5"), cursor:"pointer", border:`1px solid ${h.hall_no===confirmed?"#22C55E55":"#4F46E555"}`, fontSize:13, padding:"6px 14px" }}
            onClick={()=>{ setQ(h.hall_no); confirm(h.hall_no); }}>
            {h.hall_no}
          </button>
        ))}
      </div>
      {confirmed ? (
        <div>
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:22, fontWeight:900 }}>
              {found ? <><span style={{ color:"#22C55E" }}>✓</span> {confirmed} — {found.hall_name}</> : <><span style={{ color:"#EF4444" }}>✗</span> Hall "{confirmed}" not found</>}
            </div>
            {found && <div style={{ color:"#666", marginTop:4, fontSize:14 }}>Floor {found.floor} · Block {found.block}</div>}
          </div>
          {hallEvents.length>0 && (
            <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:20 }}>
              {hallEvents.map(ev=>(
                <div key={ev.id} style={{ ...S.card, padding:"14px 18px", marginBottom:0 }}>
                  <div style={{ fontWeight:700, marginBottom:4 }}>{ev.name}</div>
                  <div style={{ fontSize:12, color:"#555", fontFamily:"monospace" }}>📅 {ev.date}</div>
                </div>
              ))}
            </div>
          )}
          <CampusMap halls={halls} targetHallNo={confirmed} interactive={false}/>
        </div>
      ) : (
        <div style={{ textAlign:"center", padding:"80px 20px", color:"#555" }}>
          <div style={{ fontSize:48, marginBottom:16 }}>🗺️</div>
          <p>Enter a hall number or click a hall tag above</p>
        </div>
      )}
    </div>
  );
}

// ─── ADMIN PAGE ───────────────────────────────────────────────────────────────
function AdminPage({ halls, setHalls, events, setEvents, registrations, showToast }) {
  const [loggedIn,   setLoggedIn]   = useState(false);
  const [adminTab,   setAdminTab]   = useState("overview");
  const [uname,      setUname]      = useState("");
  const [pass,       setPass]       = useState("");
  const [loginErr,   setLoginErr]   = useState("");
  const [eName,      setEName]      = useState("");
  const [eDate,      setEDate]      = useState("");
  const [eHall,      setEHall]      = useState("");
  const [eCat,       setECat]       = useState("");
  const [eDesc,      setEDesc]      = useState("");
  const [eDesk,      setEDesk]      = useState("");
  const [eLat,       setELat]       = useState("");
  const [eLng,       setELng]       = useState("");
  const [locFetching,setLocFetching]= useState(false);
  const [editEvId,   setEditEvId]   = useState(null);
  const [hallWarn,   setHallWarn]   = useState(""); // "" | "ok" | "missing"
  const [hNo,        setHNo]        = useState("");
  const [hName,      setHName]      = useState("");
  const [hFloor,     setHFloor]     = useState(1);
  const [hBlock,     setHBlock]     = useState("");
  const [hColor,     setHColor]     = useState("#4F46E5");
  const [editHallId, setEditHallId] = useState(null);

  const doLogin = () => {
    if ((uname==="admin"||uname==="mitchennai") && pass==="admin123") { setLoggedIn(true); setLoginErr(""); }
    else setLoginErr("Wrong credentials — use admin / admin123");
  };
  const clearEF = () => { setEName(""); setEDate(""); setEHall(""); setECat(""); setEDesc(""); setEDesk(""); setELat(""); setELng(""); setEditEvId(null); setHallWarn(""); };
  const clearHF = () => { setHNo(""); setHName(""); setHFloor(1); setHBlock(""); setHColor("#4F46E5"); setEditHallId(null); };

  // Check if typed hall no exists in the map
  const checkHall = (val) => {
    setEHall(val);
    if (!val.trim()) { setHallWarn(""); return; }
    const exists = halls.some(h => h.hall_no.trim().toLowerCase() === val.trim().toLowerCase());
    setHallWarn(exists ? "ok" : "missing");
  };

  // Auto-detect admin's current location and fill lat/lng
  const autoDetectLocation = () => {
    if (!navigator.geolocation) { showToast("Geolocation not supported","err"); return; }
    setLocFetching(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setELat(pos.coords.latitude.toFixed(7));
        setELng(pos.coords.longitude.toFixed(7));
        setLocFetching(false);
        showToast("Location detected! Adjust if needed.");
      },
      () => { setLocFetching(false); showToast("Could not detect location","err"); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const saveEvent = () => {
    if (!eName||!eDate||!eHall) { showToast("Name, date & hall required","err"); return; }
    // Hard-check: hall must exist in the map
    const hallExists = halls.some(h => h.hall_no.trim().toLowerCase() === eHall.trim().toLowerCase());
    if (!hallExists) {
      setHallWarn("missing");
      showToast(`Hall "${eHall}" not found — add it in Map Builder first!`, "err");
      return;
    }
    const lat = parseFloat(eLat), lng = parseFloat(eLng);
    const ev = {
      name:eName, date:eDate, hall_no:eHall.trim().toUpperCase(), category:eCat,
      description:eDesc, reg_desk:eDesk,
      dest_lat: !isNaN(lat) ? lat : null,
      dest_lng: !isNaN(lng) ? lng : null,
    };
    if (editEvId) { setEvents(p=>p.map(e=>e.id===editEvId?{...e,...ev}:e)); showToast("Updated!"); }
    else           { setEvents(p=>[...p,{id:genId(),...ev}]); showToast("Event created with GPS pin!"); }
    clearEF();
  };
  const editEvent = (ev) => {
    setEName(ev.name); setEDate(ev.date); setEHall(ev.hall_no);
    setECat(ev.category||""); setEDesc(ev.description||""); setEDesk(ev.reg_desk||"");
    setELat(ev.dest_lat ? String(ev.dest_lat) : "");
    setELng(ev.dest_lng ? String(ev.dest_lng) : "");
    setEditEvId(ev.id); setAdminTab("events");
    const exists = halls.some(h => h.hall_no.trim().toLowerCase() === ev.hall_no.trim().toLowerCase());
    setHallWarn(exists ? "ok" : "missing");
  };
  const saveHall = () => {
    if (!hNo||!hName) { showToast("Hall No & Name required","err"); return; }
    const h = { hall_no:hNo, hall_name:hName, floor:hFloor, block:hBlock, color:hColor, w:120, h:75 };
    if (editHallId) { setHalls(p=>p.map(x=>x.id===editHallId?{...x,...h}:x)); showToast("Updated!"); }
    else { const i=halls.length; setHalls(p=>[...p,{id:genId(),...h, x:(i*70)%580+40, y:Math.floor(i/8)*120+50}]); showToast("Hall added!"); }
    clearHF();
  };
  const editHall = (h) => { setHNo(h.hall_no); setHName(h.hall_name); setHFloor(h.floor); setHBlock(h.block||""); setHColor(h.color); setEditHallId(h.id); setAdminTab("map"); };
  const onDragEnd = useCallback((moved) => setHalls(prev=>prev.map(h=>h.id===moved.id?moved:h)), [setHalls]);

  if (!loggedIn) return (
    <div style={{ padding:"60px 28px", display:"flex", justifyContent:"center" }}>
      <div style={{ maxWidth:420, width:"100%", animation:"fadeInUp .4s ease" }}>
        <div style={{ textAlign:"center", marginBottom:32 }}><div style={{ fontSize:48, marginBottom:12 }}>🏫</div><div style={{ fontSize:28, fontWeight:900, letterSpacing:-1 }}>Admin Login</div></div>
        {loginErr && <div style={S.err}>{loginErr}</div>}
        <div style={S.card}>
          <label style={S.lbl}>USERNAME</label>
          <input style={{ ...S.inp, marginBottom:14 }} value={uname} onChange={e=>setUname(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doLogin()} onFocus={foc} onBlur={blr}/>
          <label style={S.lbl}>PASSWORD</label>
          <input type="password" style={{ ...S.inp, marginBottom:16 }} value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doLogin()} onFocus={foc} onBlur={blr}/>
          <div style={{ padding:"10px 14px", background:"rgba(79,70,229,0.06)", borderRadius:8, marginBottom:16, fontSize:12, color:"#666", fontFamily:"monospace" }}>admin / admin123</div>
          <button style={{ ...S.btn(), width:"100%", padding:14 }} onClick={doLogin}>Login →</button>
        </div>
      </div>
    </div>
  );

  const tabs = [{id:"overview",icon:"📊",label:"Overview"},{id:"events",icon:"🎪",label:"Events"},{id:"map",icon:"🗺️",label:"Map Builder"}];
  return (
    <div style={{ display:"flex" }}>
      <div style={{ width:230, background:"rgba(255,255,255,0.015)", borderRight:"1px solid rgba(255,255,255,0.05)", minHeight:"calc(100vh - 60px)", padding:"20px 12px", flexShrink:0, display:"flex", flexDirection:"column" }}>
        <div style={{ padding:"4px 12px 20px", borderBottom:"1px solid rgba(255,255,255,0.05)", marginBottom:16 }}>
          <div style={{ fontWeight:900, fontSize:15 }}>🏫 MIT Chennai</div>
          <div style={{ fontSize:11, color:"#555", fontFamily:"monospace", marginTop:4 }}>@admin</div>
        </div>
        {tabs.map(t=><button key={t.id} style={{ display:"block",width:"100%",textAlign:"left",padding:"11px 14px",borderRadius:10,border:adminTab===t.id?"1px solid rgba(79,70,229,0.35)":"1px solid transparent",background:adminTab===t.id?"rgba(79,70,229,0.15)":"none",color:adminTab===t.id?"#fff":"#555",fontWeight:600,cursor:"pointer",fontSize:13,fontFamily:"inherit",marginBottom:4 }} onClick={()=>setAdminTab(t.id)}>{t.icon} {t.label}</button>)}
        <div style={{ flex:1 }}/>
        <button style={{ display:"block",width:"100%",textAlign:"left",padding:"11px 14px",borderRadius:10,border:"none",background:"none",color:"#EF4444",fontWeight:600,cursor:"pointer",fontSize:13,fontFamily:"inherit" }} onClick={()=>setLoggedIn(false)}>🚪 Logout</button>
      </div>
      <div style={{ flex:1, padding:"28px 24px", overflowY:"auto" }}>
        {adminTab==="overview" && (
          <div>
            <div style={{ fontSize:28, fontWeight:900, letterSpacing:-1, marginBottom:24 }}>Dashboard</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16, marginBottom:28 }}>
              {[{label:"Events",value:events.length,icon:"🎪",color:"#4F46E5"},{label:"Halls on Map",value:halls.length,icon:"🏛️",color:"#22C55E"},{label:"Registrations",value:registrations.length,icon:"🎫",color:"#D97706"}].map(s=>(
                <div key={s.label} style={S.card}><div style={{ fontSize:28,marginBottom:10 }}>{s.icon}</div><div style={{ fontSize:36,fontWeight:900,color:s.color,fontFamily:"monospace" }}>{s.value}</div><div style={{ color:"#555",fontSize:13,marginTop:4 }}>{s.label}</div></div>
              ))}
            </div>
            <CampusMap halls={halls} targetHallNo="" interactive={false}/>
          </div>
        )}
        {adminTab==="events" && (()=>{
          const previewLat = parseFloat(eLat), previewLng = parseFloat(eLng);
          const hasPreviewPin = !isNaN(previewLat) && !isNaN(previewLng);
          const previewSVG = hasPreviewPin ? gpsToSVG(previewLat, previewLng) : null;
          return (
          <div>
            <div style={{ fontSize:28,fontWeight:900,letterSpacing:-1,marginBottom:24 }}>{editEvId?"Edit Event":"Events"}</div>
            <div style={S.card}>
              <div style={{ fontWeight:800,marginBottom:18,fontSize:15 }}>{editEvId?"✏️ Edit Event":"➕ New Event"}</div>

              {/* Basic info row */}
              <div style={S.r2}>
                <div><label style={S.lbl}>EVENT NAME *</label><input style={{ ...S.inp,marginBottom:14 }} value={eName} onChange={e=>setEName(e.target.value)} onFocus={foc} onBlur={blr}/></div>
                <div><label style={S.lbl}>CATEGORY</label><input style={{ ...S.inp,marginBottom:14 }} placeholder="Technical, Cultural…" value={eCat} onChange={e=>setECat(e.target.value)} onFocus={foc} onBlur={blr}/></div>
              </div>
              <label style={S.lbl}>DESCRIPTION</label>
              <textarea style={{ ...S.inp,minHeight:70,resize:"vertical",marginBottom:14 }} value={eDesc} onChange={e=>setEDesc(e.target.value)} onFocus={foc} onBlur={blr}/>
              <div style={S.r2}>
                <div><label style={S.lbl}>DATE *</label><input type="date" style={{ ...S.inp,marginBottom:14 }} value={eDate} onChange={e=>setEDate(e.target.value)} onFocus={foc} onBlur={blr}/></div>
                <div>
                  <label style={S.lbl}>
                    HALL NO *{" "}
                    {hallWarn==="ok" && <span style={{ color:"#22C55E", fontWeight:700, letterSpacing:0 }}>✓ Found on map</span>}
                    {hallWarn==="missing" && <span style={{ color:"#EF4444", fontWeight:700, letterSpacing:0 }}>✗ Not on map</span>}
                  </label>
                  <input
                    style={{ ...S.inp, marginBottom:6, fontFamily:"monospace", letterSpacing:1,
                      borderColor: hallWarn==="ok" ? "rgba(34,197,94,0.6)" : hallWarn==="missing" ? "rgba(239,68,68,0.7)" : "rgba(255,255,255,0.09)" }}
                    placeholder="e.g. A101"
                    value={eHall}
                    onChange={e=>checkHall(e.target.value)}
                    onFocus={e=>{ if(hallWarn==="ok") e.target.style.borderColor="rgba(34,197,94,0.6)"; else if(hallWarn==="missing") e.target.style.borderColor="rgba(239,68,68,0.7)"; else foc(e); }}
                    onBlur={e=>{ if(hallWarn==="ok") e.target.style.borderColor="rgba(34,197,94,0.6)"; else if(hallWarn==="missing") e.target.style.borderColor="rgba(239,68,68,0.7)"; else blr(e); }}
                  />

                  {/* Missing hall warning block */}
                  {hallWarn==="missing" && (
                    <div style={{ background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:10, padding:"12px 14px", marginTop:4 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                        <span style={{ fontSize:18 }}>🚫</span>
                        <div>
                          <div style={{ fontWeight:700, color:"#EF4444", fontSize:13 }}>Hall "{eHall}" not found!</div>
                          <div style={{ fontSize:12, color:"#888", marginTop:2 }}>You must add this hall in Map Builder before creating an event for it.</div>
                        </div>
                      </div>
                      <button
                        style={{ ...S.btn("d"), width:"100%", fontSize:12, padding:"8px 0", textAlign:"center" }}
                        onClick={()=>setAdminTab("map")}>
                        ➕ Go to Map Builder → Add Hall "{eHall}"
                      </button>
                    </div>
                  )}

                  {/* Available halls quick-pick */}
                  {halls.length > 0 && (
                    <div style={{ marginTop:8 }}>
                      <div style={{ fontSize:10, color:"#444", fontFamily:"monospace", letterSpacing:1, marginBottom:6 }}>AVAILABLE HALLS (click to select):</div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                        {halls.map(h=>(
                          <button key={h.id}
                            style={{ ...S.tag(eHall.trim().toLowerCase()===h.hall_no.toLowerCase()?"#22C55E":"#4F46E5"),
                              cursor:"pointer", fontSize:11, padding:"4px 10px",
                              background:`${eHall.trim().toLowerCase()===h.hall_no.toLowerCase()?"#22C55E":"#4F46E5"}22`,
                              border:`1px solid ${eHall.trim().toLowerCase()===h.hall_no.toLowerCase()?"rgba(34,197,94,0.5)":"rgba(79,70,229,0.4)"}` }}
                            onClick={()=>checkHall(h.hall_no)}>
                            {h.hall_no}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {halls.length === 0 && (
                    <div style={{ marginTop:8, padding:"10px 12px", background:"rgba(245,158,11,0.08)", border:"1px solid rgba(245,158,11,0.3)", borderRadius:10, fontSize:12, color:"#F59E0B" }}>
                      ⚠️ No halls added yet.{" "}
                      <span style={{ textDecoration:"underline", cursor:"pointer" }} onClick={()=>setAdminTab("map")}>Go to Map Builder to add halls first.</span>
                    </div>
                  )}
                </div>
              </div>
              <label style={S.lbl}>REGISTRATION DESK LOCATION</label>
              <input style={{ ...S.inp,marginBottom:20 }} placeholder="e.g. Main Gate, Block A Lobby" value={eDesk} onChange={e=>setEDesk(e.target.value)} onFocus={foc} onBlur={blr}/>

              {/* ── GPS DESTINATION PIN SECTION ── */}
              <div style={{ background:"linear-gradient(135deg,rgba(239,68,68,0.06),rgba(220,38,38,0.03))", border:"1px solid rgba(239,68,68,0.25)", borderRadius:14, padding:"20px 20px 16px", marginBottom:18 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, flexWrap:"wrap", gap:10 }}>
                  <div>
                    <div style={{ fontWeight:800, fontSize:14, display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ fontSize:20 }}>📍</span>
                      Hall GPS Destination Pin
                    </div>
                    <div style={{ fontSize:12, color:"#888", marginTop:4, lineHeight:1.6 }}>
                      Set the <strong style={{ color:"#fff" }}>exact GPS coordinates</strong> of the hall entrance. Participants' live navigation will route them precisely to this pin on the map.
                    </div>
                  </div>
                  <button
                    style={{ ...S.btn("teal"), fontSize:12, padding:"9px 18px", opacity:locFetching?0.7:1, flexShrink:0 }}
                    onClick={autoDetectLocation} disabled={locFetching}>
                    {locFetching ? "⏳ Detecting…" : "🎯 Auto-Detect My Location"}
                  </button>
                </div>

                <div style={S.r2}>
                  <div>
                    <label style={{ ...S.lbl, color:"#EF9999" }}>LATITUDE  <span style={{ color:"#666", fontWeight:400 }}>(e.g. 11.9410)</span></label>
                    <div style={{ position:"relative" }}>
                      <input
                        style={{ ...S.inp, marginBottom:0, paddingLeft:36, fontFamily:"monospace", fontSize:13 }}
                        placeholder="11.9410000"
                        value={eLat}
                        onChange={e=>setELat(e.target.value)}
                        onFocus={e=>e.target.style.borderColor="rgba(239,68,68,0.7)"}
                        onBlur={e=>e.target.style.borderColor="rgba(255,255,255,.09)"}
                      />
                      <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:14, pointerEvents:"none" }}>🌐</span>
                    </div>
                  </div>
                  <div>
                    <label style={{ ...S.lbl, color:"#EF9999" }}>LONGITUDE  <span style={{ color:"#666", fontWeight:400 }}>(e.g. 79.8340)</span></label>
                    <div style={{ position:"relative" }}>
                      <input
                        style={{ ...S.inp, marginBottom:0, paddingLeft:36, fontFamily:"monospace", fontSize:13 }}
                        placeholder="79.8340000"
                        value={eLng}
                        onChange={e=>setELng(e.target.value)}
                        onFocus={e=>e.target.style.borderColor="rgba(239,68,68,0.7)"}
                        onBlur={e=>e.target.style.borderColor="rgba(255,255,255,.09)"}
                      />
                      <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:14, pointerEvents:"none" }}>📡</span>
                    </div>
                  </div>
                </div>

                {/* How to get coords helper */}
                <div style={{ marginTop:14, padding:"10px 14px", background:"rgba(0,0,0,0.3)", borderRadius:10, fontSize:12, color:"#666", lineHeight:1.8 }}>
                  <strong style={{ color:"#aaa" }}>How to get coordinates:</strong>{" "}
                  Open Google Maps → Long press on the hall entrance → Coordinates appear at the bottom. Copy & paste here.
                  {" "}<span style={{ color:"#4F46E5", cursor:"pointer", textDecoration:"underline" }}
                    onClick={()=>window.open("https://maps.google.com","_blank")}>Open Google Maps →</span>
                </div>

                {/* Pin preview on mini map */}
                {hasPreviewPin && (
                  <div style={{ marginTop:16 }}>
                    <div style={{ fontSize:11, fontFamily:"monospace", color:"#EF4444", letterSpacing:2, marginBottom:10 }}>PIN PREVIEW ON CAMPUS MAP</div>
                    <div style={{ background:"#080810", borderRadius:12, overflow:"hidden", border:"1px solid rgba(239,68,68,0.25)" }}>
                      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} style={{ width:"100%", height:"auto", display:"block" }}>
                        <defs>
                          <pattern id="pg2" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="1"/></pattern>
                          <filter id="redglow"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                        </defs>
                        <rect width={MAP_W} height={MAP_H} fill="#080810"/>
                        <rect width={MAP_W} height={MAP_H} fill="url(#pg2)"/>
                        {/* Draw all halls lightly */}
                        {halls.map(h=>(
                          <g key={h.id}>
                            <rect x={h.x} y={h.y} width={h.w} height={h.h} rx={6} fill={`${h.color}10`} stroke={h.color} strokeWidth={1.2} opacity={0.5}/>
                            <text x={h.x+h.w/2} y={h.y+h.h/2+4} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize={11} fontFamily="monospace">{h.hall_no}</text>
                          </g>
                        ))}
                        {/* Entrance */}
                        <circle cx={ENTRANCE.x} cy={ENTRANCE.y} r={10} fill="#22C55E" opacity={0.7}/>
                        <text x={ENTRANCE.x} y={ENTRANCE.y+3} textAnchor="middle" fill="#fff" fontSize={8} fontWeight="900">↑</text>
                        {/* The GPS pin */}
                        <g filter="url(#redglow)">
                          <circle cx={previewSVG.x} cy={previewSVG.y} r={22} fill="rgba(239,68,68,0.15)" stroke="rgba(239,68,68,0.6)" strokeWidth={1.5}/>
                          <circle cx={previewSVG.x} cy={previewSVG.y} r={10} fill="#EF4444"/>
                          <text x={previewSVG.x} y={previewSVG.y+4} textAnchor="middle" fill="#fff" fontSize={12}>📍</text>
                        </g>
                        <rect x={previewSVG.x-42} y={previewSVG.y-40} width={84} height={18} rx={4} fill="rgba(239,68,68,0.9)"/>
                        <text x={previewSVG.x} y={previewSVG.y-28} textAnchor="middle" fill="#fff" fontSize={9} fontFamily="monospace" fontWeight="700">
                          {previewLat.toFixed(4)}, {previewLng.toFixed(4)}
                        </text>
                      </svg>
                    </div>
                    <div style={{ marginTop:8, fontSize:12, color:"#22C55E", fontFamily:"monospace" }}>
                      ✓ Pin placed at ({previewLat.toFixed(6)}, {previewLng.toFixed(6)}) — participants will be navigated here
                    </div>
                  </div>
                )}

                {!hasPreviewPin && (eLat || eLng) && (
                  <div style={{ marginTop:12, fontSize:12, color:"#F59E0B" }}>⚠️ Enter valid numbers for both latitude and longitude to place the pin.</div>
                )}
                {!eLat && !eLng && (
                  <div style={{ marginTop:12, fontSize:12, color:"#555" }}>
                    No pin set yet — navigation will use the hall box centre from the map builder.
                  </div>
                )}
              </div>

              <div style={{ display:"flex",gap:10,alignItems:"center" }}>
                <button
                  style={{ ...S.btn(), opacity: hallWarn==="missing" ? 0.45 : 1, cursor: hallWarn==="missing" ? "not-allowed" : "pointer" }}
                  onClick={saveEvent}>
                  {editEvId?"Save Changes":"Create Event"}
                </button>
                {editEvId&&<button style={S.btn("g")} onClick={clearEF}>Cancel</button>}
                {hallWarn==="missing" && (
                  <span style={{ fontSize:12, color:"#EF4444", fontFamily:"monospace" }}>
                    ✗ Add hall "{eHall}" to map first
                  </span>
                )}
              </div>
            </div>

            {/* Events list */}
            <div style={S.card}>
              <div style={{ fontWeight:800,marginBottom:16 }}>All Events ({events.length})</div>
              {events.length === 0 && <div style={{ color:"#555",textAlign:"center",padding:"30px 0",fontSize:14 }}>No events yet. Create one above.</div>}
              {events.map(ev=>{
                const hallOnMap = halls.some(h=>h.hall_no.trim().toLowerCase()===ev.hall_no.trim().toLowerCase());
                return (
                <div key={ev.id} style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"14px 0",borderBottom:"1px solid rgba(255,255,255,0.04)",flexWrap:"wrap",gap:10 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700,marginBottom:5,display:"flex",alignItems:"center",gap:8 }}>
                      {ev.name}
                      {!hallOnMap && (
                        <span style={{ fontSize:11,background:"rgba(245,158,11,0.12)",border:"1px solid rgba(245,158,11,0.4)",borderRadius:6,padding:"2px 8px",color:"#F59E0B",fontFamily:"monospace",fontWeight:700 }}>
                          ⚠️ Hall missing from map
                        </span>
                      )}
                    </div>
                    <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
                      <span style={{ fontSize:12,color:"#555",fontFamily:"monospace" }}>📅 {ev.date}</span>
                      <span style={S.tag(hallOnMap?"#22C55E":"#F59E0B")}>{ev.hall_no}</span>
                      {ev.dest_lat && ev.dest_lng
                        ? <span style={{ display:"flex",alignItems:"center",gap:5,fontSize:11,background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:6,padding:"2px 8px",color:"#EF4444",fontFamily:"monospace" }}>
                            📍 {Number(ev.dest_lat).toFixed(4)}, {Number(ev.dest_lng).toFixed(4)}
                          </span>
                        : <span style={{ fontSize:11,color:"#555",fontFamily:"monospace" }}>⬜ No GPS pin</span>
                      }
                    </div>
                    {!hallOnMap && (
                      <div style={{ marginTop:8, fontSize:12, color:"#F59E0B" }}>
                        Hall <strong>{ev.hall_no}</strong> no longer exists on the campus map.{" "}
                        <span style={{ textDecoration:"underline", cursor:"pointer" }} onClick={()=>setAdminTab("map")}>
                          Add it in Map Builder →
                        </span>
                      </div>
                    )}
                  </div>
                  <div style={{ display:"flex",gap:8 }}>
                    <button style={{ ...S.btn("g"),fontSize:12,padding:"6px 14px" }} onClick={()=>editEvent(ev)}>Edit</button>
                    <button style={{ ...S.btn("d"),fontSize:12,padding:"6px 14px" }} onClick={()=>{ setEvents(p=>p.filter(e=>e.id!==ev.id)); showToast("Deleted"); }}>Delete</button>
                  </div>
                </div>
                );
              })}
            </div>
          </div>
          );
        })()}
        {adminTab==="map" && (
          <div>
            <div style={{ fontSize:28,fontWeight:900,letterSpacing:-1,marginBottom:24 }}>Map Builder</div>
            <div style={{ display:"grid",gridTemplateColumns:"280px 1fr",gap:20 }}>
              <div>
                <div style={S.card}>
                  <div style={{ fontWeight:800,marginBottom:14,fontSize:14 }}>{editHallId?"✏️ Edit":"➕ Add Hall"}</div>
                  <div style={{ background:"rgba(79,70,229,0.07)",border:"1px solid rgba(79,70,229,0.2)",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#8B83FF",marginBottom:14 }}>💡 Drag halls on map to reposition</div>
                  <label style={S.lbl}>HALL NO *</label><input style={{ ...S.inp,marginBottom:12,fontFamily:"monospace",letterSpacing:1 }} placeholder="A101" value={hNo} onChange={e=>setHNo(e.target.value)} onFocus={foc} onBlur={blr}/>
                  <label style={S.lbl}>HALL NAME *</label><input style={{ ...S.inp,marginBottom:12 }} placeholder="Main Auditorium" value={hName} onChange={e=>setHName(e.target.value)} onFocus={foc} onBlur={blr}/>
                  <div style={S.r2}>
                    <div><label style={S.lbl}>FLOOR</label><input type="number" style={{ ...S.inp,marginBottom:12 }} value={hFloor} onChange={e=>setHFloor(Number(e.target.value))} onFocus={foc} onBlur={blr}/></div>
                    <div><label style={S.lbl}>BLOCK</label><input style={{ ...S.inp,marginBottom:12 }} placeholder="A" value={hBlock} onChange={e=>setHBlock(e.target.value)} onFocus={foc} onBlur={blr}/></div>
                  </div>
                  <label style={S.lbl}>COLOR</label>
                  <div style={{ display:"flex",gap:8,flexWrap:"wrap",marginBottom:16 }}>
                    {HALL_COLORS.map(c=><div key={c} onClick={()=>setHColor(c)} style={{ width:28,height:28,borderRadius:7,background:c,cursor:"pointer",border:hColor===c?"3px solid #fff":"2px solid transparent" }}/>)}
                  </div>
                  <div style={{ display:"flex",gap:8 }}><button style={{ ...S.btn(),flex:1 }} onClick={saveHall}>{editHallId?"Update":"Add"}</button>{editHallId&&<button style={S.btn("g")} onClick={clearHF}>✕</button>}</div>
                </div>
                <div style={S.card}>
                  <div style={{ fontWeight:800,marginBottom:14,fontSize:14 }}>Halls ({halls.length})</div>
                  <div style={{ maxHeight:260,overflowY:"auto" }}>
                    {halls.map(h=>(
                      <div key={h.id} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 0",borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                        <div style={{ display:"flex",alignItems:"center",gap:10 }}><div style={{ width:14,height:14,borderRadius:4,background:h.color,flexShrink:0 }}/><div><div style={{ fontWeight:700,fontSize:13 }}>{h.hall_no}</div><div style={{ fontSize:11,color:"#555" }}>{h.hall_name}</div></div></div>
                        <div style={{ display:"flex",gap:5 }}><button style={{ ...S.btn("g"),fontSize:11,padding:"4px 10px" }} onClick={()=>editHall(h)}>Edit</button><button style={{ ...S.btn("d"),fontSize:11,padding:"4px 10px" }} onClick={()=>{ setHalls(p=>p.filter(x=>x.id!==h.id)); showToast("Removed"); }}>✕</button></div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div style={S.card}>
                <div style={{ fontWeight:800,marginBottom:12,display:"flex",justifyContent:"space-between" }}><span>🗺️ Interactive Map Editor</span><span style={{ fontFamily:"monospace",fontSize:11,color:"#444" }}>DRAG HALLS</span></div>
                <CampusMap halls={halls} targetHallNo="" interactive={true} onDragEnd={onDragEnd}/>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TOAST + NAVBAR ───────────────────────────────────────────────────────────
function Toast({ toast }) {
  if (!toast) return null;
  return <div style={{ position:"fixed",top:20,right:20,zIndex:999,background:toast.type==="err"?"rgba(239,68,68,0.97)":"rgba(34,197,94,0.97)",color:"#fff",padding:"12px 24px",borderRadius:12,fontWeight:700,animation:"slideDown .3s ease",fontSize:14,boxShadow:"0 8px 32px rgba(0,0,0,0.5)" }}>{toast.type==="err"?"✗":"✓"} {toast.msg}</div>;
}

function Navbar({ view, setView, participant }) {
  return (
    <nav style={{ background:"rgba(6,6,14,0.97)",borderBottom:"1px solid rgba(79,70,229,0.25)",padding:"0 28px",height:60,display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:200 }}>
      <div style={{ fontFamily:"monospace",fontSize:20,fontWeight:900,color:"#fff",cursor:"pointer",letterSpacing:-1 }} onClick={()=>setView("home")}>🏛️ Campus<span style={{ color:"#4F46E5" }}>Nav</span></div>
      <div style={{ display:"flex",gap:4,alignItems:"center" }}>
        {[{id:"home",label:"Home"},{id:"events",label:"Events"},{id:"search",label:"Hall Search"},{id:"participant",label:"Participant"},{id:"admin",label:"Admin"}].map(item=>(
          <button key={item.id} style={{ padding:"7px 16px",borderRadius:8,border:view===item.id?"1px solid rgba(79,70,229,0.5)":"1px solid transparent",background:view===item.id?"rgba(79,70,229,0.15)":"none",color:view===item.id?"#fff":"#666",fontWeight:600,cursor:"pointer",fontSize:13,fontFamily:"inherit" }} onClick={()=>setView(item.id)}>{item.label}</button>
        ))}
        {participant && <span style={{ ...S.tag("#22D3EE"),fontSize:11,marginLeft:4 }}>🤖 {participant.name.split(" ")[0]}</span>}
      </div>
    </nav>
  );
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [view,          setView]          = useState("home");
  const [halls,         setHalls]         = useState(INIT_HALLS);
  const [events,        setEvents]        = useState(INIT_EVENTS);
  const [registrations, setRegistrations] = useState(INIT_REGS);
  const [participant,   setParticipant]   = useState(null);
  const [regIdInput,    setRegIdInput]    = useState("");
  const [activeNavHall, setActiveNavHall] = useState("");
  const [toast,         setToast]         = useState(null);

  const showToast = useCallback((msg, type="success") => {
    setToast({ msg, type });
    setTimeout(()=>setToast(null), 2500);
  }, []);

  return (
    <div style={{ minHeight:"100vh", background:"#06060e", color:"#e8e8f0", fontFamily:"'Segoe UI',system-ui,sans-serif" }}>
      <style>{`
        @keyframes fadeInUp   { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideDown  { from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin       { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes livepulse  { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(1.6)} }
        input::placeholder,textarea::placeholder{color:#333}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:5px}
        ::-webkit-scrollbar-track{background:#111}
        ::-webkit-scrollbar-thumb{background:#4F46E5;border-radius:3px}
      `}</style>
      <Toast toast={toast}/>
      <Navbar view={view} setView={setView} participant={participant}/>
      {view==="home"        && <HomePage        setView={setView} setActiveNavHall={setActiveNavHall}/>}
      {view==="events"      && <EventsPage      events={events} registrations={registrations} setRegistrations={setRegistrations} setView={setView} setRegIdInput={setRegIdInput} showToast={showToast}/>}
      {view==="participant" && <ParticipantPage events={events} halls={halls} registrations={registrations} regIdInput={regIdInput} setRegIdInput={setRegIdInput} participant={participant} setParticipant={setParticipant} showToast={showToast}/>}
      {view==="search"      && <SearchPage      halls={halls} events={events} activeNavHall={activeNavHall} setActiveNavHall={setActiveNavHall}/>}
      {view==="admin"       && <AdminPage       halls={halls} setHalls={setHalls} events={events} setEvents={setEvents} registrations={registrations} showToast={showToast}/>}
    </div>
  );
}
