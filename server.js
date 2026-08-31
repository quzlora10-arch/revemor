var express = require("express");
var session = require("express-session");
var helmet = require("helmet");
var rateLimit = require("express-rate-limit");
var multer = require("multer");
var bcrypt = require("bcryptjs");
var nodemailer = require("nodemailer");
var fs = require("fs");
var path = require("path");
var crypto = require("crypto");

var app = express();
var PORT = Number(process.env.PORT || 3000);
var ROOT = __dirname;
var DATA_FILE = path.join(ROOT, "data", "db.json");
var PUBLIC_DIR = path.join(ROOT, "public");
var VIDEO_DIR = path.join(ROOT, "uploads", "videos");
var THUMB_DIR = path.join(ROOT, "uploads", "thumbnails");

function loadEnvFile() {
  var envFile = path.join(ROOT, ".env");
  if (!fs.existsSync(envFile)) return;
  var lines = fs.readFileSync(envFile, "utf8").split(/\r?\n/);
  lines.forEach(function(line) {
    line = line.trim();
    if (!line || line.charAt(0) === "#") return;
    var idx = line.indexOf("=");
    if (idx < 1) return;
    var key = line.slice(0, idx).trim();
    var value = line.slice(idx + 1).trim();
    if ((value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') ||
        (value.charAt(0) === "'" && value.charAt(value.length - 1) === "'")) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  });
}
loadEnvFile();

function ensureDirs() {
  [path.dirname(DATA_FILE), VIDEO_DIR, THUMB_DIR].forEach(function(d) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });
}
ensureDirs();

function readDb() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (e) {
    return {users: [], channels: [], videos: [], follows: [], bans: [], verificationCodes: []};
  }
}
var db = readDb();

function saveDb() {
  var tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), "utf8");
  fs.renameSync(tmp, DATA_FILE);
}

function id() {
  return crypto.randomBytes(12).toString("hex");
}
function now() { return new Date().toISOString(); }
function normalizeUsername(s) { return String(s || "").trim().toLowerCase(); }
function validUsername(s) { return /^[a-zA-Z0-9_]{3,24}$/.test(String(s || "")); }
function validPassword(s) { return typeof s === "string" && s.length >= 8 && s.length <= 128; }
function validChannelName(s) { return /^[\p{L}\p{N} _.-]{2,50}$/u.test(String(s || "").trim()); }
function allowedEmail(email) {
  var parts = String(email || "").toLowerCase().trim().split("@");
  if (parts.length !== 2) return false;
  var domains = String(process.env.ALLOWED_EMAIL_DOMAINS || "hotmail.com,outlook.com,live.com,msn.com")
    .split(",").map(function(x){ return x.trim().toLowerCase(); });
  return domains.indexOf(parts[1]) !== -1;
}
function findUserById(uid) { return db.users.find(function(u){ return u.id === uid; }); }
function findUserByUsername(username) {
  var n = normalizeUsername(username);
  return db.users.find(function(u){ return u.username.toLowerCase() === n; });
}
function findUserByEmail(email) {
  var n = String(email || "").trim().toLowerCase();
  return db.users.find(function(u){ return u.email.toLowerCase() === n; });
}
function findChannelByUser(uid) { return db.channels.find(function(c){ return c.ownerId === uid; }); }
function findChannel(cid) { return db.channels.find(function(c){ return c.id === cid; }); }
function activeBan(channelId, userId) {
  var b = db.bans.find(function(x) {
    if (x.channelId !== channelId || x.userId !== userId) return false;
    if (!x.until) return true;
    return new Date(x.until).getTime() > Date.now();
  });
  return b || null;
}
function publicUser(u) {
  return {id:u.id, username:u.username, email:u.email, verified:u.verified, role:u.role, createdAt:u.createdAt};
}
function currentUser(req) {
  return req.session && req.session.userId ? findUserById(req.session.userId) : null;
}
function requireAuth(req, res, next) {
  if (!currentUser(req)) return res.status(401).json({error:"Oturum açmanız gerekiyor."});
  next();
}
function requireAdmin(req, res, next) {
  var u = currentUser(req);
  if (!u || u.role !== "admin") return res.status(403).json({error:"Admin yetkisi gerekiyor."});
  next();
}

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({limit:"1mb"}));
app.use(express.urlencoded({extended:false, limit:"1mb"}));
app.use(session({
  name: "revemor.sid",
  secret: process.env.SESSION_SECRET || "CHANGE_THIS_SESSION_SECRET",
  resave: false,
  saveUninitialized: false,
  cookie: {httpOnly:true, sameSite:"lax", secure:false, maxAge: 1000 * 60 * 60 * 24 * 7}
}));

