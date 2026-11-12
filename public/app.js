const $ = s => document.querySelector(s);
const welcome = $("#welcome"), messagesEl = $("#messages"), form = $("#chatForm");
const input = $("#messageInput"), sendButton = $("#sendButton"), mode = $("#mode");
let messages = [], threads = JSON.parse(localStorage.getItem("nocturne_threads") || "[]"), busy = false;

function toast(text){const el=$("#toast");el.textContent=text;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),3200)}
function saveThread(){
  if(!messages.length)return;
  const thread={id:Date.now(),title:(messages.find(m=>m.role==="user")?.content||"Conversation").slice(0,48),messages};
  threads.unshift(thread);threads=threads.slice(0,25);localStorage.setItem("nocturne_threads",JSON.stringify(threads));renderHistory();
}
function renderHistory(){
  const el=$("#history");el.innerHTML="";
  if(!threads.length){el.innerHTML='<div class="empty-history">Your conversations will appear here.</div>';return}
  threads.forEach(t=>{const b=document.createElement("button");b.className="history-item";b.textContent="◦  "+t.title;b.onclick=()=>loadThread(t.id);el.appendChild(b)});
}
function loadThread(id){const t=threads.find(x=>x.id===id);if(!t)return;messages=JSON.parse(JSON.stringify(t.messages));renderMessages();welcome.style.display="none";messagesEl.style.display="block";$("#sidebar").classList.remove("open")}
function renderMessages(){
  messagesEl.innerHTML="";
  messages.forEach(m=>{
    const row=document.createElement("article");row.className="message "+m.role;
    const av=document.createElement("div");av.className="message-avatar";av.textContent=m.role==="assistant"?"N":"Y";
    const body=document.createElement("div");body.className="message-body";
    const meta=document.createElement("div");meta.className="message-meta";meta.textContent=m.role==="assistant"?"GHOST CHAT BOX":"YOU";
    const content=document.createElement("div");content.className="message-content";content.textContent=m.content;
    body.append(meta,content);row.append(av,body);messagesEl.appendChild(row);
  });
  messagesEl.scrollTop=messagesEl.scrollHeight;
}
function showChat(){welcome.style.display="none";messagesEl.style.display="block"}
async function send(text){
  text=text.trim();if(!text||busy)return;
  showChat();messages.push({role:"user",content:text});renderMessages();input.value="";input.style.height="auto";
  busy=true;sendButton.disabled=true;
  const typing=document.createElement("div");typing.className="typing";typing.textContent="GHOST CHAT BOX IS THINKING…";messagesEl.appendChild(typing);messagesEl.scrollTop=messagesEl.scrollHeight;
  try{
    const r=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages,mode:mode.value})});
    const data=await r.json();if(!r.ok)throw new Error(data.error||"Request failed");
    messages.push({role:"assistant",content:data.reply});typing.remove();renderMessages();
    threads.unshift({id:Date.now(),title:text.slice(0,48),messages:JSON.parse(JSON.stringify(messages))});threads=threads.slice(0,25);localStorage.setItem("nocturne_threads",JSON.stringify(threads));renderHistory();
  }catch(e){typing.remove();messages.push({role:"assistant",content:"Connection notice: "+e.message});renderMessages()}
  finally{busy=false;sendButton.disabled=false;input.focus()}
}
form.addEventListener("submit",e=>{e.preventDefault();send(input.value)});
input.addEventListener("input",()=>{input.style.height="auto";input.style.height=Math.min(input.scrollHeight,150)+"px"});
input.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();form.requestSubmit()}});
document.querySelectorAll("[data-prompt]").forEach(b=>b.addEventListener("click",()=>send(b.dataset.prompt)));
$("#newChat").onclick=()=>{if(messages.length)saveThread();messages=[];messagesEl.innerHTML="";messagesEl.style.display="none";welcome.style.display="block";input.focus()};
$("#clearAll").onclick=()=>{if(confirm("Clear all saved conversations from this browser?")){threads=[];localStorage.removeItem("nocturne_threads");renderHistory();toast("Local conversation history cleared.")}};
$("#mobileMenu").onclick=()=>$("#sidebar").classList.toggle("open");
$("#focusMode").onclick=()=>{document.body.classList.toggle("focus");$("#sidebar").classList.toggle("open");toast("Use the menu button to return to navigation.")};
$("#themeInfo").onclick=()=>toast("Chats are stored in this browser. Messages are sent to your configured model provider when you chat.");
mode.onchange=()=>{$("#modeHint").textContent={"Deep Chat":"Reason deeply. Speak clearly.","Shadow Mode":"Explore difficult subjects analytically.","Investigation":"Separate evidence from speculation.","Debate":"Stress-test ideas and assumptions."}[mode.value]};
renderHistory();
fetch("/api/health").then(r=>r.json()).then(d=>{$("#connectionText").textContent=d.configured?"MODEL CONNECTION READY":"API KEY REQUIRED";}).catch(()=>{$("#connectionText").textContent="SERVER OFFLINE"});
