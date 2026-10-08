const API = import.meta.env.VITE_API_URL || "http://localhost:3001";
const ADMIN_KEY = "atmo-admin-session";

export function getAdminSession(){
  try { return JSON.parse(localStorage.getItem(ADMIN_KEY) || "null"); } catch { return null; }
}
export function setAdminSession(session){
  try {
    if(session) localStorage.setItem(ADMIN_KEY, JSON.stringify(session));
    else localStorage.removeItem(ADMIN_KEY);
  } catch {}
}

async function request(path, options={}) {
  const session=getAdminSession();
  const headers={"Content-Type":"application/json", ...(options.headers||{})};
  if(session?.token) headers.Authorization=`Bearer ${session.token}`;
  const res = await fetch(`${API}${path}`, {cache:"no-store", headers, ...options});
  if (!res.ok) {
    const body = await res.json().catch(()=>({}));
    if(res.status===401 && path!=="/api/auth/admin") setAdminSession(null);
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}
const withOffice=(path,office)=>office?`${path}${path.includes("?")?"&":"?"}office=${encodeURIComponent(office)}`:path;
export const api = {
  bootstrap:(office)=>request(withOffice("/api/bootstrap",office)),
  adminLogin:(body)=>request("/api/auth/admin",{method:"POST",body:JSON.stringify(body)}),
  adminMe:()=>request("/api/auth/admin/me"),
  addAgent:(body)=>request("/api/agents",{method:"POST",body:JSON.stringify(body)}),
  updateAgent:(id,body)=>request(`/api/agents/${id}`,{method:"PUT",body:JSON.stringify(body)}),
  deleteAgent:(id)=>request(`/api/agents/${id}`,{method:"DELETE"}),
  autoGenerate:(options={})=>request("/api/matchups/auto",{method:"POST",body:JSON.stringify({groupSize:4,groupingMode:"gaps",trainersOnly:false,...options})}),
  getDraftMatchups:(office)=>request(withOffice("/api/matchups/draft",office)),
  saveDraftMatchups:(date,groups,actor,action,office)=>request("/api/matchups/draft",{method:"PUT",body:JSON.stringify({date,groups,actor,action,office})}),
  getFinalMatchups:(office)=>request(withOffice("/api/matchups/final",office)),
  saveMatchups:(date,groups,office)=>request("/api/matchups",{method:"POST",body:JSON.stringify({date,groups,office})}),
  importProductionReps:()=>request("/api/production-reps/import",{method:"POST",body:"{}"}),
  generateWorkMatchups:()=>request("/api/work-matchups/generate",{method:"POST",body:"{}"}),
  getWorkMatchups:()=>request("/api/work-matchups"),
  getTrainingWatch:(mode="both",threshold=20)=>request(`/api/training-watch?mode=${encodeURIComponent(mode)}&threshold=${encodeURIComponent(threshold)}`),
  saveWorkMatchups:(date,groups,actor,action)=>request("/api/work-matchups",{method:"POST",body:JSON.stringify({date,groups,actor,action})}),
  generateStoreMatchups:()=>request("/api/store-matchups/generate",{method:"POST",body:"{}"}),
  getStoreCatalog:()=>request("/api/store-matchups/catalog"),
  getStoreMatchups:()=>request("/api/store-matchups"),
  saveStoreMatchups:(date,groups,actor,action)=>request("/api/store-matchups",{method:"POST",body:JSON.stringify({date,groups,actor,action})}),
  getFieldNotes:(office)=>request(withOffice("/api/field-notes",office)),
  addFieldNote:(body)=>request("/api/field-notes",{method:"POST",body:JSON.stringify(body)}),
  getSuggestions:()=>request("/api/suggestions"),
  addSuggestion:(body)=>request("/api/suggestions",{method:"POST",body:JSON.stringify(body)}),
  getNumbersTracking:(office)=>request(withOffice("/api/numbers-tracking",office)),
  getManualNumbers:(office)=>request(withOffice("/api/manual-numbers",office)),
  saveManualNumbers:(body)=>request("/api/manual-numbers",{method:"POST",body:JSON.stringify(body)}),
};