var authLimiter = rateLimit({windowMs: 15 * 60 * 1000, max: 80, standardHeaders: true, legacyHeaders: false});
app.use(["/api/login","/api/register","/api/verify"], authLimiter);

var storage = multer.diskStorage({
  destination: function(req, file, cb) { cb(null, VIDEO_DIR); },
  filename: function(req, file, cb) {
    cb(null, Date.now() + "-" + crypto.randomBytes(6).toString("hex") + path.extname(file.originalname).toLowerCase());
  }
});
var uploadVideo = multer({
  storage: storage,
  limits: {fileSize: 1024 * 1024 * 1024},
  fileFilter: function(req, file, cb) {
    var ok = ["video/mp4","video/webm","video/ogg","video/quicktime"].indexOf(file.mimetype) !== -1;
    cb(ok ? null : new Error("Sadece MP4, WebM, OGG veya MOV video kabul edilir."), ok);
  }
});

var thumbStorage = multer.diskStorage({
  destination: function(req, file, cb) { cb(null, THUMB_DIR); },
  filename: function(req, file, cb) {
    cb(null, Date.now() + "-" + crypto.randomBytes(6).toString("hex") + path.extname(file.originalname).toLowerCase());
  }
});
var uploadThumb = multer({
  storage: thumbStorage,
  limits: {fileSize: 8 * 1024 * 1024},
  fileFilter: function(req, file, cb) {
    var ok = ["image/jpeg","image/png","image/webp"].indexOf(file.mimetype) !== -1;
    cb(ok ? null : new Error("JPG, PNG veya WebP küçük resim kabul edilir."), ok);
  }
});

var transporter = null;
function setupMailer() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.office365.com",
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false") === "true",
    auth: {user: process.env.SMTP_USER, pass: process.env.SMTP_PASS}
  });
}
setupMailer();

async function sendVerificationCode(email, code) {
  var text = "Rêvemor doğrulama kodunuz: " + code + "\n\nBu kod 10 dakika geçerlidir.";
  if (!transporter) {
    console.log("[RÊVEMOR TEST] " + email + " için doğrulama kodu: " + code);
    return;
  }
  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: email,
    subject: "Rêvemor hesap doğrulama kodu",
    text: text,
    html: "<div style='font-family:Arial'><h2>Rêvemor</h2><p>Doğrulama kodunuz:</p><p style='font-size:30px;font-weight:bold;letter-spacing:5px'>" + code + "</p><p>Kod 10 dakika geçerlidir.</p></div>"
  });
}

async function createInitialAdmin() {
  var email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  var username = normalizeUsername(process.env.ADMIN_USERNAME || "");
  var password = String(process.env.ADMIN_PASSWORD || "");
  if (!email || !username || !password) {
    console.log("ADMIN_EMAIL / ADMIN_USERNAME / ADMIN_PASSWORD .env içinde ayarlanmadı.");
    return;
  }
  var existing = findUserByEmail(email);
  if (!existing) {
    var admin = {
      id:id(), email:email, username:username,
      passwordHash: await bcrypt.hash(password, 12),
      verified:true, role:"admin", createdAt:now()
    };
    db.users.push(admin);
    saveDb();
    console.log("İlk admin hesabı oluşturuldu: " + username);
  } else if (existing.role !== "admin") {
    existing.role = "admin";
    saveDb();
  }
}

app.get("/api/me", function(req,res) {
  var u = currentUser(req);
  if (!u) return res.json({user:null, channel:null});
  res.json({user:publicUser(u), channel:findChannelByUser(u.id) || null});
});

app.post("/api/register", async function(req,res) {
  try {
    var email = String(req.body.email || "").trim().toLowerCase();
    var username = normalizeUsername(req.body.username);
    var password = String(req.body.password || "");
    if (!allowedEmail(email)) return res.status(400).json({error:"Yalnızca Hotmail, Outlook, Live veya MSN adresleri kullanılabilir."});
    if (!validUsername(username)) return res.status(400).json({error:"Nickname 3-24 karakter olmalı; sadece harf, rakam ve alt çizgi kullanılabilir."});
    if (!validPassword(password)) return res.status(400).json({error:"Şifre 8-128 karakter arasında olmalı."});
    if (findUserByEmail(email)) return res.status(409).json({error:"Bu e-posta zaten kayıtlı."});
    if (findUserByUsername(username)) return res.status(409).json({error:"Bu nickname zaten kullanılıyor."});

    var code = String(crypto.randomInt(100000, 1000000));
    var passwordHash = await bcrypt.hash(password, 12);
    db.verificationCodes = db.verificationCodes.filter(function(x){ return x.email !== email; });
    db.verificationCodes.push({email:email, codeHash:await bcrypt.hash(code, 10), username:username, passwordHash:passwordHash, expiresAt:new Date(Date.now()+10*60*1000).toISOString()});
    saveDb();
    await sendVerificationCode(email, code);
    res.json({ok:true, message:"Doğrulama kodu e-posta adresine gönderildi."});
  } catch(e) {
    console.error(e);
    res.status(500).json({error:"Kayıt sırasında hata oluştu."});
  }
});

