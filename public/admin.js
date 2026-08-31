async function api(u,o){var r=await fetch(u,o||{}),d={};try{d=await r.json()}catch(e){}if(!r.ok)throw new Error(d.error||"Hata");return d}
function esc(s){return String(s||"").replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]})}
function table(headers,rows){return '<table class="table"><thead><tr>'+headers.map(function(h){return "<th>"+h+"</th>"}).join("")+'</tr></thead><tbody>'+rows.join("")+'</tbody></table>'}
async function checkAdmin(){
  try{
    var d=await api("/api/me");
    if(d.user && d.user.role==="admin"){showPanel();return true}
  }catch(e){}
  document.getElementById("loginBox").classList.remove("hidden");
  document.getElementById("panel").classList.add("hidden");
  return false
}
function showPanel(){document.getElementById("loginBox").classList.add("hidden");document.getElementById("panel").classList.remove("hidden");loadDashboard();loadUsers();loadChannels();loadVideos()}
document.getElementById("adminLogin").onsubmit=async function(e){
 e.preventDefault();
 try{
   await api("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({login:document.getElementById("adminLoginName").value,password:document.getElementById("adminLoginPassword").value})});
   var d=await api("/api/me");
   if(!d.user || d.user.role!=="admin") throw new Error("Bu hesap admin değil.");
   showPanel();
 }catch(x){var m=document.getElementById("adminLoginMsg");m.className="error";m.textContent=x.message}
};
async function loadDashboard(){var d=await api("/api/admin/stats");document.getElementById("stats").innerHTML=Object.keys(d).map(function(k){return '<div class="stat">'+esc(k)+'<b>'+d[k]+'</b></div>'}).join("")}
async function loadUsers(){var d=await api("/api/admin/users");document.getElementById("usersTable").innerHTML=table(["Nickname","E-posta","Rol","Doğrulandı","İşlem"],d.users.map(function(u){return '<tr><td>'+esc(u.username)+'</td><td>'+esc(u.email)+'</td><td class="role">'+u.role+'</td><td>'+u.verified+'</td><td><button class="btn" onclick="toggleRole(\''+u.id+'\',\''+u.role+'\')">Rol değiştir</button> <button class="btn danger" onclick="deleteUser(\''+u.id+'\')">Sil</button></td></tr>'}))}
async function loadChannels(){var d=await api("/api/admin/channels");document.getElementById("channelsTable").innerHTML=table(["Kanal","Sahip","Takipçi","Oluşturulma"],d.channels.map(function(c){return '<tr><td>'+esc(c.name)+'</td><td>'+esc(c.owner)+'</td><td>'+c.subscribers+'</td><td>'+new Date(c.createdAt).toLocaleString("tr-TR")+'</td></tr>'}))}
async function loadVideos(){var d=await api("/api/admin/videos");document.getElementById("videosTable").innerHTML=table(["Başlık","Kanal","Görüntülenme","Tarih","İşlem"],d.videos.map(function(v){return '<tr><td>'+esc(v.title)+'</td><td>'+esc(v.channel)+'</td><td>'+v.views+'</td><td>'+new Date(v.createdAt).toLocaleString("tr-TR")+'</td><td><button class="btn danger" onclick="deleteVideo(\''+v.id+'\')">Sil</button></td></tr>'}))}
async function toggleRole(id,role){try{await api("/api/admin/users/"+id+"/role",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({role:role==="admin"?"user":"admin"})});loadUsers()}catch(e){alert(e.message)}}
async function deleteUser(id){if(!confirm("Kullanıcı ve varsa kanalı/videoları silinsin mi?"))return;try{await api("/api/admin/users/"+id,{method:"DELETE"});loadUsers();loadChannels();loadVideos();loadDashboard()}catch(e){alert(e.message)}}
async function deleteVideo(id){if(!confirm("Bu videoyu silmek istediğinize emin misiniz?"))return;try{await api("/api/admin/videos/"+id,{method:"DELETE"});loadVideos();loadDashboard()}catch(e){alert(e.message)}}
document.querySelectorAll(".nav").forEach(function(n){n.onclick=function(){document.querySelectorAll(".nav").forEach(function(x){x.classList.remove("active")});n.classList.add("active");document.querySelectorAll(".tabpage").forEach(function(x){x.classList.add("hidden")});document.getElementById(n.dataset.tab).classList.remove("hidden")}})
document.getElementById("logout").onclick=async function(){await api("/api/logout",{method:"POST"});location.reload()};
checkAdmin();

async function openAccountSettings(){
  try{
    var d=await api("/api/me");
    if(!d.user || d.user.role!=="admin") return;
    document.getElementById("settingsBox").classList.remove("hidden");
    document.getElementById("settingsNick").value=d.user.username;
    document.getElementById("settingsOldPassword").value="";
    document.getElementById("settingsNewPassword").value="";
    document.getElementById("settingsMsg").textContent="";
    document.getElementById("settingsBox").scrollIntoView({behavior:"smooth"});
  }catch(e){alert(e.message)}
}
document.getElementById("accountSettings").onclick=openAccountSettings;

document.getElementById("settingsForm").onsubmit=async function(e){
  e.preventDefault();
  var msg=document.getElementById("settingsMsg");
  try{
    var nick=document.getElementById("settingsNick").value;
    var oldPass=document.getElementById("settingsOldPassword").value;
    var newPass=document.getElementById("settingsNewPassword").value;
    if(!nick) throw new Error("Nickname boş bırakılamaz.");
    if(newPass && !oldPass) throw new Error("Şifre değiştirmek için mevcut şifrenizi yazın.");
    await api("/api/account",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({username:nick,oldPassword:oldPass,newPassword:newPass})
    });
    msg.className="notice";
    msg.textContent="Admin hesabı güncellendi.";
    document.getElementById("settingsOldPassword").value="";
    document.getElementById("settingsNewPassword").value="";
  }catch(x){
    msg.className="error";
    msg.textContent=x.message;
  }
};