app.post("/api/verify", async function(req,res) {
  try {
    var email = String(req.body.email || "").trim().toLowerCase();
    var code = String(req.body.code || "").trim();
    var item = db.verificationCodes.find(function(x){ return x.email === email; });
    if (!item || new Date(item.expiresAt).getTime() < Date.now()) return res.status(400).json({error:"Kod geçersiz veya süresi dolmuş."});
    if (!(await bcrypt.compare(code, item.codeHash))) return res.status(400).json({error:"Doğrulama kodu yanlış."});
    if (findUserByEmail(email) || findUserByUsername(item.username)) return res.status(409).json({error:"E-posta veya nickname artık kullanılıyor."});
    var user = {id:id(), email:email, username:item.username, passwordHash:item.passwordHash, verified:true, role:"user", createdAt:now()};
    db.users.push(user);
    db.verificationCodes = db.verificationCodes.filter(function(x){ return x.email !== email; });
    saveDb();
    req.session.userId = user.id;
    res.json({ok:true, user:publicUser(user)});
  } catch(e) {
    res.status(500).json({error:"Doğrulama sırasında hata oluştu."});
  }
});

app.post("/api/login", async function(req,res) {
  try {
    var login = String(req.body.login || "");
    var password = String(req.body.password || "");
    var user = login.indexOf("@") !== -1 ? findUserByEmail(login) : findUserByUsername(login);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({error:"Nickname/e-posta veya şifre yanlış."});
    req.session.userId = user.id;
    res.json({ok:true, user:publicUser(user), channel:findChannelByUser(user.id) || null});
  } catch(e) { res.status(500).json({error:"Giriş sırasında hata oluştu."}); }
});

app.post("/api/logout", function(req,res) {
  req.session.destroy(function(){ res.json({ok:true}); });
});

app.post("/api/account", requireAuth, async function(req,res) {
  try {
    var u = currentUser(req);
    var newUsername = req.body.username !== undefined ? normalizeUsername(req.body.username) : u.username;
    var oldPassword = String(req.body.oldPassword || "");
    var newPassword = req.body.newPassword !== undefined ? String(req.body.newPassword) : "";
    if (newUsername !== u.username) {
      if (!validUsername(newUsername)) return res.status(400).json({error:"Geçersiz nickname."});
      var other = findUserByUsername(newUsername);
      if (other && other.id !== u.id) return res.status(409).json({error:"Bu nickname zaten kullanılıyor."});
      u.username = newUsername;
    }
    if (newPassword) {
      if (!oldPassword || !(await bcrypt.compare(oldPassword, u.passwordHash))) return res.status(400).json({error:"Mevcut şifre yanlış."});
      if (!validPassword(newPassword)) return res.status(400).json({error:"Yeni şifre en az 8 karakter olmalı."});
      u.passwordHash = await bcrypt.hash(newPassword, 12);
    }
    saveDb();
    res.json({ok:true,user:publicUser(u)});
  } catch(e) { res.status(500).json({error:"Hesap güncellenemedi."}); }
});

app.post("/api/channels", requireAuth, function(req,res) {
  var u = currentUser(req);
  if (findChannelByUser(u.id)) return res.status(409).json({error:"Her hesap yalnızca bir kanal açabilir."});
  var name = String(req.body.name || "").trim();
  if (!validChannelName(name)) return res.status(400).json({error:"Kanal adı 2-50 karakter olmalı."});
  if (db.channels.some(function(c){ return c.name.toLowerCase() === name.toLowerCase(); })) return res.status(409).json({error:"Bu kanal adı zaten kullanılıyor."});
  var channel = {id:id(), ownerId:u.id, name:name, createdAt:now(), subscribers:0};
  db.channels.push(channel);
  saveDb();
  res.json({ok:true,channel:channel});
});

app.get("/api/videos", function(req,res) {
  var items = db.videos.slice().sort(function(a,b){ return new Date(b.createdAt)-new Date(a.createdAt); }).map(function(v){
    return {
      id:v.id,title:v.title,description:v.description,videoUrl:"/uploads/videos/"+v.fileName,
      thumbnailUrl:v.thumbnailFileName ? "/uploads/thumbnails/"+v.thumbnailFileName : "",
      channelId:v.channelId,channelName:(findChannel(v.channelId)||{}).name || "Bilinmeyen kanal",
      views:v.views || 0,createdAt:v.createdAt
    };
  });
  res.json({videos:items});
});

app.get("/api/videos/:id", function(req,res) {
  var v = db.videos.find(function(x){ return x.id === req.params.id; });
  if (!v) return res.status(404).json({error:"Video bulunamadı."});
  v.views = (v.views || 0) + 1; saveDb();
  res.json({video:v, channel:findChannel(v.channelId)||null});
});

app.post("/api/videos", requireAuth, uploadVideo.single("video"), function(req,res) {
  try {
    var u = currentUser(req);
    var c = findChannelByUser(u.id);
    if (!c) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({error:"Önce kanal oluşturmalısınız."});
    }
    var title = String(req.body.title || "").trim();
    if (title.length < 2 || title.length > 120) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({error:"Video başlığı 2-120 karakter olmalı."});
    }
    var v = {id:id(), channelId:c.id, title:title, description:String(req.body.description||"").slice(0,5000), fileName:path.basename(req.file.filename), thumbnailFileName:"", views:0, createdAt:now()};
    db.videos.push(v); saveDb();
    res.json({ok:true,video:v});
  } catch(e) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(400).json({error:e.message || "Video yüklenemedi."});
  }
});

app.post("/api/follow/:channelId", requireAuth, function(req,res) {
  var u = currentUser(req);
  var c = findChannel(req.params.channelId);
  if (!c) return res.status(404).json({error:"Kanal bulunamadı."});
  if (c.ownerId === u.id) return res.status(400).json({error:"Kendi kanalınızı takip edemezsiniz."});
  if (activeBan(c.id, u.id)) return res.status(403).json({error:"Bu kanalda banlısınız."});
  var existing = db.follows.find(function(f){ return f.channelId===c.id && f.userId===u.id; });
  if (existing) {
    db.follows = db.follows.filter(function(f){ return f !== existing; });
  } else {
    db.follows.push({channelId:c.id,userId:u.id,createdAt:now()});
  }
  c.subscribers = db.follows.filter(function(f){ return f.channelId===c.id; }).length;
  saveDb();
  res.json({following:!existing,subscribers:c.subscribers});
});

app.get("/api/channels/:id", function(req,res) {
  var c = findChannel(req.params.id);
  if (!c) return res.status(404).json({error:"Kanal bulunamadı."});
  var followers = db.follows.filter(function(f){ return f.channelId===c.id; }).map(function(f){ return findUserById(f.userId); }).filter(Boolean).map(publicUser);
  var videos = db.videos.filter(function(v){ return v.channelId===c.id; });
  var me = currentUser(req);
  res.json({channel:c,owner:publicUser(findUserById(c.ownerId)),followers:followers,videos:videos,following:!!(me && db.follows.some(function(f){return f.channelId===c.id&&f.userId===me.id;}))});
});

app.post("/api/channels/:id/ban", requireAuth, function(req,res) {
  var u = currentUser(req), c = findChannel(req.params.id);
  if (!c || c.ownerId !== u.id) return res.status(403).json({error:"Sadece kanal sahibi ban uygulayabilir."});
  var target = findUserById(String(req.body.userId || ""));
  if (!target || target.id === u.id) return res.status(400).json({error:"Geçersiz kullanıcı."});
  var type = String(req.body.type || "permanent");
  var until = null;
  if (type === "1h") until = new Date(Date.now()+3600*1000).toISOString();
  if (type === "1d") until = new Date(Date.now()+24*3600*1000).toISOString();
  if (type === "7d") until = new Date(Date.now()+7*24*3600*1000).toISOString();
  if (type === "30d") until = new Date(Date.now()+30*24*3600*1000).toISOString();
  db.bans = db.bans.filter(function(b){ return !(b.channelId===c.id && b.userId===target.id); });
  db.bans.push({id:id(),channelId:c.id,userId:target.id,until:until,createdAt:now(),reason:String(req.body.reason||"Kanal sahibi tarafından banlandı.").slice(0,300)});
  db.follows = db.follows.filter(function(f){ return !(f.channelId===c.id && f.userId===target.id); });
  c.subscribers = db.follows.filter(function(f){ return f.channelId===c.id; }).length;
  saveDb();
  res.json({ok:true});
});

app.post("/api/channels/:id/unban", requireAuth, function(req,res) {
  var u=currentUser(req), c=findChannel(req.params.id);
  if (!c || c.ownerId!==u.id) return res.status(403).json({error:"Yetki yok."});
  db.bans = db.bans.filter(function(b){ return !(b.channelId===c.id && b.userId===String(req.body.userId||"")); });
  saveDb(); res.json({ok:true});
});

app.get("/api/admin/stats", requireAdmin, function(req,res) {
  res.json({
    users:db.users.length, channels:db.channels.length, videos:db.videos.length,
    follows:db.follows.length, bans:db.bans.length
  });
});
app.get("/api/admin/users", requireAdmin, function(req,res) {
  res.json({users:db.users.map(publicUser)});
});
app.get("/api/admin/channels", requireAdmin, function(req,res) {
  res.json({channels:db.channels.map(function(c){return {id:c.id,name:c.name,owner:(findUserById(c.ownerId)||{}).username||"",ownerId:c.ownerId,subscribers:c.subscribers,createdAt:c.createdAt};})});
});
app.get("/api/admin/videos", requireAdmin, function(req,res) {
  res.json({videos:db.videos.map(function(v){return {id:v.id,title:v.title,channel:(findChannel(v.channelId)||{}).name||"",views:v.views||0,createdAt:v.createdAt,fileName:v.fileName};})});
});
app.post("/api/admin/users/:id/role", requireAdmin, function(req,res) {
  var target=findUserById(req.params.id);
  if (!target) return res.status(404).json({error:"Kullanıcı yok."});
  var role=String(req.body.role||"user");
  if (["user","admin"].indexOf(role)===-1) return res.status(400).json({error:"Rol geçersiz."});
  target.role=role; saveDb(); res.json({ok:true});
});
app.delete("/api/admin/users/:id", requireAdmin, function(req,res) {
  var admin=currentUser(req), target=findUserById(req.params.id);
  if (!target) return res.status(404).json({error:"Kullanıcı yok."});
  if (target.id===admin.id) return res.status(400).json({error:"Kendi admin hesabınızı silemezsiniz."});
  var channel=findChannelByUser(target.id);
  if (channel) {
    db.videos.filter(function(v){return v.channelId===channel.id;}).forEach(function(v){
      var fp=path.join(VIDEO_DIR,v.fileName); if(fs.existsSync(fp)) fs.unlinkSync(fp);
    });
    db.channels=db.channels.filter(function(c){return c.id!==channel.id;});
    db.videos=db.videos.filter(function(v){return v.channelId!==channel.id;});
    db.follows=db.follows.filter(function(f){return f.channelId!==channel.id;});
    db.bans=db.bans.filter(function(b){return b.channelId!==channel.id;});
  }
  db.users=db.users.filter(function(u){return u.id!==target.id;});
  db.follows=db.follows.filter(function(f){return f.userId!==target.id;});
  db.bans=db.bans.filter(function(b){return b.userId!==target.id;});
  saveDb(); res.json({ok:true});
});
app.delete("/api/admin/videos/:id", requireAdmin, function(req,res) {
  var v=db.videos.find(function(x){return x.id===req.params.id;});
  if(!v) return res.status(404).json({error:"Video yok."});
  var fp=path.join(VIDEO_DIR,v.fileName); if(fs.existsSync(fp)) fs.unlinkSync(fp);
  if(v.thumbnailFileName){var tp=path.join(THUMB_DIR,v.thumbnailFileName);if(fs.existsSync(tp))fs.unlinkSync(tp);}
  db.videos=db.videos.filter(function(x){return x.id!==v.id;});
  saveDb(); res.json({ok:true});
});

// Admin panel kısa adresi: /admin
app.get("/admin", function(req, res) {
  res.sendFile(path.join(PUBLIC_DIR, "admin.html"));
});

app.use("/uploads/videos", express.static(VIDEO_DIR, {fallthrough:false}));
app.use("/uploads/thumbnails", express.static(THUMB_DIR, {fallthrough:false}));
app.use(express.static(PUBLIC_DIR));

app.use(function(err, req, res, next) {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(400).json({error:err.message || "İstek işlenemedi."});
});

createInitialAdmin().then(function(){
  app.listen(PORT, function(){
    console.log("Rêvemor çalışıyor: http://localhost:" + PORT);
    console.log("Admin: http://localhost:" + PORT + "/admin");
  });
});
